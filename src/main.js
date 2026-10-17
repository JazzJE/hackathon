const { app, BrowserWindow, ipcMain, globalShortcut, screen, desktopCapturer, systemPreferences, shell } = require('electron');
const path = require('node:path');
const { interpret, validate, commandFor, runCommand, terminate, arrangeCommand, supportedApps } = require('./agent');
let win, pending = null, active = null, stopped = false, busy = false, controller = null;
const {desktopInventory, trashDesktopItems, trashNames, clickCommand, layoutFrom, layoutRect} = require('./desktop');
let overlay = null, capturedFrame = null, pendingFrame = null, openingOverlay = false, overlayHotkeyAvailable = false, overlaySubmitted = false;
const platform = process.platform;
const settings = {key:process.env.OPENAI_API_KEY || '', model:'gpt-4.1-mini', shell:false, install:false};
let shortcutAvailable = false;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1440, height: 1000, minWidth: 960, minHeight: 720, backgroundColor: '#f8f5ef', webPreferences: { preload: path.join(__dirname,'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.loadFile(path.join(__dirname,'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  overlayHotkeyAvailable = globalShortcut.register('CommandOrControl+Shift+D', () => {
    if (overlay) cancelOverlay();
    else openOverlay().catch(e => { win.restore(); win.show(); win.webContents.send('overlay-error',e.message); });
  });
  shortcutAvailable = globalShortcut.register('CommandOrControl+Alt+Backspace', stop);
  if (process.env.DOODLE_SMOKE === '1') win.webContents.once('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(require('node:fs').readFileSync(path.join(__dirname,'../test/fixtures/smoke.txt'),'utf8'));
      console.log('SMOKE',JSON.stringify(result));
      await win.webContents.executeJavaScript('document.activeElement.blur(); window.scrollTo(0,0)');
      await pause(100);
      await openOverlay();
      const overlayResult = await overlay.webContents.executeJavaScript(require('node:fs').readFileSync(path.join(__dirname,'../test/fixtures/overlay-smoke.txt'),'utf8'));
      console.log('OVERLAY_SMOKE',JSON.stringify(overlayResult));
      if (process.env.DOODLE_OVERLAY_SCREENSHOT) require('node:fs').writeFileSync(process.env.DOODLE_OVERLAY_SCREENSHOT,(await overlay.webContents.capturePage()).toPNG());
      const originalFetch = global.fetch, originalKey = settings.key;
      try {
        settings.key = 'smoke-placeholder';
        global.fetch = async (url, options) => {
          const body = JSON.parse(options.body);
          if (url !== 'https://api.openai.com/v1/responses' || body.input[0].content.length !== 3) throw Error('Overlay must send scene + drawing together.');
          return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({title:'Split screen, drawn by hand',explanation:'Chrome on the left. Spotify on the right. A fixture plan for the automated rehearsal.',confidence:.95,actions:[{type:'arrange_app',value:'{"app":"chrome","x":0,"y":0,"width":500,"height":1000}'},{type:'arrange_app',value:'{"app":"spotify","x":500,"y":0,"width":500,"height":1000}'}]})}]}]})};
        };
        await overlay.webContents.executeJavaScript("document.getElementById('overlayDone').click()");
        const completed = await win.webContents.executeJavaScript(require('node:fs').readFileSync(path.join(__dirname,'../test/fixtures/complete-smoke.txt'),'utf8'));
        console.log('COMPLETE_SMOKE',JSON.stringify(completed));
      } finally { global.fetch = originalFetch; settings.key = originalKey; }
      await win.webContents.executeJavaScript('document.activeElement.blur(); window.scrollTo(0,0)');
      await pause(100);
      if (process.env.DOODLE_SCREENSHOT) require('node:fs').writeFileSync(process.env.DOODLE_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
      app.exit(0);
    } catch(e) { console.error(e); app.exit(1); }
  });
});
function stop() { if (overlay) cancelOverlay(); stopped = true; pending = null; controller?.abort(); terminate(active); }
function available() { if (busy || openingOverlay || overlay) throw Error('Finish or stop the current request first.'); }
function info() { return {platform,hasKey:!!settings.key,model:settings.model,shell:settings.shell,install:settings.install,shortcutAvailable,overlayHotkeyAvailable}; }
ipcMain.handle('info', info);
ipcMain.handle('settings', (_, args = {}) => {
  available();
  if (args.forgetKey) settings.key = '';
  else if (typeof args.key === 'string' && args.key.trim()) settings.key = args.key.trim();
  if (typeof args.model === 'string' && args.model.trim()) settings.model = args.model.trim().slice(0,100);
  settings.shell = platform === 'win32' && args.shell === true;
  settings.install = platform === 'win32' && args.install === true;
  pending = null; pendingFrame = null;
  return info();
});
ipcMain.handle('invalidate', () => { pending = null; pendingFrame = null; });
ipcMain.handle('interpret', async (_, args = {}) => {
  available();
  const frame = args.overlay === true ? capturedFrame : null; capturedFrame = null; pendingFrame = null;
  if (args.overlay === true && !frame) throw Error('Open the desktop canvas and draw again.');
  busy = true; stopped = false; pending = null; controller = new AbortController();
  try {
    const plan = await interpret({image:args.image,hint:args.hint,...settings,allowShell:!frame && settings.shell,platform,signal:controller.signal,desktop:frame ? {image:frame.image,names:[...frame.inventory.keys()]} : undefined});
    if (stopped) throw Error('Interpretation cancelled. Your drawing is still here.');
    pending = plan; pendingFrame = frame;
    return plan;
  } catch (e) {
    if (controller.signal.aborted) throw Error('Interpretation cancelled. Your drawing is still here.');
    throw e;
  } finally { busy = false; controller = null; }
});
ipcMain.handle('demo', (_, name) => {
  available();
  const demos = {
    tab: {title:'Close the current tab',explanation:'One tab. One very decisive X. I see a browser tab ready for retirement.',confidence:1,actions:[{type:'keys',value:'close_tab'}]},
    music: {title:'Open Spotify',explanation:'A circle with three little sound waves. Your masterpiece has a soundtrack.',confidence:1,actions:[{type:'open_app',value:'spotify'}]},
    note: {title:platform === 'darwin' ? 'Open TextEdit' : 'Open Notepad',explanation:'A page full of lines. A blank document would like to meet you.',confidence:1,actions:[{type:'open_app',value:'notepad'}]},
    compass: {title:platform === 'darwin' ? 'Open Safari' : 'Open your browser',explanation:'A compass pointing toward the internet. An unnecessarily artistic way to browse.',confidence:1,actions:[platform === 'darwin' ? {type:'open_app',value:'safari'} : {type:'open_url',value:'https://www.google.com'}]}
  };
  if (!Object.hasOwn(demos,name)) throw Error('Unknown demo.');
  pendingFrame = null; capturedFrame = null;
  pending = validate(demos[name], platform);
  return pending;
});
ipcMain.handle('execute', async (_, options = {}) => {
  available();
  if (!pending) throw Error('Interpret this drawing again before running it.');
  const plan = validate(pending, platform);
  if (!plan.actions.length || plan.confidence < .65) throw Error('Drawing is unclear. Add a detail and try again.');
  const frame = pendingFrame;
  if (plan.actions.some(a => ['click','trash_files','arrange_app'].includes(a.type)) && !frame) throw Error('This plan needs a fresh desktop capture.');
  const rehearsal = options.rehearsal !== false;
  if (!rehearsal && frame) {
    const display = screen.getAllDisplays().find(d => d.id === frame.displayId);
    if (Date.now()-frame.createdAt > 120000 || !display || ['x','y','width','height'].some(k => display.bounds[k] !== frame.bounds[k])) throw Error('The desktop capture expired or the display changed. Draw over the desktop again.');
  }
  if (!rehearsal && !['win32','darwin'].includes(platform)) throw Error('Real actions require Windows or macOS.');
  if (!rehearsal && plan.actions.some(a => a.type === 'shell') && !settings.shell) throw Error('Enable full computer control and interpret again.');
  pending = null; pendingFrame = null; busy = true; stopped = false;
  const results = [];
  try {
    if (!rehearsal) { win.minimize(); await pause(900); }
    for (let i = 0; i < plan.actions.length; i++) {
      if (stopped) throw Error('Stopped. Completed actions stay completed.');
      const action = plan.actions[i];
      win.webContents.send('progress', {index:i,total:plan.actions.length,rehearsal});
      if (rehearsal) { await pause(550); results.push(`Previewed ${action.type}: ${action.value}`); }
      else if (action.type === 'trash_files') { results.push(await trashDesktopItems(trashNames(action.value),frame,file => shell.trashItem(file),() => stopped)); }
      else {
        let command;
        if (action.type === 'click') command = clickCommand(action.value,frame.bounds,platform,point => platform === 'win32' ? screen.dipToScreenPoint(point) : point);
        else if (action.type === 'arrange_app') {
          const layout = layoutFrom(action.value,supportedApps(platform));
          const rect = layoutRect(layout,frame.bounds);
          const area = frame.workArea;
          rect.x = Math.max(rect.x,area.x); rect.y = Math.max(rect.y,area.y);
          rect.width = Math.min(rect.width,area.x+area.width-rect.x); rect.height = Math.min(rect.height,area.y+area.height-rect.y);
          command = arrangeCommand(layout,platform === 'win32' ? screen.dipToScreenRect(null,rect) : rect,platform,settings.install);
        } else command = commandFor(action,{platform,install:settings.install});
        results.push(await runCommand(command,child => {active = child;})); active = null;
        if (action.type === 'click') await pause(250);
      }
    }
    if (stopped) throw Error('Stopped. Completed actions stay completed.');
    if (rehearsal) { pending = plan; pendingFrame = frame; }
    return {results,rehearsal};
  } catch (e) {
    if (stopped) throw Error('Stopped. Completed actions stay completed.');
    throw e;
  } finally {
    busy = false; active = null;
    if (!win.isDestroyed() && !rehearsal) { win.restore(); win.focus(); }
  }
});
// One display per capture: coordinates stay tied to its bounds, including negative origins.
async function openOverlay() {
  available();
  if (!['darwin','win32'].includes(platform)) throw Error('The desktop canvas supports Windows and macOS.');
  openingOverlay = true; overlaySubmitted = false; pending = null; pendingFrame = null; capturedFrame = null;
  try {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    if (process.env.DOODLE_SMOKE !== '1' && platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') === 'denied') throw Error('Enable Screen Recording for Doodle Do / Electron in System Settings → Privacy & Security, then restart the app.');
    let image;
    if (process.env.DOODLE_SMOKE === '1') image = await win.webContents.capturePage();
    win.hide(); await pause(250);
    if (!image) {
      const width = Math.min(1920,display.bounds.width);
      const sources = await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width,height:Math.round(width*display.bounds.height/display.bounds.width)}});
      const source = sources.find(s => s.display_id === String(display.id));
      if (!source || source.thumbnail.isEmpty()) throw Error('Could not capture this display. Check Screen Recording permission and try again.');
      image = source.thumbnail;
    }
    const size = image.getSize(), directory = app.getPath('desktop');
    capturedFrame = {image:`data:image/jpeg;base64,${image.toJPEG(85).toString('base64')}`,width:size.width,height:size.height,bounds:{...display.bounds},workArea:{...display.workArea},displayId:display.id,createdAt:Date.now(),directory,inventory:process.env.DOODLE_SMOKE === '1' ? new Map() : await desktopInventory(directory)};
    overlay = new BrowserWindow({...display.bounds,frame:false,transparent:true,resizable:false,movable:false,hasShadow:false,alwaysOnTop:true,skipTaskbar:true,show:false,enableLargerThanScreen:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    overlay.setAlwaysOnTop(true,'screen-saver');
    overlay.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
    overlay.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    overlay.webContents.on('will-navigate',e => e.preventDefault());
    overlay.on('closed',() => {
      overlay = null;
      if (!overlaySubmitted) { capturedFrame = null; if (!win.isDestroyed()) { win.show(); win.focus(); } }
    });
    await overlay.loadFile(path.join(__dirname,'overlay.html'));
    overlay.setBounds(display.bounds); overlay.show(); overlay.focus();
  } catch (e) {
    capturedFrame = null;
    if (overlay) overlay.close();
    win.show(); win.focus(); throw e;
  } finally { openingOverlay = false; }
}
function cancelOverlay() {
  capturedFrame = null;
  if (overlay) overlay.close();
  win.show(); win.focus(); win.webContents.send('overlay-cancelled');
}
function requireOverlay(event) {
  if (!overlay || event.sender.id !== overlay.webContents.id) throw Error('This request must come from the desktop canvas.');
}
ipcMain.handle('open-overlay',openOverlay);
ipcMain.handle('overlay-info',event => {
  requireOverlay(event);
  if (!capturedFrame) throw Error('Capture expired.');
  return {image:capturedFrame.image,width:capturedFrame.width,height:capturedFrame.height};
});
ipcMain.handle('cancel-overlay',event => { requireOverlay(event); cancelOverlay(); });
ipcMain.handle('complete-overlay',(event,args = {}) => {
  requireOverlay(event);
  if (!capturedFrame || typeof args.image !== 'string' || !args.image.startsWith('data:image/png;base64,') || args.image.length > 8000000) throw Error('Invalid desktop drawing.');
  const preview = capturedFrame.image;
  overlaySubmitted = true; overlay.close(); win.show(); win.focus();
  win.webContents.send('overlay-drawing',{image:args.image,preview});
});
ipcMain.handle('stop', stop);
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { stop(); globalShortcut.unregisterAll(); });
