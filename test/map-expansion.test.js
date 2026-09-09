import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoDocument} from '../src/core/demo.js';
import {createNode,createEdge} from '../src/core/protocol.js';
import {recentMapChat,applyMapExpansion} from '../src/core/map-expansion.js';
import {buildMapGenerationPrompt} from '../src/core/generation-prompt.js';
test('expansion preserves old map while adding new connected nodes',()=>{
 const d=createDemoDocument(),original=structuredClone(d),patch={nodes:{new_place:createNode('new_place','新地点',{type:'city'})},edges:[createEdge('new_road','longmen_city','new_place',{direction:'south',name:'新路',distance:8})]};
 const next=applyMapExpansion(d,patch);assert.deepEqual(d,original);for(const [id,n] of Object.entries(d.maps.world.nodes))assert.deepEqual(next.maps.world.nodes[id],n);
 assert.deepEqual(next.maps.world.edges.slice(0,2),d.maps.world.edges);assert.equal(next.maps.world.currentLocation,d.maps.world.currentLocation);assert.equal(next.maps.world.edges[2].name,'');assert.equal(next.maps.world.edges[2].distance,null);
 const named=applyMapExpansion(d,patch,{nameRoads:true,distanceRoads:true});assert.equal(named.maps.world.edges[2].distance,8);assert.equal(named.maps.world.edges[2].name,'新路');
 assert.throws(()=>applyMapExpansion(d,{nodes:{longmen_city:patch.nodes.new_place},edges:[]}),/已存在/);
 assert.throws(()=>applyMapExpansion(d,{nodes:{},edges:[{...d.maps.world.edges[0],id:'duplicate'}]}),/重复/);
 assert.throws(()=>applyMapExpansion(d,{...patch,currentLocation:'new_place'}),/只允许/);
 const adjusted=applyMapExpansion(d,{nodes:patch.nodes,edges:[{...patch.edges[0],direction:'north'}]});assert.ok(adjusted.maps.world.nodes.new_place);assert.deepEqual(adjusted.maps.world.nodes.longmen_city,d.maps.world.nodes.longmen_city);
});
test('chat reader selects latest visible text, not hidden or unselected swipes',()=>{
 const chat=Array.from({length:35},(_,i)=>({mes:String(i),name:'角色',swipes:['secret']}));chat.push({is_system:true,mes:'hidden'});
 const result=recentMapChat({chat});assert.equal(result.length,30);assert.equal(result[0].内容,'5');assert.ok(!JSON.stringify(result).includes('secret'));assert.throws(()=>recentMapChat({chat:[]}),/没有/);
 assert.throws(()=>recentMapChat({chat:[{mes:'x'.repeat(60001)}]}),/超过/);
});
test('distance prompt is opt in independently of naming',()=>{
 const d=createDemoDocument();assert.match(buildMapGenerationPrompt(d),/本次道路距离：未开启/);assert.match(buildMapGenerationPrompt(d,{distanceRoads:true}),/本次道路距离：已开启/);
});
