import { createDraftSession } from '../core/draft.js';
import { createNode, createEdge, validateDocument } from '../core/protocol.js';
import { DIRECTIONS, prepareDocument, layoutMap, validateRules, applySnap, connectionDetails } from '../core/spatial.js';
import { renderMap, fitCamera } from './graph.js';
import { attachFloatingWindow, readWindowPreferences } from './floating.js';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const uid=prefix=>`${prefix}_${crypto.randomUUID().replaceAll('-','')}`;
const button=(text,fn)=>{const e=el('button',text);e.type='button';e.addEventListener('click',fn);return e;};
const input=(value='',type='text')=>{const e=el('input');e.type=type;e.value=value;return e;};
const select=(items,value)=>{const e=el('select');for(const item of items){const o=el('option',item.name??item.label);o.value=item.id;e.append(o);}e.value=value;return e;};
const field=(host,name,control)=>{const label=el('label',name);label.append(control);host.append(label);return control;};
const download=(data)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='dynamic-map.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

export function createPanel(store,persistence){
    const draft=createDraftSession(store,persistence), panel=el('section');panel.id='dynamic-map-panel';panel.setAttribute('aria-label','动态地图悬浮窗');
    panel.innerHTML='<header class="dm-header"><div class="dm-handle" tabindex="0" aria-label="拖动地图窗口，方向键移动"><span>🗺</span><strong class="dm-compact-location"></strong></div><button class="dm-toggle" type="button"></button></header><div id="dm-content"><nav class="dm-tabs" role="tablist" aria-label="地图功能"></nav><div class="dm-page"></div><div class="dm-savebar"></div><p class="dm-save-status" role="status"></p><p class="dm-feedback" role="status"></p></div>';
    document.body.append(panel);
    const content=panel.querySelector('#dm-content'),page=panel.querySelector('.dm-page'),feedback=panel.querySelector('.dm-feedback'),savebar=panel.querySelector('.dm-savebar'),toggle=panel.querySelector('.dm-toggle');
    let collapsed=readWindowPreferences()?.collapsed??true,tab='view',selected=null,unlocked=false,camera=null,cameraKey='',method='walk',notice='',aiBusy=false,aiPrompt='';
    const floating=attachFloatingWindow(panel,panel.querySelector('.dm-handle'),()=>collapsed);
    const tabs=[['view','查看地图'],['edit','调整地图'],['rules','地图规则'],['ai','AI生成地图'],['templates','地图模板'],['settings','设置']];
    const run=fn=>{try{fn();}catch(error){notice=error.message;render();}};
    const edit=fn=>run(()=>{draft.mutate(d=>fn(d.maps[d.activeMap],d));});
    const layoutEdit=fn=>edit((m,d)=>{fn(m,d);if(m.type==='graph')layoutMap(m);});
    function setCollapsed(value){collapsed=value;content.hidden=value;panel.classList.toggle('dm-collapsed',value);toggle.textContent=value?'展开':'收起';toggle.setAttribute('aria-expanded',String(!value));render();floating.keepVisible();floating.save();}
    toggle.addEventListener('click',()=>setCollapsed(!collapsed));
    panel.addEventListener('keydown',e=>{if(e.key==='Escape'){setCollapsed(true);toggle.focus();}});
    for(const [id,name]of tabs){const b=button(name,()=>{tab=id;camera=null;notice='';render();});b.dataset.tab=id;b.setAttribute('role','tab');panel.querySelector('.dm-tabs').append(b);}
    function render(){
        const saved=prepareDocument(store.snapshot()),document=tab==='view'?saved:draft.snapshot(),map=document.maps[document.activeMap];
        panel.querySelector('.dm-compact-location').textContent=saved.maps[saved.activeMap].nodes[saved.maps[saved.activeMap].currentLocation]?.name??'动态地图';
        for(const b of panel.querySelectorAll('[data-tab]'))b.setAttribute('aria-selected',String(b.dataset.tab===tab));
        page.replaceChildren();savebar.replaceChildren();feedback.textContent=notice;
        if(collapsed)return;
        const key=`${persistence.scope()}:${tab}:${map.id}`;if(key!==cameraKey){camera=null;selected=null;unlocked=false;cameraKey=key;}
        page.append(el('h2',map.name));
        if(Object.keys(document.maps).length>1){const s=select(Object.values(document.maps),map.id);field(page,'地图',s);s.onchange=()=>{if(tab==='view'){run(()=>store.applyUpdate([{type:'setActiveMap',mapId:s.value}]));}else edit((m,d)=>{d.activeMap=s.value;});};}
        if(tab==='view'||tab==='edit')renderCanvas(map);
        if(tab==='edit')renderEditor(map);
        if(tab==='rules')renderRules(map);
        if(tab==='settings')renderSettings(map);
        if(tab==='ai')renderAI(map);
        if(tab==='templates')renderTemplates();
        if(tab!=='view'){
            const status=draft.status();savebar.append(el('span',status.conflict?'已保存地图发生变化，请放弃草稿后重试':status.dirty?'有未保存调整':'未修改'));
            savebar.append(button('保存地图',()=>run(()=>{draft.save();notice='地图已保存，查看地图与变量接口现已使用新地图。';render();})),button('放弃草稿',()=>{draft.discard();notice='已放弃未保存调整';camera=null;render();}));
        }
    }
    function renderCanvas(map){
        const controls=el('div',undefined,'dm-toolbar');
        controls.append(button('拖动后回归',()=>{camera=fitCamera(map,tab==='edit');render();}));
        if(tab==='edit'){const b=button(`${unlocked?'✓ ':''}允许拖动地点`,()=>{unlocked=!unlocked;render();});b.setAttribute('aria-pressed',String(unlocked));controls.append(b);}
        page.append(controls);
        const canvas=el('div',undefined,'dm-canvas');page.append(canvas);
        if(map.type!=='graph'){canvas.textContent=`${map.type} 渲染器尚未实现`;return;}
        camera??=fitCamera(map,tab==='edit');
        canvas.append(renderMap(map,{camera,adjusting:tab==='edit',editable:tab==='edit'&&unlocked,onSelect:id=>{selected=id;render();},onCamera:value=>{camera=value;render();},onSnap:(id,plan)=>layoutEdit(m=>{applySnap(m,id,plan);notice='已调整草稿；保存地图后生效';}),onHint:text=>{feedback.textContent=text;}}));
        page.append(el('p',`每段道路 ${map.metadata.rules.segmentDistance} ${map.metadata.rules.unit} · 拖动空白平移 · 滚轮缩放`,'dm-help'));
        const node=map.nodes[selected],details=el('div',undefined,'dm-details');page.append(details);
        if(!node||(!node.discovered&&tab==='view')){details.textContent='点击地点或途经点查看说明与相邻路线。';return;}
        details.append(el('h3',node.name),el('p',node.description||'暂无说明'));
        const methods=map.metadata.rules.methods;if(!methods.some(m=>m.id===method))method=methods[0].id;
        const travel=select(methods,method);field(details,'通行方式',travel);travel.onchange=()=>{method=travel.value;render();};
        const links=connectionDetails(map,node.id,method);
        if(!links.length)details.append(el('p','暂无已发现的相邻路线'));
        for(const link of links){const line=el('p');line.append(button(link.node.name,()=>{selected=link.node.id;render();}),document.createTextNode(` · ${link.direction.label} · ${link.distance} ${link.unit} · ${link.edge.name||link.edge.type}（${link.edge.type}） · ${link.edge.bidirectional?'双向':link.accessible?'单向出发':'单向到达，不能沿此路出发'} · ${link.method}约 ${Number(link.minutes.toFixed(1))} 分钟`));details.append(line);}
    }
    function renderEditor(map){
        const form=el('div',undefined,'dm-form');page.append(form);
        const node=map.nodes[selected];
        form.append(el('h3',node?`调整：${node.name}`:'新增地点'));
        const name=field(form,'名称',input(node?.name??'')),type=field(form,'地点类型',select(map.metadata.nodeTypes,node?.type??map.metadata.nodeTypes[0].id)),description=field(form,'说明',el('textarea'));
        description.value=node?.description??'';
        form.append(button(node?'应用地点调整':'新增地点',()=>layoutEdit(m=>{
            if(!name.value.trim())throw new Error('请填写地点名称');
            const id=node?.id??uid('node');
            m.nodes[id]=node?{...m.nodes[id],name:name.value.trim(),type:type.value,description:description.value}:createNode(id,name.value.trim(),{type:type.value,description:description.value,position:{x:100+Object.keys(m.nodes).length*210,y:480}});selected=id;
        })));
        form.append(button('新增途经点',()=>layoutEdit(m=>{
            if(!m.metadata.nodeTypes.some(t=>t.id==='waypoint'))m.metadata.nodeTypes.push({id:'waypoint',name:'途经点'});
            const id=uid('waypoint');m.nodes[id]=createNode(id,`途经点 ${Object.values(m.nodes).filter(n=>n.type==='waypoint').length+1}`,{type:'waypoint',position:{x:100+Object.keys(m.nodes).length*210,y:480}});selected=id;
        })));
        if(node){form.append(button('取消选择 / 新增地点',()=>{selected=null;render();}),button('设为当前位置',()=>edit(m=>{m.currentLocation=node.id;m.nodes[node.id].discovered=true;})),button('删除此地点',()=>layoutEdit(m=>{delete m.nodes[node.id];m.edges=m.edges.filter(e=>e.from!==node.id&&e.to!==node.id);if(m.currentLocation===node.id)m.currentLocation=null;selected=null;})));}
        form.append(el('h3','路线连接'),el('p','方位以起点为中心。途经点可连接多条路线，作为岔路口。','dm-help'));
        const nodes=Object.values(map.nodes);if(nodes.length<2)return;
        const from=field(form,'起点',select(nodes,node?.id??nodes[0].id)),to=field(form,'终点',select(nodes,nodes.find(n=>n.id!==from.value)?.id)),dir=field(form,'终点位于起点的',select(DIRECTIONS,'east')),road=field(form,'道路类型',input('官道')),oneway=field(form,'单向通行（起点 → 终点）',input('', 'checkbox'));
        form.append(button('添加路线',()=>layoutEdit(m=>{
            if(from.value===to.value)throw new Error('起点与终点不能相同');
            if(m.edges.some(e=>e.from===from.value&&e.to===to.value||e.to===from.value&&e.from===to.value))throw new Error('这两个地点已经连接，请调整已有路线');
            m.edges.push(createEdge(uid('edge'),from.value,to.value,{direction:dir.value,type:road.value.trim()||'道路',name:road.value.trim(),bidirectional:!oneway.checked}));
        })));
        for(const edge of map.edges){
            const row=el('div',undefined,'dm-route');row.append(el('strong',`${map.nodes[edge.from].name} → ${map.nodes[edge.to].name}`));
            const direction=field(row,'方位',select(DIRECTIONS,edge.direction)),kind=field(row,'道路类型',input(edge.type)),single=field(row,'单向通行',input('','checkbox'));single.checked=!edge.bidirectional;
            row.append(button('应用路线调整',()=>layoutEdit(m=>{Object.assign(m.edges.find(e=>e.id===edge.id),{direction:direction.value,type:kind.value.trim()||'道路',name:kind.value.trim(),bidirectional:!single.checked});})),button('断开路线',()=>layoutEdit(m=>{m.edges=m.edges.filter(e=>e.id!==edge.id);})),button('插入途经点',()=>layoutEdit(m=>{
                if(!m.metadata.nodeTypes.some(t=>t.id==='waypoint'))m.metadata.nodeTypes.push({id:'waypoint',name:'途经点'});
                const id=uid('waypoint');m.nodes[id]=createNode(id,'途经点',{type:'waypoint'});
                m.edges=m.edges.filter(e=>e.id!==edge.id);m.edges.push({...edge,to:id},{...edge,id:uid('edge'),from:id});selected=id;
            })));form.append(row);
        }
        form.append(el('p','插入一个途经点会将一段路变成两段，总距离随段数增加。闭环方位冲突或地点重叠时，将拒绝本次调整。','dm-help'));
    }
    function renderRules(map){
        const form=el('div',undefined,'dm-form');page.append(form);const rules=map.metadata.rules;
        const distance=field(form,'每段道路距离',input(rules.segmentDistance,'number')),unit=field(form,'距离单位',input(rules.unit));
        form.append(button('应用距离规则',()=>edit(m=>{m.metadata.rules.segmentDistance=Number(distance.value);m.metadata.rules.unit=unit.value.trim();validateRules(m);})),el('p','速度单位：距离单位 / 小时。通行时间按道路段数累计。','dm-help'));
        for(const mode of rules.methods){const row=el('div',undefined,'dm-route'),name=field(row,'通行方式',input(mode.name)),speed=field(row,'每小时速度',input(mode.speed,'number'));row.append(button('应用速度',()=>edit(m=>{Object.assign(m.metadata.rules.methods.find(x=>x.id===mode.id),{name:name.value.trim(),speed:Number(speed.value)});validateRules(m);})),button('删除方式',()=>edit(m=>{m.metadata.rules.methods=m.metadata.rules.methods.filter(x=>x.id!==mode.id);validateRules(m);})));form.append(row);}
        const name=field(form,'新通行方式',input('骑马')),speed=field(form,'每小时速度',input(20,'number'));form.append(button('添加通行方式',()=>edit(m=>{m.metadata.rules.methods.push({id:uid('travel'),name:name.value.trim(),speed:Number(speed.value)});validateRules(m);})));
    }
    function renderSettings(map){
        const form=el('div',undefined,'dm-form');page.append(form);form.append(el('h3','地点类型'));
        for(const type of map.metadata.nodeTypes){const row=el('div',undefined,'dm-route'),name=field(row,'类型名称',input(type.name));row.append(button('更名',()=>edit(m=>{m.metadata.nodeTypes.find(t=>t.id===type.id).name=name.value.trim();validateRules(m);})),button('删除类型',()=>edit(m=>{if(Object.values(m.nodes).some(n=>n.type===type.id))throw new Error('有地点正在使用此类型，请先修改这些地点的类型');m.metadata.nodeTypes=m.metadata.nodeTypes.filter(t=>t.id!==type.id);validateRules(m);})));form.append(row);}
        const name=field(form,'新类型名称',input());form.append(button('添加类型',()=>edit(m=>{m.metadata.nodeTypes.push({id:uid('type'),name:name.value.trim()});validateRules(m);})),el('p','途经点显示为小圆点；“新增途经点”会自动恢复该类型。小白X、状态栏与 Tool Calling 接口保持独立，只能读取已保存地图。','dm-help'));
    }
    function renderAI(map){
        const form=el('div',undefined,'dm-form');page.append(form);form.append(el('p','使用酒馆当前模型生成地图草稿。生成后请到“调整地图”检查，再保存地图。'));
        const prompt=field(form,'描述你想要的地图',el('textarea'));prompt.value=aiPrompt;prompt.oninput=()=>{aiPrompt=prompt.value;};
        const generate=button(aiBusy?'正在生成…':'生成地图草稿',async()=>{
            if(aiBusy)return;
            const ctx=globalThis.SillyTavern?.getContext?.();if(typeof ctx?.generateRaw!=='function'){notice='当前环境没有酒馆生成接口；请在酒馆中配置模型后使用。';render();return;}
            const token=draft.token();aiBusy=true;notice='';render();
            try{
                persistence.ensureActive();
                const result=await ctx.generateRaw({prompt:aiPrompt,systemPrompt:`只输出 JSON 地图文档，无 Markdown。以下是协议示例，沿用字段。所有路线必须等长，direction 为 ${DIRECTIONS.map(d=>d.id).join(',')}，可用 waypoint 途经点连接远方地点；避免闭环及重叠。地图规则和地点类型保留。示例：${JSON.stringify(draft.snapshot())}`,responseLength:4096,trimNames:false});
                if(token!==draft.token())throw new Error('生成期间聊天或草稿发生变化，未覆盖当前地图，请重新生成');
                const raw=String(result).trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
                const doc=prepareDocument(validateDocument(JSON.parse(raw)));for(const m of Object.values(doc.maps)){validateRules(m);if(m.type==='graph')layoutMap(m);}
                draft.replace(doc);notice='已生成草稿；请检查并保存地图。';
            }catch(error){notice=`生成未应用：${error.message}`;}finally{aiBusy=false;render();}
        });generate.disabled=aiBusy;form.append(generate);
    }
    const libraryKey=`dynamic-map-templates:${persistence.namespace}`;
    function library(){const value=JSON.parse(localStorage.getItem(libraryKey)||'[]');if(!Array.isArray(value))throw new Error('模板库格式错误');return value;}
    function renderTemplates(){
        const form=el('div',undefined,'dm-form');page.append(form);const name=field(form,'模板名称',input('我的地图模板'));
        form.append(button('存为模板（当前草稿）',()=>run(()=>{if(!name.value.trim())throw new Error('请输入模板名称');const items=library();items.push({id:uid('template'),name:name.value.trim(),document:draft.snapshot()});localStorage.setItem(libraryKey,JSON.stringify(items));notice='模板已保存在此浏览器';render();})),button('导出已保存地图',()=>download(persistence.exportDocument())),button('导出草稿',()=>download(draft.snapshot())),button('重试同步已保存地图',()=>run(()=>persistence.retry())));
        const upload=field(form,'导入地图 JSON 到草稿',input('','file'));upload.accept='.json,application/json';upload.onchange=async()=>{const file=upload.files[0],token=draft.token();if(!file)return;try{if(file.size>5*1024*1024)throw new Error('地图文件不能超过 5 MB');const text=await file.text();if(token!==draft.token())throw new Error('读取期间聊天或草稿发生变化，请重试');draft.replace(JSON.parse(text));notice='已导入草稿；保存后才生效';render();}catch(error){notice=error.message;render();}};
        try{for(const item of library()){const row=el('div',undefined,'dm-route');row.append(el('strong',item.name),button('载入草稿',()=>run(()=>{draft.replace(item.document);notice='模板已载入草稿';camera=null;render();})),button('删除模板',()=>run(()=>{localStorage.setItem(libraryKey,JSON.stringify(library().filter(x=>x.id!==item.id)));render();})));form.append(row);}}catch(error){form.append(el('p',error.message));}
        form.append(el('p','模板保存在此浏览器。载入模板会替换未保存草稿；可先导出草稿备份。','dm-help'));
    }
    const off=draft.subscribe(render);setCollapsed(collapsed);
    return {open(){setCollapsed(false);},resetPosition:floating.reset,setStatus(text){panel.querySelector('.dm-save-status').textContent=text;},destroy(){off();draft.destroy();floating.destroy();panel.remove();}};
}

