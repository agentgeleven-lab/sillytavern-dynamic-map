import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoDocument } from '../src/core/demo.js';
import { createNode, validateDocument } from '../src/core/protocol.js';
import { placementPlan, applyPlacement, ROAD_LENGTH } from '../src/core/spatial.js';
import { collectMapSources } from '../src/adapters/sources.js';
import { createPreferences } from '../src/ui/preferences.js';
test('free drop detaches roads and preserves the precise pointer position',()=>{
 const m=createDemoDocument().maps.world,plan=placementPlan(m,'longmen_city',{x:950,y:800});assert.equal(plan.mode,'free');applyPlacement(m,'longmen_city',plan,'new');assert.deepEqual(m.nodes.longmen_city.position,{x:950,y:800});assert.equal(m.edges.length,0);assert.equal(Object.keys(m.nodes).length,3);
});
test('an unconnected nearby location becomes the anchor and gets a new road',()=>{
 const m=createDemoDocument().maps.world;m.nodes.remote=createNode('remote','新地点',{position:{x:900,y:600}});
 const p=placementPlan(m,'longmen_city',{x:1000,y:600});assert.equal(p.anchorId,'remote');applyPlacement(m,'longmen_city',p,'fresh');assert.equal(m.edges.length,1);assert.equal(m.edges[0].id,'fresh');assert.equal(m.nodes.longmen_city.position.x,900+ROAD_LENGTH);
});
test('an occupied compass slot previews an available slot that survives commit',()=>{
 const m=createDemoDocument().maps.world,city=m.nodes.longmen_city.position;
 const p=placementPlan(m,'qingyun_sect',{x:city.x+55,y:city.y});assert.equal(p.anchorId,'longmen_city');assert.equal(p.adjusted,true);assert.notEqual(p.direction,'east');const expected={...p.position};applyPlacement(m,'qingyun_sect',p,'unused');assert.deepEqual(m.nodes.qingyun_sect.position,expected);
});
test('retained one-way road preserves type and direction relative to its original endpoints',()=>{
 const m=createDemoDocument().maps.world;m.edges[0].bidirectional=false;const q=m.nodes.qingyun_sect.position;const p=placementPlan(m,'longmen_city',{x:q.x+100,y:q.y});applyPlacement(m,'longmen_city',p,'unused');assert.equal(m.edges[0].bidirectional,false);assert.equal(m.edges[0].type,'path');assert.equal(m.edges[0].direction,'west');
});
function sourceFixture(){
 const calls=[];const ctx={characterId:0,characters:[{avatar:'hero.png',data:{name:'测试角色',description:'卡片描述',extensions:{world:'bound'}}}],chatMetadata:{world_info:'chat'}};
 const wi={world_info:{charLore:[{name:'hero',extraBooks:['extra']}]},selected_world_info:['active-global','bound'],world_names:['bound','extra','chat','active-global','inactive'],async loadWorldInfo(name){calls.push(name);return {entries:{a:{content:`${name}正文`},b:{disable:true,content:'禁用内容'}}};}};return {ctx,wi,calls};
}
test('default sources read bound books and card, but no global or inactive books',async()=>{
 const {ctx,wi,calls}=sourceFixture();const result=await collectMapSources(ctx,wi);assert.deepEqual(calls,['bound','extra','chat']);assert.equal(result.source.角色卡.描述,'卡片描述');assert.ok(result.source.世界书.every(b=>b.条目.length===1));
});
test('global option reads only ENABLED global books, never all available books',async()=>{
 const {ctx,wi,calls}=sourceFixture();await collectMapSources(ctx,wi,{includeGlobal:true});assert.deepEqual(calls,['bound','extra','chat','active-global']);assert.ok(!calls.includes('inactive'));assert.equal(calls.filter(n=>n==='bound').length,1);
});
test('failed book reads, changed chat and excessive sources reject before generation',async()=>{
 const {ctx,wi}=sourceFixture();await assert.rejects(collectMapSources(ctx,wi,{maxChars:1}),/超过/);await assert.rejects(collectMapSources(ctx,wi,{guard(){throw Error('聊天变化');}}),/聊天变化/);wi.loadWorldInfo=async()=>null;await assert.rejects(collectMapSources(ctx,wi),/读取失败/);
});
test('embedded character book is read when no primary book is bound',async()=>{
 const {ctx,wi}=sourceFixture();delete ctx.characters[0].data.extensions.world;ctx.characters[0].data.character_book={name:'内嵌书',entries:[{enabled:true,content:'世界背景'},{enabled:false,content:'禁用'}]};const result=await collectMapSources(ctx,wi);assert.equal(result.source.世界书.at(-1).名称,'内嵌书');assert.equal(result.source.世界书.at(-1).条目.length,1);
});
test('UI preferences persist separately from chat metadata',()=>{
 const data=new Map(),ctx={extensionSettings:{},chatMetadata:{},saveSettingsDebounced(){}};const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};const p=createPreferences(()=>ctx,storage,'test');p.update({theme:'paper',messageButtons:false});assert.deepEqual(ctx.chatMetadata,{});assert.equal(createPreferences(()=>ctx,storage,'test').snapshot().theme,'paper');assert.throws(()=>p.update({theme:'unknown'}));
});
test('road catalog preserves legacy custom types during migration',async()=>{
 const {prepareDocument}=await import('../src/core/spatial.js');const doc=createDemoDocument();delete doc.maps.world.metadata.roadTypes;doc.maps.world.edges[0].type='旧官道';const migrated=prepareDocument(doc);assert.ok(migrated.maps.world.metadata.roadTypes.some(t=>t.id==='旧官道'));validateDocument(migrated);
});

test('free placement copies coordinates exposed as DOMPoint-style getters',()=>{
 const m=createDemoDocument().maps.world;class Point{get x(){return 950;}get y(){return 800;}}const plan=placementPlan(m,'longmen_city',new Point());applyPlacement(m,'longmen_city',plan,'new');assert.deepEqual(m.nodes.longmen_city.position,{x:950,y:800});
});
