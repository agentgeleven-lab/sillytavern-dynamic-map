import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.DM_PLAYWRIGHT_PATH?pathToFileURL(process.env.DM_PLAYWRIGHT_PATH).href:'playwright');const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const original={entries:{0:{uid:0,content:'保留原文'},1:{uid:1,content:''}}};let book=structuredClone(original),writes=0;
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost').pathname;
 if(url.startsWith('/api/worldinfo/')){let body='';req.on('data',c=>body+=c);req.on('end',()=>{const data=JSON.parse(body);assert.equal(data.name,'测试世界书');res.setHeader('Content-Type','application/json');if(url.endsWith('/edit')){book=data.data;writes++;res.end('{}');}else res.end(JSON.stringify(book));});return;}
 if(url==='/scripts/world-info.js'){res.setHeader('Content-Type','text/javascript');res.end('export const worldInfoCache=new Map();export function createWorldInfoEntry(_,b){let uid=0;while(b.entries[uid])uid++;return b.entries[uid]={uid};}');return;}
 const file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{let data=fs.readFileSync(file);if(url==='/demo.js')data=data.toString().replace("characters: [{ avatar: 'demo.png' }]","characters: [{ avatar: 'demo.png',data:{extensions:{world:'测试世界书'}} }]").replace('const settings =', "const chat=[];const prompts={};globalThis.textFixture={chat,prompts,emit:(key,...args)=>{for(const fn of listeners.get(key)??[])fn(...args);}};const settings =").replace("event_types: { APP_INITIALIZED: 'ready', CHAT_CHANGED: 'chat' }","chat,saveSettingsDebounced(){},setExtensionPrompt:(key,value)=>prompts[key]=value,event_types: { APP_INITIALIZED: 'ready', CHAT_CHANGED: 'chat', GENERATION_AFTER_COMMANDS:'start',MESSAGE_RECEIVED:'received',GENERATION_ENDED:'end',GENERATION_STOPPED:'stop' }").replace('async saveMetadata()',"getRequestHeaders:()=>({'Content-Type':'application/json'}),async saveMetadata()");res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data);}catch{res.writeHead(404).end();}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/demo.html`);
 await page.getByRole('button',{name:'展开',exact:true}).click();
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 await page.getByRole('tab',{name:'设置',exact:true}).click();
 await page.getByRole('button',{name:'AI 动态更新',exact:true}).click();
 await page.getByRole('button',{name:'一键写入世界书',exact:true}).click();
 await page.getByText('测试世界书：已写入地图工具提示词',{exact:true}).waitFor();
 await page.getByRole('combobox',{name:'更新方式',exact:true}).selectOption('text');
 await page.getByRole('checkbox',{name:'启用聊天中的地图工具',exact:true}).check();
 await page.getByText('正文模式可用，无需模型支持工具调用',{exact:true}).waitFor();
 await page.getByRole('button',{name:'一键写入世界书',exact:true}).click();
 await page.getByText('测试世界书：已写入地图工具提示词',{exact:true}).waitFor();
 await page.getByRole('button',{name:'一键添加隐藏正则',exact:true}).click();
 await page.getByText(/已添加地图隐藏正则；/).waitFor();
 await page.getByRole('button',{name:'一键添加隐藏正则',exact:true}).click();
 await page.getByText('隐藏正则已是最新，无需重复添加',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>SillyTavern.getContext().extensionSettings.regex.length),1);
 assert.equal(await page.evaluate(()=>SillyTavern.getContext().extensionSettings.regex[0].markdownOnly),true);
 await page.getByRole('button',{name:'移除地图隐藏正则',exact:true}).click();
 await page.getByText(/已移除地图隐藏正则；/).waitFor();
 assert.equal(await page.evaluate(()=>SillyTavern.getContext().extensionSettings.regex.length),0);
 assert.equal(writes,2);assert.equal(Object.keys(book.entries).length,3);assert.match(book.entries[2].content,/<map_update>/);assert.deepEqual(book.entries[0],original.entries[0]);
 await page.evaluate(()=>{const f=globalThis.textFixture;f.emit('start','normal',{},false);const data=JSON.parse(f.prompts['dynamic-map-text-update'].split('本轮地图数据：\n')[1]);f.chat.push({mes:'抵达宗门。<map_update>'+JSON.stringify({token:data.token,reason:'已到达',operations:[{op:'move',mapId:'world',id:'qingyun_sect'}]})+'</map_update>',is_user:false,gen_finished:Date.now()});f.emit('received',0);});
 await page.getByRole('tab',{name:'调整地图',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'保存全部地图调整',exact:true}).isEnabled(),false);
 await page.evaluate(()=>globalThis.textFixture.emit('end'));
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).waitFor();
 await page.waitForFunction(()=>SillyTavern.getContext().chat.length===1);
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click({trial:true});
 await page.getByText('AI 更新已进入草稿，请检查并保存全部地图',{exact:true}).first().waitFor();
 assert.equal(await page.evaluate(()=>SillyTavern.getContext().chatMetadata.dynamicMapV1.document.maps.world.currentLocation),'longmen_city');
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 assert.equal(await page.evaluate(()=>SillyTavern.getContext().chatMetadata.dynamicMapV1.document.maps.world.currentLocation),'qingyun_sect');
 await page.getByRole('tab',{name:'设置',exact:true}).click();
 await page.getByRole('checkbox',{name:'启用聊天中的地图工具',exact:true}).uncheck();
 assert.equal(await page.evaluate(()=>globalThis.textFixture.prompts['dynamic-map-text-update']),'');
 assert.deepEqual(errors,[]);console.log('PASS: actual mode controls, native-to-text worldbook replacement, completed reply stages then saves, disabling clears injection; mock host only');
}finally{await browser?.close();server.close();}
