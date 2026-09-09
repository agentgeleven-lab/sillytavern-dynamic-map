import { createMap, createNode, createEdge } from './protocol.js';
/** Neutral structural example: never feed demo geography or user map content as a template. */
export function generationExample(document){
 const current=document.maps[document.activeMap],map=createMap('generated_map','根据世界设定命名');
 for(const key of ['rules','nodeTypes','roadTypes'])map.metadata[key]=structuredClone(current.metadata[key]);
 const type=map.metadata.nodeTypes[0].id;
 map.nodes={location_a:createNode('location_a','起点',{type,description:'地点说明'}),location_b:createNode('location_b','相邻地点',{type,description:'地点说明'})};
 map.edges=[createEdge('route_a_b','location_a','location_b',{direction:'east',type:map.metadata.roadTypes[0].id})];map.currentLocation='location_a';
 return {version:1,activeMap:map.id,maps:{[map.id]:map}};
}
