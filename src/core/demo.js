import { createMap, createNode, createEdge } from './protocol.js';

export function createDemoDocument() {
    const map = createMap('world', '沧州 · 示例地图');
    map.nodes = {
        qingyun_sect: createNode('qingyun_sect', '青云宗', { type: 'sect', description: '龙门市以北，沿山路可达的修真宗门。', position: { x: 240, y: 105 } }),
        longmen_city: createNode('longmen_city', '龙门市', { type: 'city', description: '山路与官道交汇的城池，也是你当前所在的地点。', position: { x: 240, y: 295 } }),
        baisha_town: createNode('baisha_town', '白沙镇', { type: 'town', description: '位于龙门市东侧，与城池由官道相连。', position: { x: 550, y: 295 } }),
    };
    map.edges = [
        createEdge('longmen_qingyun', 'longmen_city', 'qingyun_sect', { name: '山路', type: 'path', direction: 'north' }),
        createEdge('longmen_baisha', 'longmen_city', 'baisha_town', { name: '官道', direction: 'east' }),
    ];
    map.currentLocation = 'longmen_city';
    return { version: 1, activeMap: 'world', maps: { world: map } };
}
