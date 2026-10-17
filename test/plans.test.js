const {test}=require('node:test');
const assert=require('node:assert/strict');
const {correctApp,captureFresh}=require('../src/plans');
const catalog={messages:{name:'Messages'},chrome:{name:'Chrome'}};
const plan=actions=>({title:'Layout',explanation:'Drawn layout',confidence:.9,actions});
test('app correction preserves the drawn rectangle and original plan',()=>{
  const bounds={app:'chrome',x:100,y:150,width:400,height:700};
  const original=plan([{type:'arrange_app',value:JSON.stringify(bounds)}]);
  const result=correctApp(original,0,'messages','darwin',catalog);
  assert.deepEqual(JSON.parse(result.actions[0].value),{...bounds,app:'messages'});
  assert.equal(JSON.parse(original.actions[0].value).app,'chrome');
  assert.equal(result.correctedByUser,true);
});
test('correction accepts installed app launches and rejects unrelated actions or duplicate layouts',()=>{
  assert.equal(correctApp(plan([{type:'open_app',value:'chrome'}]),0,'messages','darwin',catalog).actions[0].value,'messages');
  assert.throws(()=>correctApp(plan([{type:'keys',value:'close_tab'}]),0,'messages','darwin',catalog));
  assert.throws(()=>correctApp(plan([{type:'open_app',value:'chrome'}]),0,'missing','darwin',catalog));
  const region=app=>({type:'arrange_app',value:JSON.stringify({app,x:0,y:0,width:500,height:500})});
  assert.throws(()=>correctApp(plan([region('chrome'),region('messages')]),0,'messages','darwin',catalog));
});
test('desktop reuse rejects expired captures and changed display geometry',()=>{
  const frame={displayId:1,createdAt:1000,bounds:{x:-100,y:0,width:100,height:100}};
  const displays=[{id:1,bounds:{...frame.bounds}}];
  assert.doesNotThrow(()=>captureFresh(frame,displays,121000));
  assert.throws(()=>captureFresh(frame,displays,121001));
  assert.throws(()=>captureFresh(frame,[],1001));
  assert.throws(()=>captureFresh(frame,[{id:1,bounds:{...frame.bounds,width:200}}],1001));
});
