const {test}=require('node:test');
const assert=require('node:assert/strict');
const {comedyPlan,drawingPlan,topicFromHint,TOPICS}=require('../src/comedy');
const {validate,interpret}=require('../src/agent');
test('money opens Crypto.com directly',()=>{
  const p=comedyPlan('money');assert.equal(p.actions[0].value,'https://crypto.com/');
  assert.match(p.title,/tuition.*crypto/);assert.equal(p.comedy,true);validate(p);
});
test('all comedy topics produce valid real-web actions',()=>{
  for(const topic of TOPICS){const p=validate(comedyPlan(topic));assert.equal(p.actions[0].type,'open_url');assert.match(p.actions[0].value,/^https:\/\//);}
  assert.equal(comedyPlan('a rocket').topic,'custom');
});
test('obvious hints skip the vision model',()=>{
  assert.equal(topicFromHint('money'),'money');assert.equal(topicFromHint('a heart'),'love');
  assert.equal(topicFromHint('completely unfamiliar'),null);
});
test('fast comedy mode describes the actual drawing instead of choosing a generic category',async()=>{
  let request;
  const p=await interpret({image:'data:image/png;base64,AAAA',comedy:true},async(url,options)=>{
    request={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({response:JSON.stringify({caption:'a pile of cash'}),done:true})};
  });
  assert.equal(request.url,'http://127.0.0.1:11434/api/generate');
  assert.equal(request.body.model,'moondream:latest');assert.equal(request.body.options.num_predict,32);
  assert.deepEqual(request.body.format.required,['caption']);
  assert.equal(p.topic,'money');
});
test('unfamiliar drawings keep their own content and never become grass or cats',()=>{
  const rocket=drawingPlan('a rocket launching into space'),duck=drawingPlan('a rubber duck wearing a hat');
  assert.match(decodeURIComponent(rocket.actions[0].value),/rocket launching into space/);
  assert.match(decodeURIComponent(duck.actions[0].value),/rubber duck wearing a hat/);
  assert.notEqual(rocket.actions[0].value,duck.actions[0].value);
  assert.doesNotMatch(rocket.actions[0].value,/grass|cat%20images/);
  assert.throws(()=>drawingPlan('unknown'),/No drawing description/);
});
