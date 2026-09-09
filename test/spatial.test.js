import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/core/store.js';
import { createDemoDocument } from '../src/core/demo.js';
import { createNode } from '../src/core/protocol.js';
import { createDraftSession } from '../src/core/draft.js';
import { DIRECTIONS, ROAD_LENGTH, layoutMap, snapPlan, applySnap, connectionDetails, validateRules, splitRoad, prepareDocument, roadName } from '../src/core/spatial.js';
function fixture(){
 const store=createStore(createDemoDocument());let generation=0,scope='A';
 const persistence={scope:()=>scope,token:()=>generation,ensureActive(){},importDocument(doc,token){assert.equal(token,generation);generation++;store.replace(doc);}};
 const draft=createDraftSession(store,persistence);
 return {store,draft,switchChat(id,document){scope=id;generation++;store.replace(document);}};
}
test('draft edits do not notify committed subscribers or alter variables until save',()=>{
 const {store,draft}=fixture();let events=0;store.subscribe(()=>events++);
 draft.mutate(d=>d.maps.world.nodes.longmen_city.name='新城');
 assert.equal(store.snapshot().maps.world.nodes.longmen_city.name,'龙门市');assert.equal(events,0);
 draft.save();assert.equal(events,1);assert.equal(store.snapshot().maps.world.nodes.longmen_city.name,'新城');assert.equal(draft.status().dirty,false);
});
test('drafts remain isolated across chats and return with unsaved changes',()=>{
 const {store,draft,switchChat}=fixture(),original=store.snapshot();
 draft.mutate(d=>d.maps.world.name='A 草稿');switchChat('B',original);assert.notEqual(draft.snapshot().maps.world.name,'A 草稿');
 switchChat('A',original);assert.equal(draft.snapshot().maps.world.name,'A 草稿');assert.equal(draft.status().dirty,true);
});
test('external update conflicts reject save without overwriting committed map',()=>{
 const {store,draft}=fixture();draft.mutate(d=>d.maps.world.name='草稿');const next=store.snapshot();next.maps.world.name='外部';store.replace(next);
 assert.throws(()=>draft.save(),/发生变化/);assert.equal(store.snapshot().maps.world.name,'外部');draft.discard();assert.equal(draft.snapshot().maps.world.name,'外部');
});
test('all sixteen directions have equal-length roads and inverse descriptions',()=>{
 for(const dir of DIRECTIONS){const m=createDemoDocument().maps.world;m.edges=m.edges.slice(0,1);delete m.nodes.baisha_town;m.edges[0].direction=dir.id;layoutMap(m);
 const a=m.nodes.longmen_city.position,b=m.nodes.qingyun_sect.position;assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-ROAD_LENGTH)<.001);
 assert.equal(connectionDetails(m,'longmen_city','walk')[0].direction.id,dir.id);
 assert.equal(connectionDetails(m,'qingyun_sect','walk')[0].direction.index,(dir.index+8)%16);}
});
test('drag chooses only a directly connected neighbor and cuts other edges, retaining nodes',()=>{
 const m=createDemoDocument().maps.world;const anchor={...m.nodes.baisha_town.position};m.nodes.unrelated=createNode('unrelated','无关地点',{position:{x:anchor.x,y:anchor.y+20}});
 const plan=snapPlan(m,'longmen_city',{x:anchor.x,y:anchor.y+30});assert.equal(plan.anchorId,'baisha_town');assert.equal(plan.direction,'south');
 applySnap(m,'longmen_city',plan);assert.equal(m.edges.length,1);assert.equal(Object.keys(m.nodes).length,4);assert.deepEqual(m.nodes.baisha_town.position,anchor);assert.equal(m.nodes.longmen_city.position.y,anchor.y+ROAD_LENGTH);
});
test('waypoint extends a road into two equal segments and supports a branch',()=>{
 const m=createDemoDocument().maps.world,e=m.edges.pop();e.distance=10;m.nodes.w=createNode('w','途经点',{type:'waypoint'});m.edges.push(...splitRoad(m,e,'w','second'));layoutMap(m);
 const a=m.nodes.longmen_city.position,b=m.nodes.baisha_town.position;assert.equal(b.x-a.x,ROAD_LENGTH*2);
 const links=connectionDetails(m,'w','walk');assert.equal(links.length,2);assert.equal(links.reduce((sum,l)=>sum+l.distance,0),10);
});
test('invalid distance/speed and conflicting topology are rejected atomically',()=>{
 const {store,draft}=fixture();assert.throws(()=>draft.mutate(d=>d.maps.world.metadata.rules.segmentDistance=-1));assert.equal(store.snapshot().maps.world.metadata.rules.segmentDistance,1);
 const m=createDemoDocument().maps.world;m.metadata.rules.methods[0].speed=0;assert.throws(()=>validateRules(m));
 m.edges[1].direction='north';assert.throws(()=>layoutMap(m),/同一方位/);
});
test('travel time uses configured distance and speed, one-way arrivals cannot depart',()=>{
 const m=createDemoDocument().maps.world;m.edges[0].bidirectional=false;m.edges[0].distance=10;
 const link=connectionDetails(m,'qingyun_sect','walk')[0];assert.equal(link.accessible,false);assert.equal(link.minutes,120);assert.equal(link.direction.id,'south');
});


test('optional road distance preserves legacy values and never changes diagram length',()=>{
 const doc=createDemoDocument(),m=doc.maps.world,e=m.edges[0];delete e.distance;m.metadata.rules.segmentDistance=7;
 const migrated=prepareDocument(doc).maps.world;assert.equal(migrated.edges[0].distance,7);
 const before=structuredClone(migrated.nodes);migrated.edges[0].distance=99;layoutMap(migrated);assert.deepEqual(migrated.nodes,before);
 migrated.edges[0].distance=null;assert.equal(connectionDetails(migrated,'qingyun_sect','walk')[0].minutes,null);
 migrated.edges[0].name='';assert.equal(roadName(migrated,migrated.edges[0]),'');
 const {draft}=fixture();assert.throws(()=>draft.mutate(d=>d.maps.world.edges[0].distance=-1));
});
