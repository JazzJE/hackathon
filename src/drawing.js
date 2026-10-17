(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.doodleDrawing=factory();
})(globalThis,()=>{
  function validateLines(lines,width,height) {
    if(!Array.isArray(lines)||lines.length>1000)throw Error('This drawing has too many strokes.');
    let total=0;
    return lines.map(line=>{
      if(!line||!['pen','circle','box','eraser'].includes(line.tool)||!Number.isFinite(line.size)||line.size<.5||line.size>200||!Array.isArray(line.points)||!line.points.length)throw Error('Invalid drawing stroke.');
      if(line.color!==undefined && (typeof line.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(line.color)))throw Error('Invalid ink color.');
      total+=line.points.length;
      if(total>80000)throw Error('This drawing has too many points. Undo a few strokes.');
      const points=line.points.map(point=>{
        if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||point[0]<-width||point[0]>width*2||point[1]<-height||point[1]>height*2)throw Error('Invalid drawing coordinates.');
        return [...point];
      });
      if(['circle','box'].includes(line.tool)&&points.length!==2)throw Error('Invalid shape.');
      return {tool:line.tool,size:line.size,points,...(line.color!==undefined?{color:line.color}:{})};
    });
  }
  function paint(context,lines,width,height) {
    context.clearRect(0,0,width,height);
    for(const line of lines){
      context.globalCompositeOperation=line.tool==='eraser'?'destination-out':'source-over';
      context.beginPath();context.strokeStyle=line.color||'#e14f35';context.fillStyle=line.color||'#e14f35';context.lineWidth=line.size;context.lineJoin='round';context.lineCap='round';
      if(line.tool==='circle'||line.tool==='box'){
        const [a,b]=line.points,x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]),w=Math.abs(a[0]-b[0]),h=Math.abs(a[1]-b[1]);
        if(line.tool==='box')context.rect(x,y,w,h);
        else context.ellipse(x+w/2,y+h/2,Math.max(w/2,.1),Math.max(h/2,.1),0,0,Math.PI*2);
        context.stroke();
      }else{
        line.points.forEach((point,i)=>i?context.lineTo(...point):context.moveTo(...point));
        if(line.points.length===1){context.arc(...line.points[0],line.size/2,0,Math.PI*2);context.fill();}else context.stroke();
      }
    }
    context.globalCompositeOperation='source-over';
  }
  return {validateLines,paint};
});
