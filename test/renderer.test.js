const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {resolvePlan}=require('../src/agent');
const plan={title:'Open Notepad',explanation:'A page',confidence:.95,actions:[{type:'open_app',value:'notepad'}]};
function ui(interpret=async()=>plan){
  const elements=new Map(),executions=[];
  const context=new Proxy({}, {get:()=>()=>{}});
  function element(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,checked:false,classList:{add(){},remove(){}},addEventListener(){},showModal(){},getContext:()=>context,toDataURL:()=> 'data:image/png;base64,AAAA'});return elements.get(id)}
  const demos=['tab','music','note'].map(name=>({...element(name),dataset:{demo:name}}));
  const sandbox={console,localStorage:{getItem:()=>null,setItem(){}},document:{getElementById:element,querySelectorAll:()=>demos,createElement:()=>element('exportCanvas')},window:{doodle:{interpret,execute:async(options)=>{executions.push(options);return ['Done.']},demo:async()=>plan,localStatus:async()=>({ready:true,message:'Ready'}),stop:async()=>{},onProgress(){}}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8'),sandbox);
  return {element,demos,executions};
}
test('Make it happen interprets and executes once without a second click',async()=>{
  const app=ui();await app.demos[2].onclick();assert.equal(app.executions.length,0);
  await app.element('interpret').onclick();assert.equal(app.executions.length,1);
  assert.equal(app.element('status').textContent,'Done.');assert.equal(app.element('execute').disabled,true);
});
test('cat-search fallback runs automatically and is labelled as a fallback',async()=>{
  const app=ui(async()=>resolvePlan({...plan,confidence:0,actions:[]}));await app.demos[2].onclick();
  await app.element('interpret').onclick();assert.equal(app.executions.length,1);
  assert.match(app.element('actions').textContent,/google.com\/search/);
  assert.match(app.element('confidence').textContent,/Cat search fallback/);
});
test('low-confidence best guesses still execute automatically',async()=>{
  const app=ui(async()=>resolvePlan({...plan,confidence:.01}));await app.demos[2].onclick();
  await app.element('interpret').onclick();assert.equal(app.executions.length,1);
  assert.match(app.element('actions').textContent,/notepad/);
  assert.doesNotMatch(app.element('confidence').textContent,/Cat search/);
});
test('Stop during recognition prevents subsequent automatic execution',async()=>{
  let finish;
  const app=ui(()=>new Promise(resolve=>{finish=resolve}));await app.demos[2].onclick();
  const running=app.element('interpret').onclick();app.element('stop').onclick();finish(plan);await running;
  assert.equal(app.executions.length,0);assert.equal(app.element('status').textContent,'Stopped.');
});
