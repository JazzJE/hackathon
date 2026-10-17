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

test('validates apps and script permission against the target OS',async()=>{
  assert.doesNotThrow(()=>validate(plan([{type:'open_app',value:'safari'}]),'darwin'));
  assert.throws(()=>validate(plan([{type:'open_app',value:'safari'}]),'win32'));
  assert.throws(()=>validate(plan([{type:'open_app',value:'paint'}]),'darwin'));
  assert.throws(()=>validate(plan([{type:'shell',value:'echo test'}]),'darwin'));
  const mock = async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(plan([{type:'shell',value:'echo test'}]))}]}]})});
  await assert.rejects(()=>interpret({image:'data:image/png;base64,AAAA',key:'test',platform:'win32'},mock),/full computer control/);
});
test('rejects malformed and credential-bearing web URLs',()=>{
  for (const value of ['https://','https://x:password@example.com','javascript:alert(1)','file:///tmp/test']) assert.throws(()=>validate(plan([{type:'open_url',value}])));
  assert.doesNotThrow(()=>validate(plan([{type:'open_url',value:'https://example.com/search?q=hello'}])));
});
test('macOS commands use argument arrays without shell interpolation',()=>{
  const {commandFor} = require('../src/agent');
  assert.deepEqual(commandFor({type:'open_app',value:'safari'},{platform:'darwin'}),{file:'/usr/bin/open',args:['-a','Safari']});
  assert.deepEqual(commandFor({type:'open_app',value:'notepad'},{platform:'darwin'}),{file:'/usr/bin/open',args:['-a','TextEdit']});
  const url='https://example.com/$(whoami)';
  assert.deepEqual(commandFor({type:'open_url',value:url},{platform:'darwin'}).args,[url]);
  assert.match(commandFor({type:'keys',value:'close_tab'},{platform:'darwin'}).args[1],/command down/);
  assert.throws(()=>commandFor({type:'keys',value:'close_tab'},{platform:'linux'}),/Windows and macOS/);
});
test('vision uses structured output and target-specific capabilities',async()=>{
  let body;
  await interpret({image:'data:image/png;base64,AAAA',key:'test',platform:'darwin'},async(_,options)=>{
    body=JSON.parse(options.body);
    return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(plan([{type:'open_app',value:'safari'}]))}]}]})};
  });
  assert.equal(body.text.format.type,'json_schema'); assert.equal(body.text.format.strict,true);
  assert.match(body.instructions,/macOS/); assert.match(body.instructions,/safari/); assert.match(body.instructions,/Do not return shell/);
});
test('refusal, incomplete and malformed model output have useful messages',async()=>{
  const args={image:'data:image/png;base64,AAAA',key:'test'};
  for(const [data,message] of [
    [{output:[{content:[{type:'refusal',refusal:'No'}]}]},/could not interpret/],
    [{status:'incomplete'},/cut short/],
    [{output:[{content:[{type:'output_text',text:'not JSON'}]}]},/complete plan/]
  ]) await assert.rejects(()=>interpret(args,async()=>({ok:true,json:async()=>data})),message);
});
test('empty actions and empty or oversized titles are rejected',()=>{
  assert.throws(()=>validate(plan([{type:'shell',value:''}])));
  assert.throws(()=>validate({...plan([]),title:''}));
  assert.throws(()=>validate({...plan([]),title:'x'.repeat(161)}));
});

test('macOS Messages is recognized, launched, and arranged as Messages',()=>{
  const {commandFor,arrangeCommand} = require('../src/agent');
  assert.doesNotThrow(()=>validate(plan([{type:'open_app',value:'messages'}]),'darwin'));
  assert.throws(()=>validate(plan([{type:'open_app',value:'messages'}]),'win32'));
  assert.deepEqual(commandFor({type:'open_app',value:'messages'},{platform:'darwin'}).args,['-a','Messages']);
  const action=arrangeCommand({app:'messages'},{x:20,y:30,width:800,height:600},'darwin');
  assert.match(action.args[1],/tell application "Messages" to activate/);
  assert.match(action.args[1],/tell process "Messages"/);
  assert.ok(!action.args[1].includes('Code'));
});
