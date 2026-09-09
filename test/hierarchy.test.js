import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoDocument} from '../src/core/demo.js';
import {createMap,createNode} from '../src/core/protocol.js';
import {prepareDocument} from '../src/core/spatial.js';
import {createStore} from '../src/core/store.js';
import {createDraftSession} from '../src/core/draft.js';
import {GENERATION_LEVELS,mapChoices,locationPath,projectedLocation,generationScope,levelPrompt} from '../src/core/hierarchy.js';
function fixture(){const d=createDemoDocument(),city=createMap('city','龙门城内','grid'),room=createMap('room','城主府','hex');city.parentMap='world';city.metadata.parentNode='longmen_city';city.nodes.hall=createNode('hall','大厅');city.currentLocation='hall';room.parentMap='city';room.metadata.parentNode='hall';room.nodes.study=createNode('study','书房');room.currentLocation='study';d.maps.city=city;d.maps.room=room;d.activeMap='room';return prepareDocument(d);}
test('role location projects onto ancestor entrances and paths distinguish maps',()=>{
 const d=fixture(),before=structuredClone(d);assert.equal(projectedLocation(d,'world'),'longmen_city');assert.equal(projectedLocation(d,'city'),'hall');assert.equal(projectedLocation(d,'room'),'study');assert.match(locationPath(d),/龙门城内 → 城主府 → 书房/);assert.match(mapChoices(d).find(m=>m.id==='room').name,/龙门城内 → 城主府/);assert.deepEqual(d,before);
});
test('each generation level has a distinct prompt and explicit parent context',()=>{
 const d=fixture(),scope=generationScope(d,'room','interior');assert.equal(scope.入口地点.id,'hall');assert.equal(scope.上级地图.id,'city');assert.equal(scope.当前地图.name,'城主府');assert.equal(scope.层级路径.length,3);assert.equal(new Set(GENERATION_LEVELS.map(l=>levelPrompt(l.id))).size,6);assert.match(levelPrompt('city'),/街区/);assert.match(levelPrompt('interior'),/房间/);assert.throws(()=>levelPrompt('bad'));
 const parent=generationScope(d,'city','city');assert.equal(parent.必须保留的子地图入口[0].id,'hall');
});
test('generation undo restores the whole prior draft without notifying committed state',()=>{
 const store=createStore(fixture()),p={scope:()=> 'A',token:()=>0,ensureActive(){},importDocument:d=>store.replace(d)},draft=createDraftSession(store,p);let events=0;store.subscribe(()=>events++);
 draft.mutate(d=>{d.maps.city.name='待保存城市';});const before=draft.snapshot(),next=structuredClone(before);next.maps.room.name='AI 新房间';draft.applyGeneration(next);assert.equal(draft.status().canUndo,true);assert.deepEqual(new Set(draft.status().changedMaps),new Set(['待保存城市','AI 新房间']));draft.undoGeneration();assert.deepEqual(draft.snapshot(),before);assert.equal(events,0);
 draft.applyGeneration(next);draft.mutate(d=>{d.maps.room.name='手动修正';});assert.equal(draft.status().canUndo,false);assert.throws(()=>draft.undoGeneration());
 draft.save();assert.equal(store.snapshot().maps.city.name,'待保存城市');assert.equal(store.snapshot().maps.room.name,'手动修正');
});
test('external role-map changes conflict with unsaved location edits',()=>{
 const store=createStore(fixture()),p={scope:()=> 'A',token:()=>0,ensureActive(){},importDocument:d=>store.replace(d)},draft=createDraftSession(store,p);draft.mutate(d=>{d.maps.city.name='草稿';});store.applyUpdate([{type:'setActiveMap',mapId:'world'}]);assert.equal(draft.status().conflict,true);assert.throws(()=>draft.save(),/发生变化/);
});
