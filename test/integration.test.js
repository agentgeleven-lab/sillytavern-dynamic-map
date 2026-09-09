import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../src/core/store.js';
import {createDemoDocument} from '../src/core/demo.js';
import {bindChatStore} from '../src/adapters/chat.js';
import {createDraftSession} from '../src/core/draft.js';
import {createVariableBridge,integrationSummary} from '../src/integrations/chat-variables.js';
const settle=()=>new Promise(r=>setTimeout(r,0));
async function fixture(options={}){
 let ctx={characters:[{avatar:'a'}],characterId:0,getCurrentChatId:()=> 'chat',extensionSettings:{},chatMetadata:{},chat:[],saveMetadata:async()=>{},saveChat:async()=>{},saveSettingsDebounced(){}};
 const store=createStore(createDemoDocument()),persistence=bindChatStore(store,{getContext:()=>ctx,storage:{getItem:()=>null,setItem(){}},namespace:'test'});
 const writes=[],bridge=createVariableBridge({store,persistence,getContext:()=>ctx,getLwb:()=>({applyText(){}}),loadVariables:options.loadVariables??(async()=>({setLocalVariable(k,v){writes.push([ctx.chatMetadata,k,v]);ctx.chatMetadata.variables??={};ctx.chatMetadata.variables[k]=v;}})),interval:0});
 await settle();return {store,persistence,bridge,writes,get ctx(){return ctx;},switch(next){ctx=next;persistence.switchChat();},async save(){persistence.importDocument(store.snapshot(),persistence.token());await settle();await bridge.sync();},destroy(){bridge.destroy();persistence.destroy();}};
}
test('bridge publishes no demo; committed saves publish without touching status variable',async()=>{
 const f=await fixture();try{assert.equal(f.writes.length,0);f.ctx.chatMetadata.variables={状态栏:'original'};await f.save();const value=JSON.parse(f.ctx.chatMetadata.variables.地图);assert.equal(value.地点名称,'龙门市');assert.equal(f.ctx.chatMetadata.variables.状态栏,'original');assert.equal(value.maps,undefined);
 const draft=createDraftSession(f.store,f.persistence),count=f.writes.length;draft.mutate(d=>{d.maps.world.nodes.longmen_city.name='草稿';});await f.bridge.sync();assert.equal(f.writes.length,count);draft.save();await settle();await f.bridge.sync();assert.equal(JSON.parse(f.ctx.chatMetadata.variables.地图).地点名称,'草稿');draft.destroy();}finally{f.destroy();}
});
test('occupied variables are preserved and disabled sync writes nothing',async()=>{
 const f=await fixture();try{f.ctx.chatMetadata.variables={地图:'user-owned'};await f.save();assert.equal(f.ctx.chatMetadata.variables.地图,'user-owned');assert.match(f.bridge.status().message,/占用/);delete f.ctx.chatMetadata.variables.地图;f.bridge.configure({variables:false});await f.bridge.sync();assert.equal(f.ctx.chatMetadata.variables.地图,undefined);}finally{f.destroy();}
});
test('move requests reject disabled, stale and hidden targets; valid requests are atomic',async()=>{
 const f=await fixture();try{await f.save();const req={请求ID:'one',地图版本:f.ctx.chatMetadata.dynamicMapV1.updatedAt,地图ID:'world',地点ID:'qingyun_sect'};assert.throws(()=>f.bridge.requestMove(req),/未开启/);f.bridge.configure({allowMoves:true});await settle();assert.throws(()=>f.bridge.requestMove({...req,地图版本:0}),/版本/);assert.throws(()=>f.bridge.requestMove({...req,地点ID:'missing'}),/不存在/);f.bridge.requestMove(req);assert.equal(f.store.snapshot().maps.world.currentLocation,'qingyun_sect');assert.throws(()=>f.bridge.requestMove(req),/版本/);}finally{f.destroy();}
});
test('late variable module load cannot write into a different chat',async()=>{
 let resolve;const writes=[],f=await fixture({loadVariables:()=>new Promise(r=>{resolve=r;})});try{f.persistence.importDocument(f.store.snapshot(),f.persistence.token());await settle();const other={...f.ctx,getCurrentChatId:()=> 'other',chatMetadata:{}};f.switch(other);resolve({setLocalVariable:(k,v)=>writes.push([k,v])});await settle();assert.equal(writes.length,0);assert.equal(other.chatMetadata.variables,undefined);}finally{f.destroy();}
});
test('floor rollback restores only recorded positions and leaves map topology intact',async()=>{
 const f=await fixture();try{f.ctx.chat=[{mes:'first',extra:{}}];await f.save();f.ctx.chat.push({mes:'second',extra:{}});await f.bridge.sync();f.store.applyUpdate([{type:'setCurrentLocation',nodeId:'qingyun_sect'}]);await settle();await f.bridge.sync();const edges=f.store.snapshot().maps.world.edges;f.ctx.chat.pop();await f.bridge.sync();assert.equal(f.store.snapshot().maps.world.currentLocation,'longmen_city');assert.deepEqual(f.store.snapshot().maps.world.edges,edges);}finally{f.destroy();}
});
test('summary filters hidden locations and one-way incoming routes',()=>{
 const doc=createDemoDocument(),map=doc.maps.world;map.nodes.qingyun_sect.discovered=false;map.nodes.baisha_town.ai.includeInContext=false;assert.deepEqual(integrationSummary(doc,1).相邻地点,[]);map.nodes.longmen_city.ai.includeInContext=false;assert.equal(integrationSummary(doc,1).地点ID,null);assert.equal(integrationSummary(doc,1).位置路径,'');
});
