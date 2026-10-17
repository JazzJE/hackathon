const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
let strokes = [], future = [], current = null, pointer = null, erasing = false, ink = '#293b50';
let busy = false, plan = null, source = '', guesses = 0, runs = 0, gallery = [], info = null;
let challengeTimer = null, challengeReady = false, seconds = 30;
const actionNames = {close_tab:'Close the current tab',new_tab:'Open a new tab',undo:'Undo',redo:'Redo',save:'Save',copy:'Copy',paste:'Paste',select_all:'Select all',switch_window:'Switch windows',show_desktop:'Show the desktop',volume_up:'Turn volume up',volume_down:'Turn volume down',mute:'Toggle mute'};
function appName(value) { return ({safari:'Safari',chrome:'Google Chrome',firefox:'Firefox',spotify:'Spotify',discord:'Discord',vscode:'Visual Studio Code',vlc:'VLC',notepad:info?.platform === 'darwin' ? 'TextEdit' : 'Notepad',calculator:'Calculator',paint:'Paint',explorer:info?.platform === 'darwin' ? 'Finder' : 'File Explorer'})[value] || value; }
function actionLabel(action) {
  if (action.type === 'open_app') return `Open ${appName(action.value)}`;
  if (action.type === 'open_url') return `Open ${new URL(action.value).hostname}`;
  if (action.type === 'keys') return actionNames[action.value];
  if (action.type === 'click') return 'Click the marked screen target';
  if (action.type === 'trash_files') return `Move ${JSON.parse(action.value).length} desktop item(s) to Trash`;
  if (action.type === 'arrange_app') { const r = JSON.parse(action.value); return `Open & place ${appName(r.app)} · ${Math.round(r.width/10)}% × ${Math.round(r.height/10)}% of screen`; }
  return 'Run a PowerShell script';
}
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function redraw() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for (const stroke of strokes) {
    ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
    ctx.beginPath(); ctx.strokeStyle = stroke.color || '#293b50'; ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = stroke.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    stroke.points.forEach((p,i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
    if (stroke.points.length === 1) { ctx.arc(...stroke.points[0],stroke.size/2,0,Math.PI*2); ctx.fill(); }
    else ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  $('placeholder').hidden = strokes.length > 0;
  $('strokeLabel').textContent = strokes.length ? `${strokes.length} stroke${strokes.length === 1 ? '' : 's'} of genius` : 'A fresh start';
  syncControls();
}
function syncControls() {
  $('interpret').disabled = busy || !strokes.length;
  $('execute').disabled = busy || !plan || plan.confidence < .65 || !plan.actions.length;
  $('undo').disabled = busy || !strokes.length;
  $('redo').disabled = busy || !future.length;
  $('clear').disabled = busy || !strokes.length;
  $('stop').disabled = !busy;
  ['openDesktop','hint','rehearsal','settingsButton','newChallenge','dismissChallenge','pen','eraser','size'].forEach(id => $(id).disabled = busy);
  document.querySelectorAll('[data-demo], [data-color], .gallery-item').forEach(b => b.disabled = busy);
  canvas.setAttribute('aria-disabled', String(busy));
}
function invalidate() {
  const hadPlan = !!plan;
  plan = null;
  $('desktopPreview').hidden = true; $('backToSketchpad').hidden = true; $('desktopPreviewBackground').removeAttribute('src'); $('desktopPreviewSketch').removeAttribute('src');
  $('reviewCapture').hidden = true; $('captureBackground').removeAttribute('src'); $('captureSketch').removeAttribute('src'); $('captureTargets').replaceChildren();
  window.doodle.invalidate().catch(() => {});
  if (hadPlan) {
    $('planCard').dataset.state = 'idle'; $('planBadge').textContent = 'SKETCH CHANGED';
    $('planTitle').textContent = 'A new plot twist.';
    $('explanation').textContent = 'Your drawing or settings changed. Read the doodle again to make a fresh plan.';
    $('actions').replaceChildren(); $('planMeta').hidden = true; $('targetNote').hidden = true;
    status('New strokes, new possibilities. Interpret again when ready.');
  }
  syncControls();
}
function point(event) { const r = canvas.getBoundingClientRect(); return [(event.clientX-r.left)*canvas.width/r.width,(event.clientY-r.top)*canvas.height/r.height]; }
canvas.onpointerdown = event => {
  if (busy || current || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault(); canvas.setPointerCapture(event.pointerId); pointer = event.pointerId;
  invalidate(); future = [];
  current = {erase:erasing,color:ink,size:Number($('size').value)*2,points:[point(event)]}; strokes.push(current);
  if (challengeReady) startTimer();
  redraw();
};
canvas.onpointermove = event => {
  if (!current || event.pointerId !== pointer) return;
  const p = point(event), last = current.points.at(-1);
  if (Math.hypot(p[0]-last[0],p[1]-last[1]) < 1) return;
  current.points.push(p); redraw();
};
canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = event => { if (event.pointerId === pointer) { current = null; pointer = null; } };
function selectTool(erase) {
  erasing = erase;
  for (const id of ['pen','eraser']) { const selected = (id === 'eraser') === erase; $(id).classList.toggle('selected',selected); $(id).setAttribute('aria-pressed',String(selected)); }
  canvas.classList.toggle('erasing',erase);
}
$('pen').onclick = () => selectTool(false);
$('eraser').onclick = () => selectTool(true);
document.querySelectorAll('[data-color]').forEach(button => button.onclick = () => {
  ink = button.dataset.color; selectTool(false);
  document.querySelectorAll('[data-color]').forEach(b => { b.classList.toggle('selected',b === button); b.setAttribute('aria-pressed',String(b === button)); });
});
$('undo').onclick = () => { if (busy || !strokes.length) return; current = null; future.push(strokes.pop()); invalidate(); redraw(); };
$('redo').onclick = () => { if (busy || current || !future.length) return; current = null; strokes.push(future.pop()); invalidate(); redraw(); };
$('clear').onclick = () => { if (busy) return; current = null; strokes = []; future = []; invalidate(); redraw(); };
$('hint').oninput = invalidate;
document.addEventListener('keydown', event => {
  if (busy || $('settings').open || event.target.matches('input,textarea,button')) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); $(event.shiftKey ? 'redo' : 'undo').click(); }
  else if (!event.metaKey && !event.ctrlKey && !event.altKey) {
    if (event.key.toLowerCase() === 'b') selectTool(false);
    if (event.key.toLowerCase() === 'e') selectTool(true);
  }
});
function showPlan(p, origin) {
  plan = p; source = origin;
  $('planCard').dataset.state = p.confidence >= .65 && p.actions.length ? 'ready' : 'unclear';
  $('planBadge').textContent = p.confidence >= .65 && p.actions.length ? 'GUESS READY' : 'NEEDS A CLUE';
  $('planTitle').textContent = p.title; $('explanation').textContent = p.explanation;
  $('planMeta').hidden = false; $('sourceBadge').textContent = origin === 'demo' ? 'PRESET DEMO' : origin === 'desktop' ? 'DESKTOP + AI' : 'AI INTERPRETATION';
  $('confidence').textContent = `${Math.round(p.confidence*100)}% confident`;
  $('actions').replaceChildren();
  p.actions.forEach((action,i) => {
    const row = document.createElement('li'), num = document.createElement('span'), content = document.createElement('div'), title = document.createElement('strong');
    num.className = 'action-number'; num.textContent = String(i+1).padStart(2,'0'); title.textContent = actionLabel(action);
    content.append(title);
    if (['shell','open_url','click','trash_files','arrange_app'].includes(action.type)) { const detail = document.createElement('code'); detail.textContent = action.type === 'trash_files' ? JSON.parse(action.value).map(n => `• ${n}`).join('\n') : action.type === 'arrange_app' ? `Position: ${JSON.parse(action.value).x/10}% from left, ${JSON.parse(action.value).y/10}% from top` : action.type === 'click' ? `Target: ${action.value.split(',').map(n => Number(n)/10+'%').join(', ')}` : action.value; content.append(detail); }
    row.append(num,content); $('actions').append(row);
  });
  $('targetNote').hidden = origin !== 'desktop' && !p.actions.some(a => a.type === 'keys');
  $('targetNote').textContent = origin === 'desktop' ? 'Targets use the captured display. Keep windows in place. Capture expires after 2 minutes; apps may enforce minimum window sizes.' : 'Keyboard shortcuts go to the window behind Doodle Do. Put the intended app there first.';
  updateMode(); syncControls();
}
async function work(task, state) {
  if (busy) return;
  current = null; pointer = null; busy = true; syncControls();
  $('planCard').dataset.state = state; $('planCard').setAttribute('aria-busy','true');
  try { await task(); }
  catch (error) {
    $('planCard').dataset.state = 'error'; $('planBadge').textContent = 'LET’S TRY AGAIN';
    const message = error.message.replace(/^Error invoking remote method '[^']+': Error: /,'');
    status(message,true);
  } finally {
    busy = false; $('planCard').setAttribute('aria-busy','false'); syncControls();
    $('interpret').innerHTML = 'Read my doodle <span>↗</span>';
  }
}
function snapshot() {
  const image = document.createElement('canvas'); image.width = canvas.width; image.height = canvas.height;
  const context = image.getContext('2d'); context.fillStyle = '#fffefa'; context.fillRect(0,0,image.width,image.height); context.drawImage(canvas,0,0);
  return image;
}
function remember(p, origin) {
  const image = snapshot(), thumb = document.createElement('canvas'); thumb.width = 280; thumb.height = 160; thumb.getContext('2d').drawImage(image,0,0,280,160);
  gallery.unshift({strokes:structuredClone(strokes),hint:$('hint').value,title:p.title,source:origin,image:thumb.toDataURL()});
  gallery = gallery.slice(0,8); renderGallery();
}
function renderGallery() {
  $('gallerySection').hidden = !gallery.length; $('gallery').replaceChildren();
  gallery.forEach(entry => {
    const button = document.createElement('button'), image = document.createElement('img'), title = document.createElement('strong'), label = document.createElement('small');
    button.className = 'gallery-item'; image.src = entry.image; image.alt = entry.title;
    title.textContent = entry.title; label.textContent = `${entry.source === 'demo' ? 'PRESET DEMO' : 'AI GUESS'} · RESTORE SKETCH ↗`;
    button.append(image,title,label);
    button.onclick = () => { if (busy) return; endChallenge(); invalidate(); strokes = structuredClone(entry.strokes); future = []; $('hint').value = entry.hint; redraw(); status('Sketch restored. Read it again for a fresh interpretation.'); canvas.focus(); };
    $('gallery').append(button);
  });
}
$('interpret').onclick = () => work(async () => {
  const pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  if (!pixels.some((v,i) => i%4 === 3 && v > 0)) throw Error('A blank canvas is a bold statement. Add a little ink first.');
  invalidate(); $('planCard').dataset.state = 'thinking'; $('planBadge').textContent = 'READING THE ROOM'; $('planTitle').textContent = 'Connecting the questionable dots…';
  $('interpret').textContent = 'Deciphering…';
  const messages = ['Squinting at your masterpiece…','Consulting the department of wild guesses…','Turning artistic license into a plan…'];
  let tick = 0; status(messages[0]);
  const interval = setInterval(() => status(messages[++tick % messages.length]),3000);
  try {
    const p = await window.doodle.interpret({image:snapshot().toDataURL('image/png'),hint:$('hint').value});
    showPlan(p,'ai'); guesses++; $('guessCount').textContent = guesses; remember(p,'ai');
    status(p.confidence < .65 || !p.actions.length ? 'A little mysterious. Add a detail or a hint, then try again.' : 'That’s my best guess. Inspect the steps, then give it a go.');
  } finally { clearInterval(interval); }
},'thinking');
function updateMode() {
  const rehearsal = $('rehearsal').checked;
  const trashCount = plan?.actions.filter(a => a.type === 'trash_files').reduce((n,a) => n+JSON.parse(a.value).length,0) || 0;
  const liveLabel = trashCount ? `Move ${trashCount} item${trashCount === 1 ? '' : 's'} to Trash` : 'Do the actual thing';
  $('execute').innerHTML = `${rehearsal ? 'Rehearse this plan' : liveLabel} <span>↗</span>`;
  $('modeHelp').textContent = rehearsal ? 'Preview the plan. Keep your desktop as-is.' : 'Real desktop actions. Your sketch has power.';
  $('planCard').classList.toggle('live-mode',!rehearsal);
}
$('rehearsal').onchange = updateMode;
$('execute').onclick = () => work(async () => {
  $('planBadge').textContent = $('rehearsal').checked ? 'DRESS REHEARSAL' : 'MAKING IT HAPPEN';
  status($('rehearsal').checked ? 'Playing through the plan. No desktop actions…' : 'The sketchpad will minimize while your plan runs…');
  const reviewedPlan = plan;
  plan = null;
  const result = await window.doodle.execute({rehearsal:$('rehearsal').checked});
  if (result.rehearsal) plan = reviewedPlan;
  $('planCard').dataset.state = 'success'; $('planBadge').textContent = result.rehearsal ? 'REHEARSAL COMPLETE' : 'ART HAS CONSEQUENCES';
  $('actions').querySelectorAll('li').forEach(row => row.classList.add('done'));
  if (!result.rehearsal) { runs++; $('runCount').textContent = runs; }
  status(result.rehearsal ? 'A flawless rehearsal. Nothing on your desktop changed. Turn rehearsal off to run the reviewed plan for real.' : `You drew. The computer obeyed. ${result.results.join(' ')}`);
},'running');
$('stop').onclick = async () => { try { await window.doodle.stop(); status('Stop requested. Completed actions stay completed.'); } catch (e) { status(e.message,true); } };
window.doodle.onProgress(message => {
  $('actions').querySelectorAll('li').forEach((row,i) => { row.classList.toggle('active',i === message.index); row.classList.toggle('done',i < message.index); });
  status(`${message.rehearsal ? 'Previewing' : 'Running'} step ${message.index+1} of ${message.total}…`);
});
function drawDemo(name) {
  strokes = []; future = []; $('hint').value = '';
  const add = points => strokes.push({points,size:7,erase:false,color:'#293b50'});
  if (name === 'tab') { add([[400,530],[400,230],[1000,230],[1000,530],[400,530]]); add([[400,310],[1000,310]]); add([[900,250],[940,285]]); add([[940,250],[900,285]]); }
  else if (name === 'music' || name === 'compass') {
    add(Array.from({length:65},(_,i) => [700+190*Math.cos(i*Math.PI/32),390+190*Math.sin(i*Math.PI/32)]));
    if (name === 'music') for (let j = 0; j < 3; j++) add(Array.from({length:25},(_,i) => [570+i*10,345+j*65-25*Math.sin(i*Math.PI/24)]));
    else { add([[780,250],[730,420],[620,530],[670,360],[780,250]]); add([[670,360],[730,420]]); }
  } else { add([[540,200],[860,200],[860,580],[540,580],[540,200]]); for (let j = 0; j < 4; j++) add([[590,280+j*65],[810,280+j*65]]); }
  redraw();
}
document.querySelectorAll('[data-demo]').forEach(button => button.onclick = () => work(async () => {
  endChallenge(); invalidate(); drawDemo(button.dataset.demo);
  const p = await window.doodle.demo(button.dataset.demo); showPlan(p,'demo'); remember(p,'demo');
  status('Preset demo loaded — no AI recognition or API key needed. Rehearse it, or turn rehearsal off for real actions.');
},'thinking'));
const challenges = ['Draw a compass. Send your computer exploring.','Draw a speaker having a very quiet day.','Draw a calculator. Make arithmetic needlessly difficult.','Draw a browser tab that has overstayed its welcome.','Draw music without using a single musical note.','Draw somewhere to put your next brilliant idea.','Draw a magnifying glass. Go looking for something.','Draw two app logos with an arrow between them.'];
let lastChallenge = -1;
function endChallenge() { clearInterval(challengeTimer); challengeTimer = null; challengeReady = false; $('challenge').hidden = true; }
function startTimer() {
  challengeReady = false;
  challengeTimer = setInterval(() => {
    seconds--; $('timer').textContent = `0:${String(seconds).padStart(2,'0')}`;
    if (!seconds) { clearInterval(challengeTimer); challengeTimer = null; $('timer').textContent = 'Time!'; $('challengeText').textContent = 'Time’s up. Masterpiece or mess? Let the AI decide. Keep drawing if you like.'; }
  },1000);
}
$('newChallenge').onclick = () => {
  endChallenge();
  let index; do { index = Math.floor(Math.random()*challenges.length); } while (index === lastChallenge); lastChallenge = index;
  $('clear').click(); $('hint').value = ''; invalidate(); $('challengeText').textContent = challenges[index];
  $('challenge').hidden = false; $('timer').textContent = '0:30'; seconds = 30; challengeReady = true;
  status('Your 30 seconds start with the first stroke. Artistic merit is optional.'); canvas.focus();
};
$('dismissChallenge').onclick = endChallenge;
function applyInfo(state) {
  info = state;
  $('overlayHotkey').textContent = state.overlayHotkeyAvailable ? `${state.platform === 'darwin' ? '⌘' : 'Ctrl'} Shift D` : 'Hotkey unavailable';
  $('connection').textContent = state.hasKey ? 'AI key ready' : 'Demo ready · add a key for AI';
  $('connection').classList.toggle('connected',state.hasKey);
  $('model').value = state.model; $('shell').checked = state.shell; $('install').checked = state.install;
  $('keyState').textContent = state.hasKey ? 'Key set for this session' : 'No key set'; $('forgetKey').hidden = !state.hasKey;
  $('windowsOptions').hidden = state.platform !== 'win32'; $('macHelp').hidden = state.platform !== 'darwin';
  $('platformLabel').textContent = `${state.platform === 'darwin' ? 'MACOS' : state.platform === 'win32' ? 'WINDOWS' : 'REHEARSAL'} EDITION / 02`;
  $('noteLabel').textContent = `A little page → ${appName('notepad')}`;
  $('compassLabel').textContent = state.platform === 'darwin' ? 'A compass → Safari' : 'A compass → your browser';
  $('stopShortcut').textContent = state.shortcutAvailable ? `· ${state.platform === 'darwin' ? '⌘ Option' : 'Ctrl Alt'} Backspace` : '· global shortcut unavailable';
}
$('settingsButton').onclick = () => { $('settingsStatus').textContent = ''; $('settings').showModal(); };
$('closeSettings').onclick = () => $('settings').close();
$('settingsForm').onsubmit = async event => {
  event.preventDefault();
  try {
    applyInfo(await window.doodle.settings({key:$('key').value,model:$('model').value,shell:$('shell').checked,install:$('install').checked}));
    $('key').value = ''; invalidate(); $('settings').close(); status(info.hasKey ? 'All set. Draw something only you understand.' : 'Demo mode is ready. Add a key anytime for your own drawings.');
  } catch(e) { $('settingsStatus').textContent = e.message; }
};
$('forgetKey').onclick = async () => {
  try { applyInfo(await window.doodle.settings({forgetKey:true,model:$('model').value,shell:$('shell').checked,install:$('install').checked})); $('key').value = ''; invalidate(); }
  catch(e) { $('settingsStatus').textContent = e.message; }
};
$('openDesktop').onclick = async () => {
  if (busy) return;
  try { endChallenge(); invalidate(); status('Opening your desktop canvas…'); await window.doodle.openOverlay(); }
  catch (e) { status(e.message.replace(/^Error invoking remote method '[^']+': Error: /,''),true); }
};
window.doodle.onOverlayError(message => status(message,true));
window.doodle.onOverlayCancelled(() => status('Desktop drawing cancelled. Nothing was sent or executed.'));
$('backToSketchpad').onclick = () => { invalidate(); redraw(); canvas.focus(); };
$('desktopPreview').onclick = () => $('captureReview').showModal();
$('reviewCapture').onclick = () => $('captureReview').showModal();
$('closeCaptureReview').onclick = () => $('captureReview').close();
function markTargets(actions) {
  const svg = $('captureTargets'); svg.replaceChildren();
  for (const action of actions) {
    let shape;
    if (action.type === 'click') {
      const [x,y] = action.value.split(','); shape = document.createElementNS('http://www.w3.org/2000/svg','circle');
      shape.setAttribute('cx',x); shape.setAttribute('cy',y); shape.setAttribute('r','9');
    } else if (action.type === 'arrange_app') {
      const r = JSON.parse(action.value); shape = document.createElementNS('http://www.w3.org/2000/svg','rect');
      ['x','y','width','height'].forEach(k => shape.setAttribute(k,r[k]));
    }
    if (shape) svg.append(shape);
  }
}
window.doodle.onOverlayDrawing(args => work(async () => {
  invalidate(); strokes = []; future = []; redraw();
  $('planCard').dataset.state = 'thinking'; $('planBadge').textContent = 'READING YOUR DESKTOP';
  $('planTitle').textContent = 'A desktop with directions.';
  $('explanation').textContent = 'Matching your marks to the things underneath them…';
  status('Interpreting the captured desktop and your drawing…');
  const p = await window.doodle.interpret({image:args.image,overlay:true});
  showPlan(p,'desktop'); guesses++; $('guessCount').textContent = guesses;
  $('desktopPreviewBackground').src = args.preview; $('desktopPreviewSketch').src = args.image; $('desktopPreview').hidden = false; $('backToSketchpad').hidden = false;
  $('captureBackground').src = args.preview; $('captureSketch').src = args.image; markTargets(p.actions); $('reviewCapture').hidden = false;
  $('planCard').scrollIntoView({block:'nearest'});
  status(p.confidence < .65 || !p.actions.length ? 'The target needs a clearer mark. Open the desktop canvas to try again.' : 'Review the marked desktop and every action. Rehearse first, or turn rehearsal off to run.');
},'thinking'));
window.doodle.info().then(applyInfo).catch(e => status(e.message,true));
redraw(); updateMode();
