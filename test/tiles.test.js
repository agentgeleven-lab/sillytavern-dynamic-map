import test from 'node:test';
import assert from 'node:assert/strict';
import {cellPoint,pointCell,layoutTiles,tilePlacement,applyTilePlacement} from '../src/core/tiles.js';
import {createDemoDocument} from '../src/core/demo.js';
import {createMap,createNode,validateDocument} from '../src/core/protocol.js';
import {prepareDocument} from '../src/core/spatial.js';
import {applyMapExpansion} from '../src/core/map-expansion.js';
import {applyGeneratedMap} from '../src/core/map-generation.js';
import {createStore} from '../src/core/store.js';
import {createDraftSession} from '../src/core/draft.js';
for(const type of ['hex','grid']){
 test(`${type}: negative cells and six/eight neighbors round trip`,()=>{
  for(let q=-10;q<=10;q++)for(let r=-10;r<=10;r++)assert.deepEqual(pointCell(type,cellPoint(type,q,r)),{q,r});
 });
 test(`${type}: conversion, drag, occupancy and JSON preserve actual routes`,()=>{
  const doc=prepareDocument(createDemoDocument()),m=doc.maps.world;m.type=type;
  const distances=m.edges.map(e=>e.distance),connections=m.edges.map(e=>[e.id,e.from,e.to,e.name]);layoutTiles(m);
  assert.equal(new Set(Object.values(m.nodes).map(n=>JSON.stringify(n.position))).size,3);
  const id=Object.keys(m.nodes)[0],other=Object.keys(m.nodes)[1];
  assert.equal(tilePlacement(m,id,m.nodes[other].position).mode,'blocked');
  applyTilePlacement(m,id,tilePlacement(m,id,cellPoint(type,-8,4)));
  assert.deepEqual(m.nodes[id].position,cellPoint(type,-8,4));
  assert.deepEqual(m.edges.map(e=>e.distance),distances);assert.deepEqual(m.edges.map(e=>[e.id,e.from,e.to,e.name]),connections);
  assert.deepEqual(prepareDocument(JSON.parse(JSON.stringify(doc))),doc);
  const before=structuredClone(m);m.nodes[id].layout.pinned=true;
  assert.throws(()=>applyTilePlacement(m,id,tilePlacement(m,id,{x:0,y:0})),/固定/);
  m.nodes[id].layout.pinned=false;assert.deepEqual(m.nodes[id].position,before.nodes[id].position);
 });
 test(`${type}: incremental generation keeps all existing locations`,()=>{
  const doc=prepareDocument(createDemoDocument());doc.maps.world.type=type;layoutTiles(doc.maps.world);
  const next=applyMapExpansion(doc,{nodes:{extra:createNode('extra','新增')},edges:[]});
  for(const [id,n] of Object.entries(doc.maps.world.nodes))assert.deepEqual(next.maps.world.nodes[id],n);
  assert.equal(new Set(Object.values(next.maps.world.nodes).map(n=>JSON.stringify(n.position))).size,4);
 });
}
test('tile failures are atomic and reject extreme coordinates',()=>{
 const m=prepareDocument(createDemoDocument()).maps.world;m.type='grid';for(const n of Object.values(m.nodes)){n.position={x:0,y:0};n.layout.pinned=true;}
 const before=structuredClone(m);assert.throws(()=>layoutTiles(m),/固定/);assert.deepEqual(m,before);
 Object.values(m.nodes)[0].position.x=1e300;assert.throws(()=>layoutTiles(m),/范围/);
});
test('hierarchy validates entrances and cycles; generation preserves siblings and parent',()=>{
 const doc=prepareDocument(createDemoDocument());const child=createMap('city','城内','hex');child.parentMap='world';child.metadata.parentNode='longmen_city';doc.maps.city=child;
 const base=prepareDocument(doc);validateDocument(base);
 const invalid=structuredClone(base);invalid.maps.city.metadata.parentNode='missing';assert.throws(()=>validateDocument(invalid),/入口/);
 invalid.maps.city.metadata.parentNode='longmen_city';invalid.maps.world.parentMap='city';assert.throws(()=>validateDocument(invalid));
 base.activeMap='city';const next=applyGeneratedMap(base,createDemoDocument());assert.deepEqual(next.maps.world,base.maps.world);assert.equal(next.maps.city.parentMap,'world');assert.equal(next.maps.city.type,'hex');assert.equal(next.maps.city.metadata.parentNode,'longmen_city');
 base.activeMap='world';const generated=createDemoDocument();delete generated.maps.world.nodes.longmen_city;generated.maps.world.edges=[];generated.maps.world.currentLocation=null;
 assert.throws(()=>applyGeneratedMap(base,generated),/入口/);
});
test('tile draft and hierarchy navigation are isolated until save',()=>{
 const original=prepareDocument(createDemoDocument());original.maps.child=createMap('child','子地图','grid');original.maps.child.parentMap='world';
 const store=createStore(prepareDocument(original)),persistence={scope:()=> 'chat',token:()=>0,ensureActive(){},importDocument:d=>store.replace(d)};
 const draft=createDraftSession(store,persistence);draft.mutate(d=>{d.maps.world.type='hex';layoutTiles(d.maps.world);});
 assert.equal(store.snapshot().maps.world.type,'graph');store.applyUpdate([{type:'setActiveMap',mapId:'child'}]);assert.equal(draft.status().conflict,false);
 draft.save();assert.equal(store.snapshot().maps.world.type,'hex');assert.deepEqual(store.snapshot().maps.world.nodes,draft.snapshot().maps.world.nodes);
});
