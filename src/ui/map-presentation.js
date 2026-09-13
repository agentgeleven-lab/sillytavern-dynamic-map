/** Presentation helpers; never modify map documents. */
export const nodeGlyph=type=>({city:'▥',town:'⌂',village:'⌂',sect:'▲',port:'⚓',harbor:'⚓',forest:'♠',mountain:'△',building:'▣',dungeon:'▧',waypoint:'·',landmark:'◇'}[type]??'◇');
export function mapChanges(before,after){
 const changes=[];
 for(const id of new Set([...Object.keys(before.maps),...Object.keys(after.maps)])){
  const a=before.maps[id],b=after.maps[id];
  if(!a||!b){changes.push({mapId:id,label:(b?'新增地图：':'删除地图：')+(b??a).name,kind:'map'});continue;}
  for(const key of new Set([...Object.keys(a.nodes),...Object.keys(b.nodes)])){
   const old=a.nodes[key],now=b.nodes[key];if(JSON.stringify(old)===JSON.stringify(now))continue;
   const kind=!old?'added':!now?'removed':'changed';changes.push({mapId:id,nodeId:now?.id,label:(!old?'新增地点：':!now?'删除地点：':'修改地点：')+(now??old).name,kind});
  }
  const aa=new Map(a.edges.map(e=>[e.id,e])),bb=new Map(b.edges.map(e=>[e.id,e]));
  for(const key of new Set([...aa.keys(),...bb.keys()])){const old=aa.get(key),now=bb.get(key);if(JSON.stringify(old)===JSON.stringify(now))continue;const e=now??old,m=now?b:a;changes.push({mapId:id,edgeId:now?.id,label:(!old?'新增道路：':!now?'删除道路：':'修改道路：')+(e.name||`${m.nodes[e.from]?.name??e.from} → ${m.nodes[e.to]?.name??e.to}`),kind:!old?'added':!now?'removed':'changed'});}
  const metadata=m=>JSON.stringify({name:m.name,type:m.type,parentMap:m.parentMap,metadata:m.metadata});
  if(metadata(a)!==metadata(b))changes.push({mapId:id,label:'地图资料或规则：'+b.name,kind:'map'});
 }
 const am=before.maps[before.activeMap],bm=after.maps[after.activeMap];
 if(before.activeMap!==after.activeMap||am.currentLocation!==bm.currentLocation)changes.push({mapId:bm.id,nodeId:bm.currentLocation,label:`角色位置：${am.nodes[am.currentLocation]?.name??'未知'} → ${bm.nodes[bm.currentLocation]?.name??'未知'}`,kind:'move'});
 return changes;
}
export function labelPositions(nodes){
 const boxes=nodes.map(n=>({x:n.position.x-27,y:n.position.y-30,w:54,h:60})),result=new Map();
 const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 for(const n of nodes){const width=Math.min(240,Math.max(48,Array.from(n.name).length*15));let chosen;
  for(const [dx,dy] of [[0,54],[0,-58],[width/2+34,5],[-width/2-34,5],[0,70]]){const box={x:n.position.x+dx-width/2,y:n.position.y+dy-18,w:width,h:24};if(!boxes.some(b=>overlaps(box,b))){chosen={dx,dy,box};break;}}
  chosen??={dx:0,dy:45,box:{x:n.position.x-width/2,y:n.position.y+27,w:width,h:24}};boxes.push(chosen.box);result.set(n.id,chosen);
 }return result;
}
