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
 if(pathname==='/scripts/variables.js'){res.setHeader('Content-Type','text/javascript');res.end("export function setLocalVariable(k,v){const c=globalThis.SillyTavern.getContext();c.chatMetadata.variables??={};c.chatMetadata.variables[k]=v;}");return;}
 if(pathname==='/hud/map-link.js'&&process.env.DM_HUD_PATH){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(process.env.DM_HUD_PATH,'map-link.js')));return;}
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
 await page.mouse.up();const snapped=await page.locator('[data-node-id="longmen_city"]').getAttribute('transform');assert.notEqual(preview,snapped);assert.match(await page.locator('.dm-savebar').innerText(),/未保存：/);
 await page.getByRole('tab',{name:'查看地图',exact:true}).click();assert.equal(await page.locator('.dm-edge').count(),2);
 await page.getByRole('tab',{name:'调整地图',exact:true}).click();assert.equal(await page.locator('.dm-edge').count(),1);
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();await page.getByRole('tab',{name:'查看地图',exact:true}).click();assert.equal(await page.locator('.dm-edge').count(),1);
 // Free placement outside all attraction radii, using pointer capture outside the SVG.
 await page.getByRole('tab',{name:'调整地图',exact:true}).click();await page.getByRole('button',{name:'允许拖动地点',exact:true}).click();
 start=await center('longmen_city');const svg=await page.locator('.dm-svg').boundingBox();
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(svg.x-200,svg.y+svg.height+150,{steps:15});assert.match(await page.locator('.dm-drag-hint').innerText(),/自由放置/);const freePreview=await page.locator('[data-node-id="longmen_city"]').getAttribute('transform');await page.mouse.up();assert.equal(await page.locator('[data-node-id="longmen_city"]').getAttribute('transform'),freePreview);assert.equal(await page.locator('.dm-edge').count(),0);
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 // Compact operations and fixed road catalog.
 await page.getByRole('button',{name:'路线连接',exact:true}).click();assert.equal(await page.getByRole('combobox',{name:'道路类型',exact:true}).count(),1);assert.equal(await page.getByRole('textbox',{name:'道路类型',exact:true}).count(),0);
 // Route apply must run its layout callback without an undefined generation-mode variable.
 await page.getByRole('button',{name:'添加路线',exact:true}).click();assert.equal(await page.locator('.dm-edge').count(),1);
 await page.getByRole('button',{name:'放弃草稿',exact:true}).click();assert.equal(await page.locator('.dm-edge').count(),0);
 await page.getByRole('tab',{name:'地图规则',exact:true}).click();await page.getByRole('button',{name:'道路类型',exact:true}).click();await page.getByRole('textbox',{name:'新道路类型名称',exact:true}).fill('铁路');await page.getByRole('button',{name:'添加类型',exact:true}).click();await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 await page.getByRole('tab',{name:'调整地图',exact:true}).click();assert.ok((await page.getByRole('combobox',{name:'道路类型',exact:true}).innerText()).includes('铁路'));
 // Message control mount, dynamic additions, visibility, content isolation and theme persistence.
 await page.evaluate(()=>{const chat=document.createElement('div');chat.id='chat';chat.innerHTML='<div class="mes" mesid="0"><div class="mes_block"><div class="mes_text">原始消息正文</div></div></div>';document.body.append(chat);});
 await page.locator('.dm-message-button').waitFor();assert.equal(await page.locator('.mes_text').innerText(),'原始消息正文');
 await page.getByRole('tab',{name:'设置',exact:true}).click();await page.getByRole('checkbox',{name:'在消息末尾显示小型地图按钮',exact:true}).uncheck();assert.equal(await page.locator('.dm-message-map').isVisible(),false);
 await page.getByRole('combobox',{name:'界面主题',exact:true}).selectOption('paper');assert.equal(await page.locator('#dynamic-map-panel').getAttribute('data-theme'),'paper');assert.equal(await page.getByRole('button',{name:'保存全部地图调整',exact:true}).count(),0);
 await page.getByRole('checkbox',{name:'在消息末尾显示小型地图按钮',exact:true}).check();await page.getByRole('button',{name:'收起',exact:true}).click();await page.locator('.dm-message-button').click();
 const inline=page.getByRole('region',{name:'消息末尾地图窗口',exact:true});await inline.waitFor();
 assert.equal(await page.locator('#dynamic-map-panel .dm-content').isVisible(),false);
 assert.equal(await inline.evaluate(e=>getComputedStyle(e).position),'relative');assert.equal(await inline.getByRole('tab').count(),6);
 assert.equal(await inline.evaluate(e=>!!e.closest('#chat .mes[mesid]')),true);
 await inline.getByRole('tab',{name:'调整地图',exact:true}).click();await inline.getByRole('button',{name:'地点资料',exact:true}).click();
 await inline.getByRole('combobox',{name:'选择地点',exact:true}).selectOption('longmen_city');await inline.getByRole('textbox',{name:'名称',exact:true}).fill('消息内编辑');
 await inline.getByRole('button',{name:'应用地点调整',exact:true}).click();
 assert.equal(await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState().maps.world.nodes.longmen_city.name),'龙门市');
 await page.locator('.dm-message-button').click();assert.equal(await page.locator('.dm-inline').count(),0);
 await page.locator('.dm-message-button').click();await inline.getByRole('tab',{name:'调整地图',exact:true}).click();
 assert.equal(await inline.getByRole('button',{name:'消息内编辑，当前位置，查看地点详情',exact:true}).count(),1);
 await inline.getByRole('button',{name:'保存全部地图调整',exact:true}).click();assert.equal(await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState().maps.world.nodes.longmen_city.name),'消息内编辑');
 assert.equal(await page.locator('.mes_text').innerText(),'原始消息正文');
 await inline.getByRole('tab',{name:'设置',exact:true}).click();await inline.getByRole('checkbox',{name:'在消息末尾显示小型地图按钮',exact:true}).click();
 assert.equal(await page.locator('.dm-inline').count(),0);assert.equal(await page.locator('.dm-message-map').isVisible(),false);
 await page.locator('#dynamic-map-panel').getByRole('button',{name:'展开',exact:true}).click();

 await page.reload();assert.equal(await page.locator('#dynamic-map-panel').getAttribute('data-theme'),'paper');
 // Mock model receives actual source material. No network model call is made.
 await page.getByRole('tab',{name:'AI生成地图',exact:true}).click();await page.getByRole('button',{name:'生成地图草稿',exact:true}).click();await page.getByText('已生成草稿；请检查并保存地图。',{exact:true}).waitFor();
 let request=await page.evaluate(()=>JSON.parse(globalThis.__aiRequest.prompt));assert.equal(request.设定素材.角色卡.名称,'测试角色');assert.deepEqual(request.设定素材.世界书.map(b=>b.名称),['bound']);
 await page.getByRole('checkbox',{name:'同时读取已开启的全局世界书',exact:true}).check();await page.getByRole('button',{name:'生成地图草稿',exact:true}).click();await page.getByText('已生成草稿；请检查并保存地图。',{exact:true}).waitFor();request=await page.evaluate(()=>JSON.parse(globalThis.__aiRequest.prompt));assert.deepEqual(request.设定素材.世界书.map(b=>b.名称),['bound','enabled']);assert.ok(!(await page.evaluate(()=>globalThis.__bookReads)).includes('disabled'));
 // Reproduce a host promise that never returns, then cancel and ignore a late result.
 await page.evaluate(()=>{globalThis.__originalGetContext=globalThis.SillyTavern.getContext;globalThis.SillyTavern.getContext=()=>({...globalThis.__originalGetContext(),generateRaw:()=>new Promise(resolve=>globalThis.__resolveHung=resolve)});});
 const previousMap=await page.evaluate(()=>JSON.stringify(globalThis.SillyTavernDynamicMap.getState()));
 await page.getByRole('button',{name:'生成地图草稿',exact:true}).click();
 await page.getByText(/等待酒馆模型返回 · 已等待/).waitFor();
 await page.getByRole('button',{name:'取消生成',exact:true}).click();
 await page.getByRole('button',{name:'生成地图草稿',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'生成地图草稿',exact:true}).isEnabled(),true);
 await page.evaluate(()=>globalThis.__resolveHung('{"invalid":"late"}'));assert.equal(await page.evaluate(()=>JSON.stringify(globalThis.SillyTavernDynamicMap.getState())),previousMap);
 // Total timeout also releases the UI when a host promise never settles.
 await page.getByRole('tab',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'生成 API',exact:true}).click();await page.getByRole('spinbutton',{name:'生成总超时（秒，两种模型均适用）',exact:true}).fill('10');await page.getByRole('button',{name:'保存 API 设置',exact:true}).click();
 await page.getByRole('tab',{name:'AI生成地图',exact:true}).click();await page.getByRole('button',{name:'生成地图草稿',exact:true}).click();
 await page.locator('.dm-generation-progress').filter({hasText:'生成总等待超时'}).waitFor({timeout:15000});assert.equal(await page.getByRole('button',{name:'生成地图草稿',exact:true}).isEnabled(),true);
 await page.evaluate(()=>globalThis.SillyTavern.getContext=globalThis.__originalGetContext);
 await page.getByRole('tab',{name:'调整地图',exact:true}).click();await page.getByRole('textbox',{name:'地图名称',exact:true}).fill('自定地图名称');await page.getByRole('button',{name:'应用地图名称',exact:true}).click();await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 await page.getByRole('tab',{name:'查看地图',exact:true}).click();await page.getByRole('heading',{name:'自定地图名称',exact:true}).waitFor();
 // Independent API works without the host generation method and keeps keys out of storage.
 await page.getByRole('tab',{name:'设置',exact:true}).click();
 await page.getByRole('button',{name:'生成 API',exact:true}).click();await page.getByRole('checkbox',{name:'使用独立 API 生成地图',exact:true}).check();
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
 await page.reload();await page.getByRole('tab',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'生成 API',exact:true}).click();assert.equal(await page.getByLabel('API 密钥',{exact:true}).inputValue(),'');
 assert.equal(await page.getByRole('textbox',{name:'模型名称',exact:true}).inputValue(),'custom-test-model');
 await page.evaluate(()=>{
 const original=globalThis.SillyTavern.getContext;
 globalThis.SillyTavern.getContext=()=>({...original(),chat:(globalThis.__mapChat??=[{name:'用户',is_user:true,mes:'城南新发现了一座驿站'}]),generateRaw:async request=>{
  globalThis.__expansionRequest=request;
  const {createNode,createEdge}=await import('./src/core/protocol.js');
  const doc=JSON.parse(request.prompt).当前地图,m=doc.maps[doc.activeMap],root=Object.keys(m.nodes).at(-1);
  return JSON.stringify({nodes:{new_inn:createNode('new_inn','新驿站',{type:m.metadata.nodeTypes[0].id})},edges:[createEdge('new_inn_road',root,'new_inn',{direction:'east',type:m.metadata.roadTypes[0].id,name:'驿道',distance:12})]});
 }});
 });
 await page.getByRole('tab',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'生成 API',exact:true}).click();await page.getByRole('checkbox',{name:'使用独立 API 生成地图',exact:true}).uncheck();await page.getByRole('button',{name:'保存 API 设置',exact:true}).click();
 await page.getByRole('tab',{name:'AI生成地图',exact:true}).click();
 assert.equal(await page.getByRole('checkbox',{name:'为道路生成距离',exact:true}).isChecked(),false);
 await page.getByRole('checkbox',{name:'为道路生成距离',exact:true}).check();
 const priorExpansion=await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState());
 await page.getByRole('button',{name:'根据资料与聊天记录新增地点和道路',exact:true}).click();
 await page.getByText('已生成草稿；请检查并保存地图。',{exact:true}).waitFor({timeout:5000}).catch(async e=>{console.log(await page.locator('.dm-generation-progress').innerText());throw e;});
 const expansionRequest=await page.evaluate(()=>JSON.parse(globalThis.__expansionRequest.prompt));assert.equal(expansionRequest.最近聊天记录[0].内容,'城南新发现了一座驿站');assert.ok(expansionRequest.当前地图);
 assert.deepEqual(await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState()),priorExpansion);
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 const expanded=await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState());const em=expanded.maps[expanded.activeMap];assert.equal(em.nodes.new_inn.name,'新驿站');assert.equal(em.edges.find(e=>e.id==='new_inn_road').distance,12);assert.equal(em.edges.find(e=>e.id==='new_inn_road').name,'');
 // Real UI: create a closed triangle, arrange it, and save the exact preview.
 await page.evaluate(async()=>{const api=globalThis.SillyTavernDynamicMap,m=api.getState().maps.world;const {createEdge}=await import('./src/core/protocol.js');api.applyUpdate([{type:'upsertEdge',edge:createEdge('cycle_test','qingyun_sect','baisha_town',{direction:'east',type:m.metadata.roadTypes[0].id,distance:42})}]);});
 await page.getByRole('tab',{name:'调整地图',exact:true}).click();await page.getByRole('button',{name:'自动布局',exact:true}).click();
 const beforeArrange=await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState());
 await page.getByRole('button',{name:'自动整理地图',exact:true}).click();assert.match(await page.locator('.dm-feedback').innerText(),/已自动布局/);
 assert.deepEqual(await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState()),beforeArrange);
 const positions=await page.locator('[data-node-id]').evaluateAll(nodes=>nodes.map(n=>[n.dataset.nodeId,n.getAttribute('transform')]));
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();assert.deepEqual(await page.locator('[data-node-id]').evaluateAll(nodes=>nodes.map(n=>[n.dataset.nodeId,n.getAttribute('transform')])),positions);
 const arranged=await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState());assert.equal(arranged.maps.world.edges.length,beforeArrange.maps.world.edges.length);assert.equal(arranged.maps.world.edges.find(e=>e.id==='cycle_test').distance,42);
 await page.getByRole('button',{name:'地点资料',exact:true}).click();await page.getByRole('combobox',{name:'选择地点',exact:true}).selectOption('longmen_city');
 await page.getByRole('checkbox',{name:'固定此地点位置（自动布局时保留）',exact:true}).check();await page.getByRole('button',{name:'应用地点调整',exact:true}).click();
 const pinned=await page.locator('[data-node-id="longmen_city"]').getAttribute('transform');
 await page.getByRole('button',{name:'自动布局',exact:true}).click();await page.getByRole('button',{name:'自动整理地图',exact:true}).click();assert.equal(await page.locator('[data-node-id="longmen_city"]').getAttribute('transform'),pinned);
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 // Cell maps and nested navigation through the actual editor.
 await page.getByRole('button',{name:'地图类型与层级',exact:true}).click();
 await page.getByRole('combobox',{name:'地图形态',exact:true}).selectOption('hex');
 await page.getByRole('button',{name:'应用地图形态',exact:true}).click();
 assert.ok(await page.locator('.dm-cell-layer polygon').count()>0);
 assert.equal((await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState())).maps.world.type,'graph');
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 assert.equal((await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState())).maps.world.type,'hex');
 await page.getByRole('textbox',{name:'新地图名称',exact:true}).fill('龙门城内');
 await page.getByRole('combobox',{name:'新地图形态',exact:true}).selectOption('grid');
 await page.getByRole('combobox',{name:'上级入口地点',exact:true}).selectOption('longmen_city');
 await page.getByRole('button',{name:'创建子地图',exact:true}).click();
 assert.ok(await page.locator('.dm-cell-layer rect').count()>0);
 await page.getByRole('button',{name:'地点资料',exact:true}).click();
 await page.getByRole('textbox',{name:'名称',exact:true}).fill('城门');
 await page.getByRole('button',{name:'新增地点',exact:true}).click();
 await page.getByRole('button',{name:'设为当前位置',exact:true}).click();
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 const nested=await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState()),child=nested.maps[nested.activeMap];
 assert.equal(child.parentMap,'world');assert.equal(child.metadata.parentNode,'longmen_city');assert.equal(child.type,'grid');
 await page.getByRole('tab',{name:'查看地图',exact:true}).click();
 await page.getByRole('button',{name:/^返回上级：/}).click();
 assert.equal(await page.getByRole('button',{name:'进入：龙门城内',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'进入内部地图：龙门城内',exact:true}).count(),0);await page.locator('[data-node-id="longmen_city"] .dm-dot').click();await page.getByRole('button',{name:'进入内部地图：龙门城内',exact:true}).click();
 assert.equal((await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState())).activeMap,child.id);
 await page.getByRole('tab',{name:'调整地图',exact:true}).click();
 await page.getByRole('button',{name:'允许拖动地点',exact:true}).click();
 const cellNode=page.locator('[data-node-id]').first(),box=await cellNode.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+140,box.y+box.height/2+100,{steps:8});await page.mouse.up();
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 const moved=await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState());
 assert.notDeepEqual(moved.maps[child.id].nodes[child.currentLocation].position,child.nodes[child.currentLocation].position);
 assert.equal(moved.maps[child.id].nodes[child.currentLocation].position.x%160,0);
 await page.reload();await page.getByRole('heading',{name:'龙门城内',exact:true}).waitFor();assert.ok(await page.locator('.dm-cell-layer rect').count()>0);
 // Paint multiple cells, save and inspect their independent properties.
 await page.getByRole('tab',{name:'调整地图',exact:true}).click();
 await page.getByRole('button',{name:'编辑格子',exact:true}).click();
 const cp=moved.maps[child.id].nodes[child.currentLocation].position,key0=`${cp.x/160-1},${cp.y/160}`,key1=`${cp.x/160},${cp.y/160}`;
 const cellScreen=async key=>page.locator(`[data-cell-key="${key}"]`).evaluate(e=>{const b=e.getBBox(),p=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(e.getScreenCTM());return {x:p.x,y:p.y};});
 const pickCell=async key=>{const p=await cellScreen(key);await page.mouse.click(p.x,p.y);};
 await pickCell(key0);
 await page.getByRole('combobox',{name:'格子区域类型',exact:true}).selectOption('suburb');
 await page.getByRole('combobox',{name:'格子地形',exact:true}).selectOption('forest');
 await page.getByRole('textbox',{name:'格子名称',exact:true}).fill('东郊');
 await page.getByRole('textbox',{name:'格子说明',exact:true}).fill('城外树林');
 await page.getByRole('button',{name:'应用到选中格子',exact:true}).click();
 assert.equal((await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState())).maps[child.id].metadata.cells,undefined);
 await page.getByRole('button',{name:'刷选格子',exact:true}).click();
 const c0=await cellScreen(key0),c1=await cellScreen(key1);await page.mouse.move(c0.x,c0.y);await page.mouse.down();await page.mouse.move(c1.x,c1.y,{steps:12});await page.mouse.up();
 assert.match(await page.locator('.dm-cell-selection').innerText(),/已选择 2 格/);
 await page.getByRole('button',{name:'应用到选中格子',exact:true}).click();
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 let painted=await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState());assert.equal(painted.maps[child.id].metadata.cells[key1].name,'东郊');assert.deepEqual(painted.maps[child.id].nodes,moved.maps[child.id].nodes);
 await page.getByRole('tab',{name:'地图规则',exact:true}).click();await page.getByRole('button',{name:'行政区域',exact:true}).click();
 await page.getByRole('textbox',{name:'新增条目名称',exact:true}).fill('沧州');await page.getByRole('button',{name:'添加条目',exact:true}).click();
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 painted=await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState());const province=painted.maps[child.id].metadata.cellRules.regions[0].id;
 await page.getByRole('tab',{name:'调整地图',exact:true}).click();await page.getByRole('button',{name:'编辑格子',exact:true}).click();await pickCell(key0);
 await page.getByRole('combobox',{name:'格子行政归属',exact:true}).selectOption(province);await page.getByRole('button',{name:'应用到选中格子',exact:true}).click();await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 await page.getByRole('tab',{name:'查看地图',exact:true}).click();await pickCell(key0);await page.getByText('行政归属：沧州',{exact:true}).waitFor();await page.getByText('城外树林',{exact:true}).waitFor();
 await page.reload();await pickCell(key0);await page.getByText('行政归属：沧州',{exact:true}).waitFor();
 // Browsing never changes the role position or committed document.
 const roleBefore=await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState());
 await page.getByRole('button',{name:/^返回上级：/}).click();assert.deepEqual(await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState()),roleBefore);
 assert.equal(await page.locator('[data-node-id="longmen_city"]').getAttribute('class'),'dm-node dm-current');
 await page.locator('[data-node-id="longmen_city"] .dm-dot').click();await page.getByRole('button',{name:'进入内部地图：龙门城内',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState()),roleBefore);
 await page.getByRole('button',{name:/^返回上级：/}).click();await page.getByRole('tab',{name:'AI生成地图',exact:true}).click();
 await page.evaluate(()=>{const original=globalThis.SillyTavern.getContext;globalThis.SillyTavern.getContext=()=>({...original(),generateRaw:async request=>{globalThis.__childRequest=request;const {createMap,createNode}=await import('./src/core/protocol.js'),{prepareDocument}=await import('./src/core/spatial.js'),m=createMap('generated','内部生成测试','hex');m.nodes.gate=createNode('gate','内门');return JSON.stringify(prepareDocument({version:1,activeMap:m.id,maps:{[m.id]:m}}));}});});
 const generateChild=async()=>{await page.getByRole('combobox',{name:'生成层级',exact:true}).selectOption('city');await page.getByRole('combobox',{name:'内部地图入口地点',exact:true}).selectOption('longmen_city');await page.getByRole('combobox',{name:'内部地图形态',exact:true}).selectOption('hex');await page.getByRole('button',{name:'为选中地点生成内部地图',exact:true}).click();await page.getByRole('heading',{name:'内部生成测试',exact:true}).waitFor();};
 await generateChild();let childReq=await page.evaluate(()=>globalThis.__childRequest);assert.match(childReq.systemPrompt,/城市／聚落/);assert.match(childReq.systemPrompt,/街区/);assert.equal(JSON.parse(childReq.prompt).生成范围.入口地点.id,'longmen_city');assert.equal(JSON.parse(childReq.prompt).生成范围.上级地图.id,'world');
 assert.deepEqual(await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState()),roleBefore);
 await page.getByRole('button',{name:'撤销本次生成',exact:true}).click();assert.equal(await page.getByRole('heading',{name:'内部生成测试',exact:true}).count(),0);
 await page.getByRole('combobox',{name:'地图',exact:true}).selectOption('world');await generateChild();await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 const withChild=await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState()),newMap=Object.values(withChild.maps).find(m=>m.name==='内部生成测试');assert.equal(newMap.parentMap,'world');assert.equal(newMap.metadata.parentNode,'longmen_city');assert.equal(newMap.type,'hex');assert.equal(withChild.activeMap,roleBefore.activeMap);for(const id of Object.keys(roleBefore.maps))assert.deepEqual(withChild.maps[id],roleBefore.maps[id]);
 // A result for a map that is no longer selected must not be applied.
 await page.evaluate(()=>{const original=globalThis.SillyTavern.getContext;globalThis.SillyTavern.getContext=()=>({...original(),generateRaw:()=>new Promise(resolve=>{globalThis.__resolveLateMap=resolve;})});});
 await page.getByRole('button',{name:'生成地图草稿',exact:true}).click();await page.waitForFunction(()=>!!globalThis.__resolveLateMap);
 await page.getByRole('combobox',{name:'地图',exact:true}).selectOption('world');await page.evaluate(()=>globalThis.__resolveLateMap('{}'));
 await page.getByText(/生成未应用：.*变化/).waitFor();assert.deepEqual(await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState()),withChild);
 // Verified host variable contract and companion HUD widget.
 await page.waitForFunction(()=>globalThis.SillyTavern.getContext().chatMetadata.variables?.地图);
 const sharedMap=await page.evaluate(()=>JSON.parse(globalThis.SillyTavern.getContext().chatMetadata.variables.地图));assert.equal(sharedMap.来源,'动态地图插件');assert.equal(sharedMap.地图ID,withChild.activeMap);
 if(process.env.DM_HUD_PATH){
  await page.evaluate(async()=>{const {createMapLink}=await import('/hud/map-link.js');const widget=createMapLink({open:()=>{globalThis.__hudOpenedMap=true;}});document.body.append(widget.element);globalThis.__mapWidget=widget;});
  await page.getByRole('button',{name:'打开当前位置地图',exact:true}).click();assert.equal(await page.evaluate(()=>globalThis.__hudOpenedMap),true);await page.getByRole('heading',{name:withChild.maps[withChild.activeMap].name,exact:true}).waitFor();
  await page.evaluate(()=>globalThis.__mapWidget.destroy());
 }
 await page.getByRole('tab',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'变量与状态栏',exact:true}).click();await page.getByRole('checkbox',{name:'允许小白X提交位置更新',exact:true}).check();
 const requestResult=await page.evaluate(()=>{globalThis.LWB_StateV2={applyText(){}};const c=globalThis.SillyTavern.getContext(),d=globalThis.SillyTavernDynamicMap.getState();c.chatMetadata.variables.地图移动请求=JSON.stringify({请求ID:'browser-move',地图版本:c.chatMetadata.dynamicMapV1.updatedAt,地图ID:'world',地点ID:'qingyun_sect'});return d.activeMap;});
 await page.waitForFunction(()=>globalThis.SillyTavernDynamicMap.getState().activeMap==='world'&&globalThis.SillyTavernDynamicMap.getCurrentLocation()?.id==='qingyun_sect');
 await page.waitForFunction(()=>JSON.parse(globalThis.SillyTavern.getContext().chatMetadata.variables.地图).地点ID==='qingyun_sect');
 // Invoke the registered native callbacks through a simulated host tool registry.
 await page.evaluate(()=>{const original=globalThis.SillyTavern.getContext;globalThis.__mapTools={};globalThis.SillyTavern.getContext=()=>({...original(),registerFunctionTool:t=>globalThis.__mapTools[t.name]=t,unregisterFunctionTool:n=>delete globalThis.__mapTools[n],isToolCallingSupported:()=>true});});
 await page.getByRole('button',{name:'AI 动态更新',exact:true}).click();await page.getByRole('checkbox',{name:'启用聊天中的地图工具',exact:true}).check();
 await page.getByRole('tab',{name:'调整地图',exact:true}).click();await page.getByRole('button',{name:'放弃草稿',exact:true}).click();
 const beforeTools=await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState());
 const toolResult=await page.evaluate(async()=>{const t=globalThis.__mapTools,q=JSON.parse(await t.dynamic_map_query.action({mapId:'world'}));return JSON.parse(await t.dynamic_map_update.action({token:q.token,reason:'测试叙事移动',operations:[{op:'move',mapId:'world',id:'longmen_city'}]}));});
 assert.equal(toolResult.ok,true);assert.equal(toolResult.applied,false);assert.deepEqual(await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getState()),beforeTools);
 await page.getByRole('button',{name:'保存全部地图调整',exact:true}).click();
 assert.equal(await page.evaluate(()=>globalThis.SillyTavernDynamicMap.getCurrentLocation().id),'longmen_city');
 await page.getByRole('tab',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'AI 动态更新',exact:true}).click();await page.getByRole('checkbox',{name:'自动保存 AI 地图更新',exact:true}).check();
 const savedTool=await page.evaluate(async()=>{const t=globalThis.__mapTools,q=JSON.parse(await t.dynamic_map_query.action({mapId:'world'}));return JSON.parse(await t.dynamic_map_update.action({token:q.token,reason:'测试自动保存',operations:[{op:'move',mapId:'world',id:'qingyun_sect'}]}));});assert.equal(savedTool.applied,true);
 await page.waitForFunction(()=>JSON.parse(globalThis.SillyTavern.getContext().chatMetadata.variables.地图).地点ID==='qingyun_sect');
 assert.deepEqual(errors,[]);console.log('PASS: real pointer drag/free drop, draft/save, compact forms, road catalogs, inline message windows with shared drafts, themes and AI source scope and custom API (local mock models).');
}finally{await browser?.close();server.close();}




