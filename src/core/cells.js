export const cellKey = ({q,r}) => `${q},${r}`;
export const emptyCell = () => ({area:'',terrain:'',region:'',name:'',description:'',color:''});
export function cellRules(map){return map.metadata.cellRules??{
    areas:[{id:'urban',name:'市区',color:'#8596a5'},{id:'suburb',name:'郊区',color:'#9bbd85'},{id:'rural',name:'乡村',color:'#c7bb7f'},{id:'wild',name:'荒野',color:'#728667'}],
    terrains:[{id:'plain',name:'平原',color:'#9abd78'},{id:'mountain',name:'山地',color:'#998c7c'},{id:'forest',name:'森林',color:'#528566'},{id:'water',name:'水域',color:'#659fbd'}],regions:[]};}
export function ensureCells(map){map.metadata.cells??={};map.metadata.cellRules??=structuredClone(cellRules(map));return map.metadata.cells;}
export function regionName(map,id){const rules=cellRules(map),parts=[],seen=new Set();while(id&&!seen.has(id)){seen.add(id);const region=rules.regions.find(r=>r.id===id);if(!region)break;parts.unshift(region.name);id=region.parentId;}return parts.join(' / ');}
export function cellColor(map,data){const rules=cellRules(map);return data?.color||rules.areas.find(t=>t.id===data?.area)?.color||rules.terrains.find(t=>t.id===data?.terrain)?.color||rules.regions.find(t=>t.id===data?.region)?.color||'none';}
export function validateCells(map){
    const rules=cellRules(map),cells=map.metadata.cells??{};
    const fail=msg=>{throw new Error('格子资料：'+msg);};
    if(!cells||typeof cells!=='object'||Array.isArray(cells)||Object.keys(cells).length>10000)fail('最多保存 10000 格');
    if(!rules||typeof rules!=='object')fail('规则格式错误');
    for(const key of ['areas','terrains','regions']){
        if(!Array.isArray(rules[key])||rules[key].length>500)fail('每类目录最多 500 项');const ids=new Set();
        for(const t of rules[key]){if(!t||typeof t.id!=='string'||!t.id||['__proto__','prototype','constructor'].includes(t.id)||ids.has(t.id)||typeof t.name!=='string'||!t.name.trim()||!/^#[0-9a-f]{6}$/i.test(t.color))fail('类型名称、ID 或颜色无效');ids.add(t.id);}
    }
    for(const item of rules.regions){let current=item;const seen=new Set();while(current){if(seen.has(current.id))fail('行政归属不能循环');seen.add(current.id);if(!current.parentId)break;current=rules.regions.find(r=>r.id===current.parentId);if(!current)fail('上级行政区域不存在');}}
    for(const [key,data] of Object.entries(cells)){
        if(!/^-?\d+,-?\d+$/.test(key))fail('坐标格式错误');const [q,r]=key.split(',').map(Number);if(![q,r].every(v=>Number.isSafeInteger(v)&&Math.abs(v)<=1000000)||cellKey({q,r})!==key)fail('坐标超出范围');
        if(!data||typeof data!=='object'||Array.isArray(data))fail('属性需要对象');
        for(const k of ['area','terrain','region','name','description','color'])if(typeof data[k]!=='string')fail('属性字段缺失');
        for(const [field,catalog] of [['area','areas'],['terrain','terrains'],['region','regions']])if(data[field]&&!rules[catalog].some(t=>t.id===data[field]))fail('引用的类型或行政区域不存在');
        if(data.color&&!/^#[0-9a-f]{6}$/i.test(data.color))fail('颜色格式错误');
    }
}
export function paintCells(map,keys,data){const next=structuredClone(map),cells=ensureCells(next);for(const key of keys){if(typeof key!=='string'||!/^(-?\d+),(-?\d+)$/.test(key))throw new Error('格子坐标格式错误');if(data===null)delete cells[key];else cells[key]=structuredClone(data);}validateCells(next);map.metadata=next.metadata;}
export function removeCellRule(map,kind,id){
    const fields={areas:'area',terrains:'terrain',regions:'region'};ensureCells(map);
    if(Object.values(map.metadata.cells).some(c=>c[fields[kind]]===id)||kind==='regions'&&map.metadata.cellRules.regions.some(r=>r.parentId===id))throw new Error('仍有格子或下级行政区域使用此项，请先修改归属');
    map.metadata.cellRules[kind]=map.metadata.cellRules[kind].filter(t=>t.id!==id);
}
