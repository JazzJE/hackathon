const $ = id => document.getElementById(id);
const canvas=$('canvas'), ctx=canvas.getContext('2d');
let strokes=[], current=null, erasing=false, busy=false, cancelled=false;
const savedPreferences = (()=>{try{return JSON.parse(localStorage.getItem('doodle-ai') || '{}')}catch{return {}}})();
function syncSettings(){return window.doodle.syncSettings({provider:$('provider').value,model:$('model').value.trim(),key:$('key').value,comedy:$('comedy').checked,...permissions()}).catch(()=>{});}
$('provider').value=savedPreferences.provider === 'openai' ? 'openai' : 'local';
$('comedy').checked=savedPreferences.comedy!==false;
function localModel(){return 'gemma3:4b'}
$('model').value=(savedPreferences.speedVersion===3?savedPreferences.model:null) || ($('provider').value === 'local' ? localModel() : 'gpt-4.1-mini');
function providerUI(){const local=$('provider').value==='local';$('engineBadge').textContent=local?'Local AI · No API key':'OpenAI · Cloud mode';$('cloudSettings').hidden=local;$('localSettings').hidden=!local;$('privacy').textContent=local?'Your drawings stay on this computer. Ollama runs the vision model locally.':'Drawing recognition uses OpenAI. An API key and separate API billing are required.';}
providerUI();
$('provider').onchange=()=>{$('model').value=$('provider').value==='local'?localModel():'gpt-4.1-mini';providerUI();if($('provider').value==='local')checkLocal()};
$('comedy').onchange=()=>{if($('provider').value==='local')$('model').value=localModel();syncSettings();};
$('settings').addEventListener('close',()=>{localStorage.setItem('doodle-ai',JSON.stringify({provider:$('provider').value,model:$('model').value.trim(),comedy:$('comedy').checked,speedVersion:3}));syncSettings();if($('provider').value==='local')checkLocal()});
$('shell').onchange=$('install').onchange=syncSettings;
$('screenDraw').onclick=()=>{syncSettings().then(()=>window.doodle.openOverlay()).catch(e=>status(e.message));};
window.doodle.onPlan(plan=>showPlan(plan));
async function checkLocal(){
  $('checkLocal').disabled=true;
  try { const result=await window.doodle.localStatus($('model').value.trim() || localModel());$('localStatus').textContent=result.message;if(!busy && $('provider').value==='local')status(result.message); }
  catch { $('localStatus').textContent='Could not check local AI. Try again.'; }
  finally { $('checkLocal').disabled=false; }
}
$('checkLocal').onclick=checkLocal;
function redraw(){ctx.clearRect(0,0,canvas.width,canvas.height);for(const s of strokes){ctx.beginPath();ctx.strokeStyle=s.erase?'#fffefa':'#30382a';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=s.size;ctx.lineCap='round';ctx.lineJoin='round';s.points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));if(s.points.length===1){ctx.arc(...s.points[0],s.size/2,0,Math.PI*2);ctx.fill()}else ctx.stroke()}$('placeholder').hidden=strokes.length>0;$('strokeLabel').textContent=`${strokes.length} strokes of genius`;}
function point(e){const r=canvas.getBoundingClientRect();return[(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height]}
canvas.onpointerdown=e=>{if(busy)return;canvas.setPointerCapture(e.pointerId);current={erase:erasing,size:Number($('size').value)*2,points:[point(e)]};strokes.push(current);redraw()};
canvas.onpointermove=e=>{if(!current)return;current.points.push(point(e));redraw()};
canvas.onpointerup=canvas.onpointercancel=()=>{current=null};
$('pen').onclick=()=>{erasing=false;$('pen').classList.add('selected');$('eraser').classList.remove('selected')};
$('eraser').onclick=()=>{erasing=true;$('eraser').classList.add('selected');$('pen').classList.remove('selected')};
$('undo').onclick=()=>{if(!busy){strokes.pop();redraw()}};$('clear').onclick=()=>{if(!busy){strokes=[];redraw()}};
$('settingsButton').onclick=()=>$('settings').showModal();
function showPlan(p,canRun=false){$('planTitle').textContent=p.title;$('explanation').textContent=p.explanation;$('actions').textContent=p.actions.map((a,i)=>`${i+1}. ${a.type} → ${a.value}`).join('\n\n');$('confidence').textContent=p.source?`${p.source==='gesture'?'Instant gesture':p.source==='hint'?'Instant hint':p.source==='cache'?'Cached drawing':p.source==='local'?'Local AI':'OpenAI'} · ${p.latencyMs<1000?Math.round(p.latencyMs)+' ms':(p.latencyMs/1000).toFixed(1)+' s'}`:p.quick?'Quick command':`${Math.round(p.confidence*100)}% confident · ${p.actions.length} action${p.actions.length===1?'':'s'}`;$('execute').disabled=!canRun||!p.actions.length}
function status(t){$('status').textContent=t}
async function work(fn){if(busy)return;busy=true;cancelled=false;$('interpret').disabled=true;$('execute').disabled=true;$('settingsButton').disabled=true;document.querySelectorAll('[data-demo]').forEach(b=>b.disabled=true);try{await fn()}catch(e){status(e.message.replace(/^Error invoking remote method '[^']+': Error: /,''))}finally{busy=false;$('interpret').disabled=false;$('settingsButton').disabled=false;document.querySelectorAll('[data-demo]').forEach(b=>b.disabled=false)}}
function permissions(){return {shell:$('shell').checked,install:$('install').checked}}
async function runPlan(options){if(cancelled)throw Error('Stopped.');$('execute').disabled=true;status('Doing the thing… The sketchpad will minimize.');const result=await window.doodle.execute(options);status(result.join('\n'));}
$('interpret').onclick=()=>work(async()=>{if(!strokes.length)throw Error('Give me a doodle first.');const options=permissions();status('Reading your drawing…');const image=document.createElement('canvas');image.width=768;image.height=Math.round(768*canvas.height/canvas.width);const c=image.getContext('2d');c.fillStyle='#fffefa';c.fillRect(0,0,image.width,image.height);c.drawImage(canvas,0,0,image.width,image.height);const plan=await window.doodle.interpret({image:image.toDataURL('image/png'),strokes,hint:$('hint').value,key:$('key').value,model:$('model').value.trim(),provider:$('provider').value,comedy:$('comedy').checked});if(cancelled)throw Error('Stopped.');showPlan(plan);await runPlan(options);});
$('execute').onclick=()=>work(()=>runPlan(permissions()));
$('stop').onclick=()=>{cancelled=true;$('execute').disabled=true;window.doodle.stop();status('Stop requested. Completed actions stay completed.')};window.doodle.onProgress(status);
document.querySelectorAll('[data-demo]').forEach(b=>b.onclick=()=>work(async()=>{const name=b.dataset.demo;strokes=[];const add=points=>strokes.push({points,size:7,erase:false});if(name==='money'){add([[820,240],[750,200],[650,220],[600,280],[650,350],[750,390],[800,450],[760,520],[660,540],[590,500]]);add([[700,160],[700,580]])}else if(name==='tab'){add([[400,500],[400,230],[1000,230],[1000,500],[400,500]]);add([[400,300],[1000,300]]);add([[900,250],[940,285]]);add([[940,250],[900,285]])}else if(name==='music'){add(Array.from({length:65},(_,i)=>[700+160*Math.cos(i*Math.PI/32),390+160*Math.sin(i*Math.PI/32)]));for(let j=0;j<3;j++)add(Array.from({length:25},(_,i)=>[590+i*9,345+j*55-25*Math.sin(i*Math.PI/24)]))}else{add([[540,200],[860,200],[860,580],[540,580],[540,200]]);for(let j=0;j<4;j++)add([[590,280+j*65],[810,280+j*65]])}redraw();showPlan(await window.doodle.demo(name),true);status('Demo loaded. Run the preset, or click Make it happen to interpret and run the drawing.')}));
redraw();
if($('provider').value==='local')checkLocal();
syncSettings();
