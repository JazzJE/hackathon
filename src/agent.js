const { spawn } = require('node:child_process');
const {drawingPlan}=require('./comedy');
const APPS = {
  chrome: { id: 'Google.Chrome', launch: 'chrome.exe' },
  firefox: { id: 'Mozilla.Firefox', launch: 'firefox.exe' },
  spotify: { id: 'Spotify.Spotify', launch: 'spotify.exe' },
  discord: { id: 'Discord.Discord', launch: 'discord.exe' },
  vscode: { id: 'Microsoft.VisualStudioCode', launch: 'code' },
  vlc: { id: 'VideoLAN.VLC', launch: 'vlc.exe' },
  notepad: { launch: 'notepad.exe' }, calculator: { launch: 'calc.exe' },
  paint: { launch: 'mspaint.exe' }, explorer: { launch: 'explorer.exe' }
};
function validate(plan) {
  if (!plan || typeof plan.title !== 'string' || typeof plan.explanation !== 'string' || !Number.isFinite(plan.confidence) || plan.confidence < 0 || plan.confidence > 1 || !Array.isArray(plan.actions) || plan.actions.length > 8) throw Error('The AI returned an invalid plan. Try drawing more clearly.');
  for (const a of plan.actions) {
    if (!a || !['open_app','open_url','keys','shell','click','close_tab'].includes(a.type) || typeof a.value !== 'string' || a.value.length > 12000) throw Error('Invalid action.');
    if(a.type === 'close_tab' && !/^-?\d{1,6}:-?\d{1,6}$/.test(a.value))throw Error('Invalid tab target.');
    if(a.type === 'click' && !/^(left|middle|right):-?\d{1,6}:-?\d{1,6}$/.test(a.value)) throw Error('Invalid click coordinates.');
    if (a.type === 'open_app' && !Object.hasOwn(APPS,a.value)) throw Error('Unknown app.');
    if (a.type === 'open_url' && !/^https?:\/\//i.test(a.value)) throw Error('Only web URLs are allowed.');
    if (a.type === 'keys' && !['close_tab','new_tab','undo','redo','save','copy','paste','select_all','switch_window','show_desktop','volume_up','volume_down','mute'].includes(a.value)) throw Error('Unknown shortcut.');
  }
  return plan;
}
function resolvePlan(plan) {
  validate(plan);
  if(plan.actions.length) return plan;
  throw Error('No usable action was returned. Add a short hint and try again.');
}
const LOCAL_MODEL = 'gemma3:4b';
const PLAN_SCHEMA = {
  type:'object', additionalProperties:false, required:['actions'],
  properties:{actions:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['type','value'],properties:{type:{type:'string',enum:['open_app','open_url','keys','shell']},value:{type:'string'}}}}}
};
const INSTRUCTIONS = `Interpret a drawing as Windows commands. Respond ONLY with {"actions":[{"type":"...","value":"..."}]}. No explanation, title, confidence or markdown. Prefer one best-guess action. Types: open_app (${Object.keys(APPS).join(',')}), open_url (https URL), keys (close_tab,new_tab,undo,redo,save,copy,paste,select_all,switch_window,show_desktop,volume_up,volume_down,mute), shell (PowerShell for other tasks). App logo=open_app; X or crossed browser tab=keys close_tab; lined page=open_app notepad; calculator=open_app calculator; circle with 3 curved lines=open_app spotify. SPEED over accuracy: interpret messy or ambiguous marks; choose a plausible action even if uncertain. Only actions:[] for absolutely no plausible idea. Up to 8 actions. Prefer built-in actions; shell has user permissions.`;
async function interpret({ image, hint = '', key, model, provider = 'local', signal, comedy=false }, fetcher = fetch) {
  if (!['local','openai'].includes(provider)) throw Error('Unknown AI provider.');
  if (provider === 'openai' && !key) throw Error('Add an OpenAI API key in Settings, or switch to local AI.');
  if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,') || image.length > 8000000) throw Error('Invalid drawing.');
  const inputText = `Interpret this drawing. Optional user context: ${String(hint).slice(0,1000)}`;
  const timeout = AbortSignal.timeout(provider === 'local' ? 300000 : 60000);
  const requestSignal = signal ? AbortSignal.any([signal,timeout]) : timeout;
  if(comedy){
    const format={type:'object',required:['caption'],additionalProperties:false,properties:{caption:{type:'string'}}};
    const prompt=`What object or action does this drawing look like? Give your best specific guess in a short phrase.${hint ? " Context: "+String(hint).slice(0,300) : ""}`;
    let response;
    if(provider==='local'){
      try{response=await fetcher('http://127.0.0.1:11434/api/generate',{method:'POST',signal:requestSignal,headers:{'Content-Type':'application/json'},body:JSON.stringify({model:model||'moondream:latest',prompt:prompt+' Return JSON with a caption field.',images:[image.slice('data:image/png;base64,'.length)],format,stream:false,keep_alive:'1h',options:{temperature:.2,num_predict:32,num_ctx:2048}})});}
      catch(e){if(signal?.aborted)throw Error('Drawing recognition stopped.');throw Error('Local comedy AI is unavailable. Check Ollama in Settings.');}
      if(!response.ok)throw Error(response.status===404?'Download the fast vision model: ollama pull moondream':`Local comedy AI failed (${response.status}).`);
      const data=await response.json();
      return validate(drawingPlan(JSON.parse(data.response).caption));
    }
    response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',signal:requestSignal,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:model||'gpt-4.1-mini',store:false,instructions:prompt,text:{format:{type:'json_schema',name:'drawing_topic',strict:true,schema:format}},input:[{role:'user',content:[{type:'input_image',image_url:image}]}]})});
    if(!response.ok)throw Error(`OpenAI request failed (${response.status}).`);
    const data=await response.json(),text=(data.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
    return validate(drawingPlan(JSON.parse(text).caption));
  }
  if(provider === 'local') {
    let response;
    try {
      response = await fetcher('http://127.0.0.1:11434/api/chat', {
        method:'POST', signal:requestSignal, headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:model || LOCAL_MODEL,stream:false,format:PLAN_SCHEMA,keep_alive:'1h',options:{temperature:0,num_predict:256,num_ctx:2048},messages:[{role:'system',content:INSTRUCTIONS},{role:'user',content:inputText,images:[image.slice('data:image/png;base64,'.length)]}]})
      });
    } catch(e) {
      if(signal?.aborted) throw Error('Drawing recognition stopped.');
      if(timeout.aborted) throw Error('Local AI took more than five minutes. Try a simpler drawing or a smaller vision model.');
      throw Error('Cannot reach local AI. Open Settings and check Ollama, or run setup-local.ps1.');
    }
    if(!response.ok) {
      if(response.status === 404) throw Error(`Local model missing. Run: ollama pull ${model || LOCAL_MODEL}`);
      throw Error(`Local AI failed (${response.status}). Check that your model supports images and has enough memory.`);
    }
    const data = await response.json();
    if(data.error) throw Error('Local AI failed to generate a plan. Check Ollama and model memory requirements.');
    if(data.done === false || data.done_reason === 'length') throw Error('Local AI could not finish its plan. Try a simpler drawing.');
    return parsePlan(data.message?.content);
  }
  const response = await fetcher('https://api.openai.com/v1/responses', {
    method: 'POST', signal: requestSignal,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model:model || 'gpt-4.1-mini', store: false, instructions: INSTRUCTIONS, input: [{ role: 'user', content: [{ type: 'input_text', text: inputText }, { type: 'input_image', image_url: image }] }] })
  });
  if (!response.ok) throw Error(`OpenAI request failed (${response.status}). Check your key, model, and API credits.`);
  const data = await response.json();
  const text = (data.output || []).flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('');
  return parsePlan(text);
}
function parsePlan(text) {
  try {
    const plan=JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, ''));
    if(plan && !Object.hasOwn(plan,'title') && Array.isArray(plan.actions)) {
      const action=plan.actions[0];
      return validate({...plan,title:action?`${action.type.replace(/_/g,' ')}: ${action.value.slice(0,90)}`:'No idea',explanation:'Quick interpretation. No waiting for a long explanation.',confidence:plan.actions.length?1:0,quick:true});
    }
    return validate(plan);
  }
  catch(e) { throw Error('AI returned an unreadable plan. Try a clearer drawing or a short hint.'); }
}
function powershell(script, onChild = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-OutputFormat','Text','-EncodedCommand',Buffer.from(`$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; ${script}`, 'utf16le').toString('base64')], { windowsHide: true });
    onChild(child);
    let output = ''; const timer = setTimeout(() => child.kill(), 180000);
    child.stdout.on('data', d => { output = (output + d).slice(-12000); });
    child.stderr.on('data', d => { output = (output + d).slice(-12000); });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve(output.trim() || 'Done.') : reject(Error(output || `Command stopped (${code}).`)); });
  });
}
const SHORTCUTS = {close_tab:'^w',new_tab:'^t',undo:'^z',redo:'^y',save:'^s',copy:'^c',paste:'^v',select_all:'^a',switch_window:'%{TAB}',volume_up:'{VOLUME_UP}',volume_down:'{VOLUME_DOWN}',mute:'{VOLUME_MUTE}'};
function scriptFor(a, install) {
  if(a.type === 'shell') return a.value;
  if(a.type === 'click'||a.type === 'close_tab') throw Error('This action requires the Windows helper.');
  if(a.type === 'keys' && ['volume_up','volume_down','mute'].includes(a.value)) {
    const code = {volume_up:175,volume_down:174,mute:173}[a.value];
    return `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DoodleKeys { [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra); }'; [DoodleKeys]::keybd_event(${code},0,0,[UIntPtr]::Zero); [DoodleKeys]::keybd_event(${code},0,2,[UIntPtr]::Zero)`;
  }
  if(a.type === 'keys') return a.value === 'show_desktop' ? '(New-Object -ComObject Shell.Application).ToggleDesktop()' : `$w=New-Object -ComObject WScript.Shell; $w.SendKeys('${SHORTCUTS[a.value]}')`;
  const q = s => "'" + s.replace(/'/g,"''") + "'";
  if(a.type === 'open_url') return `Start-Process ${q(a.value)}`;
  const app = APPS[a.value];
  // Start-menu discovery handles per-user installs absent from PATH.
  return `$name=${q(a.value)}; $entry=Get-StartApps | Where-Object { $_.Name -like ('*'+$name+'*') } | Select-Object -First 1; if($entry){ Start-Process explorer.exe -ArgumentList ('shell:AppsFolder\\'+$entry.AppID) } else { try { Start-Process ${q(app.launch)} -ErrorAction Stop } catch { ${install && app.id ? `& winget install --id ${q(app.id)} --exact --source winget --accept-package-agreements --accept-source-agreements; if($LASTEXITCODE -ne 0){throw 'App installation failed'}; Write-Output 'Installed. Draw the logo again to launch the app.'` : "throw 'App not found. Enable automatic installation in Settings to install supported apps.'"} } }`;
}
module.exports = { APPS, LOCAL_MODEL, validate, resolvePlan, interpret, powershell, scriptFor };

