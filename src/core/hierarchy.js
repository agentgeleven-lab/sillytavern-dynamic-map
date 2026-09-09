export const GENERATION_LEVELS=[
    {id:'world',name:'世界／大陆',prompt:'生成国家、大区域、主要城市及区域之间的连接。不要混入房间、单栋建筑或城市内部街道。'},
    {id:'region',name:'国家／省份',prompt:'仅生成指定国家或地区内部的城镇、山川和交通路线，不生成其他国家或室内房间。'},
    {id:'city',name:'城市／聚落',prompt:'仅生成指定聚落内部的街区、建筑、广场及街道。不要把其他城市作为内部地点。'},
    {id:'site',name:'宗门／园区',prompt:'仅生成指定宗门或园区内部的功能区域、建筑与内部道路，不扩展到周边城镇。'},
    {id:'interior',name:'建筑／地下城',prompt:'仅生成指定建筑或地下城内部的房间、楼层、出入口和通道。不要生成城镇、国家或外部区域。'},
    {id:'custom',name:'自定义',prompt:'严格按用户指定的空间范围与细节尺度生成。要求不明确时缩小范围，不擅自扩展至上级区域。'},
];
export function mapPath(doc,id){const path=[],seen=new Set();while(doc.maps[id]&&!seen.has(id)){seen.add(id);path.unshift(doc.maps[id]);id=doc.maps[id].parentMap;}return path;}
export function mapChoices(doc){return Object.values(doc.maps).map(m=>({id:m.id,name:mapPath(doc,m.id).map(x=>x.name).join(' → ')})).sort((a,b)=>a.name.localeCompare(b.name));}
export function locationPath(doc){const map=doc.maps[doc.activeMap],path=mapPath(doc,map.id).map(m=>m.name);if(map.nodes[map.currentLocation])path.push(map.nodes[map.currentLocation].name);return path.join(' → ');}
export function projectedLocation(doc,mapId){let map=doc.maps[doc.activeMap];if(map.id===mapId)return map.currentLocation;while(map.parentMap){if(map.parentMap===mapId)return map.metadata.parentNode??null;map=doc.maps[map.parentMap];}return null;}
export function generationScope(doc,mapId,level){
    const map=doc.maps[mapId],parent=doc.maps[map.parentMap],entrance=parent?.nodes[map.metadata.parentNode];
    return {当前地图:{id:map.id,name:map.name,type:map.type,currentLocation:map.currentLocation,当前位置资料:map.nodes[map.currentLocation]??null},生成层级:GENERATION_LEVELS.find(l=>l.id===level)?.name,层级路径:mapPath(doc,mapId).map(m=>({id:m.id,name:m.name})),上级地图:parent?{id:parent.id,name:parent.name}:null,入口地点:entrance?{id:entrance.id,name:entrance.name,description:entrance.description}:null,必须保留的子地图入口:Object.values(doc.maps).filter(m=>m.parentMap===mapId&&m.metadata.parentNode).map(m=>map.nodes[m.metadata.parentNode])};
}
export function levelPrompt(level){const entry=GENERATION_LEVELS.find(l=>l.id===level);if(!entry)throw new Error('请选择有效生成层级');return `\n本次生成层级：${entry.name}。${entry.prompt}\n以提供的层级路径和入口地点说明限定范围。上级地图只提供背景，不属于本次重建目标。必须保留已有子地图入口的 ID 和地点身份。只生成当前一张地图。`;}
