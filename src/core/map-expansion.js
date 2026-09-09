import { validateDocument } from './protocol.js';
import { autoLayout } from './auto-layout.js';

export function recentMapChat(ctx) {
    if (!Array.isArray(ctx?.chat)) throw new Error('当前酒馆未提供聊天记录，未开始新增生成');
    const eligible=ctx.chat.filter(m=>!m.is_system && typeof m.mes==='string' && m.mes.trim());
    const messages=eligible.slice(-30).map(m=>({角色:m.is_user?'用户':'角色',名称:m.name||'',内容:m.mes}));
    if (!messages.length) throw new Error('当前聊天没有可读取的正文记录');
    if (JSON.stringify(messages).length>60000) throw new Error('最近 30 条聊天超过 60000 字符，未截断内容，也未发送生成请求');
    return messages;
}

export function applyMapExpansion(document, patch, {nameRoads=false,distanceRoads=false}={}) {
    if (!patch || !patch.nodes || Array.isArray(patch.nodes) || typeof patch.nodes!=='object' || !Array.isArray(patch.edges)) throw new Error('新增结果必须包含 nodes 对象和 edges 数组');
    if (Object.keys(patch).some(k=>!['nodes','edges'].includes(k))) throw new Error('新增结果只允许 nodes 和 edges，不能替换地图');
    const next=structuredClone(document),map=next.maps[next.activeMap];
    if(map.type!=='graph')throw new Error('当前仅支持为 graph 地图新增内容');
    const nodeTypes=new Set(map.metadata.nodeTypes.map(t=>t.id)),roadTypes=new Set(map.metadata.roadTypes.map(t=>t.id));
    const ids=new Set(map.edges.map(e=>e.id)),pairs=new Set(map.edges.map(e=>[e.from,e.to].sort().join('\0')));
    for(const [id,node] of Object.entries(patch.nodes)) {
        if(['__proto__','constructor','prototype'].includes(id)||Object.hasOwn(map.nodes,id))throw new Error('新增地点 ID 已存在或为保留名称');
        if(!nodeTypes.has(node?.type))throw new Error('新增地点使用未知类型');
        map.nodes[id]=structuredClone(node);
    }
    for(const edge of patch.edges) {
        if(!edge || ids.has(edge.id))throw new Error('新增道路 ID 重复');
        if(!roadTypes.has(edge.type))throw new Error('新增道路使用未知类型');
        const pair=[edge.from,edge.to].sort().join('\0');if(pairs.has(pair))throw new Error('新增道路与已有连接重复');
        ids.add(edge.id);pairs.add(pair);
        map.edges.push({...structuredClone(edge),name:nameRoads?edge.name:'',distance:distanceRoads?(edge.distance??null):null});
    }
    validateDocument(next);
    const old=document.maps[document.activeMap];
    // Existing nodes are anchors; only the new geometry may change.
    const laid=structuredClone(map);autoLayout(laid,{pinnedIds:Object.keys(old.nodes).filter(id=>old.nodes[id].position.x!==null)});
    for(const id of Object.keys(patch.nodes))map.nodes[id]=laid.nodes[id];
    for(const e of map.edges)if(!old.edges.some(previous=>previous.id===e.id))e.direction=laid.edges.find(x=>x.id===e.id).direction;
    map.metadata.layout={...map.metadata.layout,mode:'auto'};
    return next;
}
