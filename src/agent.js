const { spawn } = require('node:child_process');
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
    if (!a || !['open_app','open_url','keys','shell'].includes(a.type) || typeof a.value !== 'string' || a.value.length > 12000) throw Error('Invalid action.');
    if (a.type === 'open_app' && !Object.hasOwn(APPS,a.value)) throw Error('Unknown app.');
    if (a.type === 'open_url' && !/^https?:\/\//i.test(a.value)) throw Error('Only web URLs are allowed.');
    if (a.type === 'keys' && !['close_tab','new_tab','undo','redo','save','copy','paste','select_all','switch_window','show_desktop','volume_up','volume_down','mute'].includes(a.value)) throw Error('Unknown shortcut.');
  }
  return plan;
}
async function interpret({ image, hint = '', key, model = 'gpt-4.1-mini' }, fetcher = fetch) {
  if (!key) throw Error('Add an OpenAI API key in Settings, or try a demo sketch.');
  if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,') || image.length > 8000000) throw Error('Invalid drawing.');
  const response = await fetcher('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, store: false, instructions: `You translate hand drawings into Windows computer actions. Return only JSON: {title:string,explanation:string,confidence:number,actions:[{type,value}]}. Up to 8 actions. Types: open_app (value one of ${Object.keys(APPS).join(',')}), open_url (https URL), keys (close_tab,new_tab,undo,redo,save,copy,paste,select_all,switch_window,show_desktop,volume_up,volume_down,mute), shell (PowerShell script for other tasks). App logos mean open_app; a tab with an X means close_tab. If ambiguous use confidence below 0.65 and actions:[]; explain what to redraw. Never invent a goal from a blank image. shell runs with the user's privileges. Prefer built-in actions. Do not include markdown.`, input: [{ role: 'user', content: [{ type: 'input_text', text: `Interpret this drawing. Optional user context: ${String(hint).slice(0,1000)}` }, { type: 'input_image', image_url: image }] }] })
  });
  if (!response.ok) throw Error(`OpenAI request failed (${response.status}). Check your key, model, and API credits.`);
  const data = await response.json();
  const text = (data.output || []).flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('');
  return validate(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')));
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
module.exports = { APPS, validate, interpret, powershell, scriptFor };
