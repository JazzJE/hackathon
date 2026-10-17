const { app, BrowserWindow, ipcMain, globalShortcut, screen, shell } = require('electron');
const path = require('node:path');
const {createHash}=require('node:crypto');
const { interpret, validate, resolvePlan, powershell, scriptFor } = require('./agent');
const { ensureLocalAI, localStatus, warmLocal } = require('./local-ai');
const {NativeHost}=require('./native-host');
const {recognizeX,recognizeMoney}=require('./gestures');
const {JOKES,comedyPlan,topicFromHint}=require('./comedy');
const native=new NativeHost(),cache=new Map();
let win, overlay, overlayBounds, targetWindow=0, pending = null, active = null, stopped = false, busy = false, recognition = null;
let settings={provider:'local',model:'moondream:latest',key:'',shell:false,install:false,comedy:true};
const reactions=new Map();
const smokeMode = process.env.DOODLE_SMOKE === '1' || process.env.DOODLE_LOCAL_SMOKE === '1' || process.env.DOODLE_OVERLAY_SMOKE === '1' || process.env.DOODLE_COMEDY_SMOKE === '1';
if(smokeMode) app.setPath('userData',path.join(app.getPath('temp'),'doodle-do-smoke',String(process.pid)));
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1320, height: 900, minWidth: 960, minHeight: 720, backgroundColor: '#f5f3ed', webPreferences: { preload: path.join(__dirname,'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
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
          const args={image:out.toDataURL('image/png'),provider:'local',model:'moondream:latest',comedy:true};
          const first=await window.doodle.interpret(args);showPlan(first);
          const second=await window.doodle.interpret(args);
          return {topic:first.topic,url:first.actions[0]?.value,firstMs:Math.round(first.latencyMs),repeatMs:Math.round(second.latencyMs),repeatSource:second.source};
        })()`);
        if(result.topic!=='money'||result.url!=='https://crypto.com/'||result.repeatSource!=='cache')throw Error('Money interpretation failed: '+JSON.stringify(result));
        console.log('COMEDY_SMOKE',JSON.stringify(result));
        const reaction=showReaction('money');await new Promise(r=>reaction.webContents.once('did-finish-load',r));await new Promise(r=>setTimeout(r,150));
        if(process.env.DOODLE_SCREENSHOT)require('node:fs').writeFileSync(process.env.DOODLE_SCREENSHOT,(await reaction.webContents.capturePage()).toPNG());
      }
      if(process.env.DOODLE_OVERLAY_SMOKE === '1'){
        const bounds=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
        const testWindow=new BrowserWindow({x:bounds.x+100,y:bounds.y+100,width:700,height:400,frame:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});
        await testWindow.loadURL('data:text/html,'+encodeURIComponent('<body style="margin:0;background:#eee"><div style="position:absolute;left:100px;top:100px;width:300px;height:80px;background:#d8ed8c" onauxclick="if(event.button===1){window.hit=true;event.preventDefault()}">Test tab · middle click here</div></body>'));
        testWindow.show();testWindow.focus();await new Promise(r=>setTimeout(r,250));
        await showOverlay();
        const x=bounds.x+350-overlayBounds.x,y=bounds.y+240-overlayBounds.y;
        await overlay.webContents.executeJavaScript(`strokes=[{points:[[${x-15},${y-15}],[${x+15},${y+15}]]},{points:[[${x+15},${y-15}],[${x-15},${y+15}]]}];draw();`);
        await new Promise(r=>setTimeout(r,100));
        if(process.env.DOODLE_SCREENSHOT)require('node:fs').writeFileSync(process.env.DOODLE_SCREENSHOT,(await overlay.webContents.capturePage()).toPNG());
        const start=performance.now();await overlay.webContents.executeJavaScript('submit()');
        await new Promise(r=>setTimeout(r,150));
        if(!await testWindow.webContents.executeJavaScript('window.hit===true'))throw Error('Overlay middle-click missed the drawn position');
        console.log('OVERLAY_SMOKE',JSON.stringify({dimmed:true,targetedMiddleClick:true,elapsedMs:Math.round(performance.now()-start),scaleFactor:screen.getDisplayMatching(bounds).scaleFactor}));
        testWindow.close();
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
  settings={provider:args.provider==='openai'?'openai':'local',model:String(args.model||'moondream:latest').slice(0,200),key:String(args.key||''),shell:!!args.shell,install:!!args.install,comedy:args.comedy!==false};
  if(settings.provider==='local'&&!smokeMode)warmLocal(settings.model).catch(()=>{});
});
ipcMain.handle('local-status', (_, model) => localStatus(typeof model === 'string' ? model.slice(0,200) : undefined));
async function processDrawing(args) {
  if(busy) throw Error('An action or drawing recognition is still running.');
  pending=null; busy=true; recognition=new AbortController();
  try {
    const start=performance.now();
    const hintedTopic=args.comedy?topicFromHint(args.hint):null;
    if(hintedTopic){pending={...comedyPlan(hintedTopic),source:'hint',latencyMs:performance.now()-start};return pending;}
    if(args.comedy&&!args.hint&&recognizeMoney(args.strokes)){pending={...comedyPlan('money'),source:'gesture',latencyMs:performance.now()-start};return pending;}
    if(!args.hint && recognizeX(args.strokes)){
      pending={title:'Close tab',explanation:'Instant X gesture. No model needed.',confidence:1,source:'gesture',latencyMs:performance.now()-start,actions:[{type:'keys',value:'close_tab'}]};return pending;
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
    if(!pending.fallback){if(cache.size>=32)cache.delete(cache.keys().next().value);cache.set(cacheKey,pending);}
    return pending;
  } finally { busy=false; recognition=null; }
}
ipcMain.handle('interpret', (_,args)=>processDrawing(args));
ipcMain.handle('demo', (_, name) => { if(busy) throw Error('An action is still running.'); const demos = { money:comedyPlan('money'), tab: {title:'Close the current tab',explanation:'A browser tab with a big X. Goodbye, tab.',confidence:1,actions:[{type:'keys',value:'close_tab'}]}, music: {title:'Open Spotify',explanation:'Three curved lines in a circle. Time for music.',confidence:1,actions:[{type:'open_app',value:'spotify'}]}, note: {title:'Open Notepad',explanation:'A little page for your next big idea.',confidence:1,actions:[{type:'open_app',value:'notepad'}]} }; if(!demos[name]) throw Error('Unknown demo'); pending = validate(demos[name]); return pending; });
async function executePlan(options,fromOverlay=false) {
  if(busy || !pending) throw Error('Interpret a drawing first.');
  const plan = validate(pending); pending = null;
  if(!plan.actions.length) throw Error('No action is available. Draw again.');
  if(plan.actions.some(a => a.type === 'shell') && !options.shell) throw Error('Enable full computer control to run PowerShell actions.');
  busy = true; stopped = false; const results = [];
  try {
    if(fromOverlay){if(targetWindow)await native.call('focus',{handle:targetWindow});}
    else win.minimize();
    await new Promise(r => setTimeout(r, 120));
    for(const action of plan.actions) {
      if(stopped) throw Error('Stopped.');
      win.webContents.send('progress', `Running ${action.type}: ${action.value.slice(0,100)}`);
      if(action.type==='keys')results.push(await native.call('keys',{value:action.value}));
      else if(action.type==='click'){const [button,x,y]=action.value.split(':');results.push(await native.call('click',{button,x:Number(x),y:Number(y)}));}
      else if(action.type==='open_url'){await shell.openExternal(action.value);results.push('Done.');}
      else results.push(await powershell(scriptFor(action, options.install), child => { active = child; })); active = null;
    }
    if(plan.comedy)showReaction(plan.topic);
    return results;
  } finally { busy = false; active = null; if(!fromOverlay&&!plan.comedy){win.restore(); win.focus();} }
}
function showReaction(topic){
  const joke=JOKES[topic]||JOKES.chaos,bounds=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const reaction=new BrowserWindow({width:610,height:175,x:Math.round(bounds.x+(bounds.width-610)/2),y:bounds.y+30,frame:false,resizable:false,alwaysOnTop:true,skipTaskbar:true,backgroundColor:'#dcf39c',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  reactions.set(reaction.webContents.id,joke);reaction.loadFile(path.join(__dirname,'reaction.html'));
  reaction.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const id=reaction.webContents.id;reaction.on('closed',()=>reactions.delete(id));
  setTimeout(()=>{if(!reaction.isDestroyed())reaction.close()},5500);
  return reaction;
}
ipcMain.handle('reaction-data',event=>reactions.get(event.sender.id)||JOKES.chaos);
ipcMain.handle('execute',(_,options)=>executePlan(options));
ipcMain.handle('overlay-submit',async(event,args)=>{
  if(event.sender!==overlay.webContents||!overlay.isVisible()||busy)throw Error('Overlay is not ready.');
  const options={...settings};
  const cross=recognizeX(args.strokes);
  overlay.hide();
  try{
    let plan;
    if(cross){
      if(cross.x<0||cross.y<0||cross.x>overlayBounds.width||cross.y>overlayBounds.height)throw Error('Drawing is outside this screen.');
      const point=screen.dipToScreenPoint({x:Math.round(overlayBounds.x+cross.x),y:Math.round(overlayBounds.y+cross.y)});
      plan=validate({title:'Close the tab under your X',explanation:'Middle-click the tab at the exact drawing position. No model wait.',confidence:1,source:'gesture',latencyMs:0,actions:[{type:'click',value:`middle:${point.x}:${point.y}`}]});pending=plan;
    } else plan=await processDrawing({...options,image:args.image,strokes:args.strokes});
    win.webContents.send('plan',plan);
    const results=await executePlan(options,true);win.webContents.send('progress',results.join('\n'));return results;
  }catch(e){reportError(e);throw e;}
});
ipcMain.handle('stop', stop);
app.on('window-all-closed', () => app.quit());
app.on('before-quit',()=>{app.isQuitting=true;});
app.on('will-quit', () => { stop(); native.close(); globalShortcut.unregisterAll(); });
