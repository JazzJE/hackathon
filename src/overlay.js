const canvas=document.getElementById('ink'),ctx=canvas.getContext('2d');
let strokes=[],current=null,submitting=false;
function resize(){canvas.width=innerWidth;canvas.height=innerHeight;draw()}
function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=5;ctx.strokeStyle='#e3ff83';for(const s of strokes){ctx.beginPath();s.points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke()}}
canvas.onpointerdown=e=>{if(submitting)return;canvas.setPointerCapture(e.pointerId);current={points:[[e.clientX,e.clientY]]};strokes.push(current);draw()};
canvas.onpointermove=e=>{if(!current)return;current.points.push([e.clientX,e.clientY]);draw()};
canvas.onpointerup=canvas.onpointercancel=()=>{current=null};
function message(text){document.getElementById('message').textContent=text}
async function submit(){
  if(submitting)return;if(!strokes.length){message('Draw something first.');return}
  submitting=true;current=null;document.getElementById('run').disabled=true;
  // Crop to ink so a small screen gesture does not become a tiny full-desktop image.
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const s of strokes)for(const [px,py] of s.points){minX=Math.min(minX,px);minY=Math.min(minY,py);maxX=Math.max(maxX,px);maxY=Math.max(maxY,py);}
  const x=Math.max(0,minX-20),y=Math.max(0,minY-20),w=Math.min(canvas.width-x,maxX-x+20),h=Math.min(canvas.height-y,maxY-y+20);
  const output=document.createElement('canvas'),scale=Math.min(1,768/Math.max(w,h));output.width=Math.max(1,Math.round(w*scale));output.height=Math.max(1,Math.round(h*scale));
  const c=output.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,output.width,output.height);c.lineCap='round';c.lineJoin='round';c.lineWidth=4*scale;c.strokeStyle='#172018';
  for(const s of strokes){c.beginPath();s.points.forEach((p,i)=>i?c.lineTo((p[0]-x)*scale,(p[1]-y)*scale):c.moveTo((p[0]-x)*scale,(p[1]-y)*scale));c.stroke()}
  try{await window.doodle.overlaySubmit({image:output.toDataURL('image/png'),strokes});}catch(e){message(e.message);}
  finally{submitting=false;document.getElementById('run').disabled=false;}
}
document.getElementById('run').onclick=submit;
document.getElementById('undo').onclick=()=>{if(!submitting){strokes.pop();draw()}};
document.getElementById('clear').onclick=()=>{if(!submitting){strokes=[];draw()}};
document.getElementById('cancel').onclick=()=>window.doodle.overlayCancel();
document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();window.doodle.overlayCancel()}else if(e.key==='Enter'){e.preventDefault();submit()}else if(e.ctrlKey&&e.key==='z'&&!submitting){e.preventDefault();strokes.pop();current=null;draw()}});
window.doodle.onOverlayReset(()=>{strokes=[];current=null;submitting=false;document.getElementById('run').disabled=false;message('Draw anywhere. Press Enter when you’re done.');draw()});
window.addEventListener('resize',resize);resize();
