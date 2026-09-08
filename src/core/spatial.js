export const DIRECTIONS = Object.freeze([
    ['north', '北'], ['north-northeast', '北东北'], ['northeast', '东北'], ['east-northeast', '东东北'],
    ['east', '东'], ['east-southeast', '东东南'], ['southeast', '东南'], ['south-southeast', '南东南'],
    ['south', '南'], ['south-southwest', '南西南'], ['southwest', '西南'], ['west-southwest', '西西南'],
    ['west', '西'], ['west-northwest', '西西北'], ['northwest', '西北'], ['north-northwest', '北西北'],
].map(([id, label], index) => Object.freeze({ id, label, index,
    x: Math.sin(index * Math.PI / 8), y: -Math.cos(index * Math.PI / 8) })));
export const ROAD_LENGTH = 160;
export const direction = id => DIRECTIONS.find(d => d.id === id);
export const opposite = id => DIRECTIONS[(direction(id).index + 8) % 16];
export function nearestDirection(a, b) {
    const angle = Math.atan2(b.x - a.x, -(b.y - a.y));
    return DIRECTIONS[(Math.round(angle / (Math.PI / 8)) + 16) % 16];
}
export const positionFrom = (a, id) => ({ x: a.x + direction(id).x * ROAD_LENGTH, y: a.y + direction(id).y * ROAD_LENGTH });
export function defaultRules() { return { segmentDistance: 1, unit: '公里', methods: [{ id: 'walk', name: '走路', speed: 5 }] }; }
export function defaultRoadTypes() { return [{id:'road',name:'道路'},{id:'path',name:'山路'},{id:'trail',name:'小径'},{id:'water',name:'水路'},{id:'portal',name:'传送通道'}]; }
export function defaultTypes() { return [
    { id: 'city', name: '城市' }, { id: 'town', name: '城镇' }, { id: 'sect', name: '宗门' },
    { id: 'village', name: '村庄' }, { id: 'port', name: '港口' }, { id: 'mountain', name: '山地' },
    { id: 'dungeon', name: '地下城' }, { id: 'landmark', name: '地标' }, { id: 'waypoint', name: '途经点' },
]; }
export function prepareDocument(document) {
    const next = structuredClone(document);
    for (const map of Object.values(next.maps)) {
        map.metadata.rules ??= defaultRules();
        map.metadata.nodeTypes ??= defaultTypes();
        map.metadata.roadTypes ??= defaultRoadTypes();
        for (const edge of map.edges) if (!map.metadata.roadTypes.some(t => t.id === edge.type)) map.metadata.roadTypes.push({id:edge.type,name:edge.type});
        for (const node of Object.values(map.nodes)) {
            if (!map.metadata.nodeTypes.some(type => type.id === node.type)) map.metadata.nodeTypes.push({ id: node.type, name: node.type });
        }
        // Migrate missing/vertical legacy directions from coordinates, without writing saved data.
        for (const edge of map.edges) if (!direction(edge.direction)) {
            const a = map.nodes[edge.from].position, b = map.nodes[edge.to].position;
            edge.direction = a.x !== null && b.x !== null ? nearestDirection(a, b).id : 'east';
        }
    }
    return next;
}
export function validateRules(map) {
    const r = map.metadata.rules;
    if (!r || !Number.isFinite(r.segmentDistance) || r.segmentDistance <= 0 || typeof r.unit !== 'string' || !r.unit.trim()) throw new Error('每段距离需大于 0，且必须填写距离单位');
    const methods = r.methods;
    if (!Array.isArray(methods) || !methods.length) throw new Error('至少保留一种通行方式');
    const ids = new Set();
    for (const m of methods) {
        if (!m || typeof m.id !== 'string' || !m.id || ids.has(m.id) || typeof m.name !== 'string' || !m.name.trim() || !Number.isFinite(m.speed) || m.speed <= 0) throw new Error('通行方式名称不能为空，速度需大于 0，ID 不能重复');
        ids.add(m.id);
    }
    if (!Array.isArray(map.metadata.nodeTypes) || !map.metadata.nodeTypes.length) throw new Error('至少保留一个地点类型');
    const types = new Set();
    for (const t of map.metadata.nodeTypes) {
        if (!t || typeof t.id !== 'string' || !t.id || types.has(t.id) || typeof t.name !== 'string' || !t.name.trim()) throw new Error('地点类型名称不能为空，ID 不能重复');
        types.add(t.id);
    }
    const roads = new Set();
    if (!Array.isArray(map.metadata.roadTypes) || !map.metadata.roadTypes.length) throw new Error('至少保留一个道路类型');
    for (const t of map.metadata.roadTypes) {
        if (!t || typeof t.id !== 'string' || !t.id || roads.has(t.id) || typeof t.name !== 'string' || !t.name.trim()) throw new Error('道路类型名称不能为空，ID 不能重复');
        roads.add(t.id);
    }
    for (const e of map.edges) if (!roads.has(e.type)) throw new Error('道路使用了已删除的类型');
    for (const n of Object.values(map.nodes)) if (!types.has(n.type)) throw new Error(`地点「${n.name}」使用了已删除的类型`);
}
/** All roads have equal diagram length. Inconsistent cycles are rejected, never silently distorted. */
export function layoutMap(map, anchorId) {
    const placed = new Map(); let component = 0;
    const adjacency = new Map(Object.keys(map.nodes).map(id => [id, []]));
    for (const e of map.edges) {
        if (!direction(e.direction)) throw new Error('路线需要 16 方位之一');
        adjacency.get(e.from).push({ id: e.to, direction: e.direction });
        adjacency.get(e.to).push({ id: e.from, direction: opposite(e.direction).id });
    }
    const roots = anchorId ? [anchorId, ...Object.keys(map.nodes).filter(id => id !== anchorId)] : Object.keys(map.nodes);
    for (const root of roots) {
        if (placed.has(root)) continue;
        const prior = map.nodes[root].position;
        placed.set(root, prior.x !== null ? { ...prior } : { x: 120 + component * 420, y: 180 }); component++;
        const queue = [root];
        for (let i = 0; i < queue.length; i++) {
            const id = queue[i];
            for (const link of adjacency.get(id)) {
                const expected = positionFrom(placed.get(id), link.direction);
                if (placed.has(link.id)) {
                    const old = placed.get(link.id);
                    if (Math.hypot(old.x - expected.x, old.y - expected.y) > 0.01) throw new Error('路线方位形成冲突闭环，请修改方位或移除冲突路线');
                } else { placed.set(link.id, expected); queue.push(link.id); }
            }
        }
    }
    const occupied = new Set();
    for (const [id, p] of placed) {
        const key = `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;
        if (occupied.has(key)) throw new Error('两个地点占用了同一方位位置，请修改路线方位');
        occupied.add(key); map.nodes[id].position = p; map.nodes[id].layout.fixed = true;
    }
    return map;
}
export function snapPlan(map, nodeId, pointer, onlyFarthest = false) {
    const connected = map.edges.filter(e => e.from === nodeId || e.to === nodeId);
    const choices = connected.map(e => {
        const id = e.from === nodeId ? e.to : e.from;
        return { edge: e, id, position: map.nodes[id].position };
    }).sort((a, b) => Math.hypot(a.position.x - pointer.x, a.position.y - pointer.y) - Math.hypot(b.position.x - pointer.x, b.position.y - pointer.y));
    if (!choices.length) return null;
    const anchor = choices[0], d = nearestDirection(anchor.position, pointer);
    const removed = onlyFarthest ? choices.slice(-1).filter(c => c !== anchor) : choices.slice(1);
    return { anchorId: anchor.id, edgeId: anchor.edge.id, direction: d.id,
        edgeDirection: anchor.edge.from === nodeId ? opposite(d.id).id : d.id,
        position: positionFrom(anchor.position, d.id), removeIds: removed.map(c => c.edge.id) };
}
export function applySnap(map, nodeId, plan) {
    if (!plan) throw new Error('此地点尚未连接路线，请先添加路线再按方位移动');
    map.edges = map.edges.filter(e => !plan.removeIds.includes(e.id));
    map.edges.find(e => e.id === plan.edgeId).direction = plan.edgeDirection;
    return layoutMap(map, plan.anchorId);
}
export function connectionDetails(map, nodeId, methodId) {
    const r = map.metadata.rules, method = r.methods.find(m => m.id === methodId) ?? r.methods[0];
    return map.edges.filter(e => e.discovered && (e.from === nodeId || e.to === nodeId))
        .filter(e => map.nodes[e.from === nodeId ? e.to : e.from].discovered)
        .map(e => ({ edge: e, node: map.nodes[e.from === nodeId ? e.to : e.from],
            direction: e.from === nodeId ? direction(e.direction) : opposite(e.direction),
            distance: r.segmentDistance, unit: r.unit, method: method.name,
            minutes: r.segmentDistance / method.speed * 60,
            accessible: e.bidirectional || e.from === nodeId }));
}

export const SNAP_RADIUS = ROAD_LENGTH * 1.4;
/** Any nearby node may be an anchor; far-away drops detach the node. */
export function placementPlan(map, nodeId, pointer) {
    if(!Number.isFinite(pointer.x)||!Number.isFinite(pointer.y))throw new Error('拖动坐标无效');
    const incident=map.edges.filter(e=>e.from===nodeId||e.to===nodeId);
    const candidates=Object.values(map.nodes).filter(n=>n.id!==nodeId&&n.position.x!==null)
        .map(n=>({node:n,distance:Math.hypot(n.position.x-pointer.x,n.position.y-pointer.y)})).filter(x=>x.distance<=SNAP_RADIUS).sort((a,b)=>a.distance-b.distance);
    const nearest=candidates[0]?.node;
    if(!nearest)return {mode:'free',position:{x:pointer.x,y:pointer.y},removeIds:incident.map(e=>e.id)};
    const existing=incident.find(e=>e.from===nearest.id||e.to===nearest.id);
    const requested=nearestDirection(nearest.position,pointer);
    const directions=[...DIRECTIONS].sort((a,b)=>{
        const distance=d=>{const p=positionFrom(nearest.position,d.id);return Math.hypot(p.x-pointer.x,p.y-pointer.y);};return distance(a)-distance(b);
    });
    for(const d of directions){
        const plan={mode:'snap',anchorId:nearest.id,direction:d.id,requestedDirection:requested.id,adjusted:d.id!==requested.id,
            edgeId:existing?.id??null,position:positionFrom(nearest.position,d.id),removeIds:incident.filter(e=>e.id!==existing?.id).map(e=>e.id)};
        try{applyPlacement(structuredClone(map),nodeId,plan,'preview_edge');return plan;}catch{}
    }
    return {mode:'blocked',anchorId:nearest.id,position:{x:pointer.x,y:pointer.y},removeIds:[],reason:'附近地点的 16 方位均不可用，请拖到更远的空白处'};
}
export function applyPlacement(map,nodeId,plan,newEdgeId){
    if(plan.mode==='blocked')throw new Error(plan.reason);
    const node=map.nodes[nodeId];if(!node)throw new Error('地点不存在');
    const kept=map.edges.find(e=>e.id===plan.edgeId);
    map.edges=map.edges.filter(e=>e.from!==nodeId&&e.to!==nodeId);
    if(plan.mode==='snap'){
        const type=map.metadata.roadTypes?.[0]?.id??'road';
        const edge=kept??{id:newEdgeId,from:plan.anchorId,to:nodeId,type,name:'',bidirectional:true,discovered:true,metadata:{}};
        edge.direction=edge.from===nodeId?opposite(plan.direction).id:plan.direction;map.edges.push(edge);
        node.position={...plan.position};node.layout.fixed=true;layoutMap(map,plan.anchorId);
    }else{node.position={...plan.position};node.layout.fixed=true;}
    return map;
}


