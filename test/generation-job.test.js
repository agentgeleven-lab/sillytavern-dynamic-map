import test from 'node:test';
import assert from 'node:assert/strict';
import {startGenerationJob,waitForSignal} from '../src/core/generation-job.js';
import {generateMapText} from '../src/adapters/generation.js';
import {generationExample} from '../src/core/generation-example.js';
import {createDemoDocument} from '../src/core/demo.js';
import {validateDocument} from '../src/core/protocol.js';
test('never-resolving worldbook or host work times out and releases the wait',async()=>{
 const job=startGenerationJob({timeoutMs:15});try{await assert.rejects(job.wait(()=>new Promise(()=>{})),/总等待超时/);}finally{job.finish();}
});
test('cancellation releases a never-resolving host model promise',async()=>{
 const controller=new AbortController();const promise=generateMapText({generateRaw:()=>new Promise(()=>{})},{enabled:false}, {prompt:'x',systemPrompt:'y'},{signal:controller.signal});controller.abort(new Error('用户取消测试'));await assert.rejects(promise,/用户取消测试/);
});
test('late host response after cancellation cannot resolve the already rejected wait',async()=>{
 let resolve;const controller=new AbortController();const waiting=waitForSignal(()=>new Promise(r=>resolve=r),controller.signal);await Promise.resolve();controller.abort(new Error('已取消'));await assert.rejects(waiting,/已取消/);resolve('late response');await assert.rejects(waiting,/已取消/);
});
test('stage feedback updates without changing the result',async()=>{
 const events=[],job=startGenerationJob({timeoutMs:1000,onTick:e=>events.push(e)});try{job.setStage('等待酒馆模型返回');assert.equal(await job.wait(()=>Promise.resolve('ok')),'ok');assert.equal(events[0].stage,'等待酒馆模型返回');}finally{job.finish();}
});
test('neutral generation example excludes old demo geography and preserves rules',()=>{
 const doc=createDemoDocument(),example=generationExample(doc);validateDocument(example);assert.ok(!JSON.stringify(example).includes('龙门市'));assert.ok(!JSON.stringify(example).includes('沧州'));assert.deepEqual(example.maps.generated_map.metadata.rules,doc.maps.world.metadata.rules);
});
