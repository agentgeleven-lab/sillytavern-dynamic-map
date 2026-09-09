import { cellRules, emptyCell, regionName, paintCells, ensureCells, removeCellRule } from '../core/cells.js';
export function renderCellEditor(host,map,keys,edit,kit){
    const {el,field,input,select,button}=kit,rules=cellRules(map),data=map.metadata.cells?.[keys[0]]??emptyCell();
    host.append(el('p',keys.length?`已选择 ${keys.length} 格：${keys.slice(0,5).join('；')}${keys.length>5?'…':''}`:'点击格子选择；开启刷选后按住拖动，可连续选择多个格子。','dm-cell-selection'));
    if(!keys.length)return;
    host.append(el('p','下列属性会统一应用到选中格子。空选项表示清除该属性；格子资料不随地点拖动。','dm-help'));
    const choices=items=>[{id:'',name:'未设置'},...items];
    const area=field(host,'格子区域类型',select(choices(rules.areas),data.area)),terrain=field(host,'格子地形',select(choices(rules.terrains),data.terrain));
    const region=field(host,'格子行政归属',select(choices(rules.regions.map(r=>({...r,name:regionName(map,r.id)}))),data.region));
    const name=field(host,'格子名称',input(data.name)),description=field(host,'格子说明',el('textarea'));description.value=data.description;
    const custom=field(host,'使用独立格子颜色',input('','checkbox'));custom.checked=!!data.color;
    const color=field(host,'格子颜色',input(data.color||'#9bbd85','color'));
    host.append(el('p','未指定独立颜色时，依次使用区域类型、地形、行政区域的颜色。','dm-help'));
    host.append(button('应用到选中格子',()=>edit(m=>paintCells(m,keys,{area:area.value,terrain:terrain.value,region:region.value,name:name.value.trim(),description:description.value,color:custom.checked?color.value:''}))),button('清除选中格子属性',()=>edit(m=>paintCells(m,keys,null))));
}
export function renderCellDetails(host,map,key,kit){
    const {el}=kit,data=map.metadata.cells?.[key],rules=cellRules(map);
    host.append(el('h3',data?.name||`格子 ${key}`));
    if(!data){host.append(el('p','此格尚未设置属性'));return;}
    host.append(el('p',`区域：${rules.areas.find(t=>t.id===data.area)?.name||'未设置'} · 地形：${rules.terrains.find(t=>t.id===data.terrain)?.name||'未设置'}`),el('p','行政归属：'+(regionName(map,data.region)||'未设置')),el('p',data.description||'暂无说明'));
}
export function renderCellRules(host,map,kind,edit,kit){
    const {el,field,input,select,button,uid}=kit,rules=cellRules(map);
    host.append(el('p',kind==='regions'?'行政区域可以跨多个格子，例如省 → 市 → 区；这与地图的父子层级分别管理。':'颜色修改会同步用于引用此类型的格子；使用中的类型需先从格子中移除再删除。','dm-help'));
    const row=(item)=>{
        const box=el('div',undefined,'dm-route'),name=field(box,item?'条目名称':'新增条目名称',input(item?.name??'')),color=field(box,item?'条目颜色':'新增条目颜色',input(item?.color??'#9bbd85','color'));
        let parent;
        if(kind==='regions')parent=field(box,'上级行政区域',select([{id:'',name:'无（顶级区域）'},...rules.regions.filter(r=>r.id!==item?.id).map(r=>({...r,name:regionName(map,r.id)}))],item?.parentId??''));
        box.append(button(item?'应用条目调整':'添加条目',()=>edit(m=>{ensureCells(m);const next={id:item?.id??uid('celltype'),name:name.value.trim(),color:color.value,...(parent?{parentId:parent.value||null}:{})};const catalog=m.metadata.cellRules[kind],index=catalog.findIndex(t=>t.id===next.id);if(index<0)catalog.push(next);else catalog[index]=next;})));
        if(item)box.append(button('删除条目',()=>edit(m=>removeCellRule(m,kind,item.id))));host.append(box);
    };
    for(const item of rules[kind])row(item);row(null);
}
