import test from 'node:test';
import assert from 'node:assert/strict';
import {endpointFor,createApiSettings,generateMapText} from '../src/adapters/generation.js';
const config={enabled:true,baseUrl:'https://example.com/v1',model:'test-model',apiKey:'fake-test-key',maxTokens:2048,timeoutSeconds:30,rememberKey:false};
const request={systemPrompt:'map protocol',prompt:'role and book data',responseLength:4096,trimNames:false};
test('API endpoint normalization supports root, version base and full completion URL',()=>{
 assert.equal(endpointFor('https://example.com'),'https://example.com/v1/chat/completions');assert.equal(endpointFor('https://example.com/v1/'),'https://example.com/v1/chat/completions');assert.equal(endpointFor('https://example.com/custom/v1/chat/completions'),'https://example.com/custom/v1/chat/completions');
 for(const url of ['file:///tmp','https://user:pass@example.com','https://example.com/?key=secret','https://example.com/#secret'])assert.throws(()=>endpointFor(url));
});
test('API keys stay session-only by default; opt-in remembering and clearing are separate',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};const settings=createApiSettings(storage,'test');settings.save(config);assert.ok(![...data.values()].join('').includes('fake-test-key'));assert.equal(settings.snapshot().apiKey,'fake-test-key');assert.equal(createApiSettings(storage,'test').snapshot().apiKey,'');
 settings.save({...config,rememberKey:true});assert.equal(createApiSettings(storage,'test').snapshot().apiKey,'fake-test-key');settings.save({...config,apiKey:'',rememberKey:false});assert.ok(![...data.values()].join('').includes('fake-test-key'));
});
test('disabled custom API delegates only to host model',async()=>{
 let calls=0;const result=await generateMapText({generateRaw:r=>{calls++;assert.deepEqual(r,request);return 'host';}},{...config,enabled:false},request,{fetchImpl(){throw Error('must not fetch');}});assert.equal(result,'host');assert.equal(calls,1);
});
test('custom API sends material and configured limits, without host credentials or redirects',async()=>{
 let calls=0;const result=await generateMapText({},config,request,{fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://example.com/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer fake-test-key');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');const body=JSON.parse(options.body);assert.equal(body.model,'test-model');assert.equal(body.max_tokens,2048);assert.equal(body.messages[1].content,request.prompt);assert.ok(!options.body.includes('fake-test-key'));return {ok:true,json:async()=>({choices:[{message:{content:'{"version":1}'}}]})};}});assert.equal(result,'{"version":1}');assert.equal(calls,1);
});
test('HTTP errors never display raw response content or echoed keys',async()=>{
 await assert.rejects(generateMapText({},config,request,{fetchImpl:async()=>({ok:false,status:401,text:async()=>'fake-test-key'})}),e=>/401/.test(e.message)&&!e.message.includes('fake-test-key'));
});
test('empty and truncated output are rejected before map parsing',async()=>{
 for(const choice of [{message:{content:''}},{finish_reason:'length',message:{content:'partial'}}])await assert.rejects(generateMapText({},config,request,{fetchImpl:async()=>({ok:true,json:async()=>({choices:[choice]})})}));
});
test('network failure gives an actionable cross-origin message',async()=>{
 await assert.rejects(generateMapText({},config,request,{fetchImpl:async()=>{throw new TypeError('fetch failed');}}),/跨域/);
});
test('cancel propagates abort signal without applying any response',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(generateMapText({},config,request,{signal:controller.signal,fetchImpl:async(url,options)=>{assert.equal(options.signal.aborted,true);throw new Error('aborted');}}),/已取消/);
});
