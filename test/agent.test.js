const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate, resolvePlan, scriptFor, interpret } = require('../src/agent');
const plan = actions => ({title:'Test',explanation:'Test drawing',confidence:.9,actions});
test('only plans with no plausible action become a Google Images cat search',()=>{
  for(const original of [{...plan([]),confidence:0},plan([])]){
    const result=resolvePlan(original);
    assert.equal(result.fallback,true);
    assert.deepEqual(result.actions,[{type:'open_url',value:'https://www.google.com/search?tbm=isch&q=cat+images'}]);
  }
  const clear=plan([{type:'open_app',value:'notepad'}]);
  assert.equal(resolvePlan(clear),clear);
  for(const confidence of [.4,.01,0]){
    const guess={...clear,confidence};
    assert.equal(resolvePlan(guess),guess,'low confidence must not suppress a plausible action');
  }
});
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
test('Start-menu app launch uses a single AppsFolder path separator',()=>{
  const script=scriptFor({type:'open_app',value:'notepad'},false);
  assert.ok(script.includes('shell:AppsFolder'+'\\'+"'+$entry.AppID"));
  assert.ok(!script.includes('shell:AppsFolder'+'\\\\'));
});
test('vision request sends drawing and extracts structured response',async()=>{
  let request;
  const result=await interpret({provider:'openai',image:'data:image/png;base64,AAAA',key:'test-key'},async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(plan([{type:'keys',value:'close_tab'}]))}]}]})}});
  assert.equal(result.actions[0].value,'close_tab');
  const body=JSON.parse(request.body);assert.equal(body.input[0].content[1].type,'input_image');assert.equal(body.store,false);
});
test('missing key and API failures produce actionable errors',async()=>{
  await assert.rejects(()=>interpret({provider:'openai'}),/API key/);
  await assert.rejects(()=>interpret({provider:'openai',image:'data:image/png;base64,AAAA',key:'test'},async()=>({ok:false,status:401})),/401/);
});
test('local AI is default, sends base64 image only to loopback, and needs no key',async()=>{
  let request;
  const result=await interpret({image:'data:image/png;base64,AAAA'},async(url,options)=>{
    request={url,...options};return {ok:true,json:async()=>({done:true,message:{content:JSON.stringify(plan([{type:'open_app',value:'notepad'}]))}})};
  });
  assert.equal(result.actions[0].value,'notepad');
  assert.equal(request.url,'http://127.0.0.1:11434/api/chat');
  assert.equal(request.headers.Authorization,undefined);
  const body=JSON.parse(request.body);
  assert.equal(body.model,'gemma3:4b');assert.equal(body.stream,false);
  assert.deepEqual(body.messages[1].images,['AAAA']);
  assert.equal(body.format.type,'object');
});
test('compact AI commands are expanded locally without generating explanations',async()=>{
  let body;
  const result=await interpret({image:'data:image/png;base64,AAAA'},async(_,options)=>{
    body=JSON.parse(options.body);return {ok:true,json:async()=>({done:true,message:{content:'{"actions":[{"type":"open_app","value":"notepad"}]}'}})};
  });
  assert.equal(result.quick,true);assert.equal(result.actions[0].value,'notepad');
  assert.deepEqual(body.format.required,['actions']);assert.equal(body.options.num_ctx,2048);
  assert.equal(body.keep_alive,'1h');
});
test('local AI reports missing model, offline server, malformed JSON, and truncated output',async()=>{
  const args={image:'data:image/png;base64,AAAA'};
  await assert.rejects(()=>interpret(args,async()=>({ok:false,status:404})),/ollama pull gemma3:4b/);
  await assert.rejects(()=>interpret(args,async()=>{throw Error('ECONNREFUSED')}),/Cannot reach local AI/);
  await assert.rejects(()=>interpret(args,async()=>({ok:true,json:async()=>({message:{content:'not json'}})})),/unreadable plan/);
  await assert.rejects(()=>interpret(args,async()=>({ok:true,json:async()=>({done:true,done_reason:'length',message:{content:JSON.stringify(plan([]))}})})),/could not finish/);
});
test('local AI cancellation cannot return an executable plan',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>interpret({image:'data:image/png;base64,AAAA',signal:controller.signal},async(_,options)=>{options.signal.throwIfAborted()}),/recognition stopped/);
});
