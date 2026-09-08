const defaults={enabled:false,baseUrl:'',model:'',maxTokens:4096,timeoutSeconds:120,rememberKey:false,apiKey:''};
export function endpointFor(baseUrl){
 let url;try{url=new URL(baseUrl.trim());}catch{throw new Error('请输入完整的 API 地址，例如 https://api.example.com/v1');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('API 地址只允许 http/https，不要在地址内填写密钥、参数或账号密码');
 let pathname=url.pathname.replace(/\/+$/,'');if(!pathname.endsWith('/chat/completions'))pathname=(pathname||'/v1')+'/chat/completions';url.pathname=pathname;return url.href;
}
export function validateApiSettings(value){
 const c={...defaults,...value};
 if(typeof c.enabled!=='boolean'||typeof c.rememberKey!=='boolean'||typeof c.baseUrl!=='string'||typeof c.model!=='string'||typeof c.apiKey!=='string')throw new Error('API 配置格式无效');
 if(!Number.isInteger(c.maxTokens)||c.maxTokens<1||c.maxTokens>131072)throw new Error('输出长度需为 1–131072 的整数');
 if(!Number.isFinite(c.timeoutSeconds)||c.timeoutSeconds<10||c.timeoutSeconds>600)throw new Error('超时时间需为 10–600 秒');
 c.baseUrl=c.baseUrl.trim();c.model=c.model.trim();c.apiKey=c.apiKey.trim();
 if(c.enabled){endpointFor(c.baseUrl);if(!c.model)throw new Error('请填写模型名称');}
 return c;
}
/** All API settings are browser-local. Keys are session-only unless explicitly remembered. */
export function createApiSettings(storage,namespace){
 const key=`dynamic-map.api:${namespace}`,secretKey=`${key}:secret`;let value={...defaults};
 try{const raw=JSON.parse(storage.getItem(key)||'{}');value=validateApiSettings({...raw,apiKey:raw.rememberKey?storage.getItem(secretKey)||'':''});}catch{}
 return {snapshot:()=>({...value}),save(config){const next=validateApiSettings(config),{apiKey,...publicFields}=next;
  if(next.rememberKey&&apiKey)storage.setItem(secretKey,apiKey);else storage.removeItem(secretKey);
  storage.setItem(key,JSON.stringify(publicFields));value=next;return {...value};
 }};
}
export async function generateMapText(ctx,config,request,{fetchImpl=globalThis.fetch,signal}={}){
 const c=validateApiSettings(config);
 if(!c.enabled){if(typeof ctx?.generateRaw!=='function')throw new Error('请配置酒馆模型，或在设置中启用独立 API');return ctx.generateRaw(request);}
 const controller=new AbortController(),abort=()=>controller.abort();
 if(signal?.aborted)abort();signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,c.timeoutSeconds*1000);
 try{
  const headers={'Content-Type':'application/json'};if(c.apiKey)headers.Authorization=`Bearer ${c.apiKey}`;
  const response=await fetchImpl(endpointFor(c.baseUrl),{method:'POST',headers,credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,
   body:JSON.stringify({model:c.model,messages:[{role:'system',content:request.systemPrompt},{role:'user',content:request.prompt}],max_tokens:c.maxTokens,stream:false})});
  if(!response.ok)throw new Error(`独立 API 请求失败（HTTP ${response.status}），请检查地址、密钥、模型名称及额度`);
  let data;try{data=await response.json();}catch{throw new Error('API 返回的不是有效 JSON 响应');}
  const choice=data?.choices?.[0];if(choice?.finish_reason==='length')throw new Error('模型输出被截断，请增加输出长度后重新生成');
  const content=choice?.message?.content;
  const text=typeof content==='string'?content:Array.isArray(content)?content.filter(x=>x.type==='text'&&typeof x.text==='string').map(x=>x.text).join(''):'';
  if(!text.trim())throw new Error('API 未返回文本，请确认使用兼容 Chat Completions 的模型');return text;
 }catch(error){
  if(controller.signal.aborted)throw new Error(signal?.aborted?'已取消生成，未应用结果':'独立 API 请求超时，请稍后重试或增加超时时间');
  if(error instanceof TypeError)throw new Error('无法连接独立 API，请检查网络、地址以及服务是否允许浏览器跨域请求');throw error;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
