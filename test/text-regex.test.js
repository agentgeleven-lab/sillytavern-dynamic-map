import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_REGEX, inspectMapRegex, syncMapRegex } from '../src/adapters/text-regex.js';
import { parseTextUpdate } from '../src/integrations/text-updates.js';
test('display-only rule hides multiline blocks and retains raw updater input',()=>{
 const raw='抵达城门。\n<map_update>\n{"token":"t","reason":"到达","operations":[]}\n</map_update>\n后记';
 const regex=new RegExp(MAP_REGEX.findRegex.slice(1,-2),'g');
 assert.equal(raw.replace(regex,MAP_REGEX.replaceString),'抵达城门。\n\n后记');
 assert.equal(parseTextUpdate(raw.replace('\n后记','')).token,'t');
 assert.equal('正文<map_update>未完成'.replace(regex,''),'正文<map_update>未完成');
 assert.equal('其他 <state>保持</state>'.replace(regex,''),'其他 <state>保持</state>');
 assert.equal(MAP_REGEX.markdownOnly,true);assert.equal(MAP_REGEX.promptOnly,false);assert.deepEqual(MAP_REGEX.placement,[2]);
});
test('add, repeat, restore and remove affect only the stable owned ID',async()=>{
 const original={id:'other',scriptName:MAP_REGEX.scriptName,findRegex:'unchanged'},ctx={extensionSettings:{regex:[original]},saveSettingsDebounced(){saves++;}};let saves=0;
 assert.equal(inspectMapRegex(()=>ctx).exists,false);await syncMapRegex(()=>ctx);await syncMapRegex(()=>ctx);assert.equal(saves,1);assert.equal(ctx.extensionSettings.regex.length,2);assert.equal(ctx.extensionSettings.regex[0],original);
 ctx.extensionSettings.regex[1].disabled=true;await syncMapRegex(()=>ctx);assert.equal(ctx.extensionSettings.regex[1].disabled,false);
 await syncMapRegex(()=>ctx,true);await syncMapRegex(()=>ctx,true);assert.deepEqual(ctx.extensionSettings.regex,[original]);assert.equal(saves,3);
});
test('invalid lists, duplicate IDs and disabled engine never change unrelated settings',async()=>{
 for(const settings of [{regex:{}},{regex:[MAP_REGEX,MAP_REGEX]},{disabledExtensions:['regex']}]){const before=structuredClone(settings);await assert.rejects(syncMapRegex(()=>({extensionSettings:settings,saveSettingsDebounced(){}})));assert.deepEqual(settings,before);}
 const ctx={extensionSettings:{regex:[]},saveSettingsDebounced(){throw Error('fail');}};await assert.rejects(syncMapRegex(()=>ctx),/保存请求失败/);assert.deepEqual(ctx.extensionSettings.regex,[]);
});
