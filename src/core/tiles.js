// Cell spacing is visual only. Route distances are never inferred from it.
export const CELL_SIZE = 160;
const bearings = ['north','north-northeast','northeast','east-northeast','east','east-southeast','southeast','south-southeast','south','south-southwest','southwest','west-southwest','west','west-northwest','northwest','north-northwest'];
export const isTileMap = map => map.type === 'grid' || map.type === 'hex';
export function cellPoint(type, q, r) {
    return type === 'hex' ? {x:CELL_SIZE*(q+r/2),y:CELL_SIZE*Math.sqrt(3)/2*r} : {x:CELL_SIZE*q,y:CELL_SIZE*r};
}
export function pointCell(type, point) {
    const x=Number.isFinite(point.x)?point.x:0,y=Number.isFinite(point.y)?point.y:0;
    if(type!=='hex')return {q:Math.round(x/CELL_SIZE),r:Math.round(y/CELL_SIZE)};
    const r=y/(CELL_SIZE*Math.sqrt(3)/2),q=x/CELL_SIZE-r/2,s=-q-r;
    let rq=Math.round(q),rr=Math.round(r),rs=Math.round(s);
    const dq=Math.abs(rq-q),dr=Math.abs(rr-r),ds=Math.abs(rs-s);
    if(dq>dr&&dq>ds)rq=-rr-rs;else if(dr>ds)rr=-rq-rs;
    return {q:rq,r:rr};
}
export function refreshTileDirections(map) {
    for(const edge of map.edges){const a=map.nodes[edge.from].position,b=map.nodes[edge.to].position;
        edge.direction=bearings[(Math.round(Math.atan2(b.x-a.x,a.y-b.y)*8/Math.PI)+16)%16];
        edge.metadata.directionLocked=false;
    }
}
export function layoutTiles(map) {
    if(!isTileMap(map))return map;
    const next=structuredClone(map);arrangeCells(next);Object.assign(map,next);return map;
}
function arrangeCells(map) {
    if(!isTileMap(map))return map;
    const occupied=new Set();
    // Reserve pinned positions before finding free cells for other locations.
    const nodes=Object.values(map.nodes).sort((a,b)=>Number(!!b.layout.pinned)-Number(!!a.layout.pinned));
    for(const node of nodes){
        const origin=pointCell(map.type,node.position);if(!Number.isSafeInteger(origin.q)||!Number.isSafeInteger(origin.r)||Math.abs(origin.q)>1000000||Math.abs(origin.r)>1000000)throw new Error('地点超出格子地图范围');let cell=origin;
        const key=c=>`${c.q},${c.r}`;
        if(occupied.has(key(cell))){
            if(node.layout.pinned)throw new Error('固定地点占用了同一格，请先解除固定');
            let found=false;
            for(let radius=1;!found&&radius<=nodes.length+1;radius++){
                const candidates=[];
                for(let q=-radius;q<=radius;q++)for(let r=-radius;r<=radius;r++){
                    if(Math.max(Math.abs(q),Math.abs(r))!==radius)continue;
                    const c={q:origin.q+q,r:origin.r+r};if(!occupied.has(key(c)))candidates.push(c);
                }
                candidates.sort((a,b)=>{const p=cellPoint(map.type,a.q-origin.q,a.r-origin.r),t=cellPoint(map.type,b.q-origin.q,b.r-origin.r);return p.x*p.x+p.y*p.y-t.x*t.x-t.y*t.y;});
                if(candidates.length){cell=candidates[0];found=true;}
            }
        }
        occupied.add(key(cell));node.position=cellPoint(map.type,cell.q,cell.r);node.layout.fixed=true;
    }
    refreshTileDirections(map);map.metadata.layout={...map.metadata.layout,mode:'cells'};return map;
}
export function tilePlacement(map,id,point) {
    const cell=pointCell(map.type,point),position=cellPoint(map.type,cell.q,cell.r);
    const blocked=map.nodes[id].layout.pinned?'此地点已固定，请先解除固定':Object.values(map.nodes).some(n=>n.id!==id&&Math.hypot(n.position.x-position.x,n.position.y-position.y)<1)?'此格已有地点，请选择空格':null;
    return {mode:blocked?'blocked':'cell',reason:blocked,position,removeIds:[],cell};
}
export function applyTilePlacement(map,id,plan) {
    if(plan.mode==='blocked')throw new Error(plan.reason);
    const checked=tilePlacement(map,id,plan.position);if(checked.mode==='blocked')throw new Error(checked.reason);
    map.nodes[id].position=checked.position;map.nodes[id].layout.fixed=true;refreshTileDirections(map);
}
