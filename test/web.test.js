const {test}=require('node:test');
const assert=require('node:assert/strict');
const {interpret,validate,commandFor,scriptFor}=require('../src/agent');
const plan=actions=>({title:'A trip to the web',explanation:'No matching local app; search for the drawn subject.',confidence:.9,actions});
test('Google queries are encoded as a single query parameter on both operating systems',()=>{
  const query='cats & dogs / café #1';
  const action={type:'search_web',value:query};
  const expected='https://www.google.com/search?q='+encodeURIComponent(query);
  const mac=commandFor(action,{platform:'darwin',appCatalog:{}});
  assert.deepEqual(mac,{file:'/usr/bin/open',args:[expected]});
  assert.equal(new URL(mac.args[0]).searchParams.get('q'),query);
  const windows=commandFor(action,{platform:'win32',appCatalog:{}});
  assert.match(Buffer.from(windows.args.at(-1),'base64').toString('utf16le'),new RegExp('Start-Process'));
  assert.ok(Buffer.from(windows.args.at(-1),'base64').toString('utf16le').includes(expected));
  assert.equal(scriptFor(action,false),`Start-Process '${expected}'`);
});
test('web search rejects empty, oversized, and control-character queries',()=>{
  for(const value of ['', ' ', 'x'.repeat(301), 'cats\nsecret', '\0']){
    assert.throws(()=>validate(plan([{type:'search_web',value}]),'darwin',{}));
  }
});
for(const provider of ['openai','gemini'])test(`${provider} accepts web fallbacks with no local app match in either drawing mode`,async()=>{
  for(const desktop of [undefined,{image:'data:image/jpeg;base64,BBBB',names:[]}]){
    for(const action of [{type:'search_web',value:'dinosaur'},{type:'open_url',value:'https://www.youtube.com/'}]){
      const expected=plan([action]);
      const result=await interpret({provider,image:'data:image/png;base64,AAAA',key:'test',platform:'darwin',appCatalog:{},desktop},async(_,options)=>{
        const body=JSON.parse(options.body);
        const instructions=provider==='gemini'?body.systemInstruction.parts[0].text:body.instructions;
        assert.match(instructions,/WEB FALLBACK/);
        assert.match(instructions,/Prefer the matching installed app/);
        assert.match(instructions,/unclear or blank drawing still requires clarification/);
        const schema=provider==='gemini'?body.generationConfig.responseJsonSchema:body.text.format.schema;
        assert.ok(schema.properties.actions.items.properties.type.enum.includes('search_web'));
        return {ok:true,json:async()=>provider==='gemini'?{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(expected)}]}}]}:{output:[{content:[{type:'output_text',text:JSON.stringify(expected)}]}]}};
      });
      assert.deepEqual(result,expected);
    }
  }
});
