import { validateDocument } from './protocol.js';
import { prepareDocument } from './spatial.js';
import { autoLayout } from './auto-layout.js';
import { layoutTiles } from './tiles.js';

// Full generation replaces only the current map, never the surrounding hierarchy.
export function applyGeneratedMap(base, generated) {
    const incoming=prepareDocument(validateDocument(generated));
    if(Object.keys(incoming.maps).length!==1)throw new Error('每次只生成当前一张地图；子地图请分别创建');
    const next=structuredClone(base),old=next.maps[next.activeMap],map=incoming.maps[incoming.activeMap];
    map.id=old.id;map.type=old.type;map.parentMap=old.parentMap;
    for(const key of ['cells','cellRules'])if(old.metadata[key]!==undefined)map.metadata[key]=structuredClone(old.metadata[key]);
    delete map.metadata.parentNode;
    if(old.metadata.parentNode!=null)map.metadata.parentNode=old.metadata.parentNode;
    for(const child of Object.values(next.maps))if(child.parentMap===old.id&&child.metadata.parentNode&&!map.nodes[child.metadata.parentNode])throw new Error('生成结果缺少子地图入口，请使用新增模式，或先解除该入口关联');
    if(map.type==='graph')autoLayout(map);else layoutTiles(map);
    next.maps[old.id]=map;return validateDocument(next);
}
