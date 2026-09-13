import { chatIdentity } from './chat.js';
export const TOOL_PROMPT='剧情涉及位置、地点或道路变化时，先调用 dynamic_map_query 查询对应地图，再调用 dynamic_map_update 提交已确定的变化。复用已有 ID 和类型；不要编造距离、名称或新地点。需要新增地点时使用新的唯一 ID。仅在剧情明确到达后提交 move。一次提交相关变化，成功后不要重复调用；结果 applied=false 代表尚待用户保存，不要说已生效。不要同时使用地图移动请求变量重复移动。';
export const PROMPT_OWNER='dynamic-map/tool-calling-v1';
const clone=v=>structuredClone(v);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const busy=new Set();
export function targetWorldbook(ctx){
 if(ctx?.groupId!=null||!chatIdentity(ctx))throw Error('请先打开单角色聊天');
 const c=ctx.characters?.[ctx.characterId],name=c?.data?.extensions?.world||c?.extensions?.world;
 if(typeof name!=='string'||!name.trim())throw Error('当前角色未绑定主世界书，请先在角色卡中绑定世界书');
 return name;
}
export function preparePromptBook(original,name,createEntry,remove=false){
 if(!original?.entries||typeof original.entries!=='object'||Array.isArray(original.entries))throw Error('世界书格式无效，未修改');
 const book=clone(original),owned=Object.entries(book.entries).filter(([,e])=>e?.dynamic_map_owner===PROMPT_OWNER);
 if(owned.length>1)throw Error('存在多个地图插件提示词条目，请先整理后重试');
 const previous=owned[0]?clone(owned[0][1]):null;
 if(remove){if(owned[0]){delete book.entries[owned[0][0]];if(Array.isArray(book.originalData?.entries))book.originalData.entries=book.originalData.entries.filter(e=>String(e.uid)!==String(previous.uid));}}
 else{
  const entry=owned[0]?.[1]??createEntry?.(name,book);
  if(!entry||!Number.isInteger(entry.uid)||book.entries[entry.uid]!==entry)throw Error('酒馆缺少兼容的条目创建接口');
  Object.assign(entry,{dynamic_map_owner:PROMPT_OWNER,comment:'动态地图 · AI 工具使用规则',content:TOOL_PROMPT,constant:true,disable:false,selective:false,vectorized:false,key:[],keysecondary:[],position:1,order:100,probability:100,useProbability:false,excludeRecursion:true,preventRecursion:true,delayUntilRecursion:0,group:'',groupOverride:false,sticky:null,cooldown:null,delay:null,triggers:[],characterFilter:{isExclude:false,names:[],tags:[]}});
 }
 return {book,previous,changed:!same(book,original)};
}
export async function syncToolPrompt({getContext,remove=false,loadModule=()=>import('/scripts/world-info.js'),fetcher=fetch}){
 const ctx=getContext(),name=targetWorldbook(ctx),id=chatIdentity(ctx),metadata=ctx.chatMetadata;
 if(busy.has(name))throw Error('正在处理此世界书，请稍候');busy.add(name);
 const guard=()=>{const now=getContext();if(chatIdentity(now)!==id||now.chatMetadata!==metadata||targetWorldbook(now)!==name)throw Error('聊天或绑定世界书已改变，本次已停止');};
 try{
  const wi=await loadModule();guard();
  if(typeof ctx.getRequestHeaders!=='function')throw Error('酒馆缺少世界书请求接口');
  async function request(route,data){const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);try{const response=await fetcher('/api/worldinfo/'+route,{method:'POST',headers:ctx.getRequestHeaders(),body:JSON.stringify(data),cache:'no-store',signal:abort.signal});if(!response.ok)throw Error(`世界书请求失败（${response.status}）`);return route==='get'?await response.json():null;}finally{clearTimeout(timer);}}
  const original=await request('get',{name});guard();
  const cache=wi.worldInfoCache?.get(name);if(cache&&!same(cache,original))throw Error('世界书编辑器有未保存修改，请先保存并关闭编辑器');
  const prepared=preparePromptBook(original,name,wi.createWorldInfoEntry,remove);
  if(!prepared.changed)return {name,message:remove?'没有本插件写入的提示词，无需删除':'提示词已是最新，无需重复写入'};
  // Back up the owned entry before updates/deletion, never copy unrelated book entries.
  if(prepared.previous){if(typeof ctx.saveMetadata!=='function')throw Error('无法备份原提示词，未修改世界书');const history=metadata.dynamicMapPromptBackups??=[];history.push({name,entry:prepared.previous,at:Date.now()});if(history.length>10)history.splice(0,history.length-10);await ctx.saveMetadata();guard();}
  const latest=await request('get',{name});guard();const currentCache=wi.worldInfoCache?.get(name);
  if(!same(latest,original)||currentCache&&!same(currentCache,original))throw Error('世界书刚被其他操作修改，请重试');
  try{await request('edit',{name,data:prepared.book});}catch(e){throw Error('保存结果未确认，请检查世界书后重试：'+e.message);}
  wi.worldInfoCache?.set(name,clone(prepared.book));
  let warning='';try{const verified=await request('get',{name});if(!same(verified,prepared.book))warning='；读回内容不一致，请打开世界书检查';}catch{warning='；读回校验失败，请打开世界书检查';}
  const events=ctx.eventTypes??ctx.event_types??{};
  try{if(events.WORLDINFO_UPDATED)await ctx.eventSource?.emit(events.WORLDINFO_UPDATED,name,clone(prepared.book));}catch{warning+='；请重新打开世界书刷新界面';}
  return {name,message:(remove?'已删除地图工具提示词':'已写入地图工具提示词')+warning};
 }finally{busy.delete(name);}
}
