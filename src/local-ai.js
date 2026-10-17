const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { LOCAL_MODEL } = require('./agent');
let starting = null;
async function probe() {
  const response = await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(2000)});
  if(!response.ok) throw Error('Ollama is not ready.');
  return response.json();
}
async function ensureLocalAI() {
  try { return await probe(); } catch {}
  if(starting) return starting;
  starting = (async()=>{
    const exe = path.join(process.env.LOCALAPPDATA || '', 'Programs','Ollama','ollama.exe');
    if(!fs.existsSync(exe)) throw Error('Ollama is not installed. Run setup-local.ps1 from the project folder.');
    const child = spawn(exe,['serve'],{windowsHide:true,detached:true,stdio:'ignore'});
    let launchError;
    child.on('error',e=>{launchError=e;}); child.unref();
    for(let i=0;i<30;i++) {
      await new Promise(r=>setTimeout(r,500));
      if(launchError) throw Error('Could not start Ollama. Open Ollama from the Start menu and try again.');
      try { return await probe(); } catch {}
    }
    throw Error('Ollama is still starting. Try Check local AI again in a moment.');
  })();
  try { return await starting; } finally { starting=null; }
}
async function localStatus(model=LOCAL_MODEL) {
  try {
    const data = await ensureLocalAI();
    const models = (data.models || []).map(m=>m.name);
    return {ready:models.includes(model),models,message:models.includes(model) ? `Local AI ready · ${model} · No API key needed` : `Ollama is running. Download your model: ollama pull ${model}`};
  } catch(e) {return {ready:false,models:[],message:e.message};}
}
const warming=new Map();
async function warmLocal(model=LOCAL_MODEL){
  if(warming.has(model))return warming.get(model);
  const task=(async()=>{await ensureLocalAI();const r=await fetch('http://127.0.0.1:11434/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(120000),body:JSON.stringify({model,stream:false,keep_alive:'1h',options:{num_ctx:4096}})});if(!r.ok)throw Error('Model warmup failed.');})();
  warming.set(model,task);try{await task}catch(e){warming.delete(model);throw e}
}
module.exports = { ensureLocalAI, localStatus, warmLocal };
