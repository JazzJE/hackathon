const {test} = require('node:test');
const assert = require('node:assert/strict');
const {interpret} = require('../src/agent');
const {createSettings,updateSettings,publicSettings} = require('../src/settings');
const plan={title:'Open Safari',explanation:'A compass sketch',confidence:.9,actions:[{type:'open_app',value:'safari'}]};
const args={provider:'gemini',image:'data:image/png;base64,AAAA',key:'test-secret',platform:'darwin'};
const result = data => async()=>({ok:true,json:async()=>data});
const geminiPlan = value => ({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});
test('Gemini sends inline images, schema and a header-only key to Google',async()=>{
  let request;
  const p=await interpret({...args,desktop:{image:'data:image/jpeg;base64,BBBB',names:[]}},async(url,options)=>{
    request={url,...options};return {ok:true,json:async()=>geminiPlan(plan)};
  });
  assert.equal(p.title,plan.title);
  assert.equal(request.url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal(request.headers['x-goog-api-key'],'test-secret');
  assert.ok(!request.url.includes('test-secret')); assert.ok(!request.body.includes('test-secret'));
  const body=JSON.parse(request.body);
  assert.equal(body.contents[0].parts[1].inlineData.mimeType,'image/jpeg');
  assert.equal(body.contents[0].parts[2].inlineData.mimeType,'image/png');
  assert.equal(body.contents[0].parts[2].inlineData.data,'AAAA');
  assert.equal(body.generationConfig.responseMimeType,'application/json');
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'low');
  assert.ok(body.generationConfig.responseJsonSchema.required.includes('actions'));
  assert.match(body.systemInstruction.parts[0].text,/DESKTOP OVERLAY MODE/);
  assert.match(body.systemInstruction.parts[0].text,/Never substitute/);
  assert.match(body.systemInstruction.parts[0].text,/circle around an existing Dock icon/);
  assert.match(body.systemInstruction.parts[0].text,/green speech bubble is Messages/);
});
test('Gemini blocks unsafe, empty and cut-short responses',async()=>{
  for (const [data,pattern] of [
    [{promptFeedback:{blockReason:'SAFETY'}},/could not interpret/],
    [{candidates:[{finishReason:'SAFETY'}]},/could not interpret/],
    [{candidates:[{finishReason:'MAX_TOKENS'}]},/cut short/],
    [{candidates:[]},/complete plan/],
    [geminiPlan({...plan,actions:[{type:'click',value:'500,500'}]}),/overlay capture/]
  ]) await assert.rejects(()=>interpret(args,result(data)),pattern);
});
test('Gemini ignores thinking parts and validates the same action permissions',async()=>{
  const data=geminiPlan(plan);data.candidates[0].content.parts.unshift({thought:true,text:'private reasoning'});
  assert.equal((await interpret(args,result(data))).title,plan.title);
  await assert.rejects(()=>interpret({...args,platform:'win32'},result(geminiPlan({...plan,actions:[{type:'shell',value:'echo test'}]}))),/full computer control/);
});
test('quota errors never fall back to another provider',async()=>{
  let count=0;
  await assert.rejects(()=>interpret(args,async()=>{count++;return {ok:false,status:429};}),/no paid provider was used/);
  assert.equal(count,1);
  await assert.rejects(()=>interpret({...args,model:'../bad?key=secret'},async()=>{throw Error('Should not fetch');}),/model ID/);
});
test('new sessions default to Gemini and keep credentials isolated',()=>{
  const state=createSettings({}); assert.equal(state.provider,'gemini');
  updateSettings(state,{key:'gemini-secret'});
  updateSettings(state,{provider:'openai'}); assert.equal(state.key,''); assert.equal(state.model,'gpt-4.1-mini');
  updateSettings(state,{key:'openai-secret'});
  updateSettings(state,{provider:'gemini'}); assert.equal(state.key,'gemini-secret');
  const serialized=JSON.stringify(publicSettings(state));
  assert.ok(!serialized.includes('gemini-secret')); assert.ok(!serialized.includes('openai-secret'));
  updateSettings(state,{forgetKey:true}); assert.equal(state.key,'');
  updateSettings(state,{provider:'openai'}); assert.equal(state.key,'openai-secret');
});
test('environment configuration preserves existing OpenAI users and validates updates atomically',()=>{
  assert.equal(createSettings({OPENAI_API_KEY:'old-key'}).provider,'openai');
  assert.equal(createSettings({GOOGLE_API_KEY:'google-key'}).key,'google-key');
  const state=createSettings({GEMINI_API_KEY:'gemini-secret',OPENAI_API_KEY:'openai-secret'});
  assert.equal(state.provider,'gemini');
  assert.throws(()=>updateSettings(state,{provider:'openai',model:'bad/model'}),/model ID/);
  assert.equal(state.provider,'gemini'); assert.equal(state.key,'gemini-secret');
  assert.throws(()=>updateSettings(state,{provider:'unknown'}),/Choose/);
});

test('custom legacy models are not sent unsupported thinking-level options',async()=>{
  let body;
  await interpret({...args,model:'gemini-2.5-flash'},async(_,opts)=>{body=JSON.parse(opts.body);return {ok:true,json:async()=>geminiPlan(plan)};});
  assert.equal(body.generationConfig.thinkingConfig,undefined);
});
test('provider overload reports availability instead of blaming credentials',async()=>{
  await assert.rejects(()=>interpret(args,async()=>({ok:false,status:503})),/temporarily unavailable/);
});
