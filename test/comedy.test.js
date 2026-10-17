const {test}=require('node:test');
const assert=require('node:assert/strict');
const {moneyPlan,isMoneyHint}=require('../src/comedy');
const {interpret}=require('../src/agent');
const args={image:'data:image/png;base64,AAAA',comedy:true};
const reply=response=>({ok:true,json:async()=>({response,done:true})});
test('only an explicit money hint uses the configured shortcut',()=>{
  assert.equal(moneyPlan().actions[0].value,'https://crypto.com/us/price/dogecoin');
  assert.equal(isMoneyHint('money'),true);
  for(const hint of ['heart','coffee','a book','music','a cash register on fire'])assert.equal(isMoneyHint(hint),false);
});
test('creative drawings use model-chosen apps and websites',async()=>{
  for(const action of [{type:'open_app',value:'spotify'},{type:'open_url',value:'https://www.nasa.gov/'}]){
    const plan=await interpret(args,async(url,options)=>{assert.equal(JSON.parse(options.body).model,'gemma3:4b');return reply(JSON.stringify(action));});
    assert.deepEqual(plan.actions,[action]);assert.equal(plan.explanation,action.value);
  }
});
test('a cut-off string retries and runs only the complete action',async()=>{
  let calls=0;const plan=await interpret(args,async()=>{calls++;return reply(calls===1?'{"type":"open_url","value":"https://www.nasa.gov':'{"type":"open_url","value":"https://www.nasa.gov/"}');});
  assert.equal(calls,2);assert.equal(plan.actions[0].value,'https://www.nasa.gov/');
});
test('missing closing brace is recovered without another model call',async()=>{
  let calls=0;const plan=await interpret(args,async()=>{calls++;return reply('{"type":"open_app","value":"notepad"');});
  assert.equal(calls,1);assert.equal(plan.actions[0].value,'notepad');
});
test('repeated malformed output gives a readable error without a backup',async()=>{
  let calls=0;await assert.rejects(()=>interpret(args,async()=>{calls++;return reply('{"type":"open_url","value":"https:');}),/could not finish its action/);assert.equal(calls,2);
});
test('cancellation prevents creative interpretation from running',async()=>{
  const controller=new AbortController();await assert.rejects(()=>interpret({...args,signal:controller.signal},async()=>{controller.abort();return reply('{"type":"keys","value":"mute"}');}),/stopped/);
});
