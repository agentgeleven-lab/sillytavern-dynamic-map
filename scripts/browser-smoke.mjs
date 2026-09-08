import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.DM_PLAYWRIGHT_PATH?pathToFileURL(process.env.DM_PLAYWRIGHT_PATH).href:'playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixtureWorld=`export const selected_world_info=['enabled'];export const world_names=['enabled','disabled'];export const world_info={};export async function loadWorldInfo(name){globalThis.__bookReads??=[];globalThis.__bookReads.push(name);return {entries:{one:{content:name+' 世界背景'}}};}`;
const customRequests=[];
const {createDemoDocument}=await import('../src/core/demo.js');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/v1/chat/completions'){
  let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{customRequests.push({body:JSON.parse(body),authorization:req.headers.authorization});const doc=createDemoDocument();doc.maps.world.name='独立 API 测试地图';res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(doc)}}]}));});return;
 }
 if(pathname==='/scripts/world-info.js'){res.setHeader('Content-Type','text/javascript');res.end(fixtureWorld);return;}
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.statusCode=403;res.end();return;}
 try{let content=fs.readFileSync(file);if(pathname==='/demo.js')content=content.toString().replace("characters: [{ avatar: 'demo.png' }]","characters: [{ avatar: 'demo.png', data:{name:'测试角色',description:'测试卡片',extensions:{world:'bound'}} }]").replace('async saveMetadata()',`async generateRaw(request){globalThis.__aiRequest=request;const {createDemoDocument}=await import('./src/core/demo.js');const doc=createDemoDocument();doc.maps.world.name='AI 测试地图';return JSON.stringify(doc);},async saveMetadata()`);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(content);}catch{res.statusCode=404;res.end();}
}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
let browser;const errors=[];
try{
 browser=await chromium.launch({channel:process.env.DM_BROWSER_CHANNEL||'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1400,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/demo.html`);
 await page.getByRole('button',{name:'展开',exact:true}).click();
 await page.getByRole('tab',{name:'调整地图',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'名称',exact:true}).count(),0);if(process.env.DM_SCREENSHOT)await page.screenshot({path:process.env.DM_SCREENSHOT});
 await page.getByRole('button',{name:'允许拖动地点',exact:true}).click();
 const center=async id=>{const b=await page.locator(`[data-node-id="${id}"] .dm-dot`).boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2};};
 // Actual pointer stream: unsnapped preview follows the mouse, release snaps nearby.
 let start=await center('longmen_city'),anchor=await center('qingyun_sect');
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(anchor.x+85,anchor.y+10,{steps:15});
 const preview=await page.locator('[data-node-id="longmen_city"]').getAttribute('transform');assert.match(await page.locator('.dm-drag-hint').innerText(),/连接 青云宗/);
 await page.mouse.up();const snapped=await page.locator('[data-node-id="longmen_city"]').getAttribute('transform');assert.notEqual(preview,snapped);assert.match(await page.locator('.dm-savebar').innerText(),/有未保存调整/);
 await page.getByRole('tab',{name:'查看地图',exact:true}).click();assert.equal(await page.locator('.dm-edge').count(),2);
 await page.getByRole('tab',{name:'调整地图',exact:true}).click();assert.equal(await page.locator('.dm-edge').count(),1);
 await page.getByRole('button',{name:'保存地图',exact:true}).click();await page.getByRole('tab',{name:'查看地图',exact:true}).click();assert.equal(await page.locator('.dm-edge').count(),1);
 // Free placement outside all attraction radii, using pointer capture outside the SVG.
 await page.getByRole('tab',{name:'调整地图',exact:true}).click();await page.getByRole('button',{name:'允许拖动地点',exact:true}).click();
 start=await center('longmen_city');const svg=await page.locator('.dm-svg').boundingBox();
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(svg.x-200,svg.y+svg.height+150,{steps:15});assert.match(await page.locator('.dm-drag-hint').innerText(),/自由放置/);const freePreview=await page.locator('[data-node-id="longmen_city"]').getAttribute('transform');await page.mouse.up();assert.equal(await page.locator('[data-node-id="longmen_city"]').getAttribute('transform'),freePreview);assert.equal(await page.locator('.dm-edge').count(),0);
 await page.getByRole('button',{name:'保存地图',exact:true}).click();
 // Compact operations and fixed road catalog.
 await page.getByRole('button',{name:'路线连接',exact:true}).click();assert.equal(await page.getByRole('combobox',{name:'道路类型',exact:true}).count(),1);assert.equal(await page.getByRole('textbox',{name:'道路类型',exact:true}).count(),0);
 await page.getByRole('tab',{name:'地图规则',exact:true}).click();await page.getByRole('button',{name:'道路类型',exact:true}).click();await page.getByRole('textbox',{name:'新道路类型名称',exact:true}).fill('铁路');await page.getByRole('button',{name:'添加类型',exact:true}).click();await page.getByRole('button',{name:'保存地图',exact:true}).click();
 await page.getByRole('tab',{name:'调整地图',exact:true}).click();assert.ok((await page.getByRole('combobox',{name:'道路类型',exact:true}).innerText()).includes('铁路'));
 // Message control mount, dynamic additions, visibility, content isolation and theme persistence.
 await page.evaluate(()=>{const chat=document.createElement('div');chat.id='chat';chat.innerHTML='<div class="mes" mesid="0"><div class="mes_block"><div class="mes_text">原始消息正文</div></div></div>';document.body.append(chat);});
 await page.locator('.dm-message-button').waitFor();assert.equal(await page.locator('.mes_text').innerText(),'原始消息正文');
 await page.getByRole('tab',{name:'设置',exact:true}).click();await page.getByRole('checkbox',{name:'在消息末尾显示小型状态按钮',exact:true}).uncheck();assert.equal(await page.locator('.dm-message-map').isVisible(),false);
 await page.getByRole('combobox',{name:'界面主题',exact:true}).selectOption('paper');assert.equal(await page.locator('#dynamic-map-panel').getAttribute('data-theme'),'paper');assert.equal(await page.getByRole('button',{name:'保存地图',exact:true}).count(),0);
 await page.getByRole('checkbox',{name:'在消息末尾显示小型状态按钮',exact:true}).check();await page.getByRole('button',{name:'收起',exact:true}).click();await page.locator('.dm-message-button').click();assert.equal(await page.locator('#dm-content').isVisible(),true);
 await page.reload();assert.equal(await page.locator('#dynamic-map-panel').getAttribute('data-theme'),'paper');
 // Mock model receives actual source material. No network model call is made.
 await page.getByRole('tab',{name:'AI生成地图',exact:true}).click();await page.getByRole('button',{name:'生成地图草稿',exact:true}).click();await page.getByText('已生成草稿；请检查并保存地图。',{exact:true}).waitFor();
 let request=await page.evaluate(()=>JSON.parse(globalThis.__aiRequest.prompt));assert.equal(request.设定素材.角色卡.名称,'测试角色');assert.deepEqual(request.设定素材.世界书.map(b=>b.名称),['bound']);
 await page.getByRole('checkbox',{name:'同时读取已开启的全局世界书',exact:true}).check();await page.getByRole('button',{name:'生成地图草稿',exact:true}).click();await page.getByText('已生成草稿；请检查并保存地图。',{exact:true}).waitFor();request=await page.evaluate(()=>JSON.parse(globalThis.__aiRequest.prompt));assert.deepEqual(request.设定素材.世界书.map(b=>b.名称),['bound','enabled']);assert.ok(!(await page.evaluate(()=>globalThis.__bookReads)).includes('disabled'));
 // Independent API works without the host generation method and keeps keys out of storage.
 await page.getByRole('tab',{name:'设置',exact:true}).click();
 await page.getByRole('checkbox',{name:'使用独立 API 生成地图',exact:true}).check();
 await page.getByRole('textbox',{name:'API 地址',exact:true}).fill(`http://127.0.0.1:${server.address().port}/v1`);
 await page.getByLabel('API 密钥',{exact:true}).fill('browser-test-only-key');
 await page.getByRole('textbox',{name:'模型名称',exact:true}).fill('custom-test-model');
 await page.getByRole('button',{name:'保存 API 设置',exact:true}).click();
 await page.evaluate(()=>{const original=globalThis.SillyTavern.getContext;globalThis.SillyTavern.getContext=()=>{const ctx=original();delete ctx.generateRaw;return ctx;};});
 await page.getByRole('tab',{name:'AI生成地图',exact:true}).click();
 await page.getByRole('button',{name:'生成地图草稿',exact:true}).click();
 await page.getByRole('heading',{name:'独立 API 测试地图',exact:true}).waitFor();
 assert.equal(customRequests.length,1);assert.equal(customRequests[0].body.model,'custom-test-model');assert.equal(customRequests[0].authorization,'Bearer browser-test-only-key');
 const customMaterial=JSON.parse(customRequests[0].body.messages[1].content);assert.deepEqual(customMaterial.设定素材.世界书.map(b=>b.名称),['bound','enabled']);
 assert.ok(!(await page.evaluate(()=>JSON.stringify({...localStorage}))).includes('browser-test-only-key'));
 await page.getByRole('tab',{name:'查看地图',exact:true}).click();assert.equal(await page.getByRole('heading',{name:'独立 API 测试地图',exact:true}).count(),0);
 await page.reload();await page.getByRole('tab',{name:'设置',exact:true}).click();assert.equal(await page.getByLabel('API 密钥',{exact:true}).inputValue(),'');
 assert.equal(await page.getByRole('textbox',{name:'模型名称',exact:true}).inputValue(),'custom-test-model');
 assert.deepEqual(errors,[]);console.log('PASS: real pointer drag/free drop, draft/save, compact forms, road catalogs, message controls, themes and AI source scope and custom API (local mock models).');
}finally{await browser?.close();server.close();}


