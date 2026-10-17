const {test}=require('node:test');
const assert=require('node:assert/strict');
const {comedyPlan,topicFromHint,TOPICS}=require('../src/comedy');
const {validate,interpret}=require('../src/agent');
test('money opens the real meme-coin market page',()=>{
  const p=comedyPlan('money');assert.equal(p.actions[0].value,'https://coinmarketcap.com/view/memes/');
  assert.match(p.title,/tuition.*dog/);assert.equal(p.comedy,true);validate(p);
});
test('all comedy topics produce valid real-web actions',()=>{
  for(const topic of TOPICS){const p=validate(comedyPlan(topic));assert.equal(p.actions[0].type,'open_url');assert.match(p.actions[0].value,/^https:\/\//);}
  assert.equal(comedyPlan('unrecognized').topic,'chaos');
});
test('obvious hints skip the vision model',()=>{
  assert.equal(topicFromHint('money'),'money');assert.equal(topicFromHint('a heart'),'love');
  assert.equal(topicFromHint('completely unfamiliar'),null);
});
test('fast comedy mode asks the local model only for a tiny topic label',async()=>{
  let request;
  const p=await interpret({image:'data:image/png;base64,AAAA',comedy:true},async(url,options)=>{
    request={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({response:'{"topic":"money"}',done:true})};
  });
  assert.equal(request.url,'http://127.0.0.1:11434/api/generate');
  assert.equal(request.body.model,'moondream:latest');assert.equal(request.body.options.num_predict,24);
  assert.equal(p.topic,'money');
});
