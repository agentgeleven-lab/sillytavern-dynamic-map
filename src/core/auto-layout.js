// Geometry only: distance, names, topology and travel rules are never rewritten.
const TAU=Math.PI*2, IDEAL=160, ANGLE=Math.PI/8;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const angleIndex=(a,b)=>(Math.round(Math.atan2(b.x-a.x,-(b.y-a.y))/ANGLE)+16)%16;
const DIRS=['north','north-northeast','northeast','east-northeast','east','east-southeast','southeast','south-southeast','south','south-southwest','southwest','west-southwest','west','west-northwest','northwest','north-northwest'];
const rect=n=>({w:Math.max(84,Math.min(200,Array.from(n.name||'').length*15+24)),h:96});
const overlap=(a,b,sa,sb)=>({x:(sa.w+sb.w)/2+18-Math.abs(a.x-b.x),y:(sa.h+sb.h)/2+18-Math.abs(a.y-b.y)});
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

/** Deterministic bounded force layout plus hard constraint projection, atomic on failure. */
export function autoLayout(map,{pinnedIds=[],preserveExisting=false}={}) {
    if(map.type!=='graph')throw new Error('自动布局目前仅支持节点地图');
    const ids=Object.keys(map.nodes).sort(),edges=[...map.edges].sort((a,b)=>a.id.localeCompare(b.id));
    if(ids.length>250||edges.length>1500)throw new Error('自动布局单张地图最多支持 250 个地点、1500 条道路，请拆分地图');
    const pins=new Set(pinnedIds),points=new Map(),sizes=new Map(),adj=new Map(ids.map(id=>[id,[]]));
    for(const id of ids){const n=map.nodes[id];sizes.set(id,rect(n));if(n.layout.pinned||preserveExisting&&finite(n.position))pins.add(id);}
    for(const id of pins)if(!map.nodes[id]||!finite(map.nodes[id].position))throw new Error('固定地点必须有有效位置');
    for(const e of edges){if(!adj.has(e.from)||!adj.has(e.to)||e.from===e.to)throw new Error('道路端点无效');adj.get(e.from).push(e.to);adj.get(e.to).push(e.from);if(e.metadata.directionLocked&&!DIRS.includes(e.direction))throw new Error('锁定道路需要有效的16方位');}
    const components=[],seen=new Set();
    for(const root of ids){if(seen.has(root))continue;const list=[root];seen.add(root);for(let i=0;i<list.length;i++)for(const id of adj.get(list[i]))if(!seen.has(id)){seen.add(id);list.push(id);}components.push(list);}
    const move=(a,b,dx,dy)=>{const pa=pins.has(a),pb=pins.has(b),p=points.get(a),q=points.get(b);if(pa&&pb)return;const wa=pa?0:pb?1:.5,wb=pb?0:pa?1:.5;p.x-=dx*wa;p.y-=dy*wa;q.x+=dx*wb;q.y+=dy*wb;};
    const locked=edges.filter(e=>e.metadata.directionLocked);
    function project(){
        // A locked bearing means the same 16-direction sector used in the UI.
        for(const e of locked){const a=points.get(e.from),b=points.get(e.to),i=DIRS.indexOf(e.direction),u={x:Math.sin(i*ANGLE),y:-Math.cos(i*ANGLE)},v={x:-u.y,y:u.x},t=Math.tan(Math.PI/16)*.88;
            for(const [x,y,min] of [[u.x,u.y,100],[t*u.x-v.x,t*u.y-v.y,0],[t*u.x+v.x,t*u.y+v.y,0]]){
                const lack=min-(x*(b.x-a.x)+y*(b.y-a.y));if(lack>0){const norm=x*x+y*y;move(e.from,e.to,x*lack/norm,y*lack/norm);}
            }
        }
        for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const a=ids[i],b=ids[j],p=points.get(a),q=points.get(b),o=overlap(p,q,sizes.get(a),sizes.get(b));if(o.x>0&&o.y>0){if(o.x<o.y)move(a,b,(q.x>=p.x?1:-1)*(o.x+.5),0);else move(a,b,0,(q.y>=p.y?1:-1)*(o.y+.5));}}
    }
    // Start from persisted positions when available. Resolve coincident starts deterministically.
    components.forEach((list,c)=>{const center=list.find(id=>pins.has(id)),origin=center?map.nodes[center].position:{x:c*600,y:0};
        list.forEach((id,i)=>{const prior=map.nodes[id].position,a=i*2.399963229728653,r=IDEAL*Math.sqrt(i+1);points.set(id,pins.has(id)||finite(prior)?{...prior}:{x:origin.x+Math.cos(a)*r,y:origin.y+Math.sin(a)*r});});});
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const a=points.get(ids[i]),b=points.get(ids[j]);if(Math.hypot(a.x-b.x,a.y-b.y)<.01&&!pins.has(ids[j])){b.x+=Math.cos(j*2.4)*IDEAL;b.y+=Math.sin(j*2.4)*IDEAL;}}
    for(let step=0;step<280;step++){
        const forces=new Map(ids.map(id=>[id,{x:0,y:0}]));
        for(const list of components){
            for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i],b=list[j],p=points.get(a),q=points.get(b);let dx=q.x-p.x,dy=q.y-p.y;const len=Math.max(1,Math.hypot(dx,dy));if(!dx&&!dy)dx=1;const strength=Math.min(25,14000/(len*len));forces.get(a).x-=dx/len*strength;forces.get(a).y-=dy/len*strength;forces.get(b).x+=dx/len*strength;forces.get(b).y+=dy/len*strength;}
        }
        for(const e of edges){const a=points.get(e.from),b=points.get(e.to),dx=b.x-a.x,dy=b.y-a.y,len=Math.max(1,Math.hypot(dx,dy)),f=clamp((len-IDEAL)*.035,-15,15);forces.get(e.from).x+=dx/len*f;forces.get(e.from).y+=dy/len*f;forces.get(e.to).x-=dx/len*f;forces.get(e.to).y-=dy/len*f;
            if(!e.metadata.directionLocked&&step<160){const i=DIRS.indexOf(e.direction);if(i>=0){const vx=Math.sin(i*ANGLE)*IDEAL-dx,vy=-Math.cos(i*ANGLE)*IDEAL-dy;forces.get(e.to).x+=vx*.015;forces.get(e.to).y+=vy*.015;forces.get(e.from).x-=vx*.015;forces.get(e.from).y-=vy*.015;}}
        }
        // Repel unrelated nodes from road interiors to reduce misleading pass-throughs.
        if(step%3===0)for(const e of edges){const a=points.get(e.from),b=points.get(e.to),dx=b.x-a.x,dy=b.y-a.y,ll=dx*dx+dy*dy;if(ll<1)continue;
            for(const id of ids){if(id===e.from||id===e.to)continue;const p=points.get(id),t=((p.x-a.x)*dx+(p.y-a.y)*dy)/ll;if(t<.05||t>.95)continue;let vx=p.x-a.x-t*dx,vy=p.y-a.y-t*dy,len=Math.hypot(vx,vy);if(len>=65)continue;if(len<.01){vx=-dy;vy=dx;len=Math.sqrt(ll);}const f=(65-Math.min(65,len))*.18+1,nx=vx/len*f,ny=vy/len*f;forces.get(id).x+=nx;forces.get(id).y+=ny;forces.get(e.from).x-=nx*.5;forces.get(e.from).y-=ny*.5;forces.get(e.to).x-=nx*.5;forces.get(e.to).y-=ny*.5;}
        }
        const cooling=1-step/350;for(const id of ids)if(!pins.has(id)){const p=points.get(id),f=forces.get(id);p.x+=clamp(f.x,-18,18)*cooling;p.y+=clamp(f.y,-18,18)*cooling;}project();
    }
    for(let i=0;i<320;i++)project();
    // Without bearing locks, finish with deterministic nearest-free-space placement.
    // This guarantees separation even when a large graph has not fully relaxed.
    if(!locked.length){
        const placed=ids.filter(id=>pins.has(id));
        const free=(id,p)=>placed.every(other=>{const o=overlap(p,points.get(other),sizes.get(id),sizes.get(other));return o.x<=0||o.y<=0;});
        for(const id of ids.filter(id=>!pins.has(id))){const origin={...points.get(id)};let candidate=origin;
            if(!free(id,candidate)){let found=false;for(let ring=1;ring<=ids.length+1&&!found;ring++)for(let slot=0;slot<16;slot++){const a=slot*TAU/16;candidate={x:origin.x+Math.sin(a)*ring*120,y:origin.y-Math.cos(a)*ring*120};if(free(id,candidate)){found=true;break;}}if(!found)throw new Error('没有足够的可用布局空间，请减少固定地点');}
            points.set(id,candidate);placed.push(id);
        }
    }
    // Pack disconnected components into separate regions; pinned components never translate.
    const box=list=>{const xs=list.map(id=>points.get(id).x),ys=list.map(id=>points.get(id).y);return {x:Math.min(...xs)-110,y:Math.min(...ys)-60,w:Math.max(...xs)-Math.min(...xs)+220,h:Math.max(...ys)-Math.min(...ys)+120};};
    const occupied=components.filter(c=>c.some(id=>pins.has(id))).map(box);let cursor=occupied.length?Math.max(...occupied.map(b=>b.x+b.w))+180:0,rowY=0,rowH=0;
    for(const list of components.filter(c=>!c.some(id=>pins.has(id)))){const b=box(list);if(!occupied.length&&cursor>1600){cursor=0;rowY+=rowH+150;rowH=0;}const dx=cursor-b.x,dy=rowY-b.y;for(const id of list){points.get(id).x+=dx;points.get(id).y+=dy;}cursor+=b.w+150;rowH=Math.max(rowH,b.h);}
    for(const e of locked)if(angleIndex(points.get(e.from),points.get(e.to))!==DIRS.indexOf(e.direction))throw new Error(`道路「${e.name||e.id}」的锁定方位冲突，请解除部分方位锁定或地点固定后重试`);
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const o=overlap(points.get(ids[i]),points.get(ids[j]),sizes.get(ids[i]),sizes.get(ids[j]));if(o.x>.1&&o.y>.1)throw new Error(`地点「${map.nodes[ids[i]].name}」与「${map.nodes[ids[j]].name}」无法分开，请解除部分固定位置或方位锁定后重试`);}
    for(const p of points.values())if(!finite(p))throw new Error('地点坐标范围过大，请调整固定位置后重试');
    let changedDirections=0;
    for(const e of edges){const d=DIRS[angleIndex(points.get(e.from),points.get(e.to))];if(e.direction!==d)changedDirections++;}
    for(const id of ids){map.nodes[id].position=points.get(id);map.nodes[id].layout.fixed=true;}
    for(const e of map.edges)if(!e.metadata.directionLocked)e.direction=DIRS[angleIndex(points.get(e.from),points.get(e.to))];
    map.metadata.layout={...map.metadata.layout,mode:'auto'};
    return {nodes:ids.length,components:components.length,changedDirections};
}

/** Saving an auto-layout map preserves its preview exactly. */
export function validateAutoPositions(map){
    for(const n of Object.values(map.nodes))if(!finite(n.position))throw new Error('地点缺少位置，请先执行自动布局');
    for(const e of map.edges)if(e.metadata.directionLocked&&angleIndex(map.nodes[e.from].position,map.nodes[e.to].position)!==DIRS.indexOf(e.direction))throw new Error('锁定道路方位与地点位置不一致，请重新布局');
    const list=Object.values(map.nodes);for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)if(Math.hypot(list[i].position.x-list[j].position.x,list[i].position.y-list[j].position.y)<1)throw new Error('地点位置重叠，请重新布局');
    return map;
}
