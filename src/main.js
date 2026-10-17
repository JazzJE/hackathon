const { app, BrowserWindow, ipcMain, globalShortcut, screen, shell } = require('electron');
const path = require('node:path');
const {createHash}=require('node:crypto');
const { interpret, validate, resolvePlan, powershell, scriptFor } = require('./agent');
const { ensureLocalAI, localStatus, warmLocal } = require('./local-ai');
const {NativeHost}=require('./native-host');
const {recognizeX,recognizeMoney}=require('./gestures');
const {moneyPlan,isMoneyHint}=require('./comedy');
const native=new NativeHost(),cache=new Map();
let win, overlay, overlayBounds, targetWindow=0, pending = null, active = null, stopped = false, busy = false, recognition = null;
let settings={provider:'local',model:'gemma3:4b',key:'',shell:false,install:false,comedy:true};

const smokeMode = process.env.DOODLE_SMOKE === '1' || process.env.DOODLE_LOCAL_SMOKE === '1' || process.env.DOODLE_OVERLAY_SMOKE === '1' || process.env.DOODLE_COMEDY_SMOKE === '1';
if(smokeMode) app.setPath('userData',path.join(app.getPath('temp'),'doodle-do-smoke',String(process.pid)));
if(!smokeMode){
  if(!app.requestSingleInstanceLock())app.quit();
  app.on('second-instance',()=>{
    overlay?.hide();
    if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}
  });
}
if(process.env.DOODLE_OVERLAY_SMOKE==='1')app.commandLine.appendSwitch('force-renderer-accessibility');
app.whenReady().then(() => {
  win = new BrowserWindow({ show: !smokeMode, width: 1320, height: 900, minWidth: 960, minHeight: 720, backgroundColor: '#f5f3ed', webPreferences: { preload: path.join(__dirname,'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.loadFile(path.join(__dirname,'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('closed',()=>app.quit());
  native.start();
  overlay=new BrowserWindow({show:false,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,skipTaskbar:true,alwaysOnTop:true,resizable:false,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  overlay.loadFile(path.join(__dirname,'overlay.html'));
  overlay.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  overlay.webContents.on('will-navigate',e=>e.preventDefault());
  overlay.on('close',e=>{if(!app.isQuitting){e.preventDefault();overlay.hide()}});
  globalShortcut.register('CommandOrControl+Alt+Backspace', stop);
  const overlayHotkey=globalShortcut.register('CommandOrControl+Alt+D',()=>showOverlay().catch(reportError));
  win.webContents.once('did-finish-load',()=>{if(!overlayHotkey)win.webContents.send('progress','Ctrl+Alt+D is already in use. Use Draw on screen in the app.');});
  if(smokeMode) win.webContents.once('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async()=>{document.querySelector('[data-demo="tab"]').click();await new Promise(r=>setTimeout(r,300));if(document.getElementById('planTitle').textContent!=='Close the current tab')throw Error('Demo failed');if(document.getElementById('execute').disabled)throw Error('Run button disabled');return {title:document.title,canvas:!!document.querySelector('canvas'),demo:true}})()`);
      console.log('SMOKE',JSON.stringify(result));
      if(process.env.DOODLE_COMEDY_SMOKE==='1'){
        const result=await win.webContents.executeJavaScript(`(async()=>{
          document.querySelector('[data-demo="money"]').click();while(document.getElementById('interpret').disabled)await new Promise(r=>setTimeout(r,100));
          const out=document.createElement('canvas');out.width=512;out.height=293;const c=out.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,512,293);c.drawImage(document.getElementById('canvas'),0,0,512,293);
          const args={image:out.toDataURL('image/png'),provider:'local',model:'gemma3:4b',comedy:true};
          const first=await window.doodle.interpret(args);showPlan(first);
          const second=await window.doodle.interpret(args);
          return {topic:first.topic,url:first.actions[0]?.value,firstMs:Math.round(first.latencyMs),repeatMs:Math.round(second.latencyMs),repeatSource:second.source};
        })()`);
        if(result.topic!=='money'||result.url!=='https://crypto.com/us/price/dogecoin'||result.repeatSource!=='cache')throw Error('Money interpretation failed: '+JSON.stringify(result));
        console.log('COMEDY_SMOKE',JSON.stringify(result));
      }
      if(process.env.DOODLE_OVERLAY_SMOKE === '1'){
        const fs=require('node:fs'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
        const base=path.join(app.getPath('temp'),'doodle-overlay-test-'+process.pid);fs.mkdirSync(base,{recursive:true});
        for(const letter of ['A','B'])fs.writeFileSync(path.join(base,letter+'.html'),'<title>Doodle Tab Test '+letter+'</title><h1>Disposable test tab</h1>');
        const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--user-data-dir='+path.join(base,'profile'),'--no-first-run','--no-default-browser-check','--disable-sync','--new-window',pathToFileURL(path.join(base,'A.html')).href,pathToFileURL(path.join(base,'B.html')).href],{stdio:'ignore'});
        try{
          let handle=0,tabs=[];
          for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,500));handle=await native.call('window-for-process',{processId:browser.pid});if(handle)tabs=await native.call('tabs',{handle});if(tabs.filter(t=>t.name.startsWith('Doodle Tab Test')).length===2)break;}
          const target=tabs.find(t=>t.name.startsWith('Doodle Tab Test A'));if(!target)throw Error('Disposable tabs unavailable');
          win.minimize();await native.call('focus',{handle});await new Promise(r=>setTimeout(r,250));await showOverlay();
          await new Promise(r=>setTimeout(r,150));
          const point=screen.screenToDipPoint({x:Math.round(target.x+target.width/2),y:Math.round(target.y+target.height/2)});
          const x=point.x-overlayBounds.x,y=point.y-overlayBounds.y;
          await overlay.webContents.executeJavaScript('strokes=[{points:[['+(x-6)+','+(y-6)+'],['+(x+6)+','+(y+6)+'],['+(x+6)+','+(y-6)+'],['+(x-6)+','+(y+6)+']]}];draw();');
          const start=performance.now();await overlay.webContents.executeJavaScript('submit()');
          const after=await native.call('tabs',{handle});if(after.some(t=>t.name.startsWith('Doodle Tab Test A'))||!after.some(t=>t.name.startsWith('Doodle Tab Test B')))throw Error('Overlay closed wrong tab or no tab');
          console.log('OVERLAY_SMOKE',JSON.stringify({realEdge:true,targetedTabClosed:true,singleStroke:true,elapsedMs:Math.round(performance.now()-start)}));
          win.restore();win.show();win.focus();await new Promise(r=>setTimeout(r,200));
          const ownBounds=win.getBounds();
          const ownPoint=screen.dipToScreenPoint({x:Math.round(ownBounds.x+ownBounds.width/2),y:Math.round(ownBounds.y+ownBounds.height/2)});
          let refused=false;
          try{await native.call('close-tab',{...ownPoint,handle,strictTarget:true});}
          catch(e){refused=/Microsoft Edge tab/.test(e.message);}
          if(!refused||win.isDestroyed())throw Error('Doodle Do was not protected from close-tab');
          if(!(await native.call('tabs',{handle})).some(t=>t.name.startsWith('Doodle Tab Test B')))throw Error('An X over Doodle Do closed an Edge tab');
          console.log('SELF_CLOSE_PROTECTION_PASSED');
        }finally{browser.kill();}

      }
      if(process.env.DOODLE_LOCAL_SMOKE === '1') {
        const localResult=await win.webContents.executeJavaScript(`(async()=>{
          document.getElementById('provider').value='local';document.getElementById('model').value='gemma3:4b';
          document.getElementById('comedy').checked=false;
          document.querySelector('[data-demo="note"]').click();
          while(document.getElementById('interpret').disabled)await new Promise(r=>setTimeout(r,100));
          document.getElementById('interpret').click();
          const start=Date.now();
          while(document.getElementById('interpret').disabled){if(Date.now()-start>310000)throw Error('Local recognition timed out');await new Promise(r=>setTimeout(r,200));}
          const actions=document.getElementById('actions').textContent;
          if(document.getElementById('status').textContent!=='Done.')throw Error(document.getElementById('status').textContent);
          if(!actions.includes('open_app → notepad'))throw Error('Unexpected local recognition: '+actions);
          return {local:true,keyRequired:false,autoExecuted:true,title:document.getElementById('planTitle').textContent,actions,engine:document.getElementById('confidence').textContent,status:document.getElementById('status').textContent,elapsedSeconds:Math.round((Date.now()-start)/1000)};
        })()`);
        console.log('LOCAL_SMOKE',JSON.stringify(localResult));
        console.log(await powershell("for($i=0;$i -lt 25;$i++){if(Get-Process -Name Notepad -ErrorAction SilentlyContinue){Write-Output 'Notepad process verified';exit 0};Start-Sleep -Milliseconds 200};throw 'Notepad did not open'"));
      }
      if(process.env.DOODLE_SCREENSHOT && process.env.DOODLE_OVERLAY_SMOKE!=='1'&&process.env.DOODLE_COMEDY_SMOKE!=='1') require('node:fs').writeFileSync(process.env.DOODLE_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
      app.exit(0);
    } catch(e) { console.error(e);app.exit(1); }
  });
});
function stop() { stopped = true; pending=null; recognition?.abort();overlay?.hide(); if(active) { const { spawn } = require('node:child_process'); spawn('taskkill',['/pid',String(active.pid),'/T','/F'],{windowsHide:true}); } }
function reportError(e){if(!win?.isDestroyed()){win.show();win.webContents.send('progress',e.message);}}
async function showOverlay(){
  if(busy)return;
  if(overlay.isVisible()){overlay.hide();return;}
  // Record the foreground window before the overlay takes focus.
  targetWindow=await native.call('foreground');
  if(win.isFocused()){win.minimize();await new Promise(r=>setTimeout(r,120));targetWindow=await native.call('foreground');}
  overlayBounds=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
  overlay.setBounds(overlayBounds);overlay.setAlwaysOnTop(true,'screen-saver');
  overlay.webContents.send('overlay-reset');overlay.show();overlay.focus();
}
ipcMain.handle('overlay-open',()=>showOverlay());
ipcMain.handle('overlay-cancel',async()=>{overlay.hide();if(targetWindow)await native.call('focus',{handle:targetWindow});});
ipcMain.handle('settings',(event,args)=>{
  if(event.sender!==win.webContents)throw Error('Settings are owned by the main window.');
  settings={provider:args.provider==='openai'?'openai':'local',model:String(args.model||'gemma3:4b').slice(0,200),key:String(args.key||''),shell:!!args.shell,install:!!args.install,comedy:args.comedy!==false};
  if(settings.provider==='local'&&!smokeMode)warmLocal(settings.model).catch(()=>{});
});
ipcMain.handle('local-status', (_, model) => localStatus(typeof model === 'string' ? model.slice(0,200) : undefined));
async function processDrawing(args) {
  if(busy) throw Error('An action or drawing recognition is still running.');
  pending=null; stopped=false; busy=true; recognition=new AbortController();
  try {
    const start=performance.now();
    const hintedMoney=args.comedy&&isMoneyHint(args.hint);
    if(hintedMoney){pending={...moneyPlan(),source:'hint',latencyMs:performance.now()-start};return pending;}
    if(args.comedy&&!args.hint&&recognizeMoney(args.strokes)){pending={...moneyPlan(),source:'gesture',latencyMs:performance.now()-start};return pending;}
    if(!args.hint && recognizeX(args.strokes)){
      pending={title:'Close Edge tab',explanation:'Close a Microsoft Edge tab. Doodle Do is never a close target.',confidence:1,source:'gesture',latencyMs:performance.now()-start,actions:[{type:'keys',value:'close_tab'}]};return pending;
    }
    const cacheKey=createHash('sha256').update(JSON.stringify([args.image,args.hint||'',args.provider||'local',args.model||'gemma3:4b',!!args.comedy])).digest('hex');
    if(cache.has(cacheKey)){pending={...cache.get(cacheKey),source:'cache',latencyMs:performance.now()-start};return pending;}
    if(!args.provider || args.provider === 'local') await ensureLocalAI();
    if(recognition.signal.aborted) throw Error('Drawing recognition stopped.');
    const request={...args, key: args.key || process.env.OPENAI_API_KEY,signal:recognition.signal};
    let result=await interpret(request);
    if(!result.actions.length && !recognition.signal.aborted) {
      win.webContents.send('progress','Taking another look for the best possible interpretation…');
      result=await interpret({...request,hint:`${String(args.hint || '').slice(0,700)} Take another look: choose the single most plausible computer action from any recognizable clue, even if uncertain. Return no actions only if there is absolutely no plausible interpretation.`});
    }
    if(recognition.signal.aborted) throw Error('Drawing recognition stopped.');
    pending={...resolvePlan(result),source:args.provider||'local',latencyMs:performance.now()-start};
    if(cache.size>=32)cache.delete(cache.keys().next().value);cache.set(cacheKey,pending);
    return pending;
  } finally { busy=false; recognition=null; }
}
ipcMain.handle('interpret', (_,args)=>processDrawing(args));
ipcMain.handle('demo', (_, name) => { if(busy) throw Error('An action is still running.'); const demos = { money:moneyPlan(), tab: {title:'Close the current tab',explanation:'A browser tab with a big X. Goodbye, tab.',confidence:1,actions:[{type:'keys',value:'close_tab'}]}, music: {title:'Open Spotify',explanation:'Three curved lines in a circle. Time for music.',confidence:1,actions:[{type:'open_app',value:'spotify'}]}, note: {title:'Open Notepad',explanation:'A little page for your next big idea.',confidence:1,actions:[{type:'open_app',value:'notepad'}]} }; if(!demos[name]) throw Error('Unknown demo'); pending = validate(demos[name]); return pending; });
async function executePlan(options,fromOverlay=false) {
  if(busy || !pending) throw Error('Interpret a drawing first.');
  const plan = validate(pending); pending = null;
  if(!plan.actions.length) throw Error('No action is available. Draw again.');
  if(plan.actions.some(a => a.type === 'shell') && !options.shell) throw Error('Enable full computer control to run PowerShell actions.');
  busy = true; stopped = false; const results = [];
  try {
    if(fromOverlay){
      const needsFocus=plan.actions.some(a=>a.type==='click'||a.type==='shell'||(a.type==='keys'&&a.value!=='close_tab'));
      if(needsFocus&&targetWindow)await native.call('focus',{handle:targetWindow});
    }
    else win.minimize();
    await new Promise(r => setTimeout(r, 120));
    for(const action of plan.actions) {
      if(stopped) throw Error('Stopped.');
      win.webContents.send('progress', `Running ${action.type}: ${action.value.slice(0,100)}`);
      if(action.type==='close_tab'){const [x,y]=action.value.split(':');results.push(await native.call('close-tab',{x:Number(x),y:Number(y),handle:fromOverlay?targetWindow:0,strictTarget:smokeMode}));}
      else if(action.type==='keys'&&action.value==='close_tab')results.push(await native.call('close-tab',{handle:fromOverlay?targetWindow:0}));
      else if(action.type==='keys')results.push(await native.call('keys',{value:action.value}));
      else if(action.type==='click'){const [button,x,y]=action.value.split(':');results.push(await native.call('click',{button,x:Number(x),y:Number(y)}));}
      else if(action.type==='open_url'){await shell.openExternal(action.value);results.push('Done.');}
      else results.push(await powershell(scriptFor(action, options.install), child => { active = child; })); active = null;
    }
    return results;
  } finally { busy = false; active = null; if(!fromOverlay&&!plan.comedy){win.restore(); win.focus();} }
}
ipcMain.handle('execute',(_,options)=>executePlan(options));
ipcMain.handle('overlay-submit',async(event,args)=>{
  if(event.sender!==overlay.webContents||!overlay.isVisible()||busy)throw Error('Overlay is not ready.');
  stopped=false;
  const options={...settings};
  const cross=recognizeX(args.strokes);
  overlay.hide();
  try{
    let plan;
    if(cross){
      if(cross.x<0||cross.y<0||cross.x>overlayBounds.width||cross.y>overlayBounds.height)throw Error('Drawing is outside this screen.');
      const point=screen.dipToScreenPoint({x:Math.round(overlayBounds.x+cross.x),y:Math.round(overlayBounds.y+cross.y)});
      plan=validate({title:'Close the Edge tab under your X',explanation:'Only Microsoft Edge tabs can be closed. Doodle Do cannot close itself.',confidence:1,source:'gesture',latencyMs:0,actions:[{type:'close_tab',value:`${point.x}:${point.y}`}]});pending=plan;
    } else plan=await processDrawing({...options,image:args.image,strokes:args.strokes});
    if(stopped)throw Error('Drawing recognition stopped.');
    win.webContents.send('plan',plan);
    const results=await executePlan(options,true);win.webContents.send('progress',results.join('\n'));return results;
  }catch(e){reportError(e);throw e;}
});
ipcMain.handle('stop', stop);
app.on('window-all-closed', () => app.quit());
app.on('before-quit',()=>{app.isQuitting=true;});
app.on('will-quit', () => { stop(); native.close(); globalShortcut.unregisterAll(); });
