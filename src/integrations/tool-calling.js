import { createNode, createEdge, validateDocument } from '../core/protocol.js';
import { prepareDocument } from '../core/spatial.js';
import { autoLayout } from '../core/auto-layout.js';
import { layoutTiles } from '../core/tiles.js';
import { STORAGE_KEY } from '../adapters/chat.js';

const names=['dynamic_map_query','dynamic_map_update'];
const visible=n=>n?.discovered&&n.ai.includeInContext;
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const str={type:'string',maxLength:4000};
const operations=['add_node','update_node','remove_node','add_edge','update_edge','remove_edge','move'];
export const updateSchema=object({token:str,reason:str,operations:{type:'array',minItems:1,maxItems:30,items:object({op:{type:'string',enum:operations},mapId:str,id:str,name:str,description:str,type:str,from:str,to:str,direction:{type:['string','null']},distance:{type:['number','null'],minimum:0},bidirectional:{type:'boolean'}},['op','mapId','id'])}},['token','reason','operations']);
function exact(value,keys){if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!keys.includes(k)))throw Error('未知字段或无效对象');}
function text(value){if(typeof value!=='string'||!value.trim()||value.length>4000||['__proto__','prototype','constructor'].includes(value))throw Error('无效文本或 ID');}
/** Compile the entire batch on a copy. Never mutate the live document on error. */
export function compileMapUpdate(document,request,{allowDelete=false}={}){
    exact(request,['token','reason','operations']);text(request.token);text(request.reason);
    if(!Array.isArray(request.operations)||!request.operations.length||request.operations.length>30||JSON.stringify(request).length>50000)throw Error('一次需要 1–30 项操作，最多 50000 字符');
    const next=prepareDocument(structuredClone(document)),changed=new Set();
    for(const o of request.operations){
        const fields={add_node:['name','description','type'],update_node:['name','description','type'],remove_node:[],add_edge:['name','type','from','to','direction','distance','bidirectional'],update_edge:['name','type','direction','distance','bidirectional'],remove_edge:[],move:[]};
        if(!operations.includes(o?.op))throw Error('未知操作');exact(o,['op','mapId','id',...fields[o.op]]);text(o.mapId);text(o.id);
        const m=Object.hasOwn(next.maps,o.mapId)?next.maps[o.mapId]:null;if(!m)throw Error('地图不存在');
        const node=Object.hasOwn(m.nodes,o.id)?m.nodes[o.id]:null,edge=m.edges.find(e=>e.id===o.id);
        const nodeAccess=id=>{if(!Object.hasOwn(m.nodes,id)||!visible(m.nodes[id]))throw Error('地点不可访问');};
        const edgeAccess=()=>{if(!edge||!edge.discovered)throw Error('道路不可访问');nodeAccess(edge.from);nodeAccess(edge.to);};
        if(o.op.endsWith('node')&&o.op!=='add_node')nodeAccess(o.id);
        if(o.op.endsWith('edge')&&o.op!=='add_edge')edgeAccess();
        if(o.op.startsWith('remove')&&!allowDelete)throw Error('未允许 AI 删除地点或道路');
        if(o.type!==undefined){text(o.type);const types=o.op.endsWith('node')?m.metadata.nodeTypes:m.metadata.roadTypes;if(!types.some(t=>t.id===o.type))throw Error('类型不在地图规则中');}
        if(o.name!==undefined&&(typeof o.name!=='string'||o.name.length>4000))throw Error('无效名称');
        if(o.description!==undefined&&(typeof o.description!=='string'||o.description.length>4000))throw Error('无效说明');
        if(o.op==='add_node'){if(node)throw Error('地点 ID 已存在');text(o.name);m.nodes[o.id]=createNode(o.id,o.name,{type:o.type??m.metadata.nodeTypes[0].id,description:o.description??''});}
        if(o.op==='update_node'){for(const k of fields[o.op])if(o[k]!==undefined)node[k]=o[k];}
        if(o.op==='remove_node'){if(Object.values(next.maps).some(c=>c.parentMap===m.id&&c.metadata.parentNode===o.id))throw Error('地点包含子地图，不能删除');delete m.nodes[o.id];m.edges=m.edges.filter(e=>e.from!==o.id&&e.to!==o.id);if(m.currentLocation===o.id)m.currentLocation=null;}
        if(o.op==='add_edge'){if(edge)throw Error('道路 ID 已存在');text(o.from);text(o.to);nodeAccess(o.from);nodeAccess(o.to);m.edges.push(createEdge(o.id,o.from,o.to,{type:o.type??m.metadata.roadTypes[0].id,...Object.fromEntries(fields[o.op].filter(k=>o[k]!==undefined).map(k=>[k,o[k]]))}));}
        if(o.op==='update_edge'){for(const k of fields[o.op])if(o[k]!==undefined)edge[k]=o[k];}
        if((o.op==='add_edge'||o.op==='update_edge')&&o.direction!==undefined&&m.type==='graph'){const target=m.edges.find(e=>e.id===o.id);target.metadata.directionLocked=o.direction!==null;}
        if(o.op==='remove_edge')m.edges=m.edges.filter(e=>e.id!==o.id);
        if(o.op==='move'){nodeAccess(o.id);next.activeMap=m.id;m.currentLocation=o.id;}
        if(o.op!=='move')changed.add(m.id);
    }
    validateDocument(next);
    for(const id of changed){const m=next.maps[id];if(m.type==='graph')autoLayout(m,{preserveExisting:true});else layoutTiles(m);}
    return validateDocument(next);
}

export function createMapTools({store,draft,persistence,getContext}){
    let disposed=false,registered=false,lease=null,ownedDraft=null,message='尚未调用地图工具';
    const settings=()=>({enabled:false,autoSave:false,allowDelete:false,...getContext()?.extensionSettings?.dynamicMapTools});
    function ready(){persistence.ensureActive();if(!getContext()?.chatMetadata?.[STORAGE_KEY])throw Error('请先保存初始地图');if(!settings().enabled||disposed)throw Error('地图工具未启用');}
    function token(){return `${persistence.token()}:${draft.token()}:${JSON.stringify(store.snapshot())}`;}
    function query(args={}){
        ready();exact(args,['mapId']);if(args.mapId!==undefined)text(args.mapId);
        const doc=draft.snapshot(),mapId=args.mapId??doc.activeMap,m=Object.hasOwn(doc.maps,mapId)?doc.maps[mapId]:null;if(!m)throw Error('地图不存在');
        lease={id:crypto.randomUUID(),base:token(),metadata:getContext().chatMetadata};
        const nodes=Object.values(m.nodes).filter(visible);
        return {token:lease.id,draft:draft.status().dirty,activeMap:doc.activeMap,maps:Object.values(doc.maps).map(x=>({id:x.id,name:x.name,type:x.type,parentMap:x.parentMap,parentNode:x.metadata.parentNode??null})),map:{id:m.id,type:m.type,currentLocation:m.currentLocation,nodeTypes:m.metadata.nodeTypes,roadTypes:m.metadata.roadTypes,rules:m.metadata.rules,nodes:nodes.map(n=>({id:n.id,name:n.name,type:n.type,description:n.description})),edges:m.edges.filter(e=>e.discovered&&visible(m.nodes[e.from])&&visible(m.nodes[e.to])).map(e=>({id:e.id,from:e.from,to:e.to,name:e.name,type:e.type,direction:e.direction,distance:e.distance,bidirectional:e.bidirectional}))},instructions:'按剧情事实更新。先查询目标地图，复制 token 与类型 ID。更新默认进入草稿，未保存不代表生效。move 只记录已发生的移动，不计算路程时间。'};
    }
    function update(request){
        ready();if(!lease||request?.token!==lease.id||lease.base!==token()||lease.metadata!==getContext().chatMetadata)throw Error('地图或聊天已变化，请重新查询');
        if(draft.status().conflict||draft.status().dirty&&ownedDraft!==draft.token())throw Error('有人工编辑草稿，请先保存或放弃后重试');
        const next=compileMapUpdate(draft.snapshot(),request,settings());
        lease=null;
        if(settings().autoSave){persistence.importDocument(next,persistence.token());draft.discard();ownedDraft=null;message='AI 更新已应用，本地保存及聊天同步状态见地图底部';}
        else{draft.applyGeneration(next);ownedDraft=draft.token();message='AI 更新已进入草稿，请检查并保存全部地图';}
        return {ok:true,applied:settings().autoSave,operations:request.operations.length,message};
    }
    const safe=fn=>async args=>{try{return JSON.stringify(fn(args));}catch(e){message=e.message;return JSON.stringify({ok:false,error:e.message});}};
    function register(){const ctx=getContext();if(registered||typeof ctx?.registerFunctionTool!=='function')return;const shouldRegister=()=>{try{ready();return true;}catch{return false;}};
        ctx.registerFunctionTool({name:names[0],displayName:'查询动态地图',description:'查询当前地图或指定层级地图及已发现地点和道路，获得本次更新 token。移动、新地点或道路变化前先查询。',parameters:object({mapId:str}),action:safe(query),shouldRegister,stealth:false});
        ctx.registerFunctionTool({name:names[1],displayName:'更新动态地图',description:'根据已确定的剧情事实，批量添加或修改地点和道路、删除或记录角色移动。必须先查询并使用最新 token；不要推测距离或道路名。默认只创建待保存草稿。成功后不要重复提交。每次最多30项；新增地点必须带name，新增道路必须带from和to。',parameters:updateSchema,action:safe(update),shouldRegister,stealth:false});registered=true;
    }
    function tryRegister(){try{register();}catch(e){message='工具注册失败：'+e.message;for(const name of names){try{getContext()?.unregisterFunctionTool?.(name);}catch{ /* Host cleanup is optional. */ }}registered=false;}}
    tryRegister();
    return {query,update,status:()=>({...settings(),registered,supported:!!getContext()?.isToolCallingSupported?.(),message}),configure(patch){exact(patch,['enabled','autoSave','allowDelete']);if(Object.values(patch).some(v=>typeof v!=='boolean'))throw Error('设置需要布尔值');const ctx=getContext();if(!ctx?.extensionSettings)throw Error('酒馆设置不可用');ctx.extensionSettings.dynamicMapTools={...settings(),...patch};ctx.saveSettingsDebounced?.();lease=null;tryRegister();},destroy(){disposed=true;lease=null;if(registered)for(const name of names)getContext()?.unregisterFunctionTool?.(name);}};
}
