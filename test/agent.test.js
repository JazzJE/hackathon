const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate, scriptFor, interpret } = require('../src/agent');
const plan = actions => ({title:'Test',explanation:'Test drawing',confidence:.9,actions});
test('rejects unknown actions, bad URLs, and unbounded plans',()=>{
  for(const a of [{type:'delete',value:'x'},{type:'open_url',value:'file:///C:/secret'},{type:'keys',value:'arbitrary'},{type:'open_app',value:'missing'}]) assert.throws(()=>validate(plan([a])));
  assert.throws(()=>validate(plan(Array(9).fill({type:'keys',value:'save'}))));
  assert.throws(()=>validate({...plan([]),confidence:NaN}));
  assert.throws(()=>validate(plan([{type:'open_app',value:'__proto__'}])));
});
test('installation only generated when enabled, using exact package ID',()=>{
  const a={type:'open_app',value:'spotify'};
  assert.ok(!scriptFor(a,false).includes('& winget install'));
  assert.match(scriptFor(a,true),/--id 'Spotify.Spotify' --exact --source winget/);
});
test('URLs are quoted as PowerShell literals',()=>{
  assert.equal(scriptFor({type:'open_url',value:"https://example.com/a'b$(whoami)"}),"Start-Process 'https://example.com/a''b$(whoami)'");
});
test('vision request sends drawing and extracts structured response',async()=>{
  let request;
  const result=await interpret({image:'data:image/png;base64,AAAA',key:'test-key'},async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(plan([{type:'keys',value:'close_tab'}]))}]}]})}});
  assert.equal(result.actions[0].value,'close_tab');
  const body=JSON.parse(request.body);assert.equal(body.input[0].content[1].type,'input_image');assert.equal(body.store,false);
});
test('missing key and API failures produce actionable errors',async()=>{
  await assert.rejects(()=>interpret({}),/API key/);
  await assert.rejects(()=>interpret({image:'data:image/png;base64,AAAA',key:'test'},async()=>({ok:false,status:401})),/401/);
});
