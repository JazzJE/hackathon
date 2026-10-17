const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('node:path');
const { interpret, validate, powershell, scriptFor } = require('./agent');
const { ensureLocalAI, localStatus } = require('./local-ai');
let win, pending = null, active = null, stopped = false, busy = false, recognition = null;
const smokeMode = process.env.DOODLE_SMOKE === '1' || process.env.DOODLE_LOCAL_SMOKE === '1';
if(smokeMode) app.setPath('userData',path.join(app.getPath('temp'),'doodle-do-smoke',String(process.pid)));
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1320, height: 900, minWidth: 960, minHeight: 720, backgroundColor: '#f5f3ed', webPreferences: { preload: path.join(__dirname,'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.loadFile(path.join(__dirname,'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  globalShortcut.register('CommandOrControl+Alt+Backspace', stop);
  if(smokeMode) win.webContents.once('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async()=>{document.querySelector('[data-demo="tab"]').click();await new Promise(r=>setTimeout(r,300));if(document.getElementById('planTitle').textContent!=='Close the current tab')throw Error('Demo failed');if(document.getElementById('execute').disabled)throw Error('Run button disabled');return {title:document.title,canvas:!!document.querySelector('canvas'),demo:true}})()`);
      console.log('SMOKE',JSON.stringify(result));
      if(process.env.DOODLE_LOCAL_SMOKE === '1') {
        const localResult=await win.webContents.executeJavaScript(`(async()=>{
          document.getElementById('provider').value='local';document.getElementById('model').value='gemma3:4b';
          document.querySelector('[data-demo="note"]').click();
          while(document.getElementById('interpret').disabled)await new Promise(r=>setTimeout(r,100));
          document.getElementById('interpret').click();
          const start=Date.now();
          while(document.getElementById('interpret').disabled){if(Date.now()-start>310000)throw Error('Local recognition timed out');await new Promise(r=>setTimeout(r,200));}
          const actions=document.getElementById('actions').textContent;
          if(!document.getElementById('status').textContent.startsWith('Plan ready.'))throw Error(document.getElementById('status').textContent);
          if(!actions.includes('open_app → notepad'))throw Error('Unexpected local recognition: '+actions);
          return {local:true,keyRequired:false,title:document.getElementById('planTitle').textContent,actions,status:document.getElementById('status').textContent,elapsedSeconds:Math.round((Date.now()-start)/1000)};
        })()`);
        console.log('LOCAL_SMOKE',JSON.stringify(localResult));
        if(process.env.DOODLE_EXECUTE_SMOKE === '1') {
          const execution=await win.webContents.executeJavaScript(`(async()=>{
            document.getElementById('execute').click();
            while(document.getElementById('interpret').disabled)await new Promise(r=>setTimeout(r,200));
            const status=document.getElementById('status').textContent;
            if(status!=='Done.')throw Error('Execution failed: '+status);
            return {executed:true,status};
          })()`);
          console.log('EXECUTE_SMOKE',JSON.stringify(execution));
          console.log(await powershell("if(!(Get-Process -Name Notepad -ErrorAction SilentlyContinue)){throw 'Notepad did not open'}; Write-Output 'Notepad process verified'"));
        }
      }
      if(process.env.DOODLE_SCREENSHOT) require('node:fs').writeFileSync(process.env.DOODLE_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
      app.exit(0);
    } catch(e) { console.error(e);app.exit(1); }
  });
});
function stop() { stopped = true; pending=null; recognition?.abort(); if(active) { const { spawn } = require('node:child_process'); spawn('taskkill',['/pid',String(active.pid),'/T','/F'],{windowsHide:true}); } }
ipcMain.handle('local-status', (_, model) => localStatus(typeof model === 'string' ? model.slice(0,200) : undefined));
ipcMain.handle('interpret', async (_, args) => {
  if(busy) throw Error('An action or drawing recognition is still running.');
  pending=null; busy=true; recognition=new AbortController();
  try {
    if(!args.provider || args.provider === 'local') await ensureLocalAI();
    if(recognition.signal.aborted) throw Error('Drawing recognition stopped.');
    const result=await interpret({...args, key: args.key || process.env.OPENAI_API_KEY,signal:recognition.signal});
    if(recognition.signal.aborted) throw Error('Drawing recognition stopped.');
    pending=result; return pending;
  } finally { busy=false; recognition=null; }
});
ipcMain.handle('demo', (_, name) => { if(busy) throw Error('An action is still running.'); const demos = { tab: {title:'Close the current tab',explanation:'A browser tab with a big X. Goodbye, tab.',confidence:1,actions:[{type:'keys',value:'close_tab'}]}, music: {title:'Open Spotify',explanation:'Three curved lines in a circle. Time for music.',confidence:1,actions:[{type:'open_app',value:'spotify'}]}, note: {title:'Open Notepad',explanation:'A little page for your next big idea.',confidence:1,actions:[{type:'open_app',value:'notepad'}]} }; if(!demos[name]) throw Error('Unknown demo'); pending = validate(demos[name]); return pending; });
ipcMain.handle('execute', async (_, options) => {
  if(busy || !pending) throw Error('Interpret a drawing first.');
  const plan = validate(pending); pending = null;
  if(!plan.actions.length || plan.confidence < .65) throw Error('Drawing is unclear. Try again.');
  if(plan.actions.some(a => a.type === 'shell') && !options.shell) throw Error('Enable full computer control to run PowerShell actions.');
  busy = true; stopped = false; const results = [];
  try {
    win.minimize(); // Return keyboard focus to the app behind the sketchpad.
    await new Promise(r => setTimeout(r, 900));
    for(const action of plan.actions) {
      if(stopped) throw Error('Stopped.');
      win.webContents.send('progress', `Running ${action.type}: ${action.value.slice(0,100)}`);
      results.push(await powershell(scriptFor(action, options.install), child => { active = child; })); active = null;
    }
    return results;
  } finally { busy = false; active = null; win.restore(); win.focus(); }
});
ipcMain.handle('stop', stop);
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { stop(); globalShortcut.unregisterAll(); });
