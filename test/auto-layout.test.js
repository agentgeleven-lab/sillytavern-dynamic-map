import test from 'node:test';
import assert from 'node:assert/strict';
import {autoLayout,validateAutoPositions} from '../src/core/auto-layout.js';
import {createMap,createNode,createEdge,validateDocument} from '../src/core/protocol.js';
import {prepareDocument,layoutMap,placementPlan} from '../src/core/spatial.js';
import {createStore} from '../src/core/store.js';
import {createDraftSession} from '../src/core/draft.js';
const make=(count,pairs)=>{const m=createMap('world','布局测试');for(let i=0;i<count;i++)m.nodes['n'+i]=createNode('n'+i,'地点'+i);m.edges=pairs.map(([a,b],i)=>createEdge('e'+i,'n'+a,'n'+b,{direction:'east',distance:i+1,name:'道路'+i}));return prepareDocument({version:1,activeMap:'world',maps:{world:m}}).maps.world;};
const separated=m=>{for(const a of Object.values(m.nodes))for(const b of Object.values(m.nodes))if(a!==b)assert.ok(Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y)>80);};
test('triangle and dense cycles retain all roads with independent real distances',()=>{
 for(const m of [make(3,[[0,1],[1,2],[2,0]]),make(8,Array.from({length:8},(_,i)=>Array.from({length:i},(_,j)=>[i,j])).flat())]){
 const edges=structuredClone(m.edges);autoLayout(m);separated(m);assert.equal(m.edges.length,edges.length);for(let i=0;i<edges.length;i++)for(const k of ['id','from','to','name','distance','type','bidirectional'])assert.deepEqual(m.edges[i][k],edges[i][k]);
 const before=structuredClone(m);layoutMap(m);assert.deepEqual(m,before);validateAutoPositions(m);
 }
});
test('many neighbors and coincident positions are spaced without dropping connections',()=>{
 const m=make(24,Array.from({length:23},(_,i)=>[0,i+1]));for(const n of Object.values(m.nodes))n.position={x:0,y:0};autoLayout(m);separated(m);assert.equal(m.edges.length,23);
});
test('fixed positions and locked bearings survive layout',()=>{
 const m=make(4,[[0,1],[1,2],[0,3]]);m.nodes.n0.position={x:300,y:400};m.nodes.n0.layout.pinned=true;m.edges[0].direction='north';m.edges[0].metadata.directionLocked=true;autoLayout(m);assert.deepEqual(m.nodes.n0.position,{x:300,y:400});assert.equal(m.edges[0].direction,'north');separated(m);assert.equal(placementPlan(m,'n0',{x:100,y:100}).mode,'blocked');
});
test('contradictory locks fail atomically with no partial mutations',()=>{
 const m=make(3,[[0,1],[1,2],[2,0]]);for(const e of m.edges)e.metadata.directionLocked=true;const before=structuredClone(m);assert.throws(()=>autoLayout(m),/冲突|无法分开/);assert.deepEqual(m,before);
});
test('disconnected components and isolates pack without overlap deterministically',()=>{
 const a=make(12,[[0,1],[2,3],[3,4]]),b=structuredClone(a);autoLayout(a);autoLayout(b);separated(a);assert.deepEqual(a,b);
});
test('incremental layout can connect two fixed existing nodes without moving them',()=>{
 const m=make(3,[[0,2],[1,2]]);m.nodes.n0.position={x:0,y:0};m.nodes.n1.position={x:600,y:400};autoLayout(m,{pinnedIds:['n0','n1']});assert.deepEqual(m.nodes.n0.position,{x:0,y:0});assert.deepEqual(m.nodes.n1.position,{x:600,y:400});separated(m);
});
test('draft automatic layout is saved exactly and discard restores old map',()=>{
 const m=make(3,[[0,1],[1,2],[2,0]]),d={version:1,activeMap:'world',maps:{world:m}},store=createStore(d);const p={scope:()=> 'A',token:()=>0,ensureActive(){},importDocument:doc=>store.replace(doc)};const draft=createDraftSession(store,p);
 draft.mutate(doc=>autoLayout(doc.maps.world));const preview=draft.snapshot();assert.deepEqual(store.snapshot(),d);draft.save();assert.deepEqual(store.snapshot(),preview);draft.mutate(doc=>doc.maps.world.name='未保存');draft.discard();assert.equal(draft.snapshot().maps.world.name,m.name);
});
test('empty maps, invalid pins and oversize maps are handled',()=>{
 autoLayout(make(0,[]));const m=make(1,[]);m.nodes.n0.layout.pinned=true;assert.throws(()=>autoLayout(m),/有效位置/);assert.throws(()=>autoLayout(make(251,[])),/250/);
});

test('250-node graph completes with no overlap using final placement fallback',()=>{
 const m=make(250,Array.from({length:249},(_,i)=>[i,i+1]));autoLayout(m);separated(m);assert.equal(m.edges.length,249);
});
