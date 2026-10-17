const el = id => document.getElementById(id);
const pad = el('overlayCanvas'), context = pad.getContext('2d');
let lines = [], future = [], activeLine = null, activePointer = null, selectedTool = 'pen', selectedInk = '#e14f35', sending = false;
function render() {
  window.doodleDrawing.paint(context,lines,pad.width,pad.height);
  el('overlayDone').disabled = sending || !lines.some(line => line.tool !== 'eraser');
  el('overlayUndo').disabled = sending || !lines.length;
  el('overlayClear').disabled = sending || !lines.length;
  el('overlayHint').disabled = sending;
  document.querySelectorAll('[data-overlay-color]').forEach(button=>button.disabled=sending);
}
function position(event) { const bounds = pad.getBoundingClientRect(); return [(event.clientX-bounds.left)*pad.width/bounds.width,(event.clientY-bounds.top)*pad.height/bounds.height]; }
pad.onpointerdown = event => {
  if (sending || activeLine || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault(); pad.setPointerCapture(event.pointerId); activePointer = event.pointerId;
  const start=position(event); future=[];
  activeLine = {tool:selectedTool,color:selectedInk,size:Number(el('overlaySize').value)*pad.width/window.innerWidth,points:['circle','box'].includes(selectedTool)?[start,start]:[start]}; lines.push(activeLine); render();
};
pad.onpointermove = event => { if (activeLine && activePointer === event.pointerId) { const point=position(event);
  if(['circle','box'].includes(activeLine.tool))activeLine.points[1]=point;
  else {const last=activeLine.points.at(-1);if(Math.hypot(point[0]-last[0],point[1]-last[1])<1)return;activeLine.points.push(point);}
  render(); } };
pad.onpointerup = pad.onpointercancel = pad.onlostpointercapture = event => { if (event.pointerId === activePointer) { activeLine = null; activePointer = null; } };
function tool(value) {
  selectedTool=value;
  for(const [id,name] of [['overlayPen','pen'],['overlayCircle','circle'],['overlayBox','box'],['overlayEraser','eraser']]){
    const selected=name===value;el(id).classList.toggle('selected',selected);el(id).setAttribute('aria-pressed',String(selected));
  }
}
for(const [id,name] of [['overlayPen','pen'],['overlayCircle','circle'],['overlayBox','box'],['overlayEraser','eraser']])el(id).onclick=()=>tool(name);
function ink(color) {
  selectedInk=color;
  document.querySelectorAll('[data-overlay-color]').forEach(button=>{
    const selected=button.dataset.overlayColor===color;
    button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
  });
}
document.querySelectorAll('[data-overlay-color]').forEach(button=>button.onclick=()=>{if(sending)return;ink(button.dataset.overlayColor);if(selectedTool==='eraser')tool('pen');});
el('overlayUndo').onclick=()=>{activeLine=null;if(lines.length)future.push(lines.pop());render();};
el('overlayClear').onclick=()=>{activeLine=null;lines=[];future=[];render();};
async function cancel() { if (!sending) await window.doodle.cancelOverlay(); }
el('overlayCancel').onclick = cancel;
document.addEventListener('keydown', event => {
  if(event.target.matches?.('input') && !((event.ctrlKey||event.metaKey)&&event.key==='Enter')){if(event.key==='Escape'){event.preventDefault();cancel();}return;}
  if (!sending&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&/^[1-5]$/.test(event.key)) {event.preventDefault();document.querySelectorAll('[data-overlay-color]')[Number(event.key)-1].click();}
  if (event.key === 'Tab') { event.preventDefault(); document.body.classList.toggle('controls-hidden'); }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !sending) { event.preventDefault(); el('overlayDone').click(); }
  if (event.key === 'Escape') { event.preventDefault(); cancel(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !sending) { event.preventDefault(); if(event.shiftKey){if(future.length)lines.push(future.pop());render();}else el('overlayUndo').click(); }
});
el('overlayDone').onclick = async () => {
  if (sending) return;
  const data = context.getImageData(0,0,pad.width,pad.height).data;
  if (!data.some((v,i) => i%4 === 3 && v > 0)) { el('overlayStatus').textContent = 'Add a little ink before calling the AI.'; return; }
  sending = true; activeLine = null; render();
  try { await window.doodle.completeOverlay({image:pad.toDataURL('image/png'),lines,hint:el('overlayHint').value}); }
  catch (e) { el('overlayStatus').textContent = e.message; sending = false; render(); }
};
window.doodle.overlayInfo().then(frame => {
  document.querySelector('.overlay-bar').title += ` · Done sends the captured desktop, drawing, desktop item and app names to ${frame.providerName} for review.`;
  el('desktopImage').src = frame.image;
  pad.width = frame.width; pad.height = frame.height;
  lines=frame.lines || []; el('overlayHint').value=frame.hint || '';
  const previousInk=lines.findLast(line=>line.tool!=='eraser')?.color;
  if(previousInk&&[...document.querySelectorAll('[data-overlay-color]')].some(button=>button.dataset.overlayColor===previousInk))ink(previousInk);
  render();
}).catch(e => { el('overlayStatus').textContent = e.message; });
