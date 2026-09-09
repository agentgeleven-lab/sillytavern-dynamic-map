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
    if (!nodes.length) return { x: 180, y: 80, zoom: 1 };
    const xs = nodes.map(n => n.position.x ?? 0), ys = nodes.map(n => n.position.y ?? 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const zoom = Math.min(1.65, 610 / (maxX-minX+100), 340 / (maxY-minY+100));
    return { x: 360-(minX+maxX)/2*zoom, y: 220-(minY+maxY)/2*zoom, zoom };
}
export function renderMap(map, options) {
    const { camera, editable = false, onSelect, onCamera, onSnap, onHint = () => {} } = options;
    const svg = svgNode('svg', { viewBox:'0 0 720 480', class:'dm-svg', role:'group', 'aria-label': `${map.name}，${Object.values(map.nodes).filter(n => options.adjusting || n.discovered).length} 个地点` });
    const viewport = svgNode('g', { transform:`translate(${camera.x} ${camera.y}) scale(${camera.zoom})` });
    const edgeLayer = svgNode('g'), nodeLayer = svgNode('g'), compass = svgNode('g', { 'pointer-events':'none', class:'dm-compass' });
    const points = new Map(Object.values(map.nodes).map(n => [n.id, { x:n.position.x ?? 0, y:n.position.y ?? 0 }]));
    const groups = new Map();
    function paintEdges(removed = []) {
        edgeLayer.replaceChildren();
        for (const e of map.edges) {
            if (!options.adjusting && (!e.discovered || !map.nodes[e.from].discovered || !map.nodes[e.to].discovered)) continue;
            const a=points.get(e.from), b=points.get(e.to), cut=removed.includes(e.id);
            const g=svgNode('g', {'data-edge-id':e.id,class:`dm-edge${cut?' dm-cut':''}`});
            g.append(svgNode('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y}));
            if (!e.bidirectional) {
                const x=a.x+(b.x-a.x)*.65,y=a.y+(b.y-a.y)*.65,angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
                g.append(svgNode('path',{d:'M -10 -6 L 0 0 L -10 6',transform:`translate(${x} ${y}) rotate(${angle})`,fill:'none',stroke:'var(--dm-accent)','stroke-width':3}));
            }
            if (roadName(map,e)) g.append(svgNode('text',{x:(a.x+b.x)/2+8,y:(a.y+b.y)/2-10},roadName(map,e)));
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
        const group=svgNode('g',{transform:`translate(${p.x} ${p.y})`,class:`dm-node${current?' dm-current':''}`,'data-node-id':n.id,role:'button',tabindex:0,'aria-label':`${n.name}${current?'，当前位置':''}，查看地点详情`});
        if (current) group.append(svgNode('circle',{r:28,class:'dm-halo'}));
        group.append(svgNode('circle',{r:n.type==='waypoint'?7:19,class:'dm-dot'}));
        if(n.type!=='waypoint') group.append(svgNode('text',{y:5,class:'dm-symbol'},n.type==='sect'?'▲':n.type==='city'?'◆':'●'));
        group.append(svgNode('text',{y:45,class:'dm-name'},n.name));
        if (current) group.append(svgNode('text',{y:-37,class:'dm-current-label'},'当前位置'));
        group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(n.id);}});
        groups.set(n.id,group);nodeLayer.append(group);
    }
    if(isTileMap(map)){
        const lattice=svgNode('g',{'pointer-events':'none',class:'dm-cell-layer',stroke:'var(--dm-muted)','stroke-opacity':.28,'stroke-width':1,fill:'none'});
        const corners=[[-200,-200],[920,-200],[-200,680],[920,680]].map(([x,y])=>pointCell(map.type,{x:(x-camera.x)/camera.zoom,y:(y-camera.y)/camera.zoom}));
        const minQ=Math.min(...corners.map(c=>c.q))-2,maxQ=Math.max(...corners.map(c=>c.q))+2,minR=Math.min(...corners.map(c=>c.r))-2,maxR=Math.max(...corners.map(c=>c.r))+2;
        for(let q=minQ;q<=maxQ;q++)for(let r=minR;r<=maxR;r++){
            const p=cellPoint(map.type,q,r);
            if(map.type==='grid')lattice.append(svgNode('rect',{x:p.x-80,y:p.y-80,width:160,height:160}));
            else lattice.append(svgNode('polygon',{points:Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return `${p.x+CELL_SIZE/Math.sqrt(3)*Math.cos(a)},${p.y+CELL_SIZE/Math.sqrt(3)*Math.sin(a)}`;}).join(' ')}));
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
        drag={pointer:e.pointerId,id,start:point(e),moved:false,plan:null};
        svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove',e=>{
        if(drag?.pointer!==e.pointerId)return;
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
        const ended=drag;drag=null;compass.replaceChildren();
        if(e.type==='pointercancel'){
            if(ended.id){points.set(ended.id,map.nodes[ended.id].position);const p=points.get(ended.id);groups.get(ended.id).setAttribute('transform',`translate(${p.x} ${p.y})`);paintEdges();}
            viewport.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`);onHint('拖动已取消');return;
        }
        if(!ended.moved){if(ended.id)onSelect(ended.id);return;}
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



