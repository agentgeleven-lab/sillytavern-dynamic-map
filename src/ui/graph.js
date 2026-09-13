import { nodeGlyph, labelPositions } from './map-presentation.js';
import { cellKey, cellColor, cellRules } from '../core/cells.js';
import { isTileMap, cellPoint, pointCell, tilePlacement, CELL_SIZE } from '../core/tiles.js';
import { roadName } from '../core/spatial.js';
import { DIRECTIONS, ROAD_LENGTH, placementPlan } from '../core/spatial.js';
const NS = 'http://www.w3.org/2000/svg';
const svgNode = (tag, attrs = {}, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [k,v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    return e;
};
export function fitCamera(map, editing = false) {
    const nodes = Object.values(map.nodes).filter(n => editing || n.discovered);
    if (!nodes.length&&(!isTileMap(map)||!Object.keys(map.metadata.cells??{}).length)) return { x: 180, y: 80, zoom: 1 };
    if(isTileMap(map))for(const key of Object.keys(map.metadata.cells??{})){const [q,r]=key.split(',').map(Number);nodes.push({position:cellPoint(map.type,q,r)});}
    const xs = nodes.map(n => n.position.x ?? 0), ys = nodes.map(n => n.position.y ?? 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const zoom = Math.max(.1,Math.min(1.65, 610 / (maxX-minX+100), 340 / (maxY-minY+100)));
    return { x: 360-(minX+maxX)/2*zoom, y: 220-(minY+maxY)/2*zoom, zoom };
}
export function renderMap(map, options) {
    const { camera, editable = false, onSelect, onCamera, onSnap, onHint = () => {} } = options;
    const svg = svgNode('svg', { viewBox:'0 0 720 480', class:'dm-svg', role:'group', 'aria-label': `${map.name}，${Object.values(map.nodes).filter(n => options.adjusting || n.discovered).length} 个地点` });
    const viewport = svgNode('g', { transform:`translate(${camera.x} ${camera.y}) scale(${camera.zoom})` });
    const edgeLayer = svgNode('g'), nodeLayer = svgNode('g'), compass = svgNode('g', { 'pointer-events':'none', class:'dm-compass' });
    const points = new Map(Object.values(map.nodes).map(n => [n.id, { x:n.position.x ?? 0, y:n.position.y ?? 0 }]));
    const groups = new Map(),cellShapes=new Map();
    const visibleNodes=Object.values(map.nodes).filter(n=>options.adjusting||n.discovered);
    const labels=labelPositions(visibleNodes.map(n=>({...n,position:points.get(n.id)})));
    const lowDetail=camera.zoom<.65, focus=options.selected;
    const usedLabelBoxes=visibleNodes.map(n=>({x:points.get(n.id).x-45,y:points.get(n.id).y-32,w:90,h:90}));
    const highlight=key=>{const shape=cellShapes.get(key);if(shape){shape.setAttribute('stroke','var(--dm-accent)');shape.setAttribute('stroke-opacity','1');shape.setAttribute('stroke-width','4');}};
    function paintEdges(removed = []) {
        edgeLayer.replaceChildren();
        for (const e of map.edges) {
            if (!options.adjusting && (!e.discovered || !map.nodes[e.from].discovered || !map.nodes[e.to].discovered)) continue;
            const a=points.get(e.from), b=points.get(e.to), cut=removed.includes(e.id);
            const g=svgNode('g', {'data-edge-id':e.id,class:`dm-edge dm-road-${['path','trail','water','portal'].includes(e.type)?e.type:'road'}${cut?' dm-cut':''}${focus&&(e.from!==focus&&e.to!==focus)?' dm-dim':''}${options.selectedEdge===e.id?' dm-edge-selected':''}`});
            g.append(svgNode('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'dm-road-line'}));
            if(options.onEdgeSelect){g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label',`道路：${map.nodes[e.from].name}到${map.nodes[e.to].name}`);g.append(svgNode('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'dm-edge-hit'}));g.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();options.onEdgeSelect(e.id);}});}
            g.append(svgNode('title',{},`${roadName(map,e)||'道路'}：${map.nodes[e.from].name} → ${map.nodes[e.to].name}`));
            if (!e.bidirectional) {
                const x=a.x+(b.x-a.x)*.65,y=a.y+(b.y-a.y)*.65,angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
                g.append(svgNode('path',{d:'M -10 -6 L 0 0 L -10 6',transform:`translate(${x} ${y}) rotate(${angle})`,fill:'none',stroke:'var(--dm-accent)','stroke-width':3}));
            }
            if(roadName(map,e)&&(!lowDetail||options.selectedEdge===e.id||focus===e.from||focus===e.to)){
                const x=(a.x+b.x)/2,y=(a.y+b.y)/2-12,w=Math.min(230,roadName(map,e).length*13),box={x:x-w/2,y:y-16,w,h:22};
                if(!usedLabelBoxes.some(v=>box.x<v.x+v.w&&box.x+box.w>v.x&&box.y<v.y+v.h&&box.y+box.h>v.y)){g.append(svgNode('text',{x,y,'text-anchor':'middle'},roadName(map,e).slice(0,18)));usedLabelBoxes.push(box);}
            }
            edgeLayer.append(g);
        }
    }
    function paintCompass(plan) {
        compass.replaceChildren();
        if (!plan || plan.mode !== 'snap') return;
        const p=points.get(plan.anchorId);
        for (const d of DIRECTIONS) {
            const active=d.id===plan.direction;
            compass.append(svgNode('line',{x1:p.x,y1:p.y,x2:p.x+d.x*ROAD_LENGTH,y2:p.y+d.y*ROAD_LENGTH,stroke:active?'var(--dm-accent)':'var(--dm-muted)','stroke-width':active?3:1,'stroke-dasharray':'3 5'}));
            compass.append(svgNode('text',{x:p.x+d.x*(ROAD_LENGTH+22),y:p.y+d.y*(ROAD_LENGTH+22)+4,'text-anchor':'middle',fill:active?'var(--dm-accent)':'var(--dm-muted)','font-size':active?15:11},d.label));
        }
    }
    for (const n of Object.values(map.nodes)) {
        if (!options.adjusting && !n.discovered) continue;
        const p=points.get(n.id), current=n.id===map.currentLocation;
        const group=svgNode('g',{transform:`translate(${p.x} ${p.y})`,class:`dm-node${current?' dm-current':''}${focus===n.id?' dm-selected':''}${n.type==='waypoint'?' dm-waypoint':''}`,'data-node-id':n.id,role:'button',tabindex:0,'aria-label':`${n.name}${current?'，当前位置':''}，查看地点详情`});
        group.append(svgNode('title',{},n.name));
        if (focus===n.id)group.append(svgNode('circle',{r:33,class:'dm-selected-ring'}));
        if (current) group.append(svgNode('circle',{r:28,class:'dm-halo'}));
        group.append(svgNode('circle',{r:n.type==='waypoint'?7:n.type==='city'?24:19,class:'dm-dot'}));
        if(n.type!=='waypoint') group.append(svgNode('text',{y:5,class:'dm-symbol'},nodeGlyph(n.type)));
        const label=labels.get(n.id);if(!lowDetail||current||focus===n.id||['city','sect'].includes(n.type))group.append(svgNode('text',{x:label.dx,y:label.dy,class:'dm-name'},n.name.length>16?n.name.slice(0,15)+'…':n.name));
        const childCount=options.childCounts?.[n.id]??0;if(childCount)group.append(svgNode('text',{x:30,y:-20,class:'dm-child-badge'},`▧ ${childCount}`));
        if (current) group.append(svgNode('text',{y:-37,class:'dm-current-label'},'当前位置'));
        group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(n.id);}});
        groups.set(n.id,group);nodeLayer.append(group);
    }
    if(isTileMap(map)){
        const lattice=svgNode('g',{'pointer-events':'none',class:'dm-cell-layer',stroke:'var(--dm-muted)','stroke-opacity':.13,'stroke-width':1,fill:'none'});
        const corners=[[-200,-200],[920,-200],[-200,680],[920,680]].map(([x,y])=>pointCell(map.type,{x:(x-camera.x)/camera.zoom,y:(y-camera.y)/camera.zoom}));
        const minQ=Math.min(...corners.map(c=>c.q))-2,maxQ=Math.max(...corners.map(c=>c.q))+2,minR=Math.min(...corners.map(c=>c.r))-2,maxR=Math.max(...corners.map(c=>c.r))+2;
        for(let q=minQ;q<=maxQ;q++)for(let r=minR;r<=maxR;r++){
            const p=cellPoint(map.type,q,r);
            const key=cellKey({q,r}),data=map.metadata.cells?.[key];
            const attrs={'data-cell-key':key,fill:cellColor(map,data),'fill-opacity':.32};
            const shape=map.type==='grid'?svgNode('rect',{...attrs,x:p.x-80,y:p.y-80,width:160,height:160}):svgNode('polygon',{...attrs,points:Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return `${p.x+CELL_SIZE/Math.sqrt(3)*Math.cos(a)},${p.y+CELL_SIZE/Math.sqrt(3)*Math.sin(a)}`;}).join(' ')});
            cellShapes.set(key,shape);lattice.append(shape);
            if(data?.name&&!lowDetail)lattice.append(svgNode('text',{x:p.x,y:p.y-55,'text-anchor':'middle',fill:'var(--dm-text)',stroke:'none','font-size':14},data.name));
            if(options.selectedCells?.includes(key))highlight(key);
        }
        const boundaries=new Map(),regions=new Map(),rules=cellRules(map);
        for(const [key,data] of Object.entries(map.metadata.cells??{})){if(!data.region)continue;const [q,r]=key.split(',').map(Number),p=cellPoint(map.type,q,r),vertices=map.type==='grid'?[[p.x-80,p.y-80],[p.x+80,p.y-80],[p.x+80,p.y+80],[p.x-80,p.y+80]]:Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return [p.x+CELL_SIZE/Math.sqrt(3)*Math.cos(a),p.y+CELL_SIZE/Math.sqrt(3)*Math.sin(a)];});
            const ids=[],seen=new Set();let regionId=data.region;while(regionId&&!seen.has(regionId)){seen.add(regionId);ids.push(regionId);regionId=rules.regions.find(r=>r.id===regionId)?.parentId;}for(const regionId of ids){if(!boundaries.has(regionId)){boundaries.set(regionId,new Map());regions.set(regionId,[]);}regions.get(regionId).push(p);const edges=boundaries.get(regionId);
            for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],code=[a.map(v=>v.toFixed(3)).join(','),b.map(v=>v.toFixed(3)).join(',')].sort().join('|');if(edges.has(code))edges.delete(code);else edges.set(code,[a,b]);}}
        }
        for(const [id,edges] of boundaries){const region=rules.regions.find(r=>r.id===id);if(!region||(lowDetail?!!region.parentId:rules.regions.some(r=>r.parentId===id)))continue;const pts=regions.get(id),center={x:pts.reduce((v,p)=>v+p.x,0)/pts.length,y:pts.reduce((v,p)=>v+p.y,0)/pts.length},anchor=pts.reduce((a,b)=>Math.hypot(a.x-center.x,a.y-center.y)<Math.hypot(b.x-center.x,b.y-center.y)?a:b);
            lattice.append(svgNode('path',{d:[...edges.values()].map(([a,b])=>`M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`).join(' '),stroke:region.color,'stroke-width':3,'stroke-opacity':.8,fill:'none',class:'dm-region-border'}));lattice.append(svgNode('text',{x:anchor.x,y:anchor.y-62,class:'dm-region-name','text-anchor':'middle'},region.name));
        }
        viewport.append(lattice);
    }
    paintEdges(); viewport.append(edgeLayer,compass,nodeLayer);svg.append(viewport);
    let drag=null;
    const point=e=>new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    const world=e=>new DOMPoint(e.clientX,e.clientY).matrixTransform(viewport.getScreenCTM().inverse());
    svg.addEventListener('pointerdown',e=>{
        if(!e.isPrimary||e.button!==0)return;
        const id=e.target.closest('[data-node-id]')?.dataset.nodeId;
        const edgeId=e.target.closest('[data-edge-id]')?.dataset.edgeId;
        drag={pointer:e.pointerId,id,edgeId,start:point(e),moved:false,plan:null};
        if(isTileMap(map)&&options.cellEditing&&options.brushCells){drag.cells=new Set();drag.previous=world(e);addBrush(world(e));}
        svg.setPointerCapture(e.pointerId);
    });
    function addBrush(pointer){
        const prev=drag.previous??pointer,steps=Math.min(2000,Math.max(1,Math.ceil(Math.hypot(pointer.x-prev.x,pointer.y-prev.y)/30)));
        for(let i=0;i<=steps;i++){const key=cellKey(pointCell(map.type,{x:prev.x+(pointer.x-prev.x)*i/steps,y:prev.y+(pointer.y-prev.y)*i/steps}));if(drag.cells.size<10000){drag.cells.add(key);highlight(key);}}
        drag.previous=pointer;onHint(`本次刷选 ${drag.cells.size} 格；松手后统一设置属性`);
    }
    svg.addEventListener('pointermove',e=>{
        if(drag?.pointer!==e.pointerId)return;
        if(drag.cells){addBrush(world(e));return;}
        const p=point(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y;
        if(!drag.moved&&Math.hypot(dx,dy)<5)return;
        drag.moved=true;
        if(drag.id){
            if(!editable)return;
            const pointer=world(e),plan=isTileMap(map)?tilePlacement(map,drag.id,pointer):placementPlan(map,drag.id,pointer);drag.plan=plan;
            if(!plan){onHint('此地点没有直接相连的邻居，请先添加路线。');return;}
            points.set(drag.id,pointer);
            groups.get(drag.id).setAttribute('transform',`translate(${pointer.x} ${pointer.y})`);
            paintEdges(plan.removeIds);paintCompass(plan);
            const names=map.edges.filter(edge=>plan.removeIds.includes(edge.id)).map(edge=>map.nodes[edge.from===drag.id?edge.to:edge.from].name);
            if(plan.mode==='snap') {
                compass.append(svgNode('circle',{cx:plan.position.x,cy:plan.position.y,r:22,fill:'none',stroke:'var(--dm-accent)','stroke-width':2,'stroke-dasharray':'5 4'}));
                const d=DIRECTIONS.find(d=>d.id===plan.direction).label;
                onHint(`松手：连接 ${map.nodes[plan.anchorId].name} · ${d}${plan.adjusted?'（原方位被占用，已选择最近空位）':''}${names.length?' · 断开：'+names.join('、'):''}`);
            } else if(plan.mode==='cell'){compass.append(svgNode('circle',{cx:plan.position.x,cy:plan.position.y,r:30,fill:'none',stroke:'var(--dm-accent)'}));onHint(`松手：放置到格子 ${plan.cell.q}, ${plan.cell.r}，保留全部路线`);} else onHint(plan.mode==='blocked'?plan.reason:`松手：自由放置${names.length?' · 断开：'+names.join('、'):''}`);
        }else viewport.setAttribute('transform',`translate(${camera.x+dx} ${camera.y+dy}) scale(${camera.zoom})`);
    });
    function finish(e){
        if(drag?.pointer!==e.pointerId)return;
        if(drag.cells&&e.type!=='pointercancel')addBrush(world(e));
        const ended=drag;drag=null;compass.replaceChildren();
        if(ended.cells){options.onCells(e.type==='pointercancel'?[]:[...ended.cells],true);return;}
        if(e.type==='pointercancel'){
            if(ended.id){points.set(ended.id,map.nodes[ended.id].position);const p=points.get(ended.id);groups.get(ended.id).setAttribute('transform',`translate(${p.x} ${p.y})`);paintEdges();}
            viewport.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`);onHint('拖动已取消');return;
        }
        if(!ended.moved){if(ended.edgeId&&!ended.id&&options.onEdgeSelect){options.onEdgeSelect(ended.edgeId);return;}if(isTileMap(map)&&(options.cellEditing||!ended.id))options.onCells?.([cellKey(pointCell(map.type,world(e)))],false);else if(ended.id)onSelect(ended.id);return;}
        if(ended.id){if(editable&&ended.plan)onSnap(ended.id,ended.plan);}
        else{const p=point(e);onCamera({...camera,x:camera.x+p.x-ended.start.x,y:camera.y+p.y-ended.start.y});}
    }
    svg.addEventListener('pointerup',finish);svg.addEventListener('pointercancel',finish);
    svg.addEventListener('wheel',e=>{
        e.preventDefault();if(drag)return;
        const p=point(e),zoom=Math.max(.1,Math.min(3,camera.zoom*(e.deltaY<0?1.12:1/1.12))),ratio=zoom/camera.zoom;
        onCamera({zoom,x:p.x-(p.x-camera.x)*ratio,y:p.y-(p.y-camera.y)*ratio});
    },{passive:false});
    return svg;
}



