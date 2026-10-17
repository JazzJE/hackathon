const el = id => document.getElementById(id);
const pad = el('overlayCanvas'), context = pad.getContext('2d');
let lines = [], activeLine = null, activePointer = null, erase = false, sending = false;
function render() {
  context.clearRect(0,0,pad.width,pad.height);
  for (const line of lines) {
    context.globalCompositeOperation = line.erase ? 'destination-out' : 'source-over';
    context.beginPath(); context.strokeStyle = '#e14f35'; context.fillStyle = '#e14f35';
    context.lineWidth = line.size; context.lineJoin = 'round'; context.lineCap = 'round';
    line.points.forEach((p,i) => i ? context.lineTo(...p) : context.moveTo(...p));
    if (line.points.length === 1) { context.arc(...line.points[0],line.size/2,0,Math.PI*2); context.fill(); } else context.stroke();
  }
  context.globalCompositeOperation = 'source-over';
  el('overlayDone').disabled = sending || !lines.some(line => !line.erase);
  el('overlayUndo').disabled = sending || !lines.length;
  el('overlayClear').disabled = sending || !lines.length;
}
function position(event) { const bounds = pad.getBoundingClientRect(); return [(event.clientX-bounds.left)*pad.width/bounds.width,(event.clientY-bounds.top)*pad.height/bounds.height]; }
pad.onpointerdown = event => {
  if (sending || activeLine || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault(); pad.setPointerCapture(event.pointerId); activePointer = event.pointerId;
  activeLine = {erase,size:Number(el('overlaySize').value)*pad.width/window.innerWidth,points:[position(event)]}; lines.push(activeLine); render();
};
pad.onpointermove = event => { if (activeLine && activePointer === event.pointerId) { activeLine.points.push(position(event)); render(); } };
pad.onpointerup = pad.onpointercancel = pad.onlostpointercapture = event => { if (event.pointerId === activePointer) { activeLine = null; activePointer = null; } };
function tool(value) { erase = value; for (const id of ['overlayPen','overlayEraser']) { const selected = (id === 'overlayEraser') === value; el(id).classList.toggle('selected',selected); el(id).setAttribute('aria-pressed',String(selected)); } }
el('overlayPen').onclick = () => tool(false); el('overlayEraser').onclick = () => tool(true);
el('overlayUndo').onclick = () => { activeLine = null; lines.pop(); render(); };
el('overlayClear').onclick = () => { activeLine = null; lines = []; render(); };
async function cancel() { if (!sending) await window.doodle.cancelOverlay(); }
el('overlayCancel').onclick = cancel;
document.addEventListener('keydown', event => {
  if (event.key === 'Tab') { event.preventDefault(); document.body.classList.toggle('controls-hidden'); }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !sending) { event.preventDefault(); el('overlayDone').click(); }
  if (event.key === 'Escape') { event.preventDefault(); cancel(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !sending) { event.preventDefault(); el('overlayUndo').click(); }
});
el('overlayDone').onclick = async () => {
  if (sending) return;
  const data = context.getImageData(0,0,pad.width,pad.height).data;
  if (!data.some((v,i) => i%4 === 3 && v > 0)) { el('overlayStatus').textContent = 'Add a little ink before calling the AI.'; return; }
  sending = true; activeLine = null; render();
  try { await window.doodle.completeOverlay({image:pad.toDataURL('image/png')}); }
  catch (e) { el('overlayStatus').textContent = e.message; sending = false; render(); }
};
window.doodle.overlayInfo().then(frame => {
  el('desktopImage').src = frame.image;
  pad.width = frame.width; pad.height = frame.height;
  render();
}).catch(e => { el('overlayStatus').textContent = e.message; });
