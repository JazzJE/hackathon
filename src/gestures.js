// Screen-sized and one-stroke Xs should not have to go through the model.
function recognizeX(strokes){
  if(!Array.isArray(strokes)||strokes.length<1||strokes.length>8)return null;
  const candidates=[];
  const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1];return Math.abs(dy*(p[0]-a[0])-dx*(p[1]-a[1]))/(Math.hypot(dx,dy)||1)};
  function simplify(points,tolerance){
    if(points.length<3)return points;
    let far=0,index=0;for(let i=1;i<points.length-1;i++){const d=distance(points[i],points[0],points.at(-1));if(d>far){far=d;index=i}}
    if(far<=tolerance)return [points[0],points.at(-1)];
    return [...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)];
  }
  for(const stroke of strokes){
    const points=stroke.points;
    if(stroke.erase||!Array.isArray(points)||points.length<2||points.length>10000)return null;
    if(points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))return null;
    const a=points[0],b=points.at(-1),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const error=points.reduce((sum,p)=>sum+distance(p,a,b),0)/points.length;
    const corners=error<=length*.18?[a,b]:simplify(points,Math.max(1.2,length*.08));
    if(corners.length>10)return null;
    for(let i=1;i<corners.length;i++){
      const a=corners[i-1],b=corners[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
      if(Math.abs(dx)<2||Math.abs(dy)<2||length<5||Math.abs(dx/dy)>5||Math.abs(dy/dx)>5)continue;
      candidates.push({a,b,dx,dy,length});
    }
  }
  if(candidates.length<2||candidates.length>3)return null;
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
    const p=candidates[i],q=candidates[j],den=p.dx*q.dy-p.dy*q.dx;
    if(!den||Math.sign(p.dx*p.dy)===Math.sign(q.dx*q.dy)||Math.abs(den)/(p.length*q.length)<.3)continue;
    const x=q.a[0]-p.a[0],y=q.a[1]-p.a[1],t=(x*q.dy-y*q.dx)/den,u=(x*p.dy-y*p.dx)/den;
    if(t<.08||t>.92||u<.08||u>.92)continue;
    return {x:p.a[0]+t*p.dx,y:p.a[1]+t*p.dy};
  }
  return null;
}
function recognizeMoney(strokes){
  if(!Array.isArray(strokes)||strokes.length!==2)return false;
  const valid=strokes.every(s=>!s.erase&&Array.isArray(s.points)&&s.points.length>=2&&s.points.length<=10000&&s.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)));
  if(!valid)return false;
  for(let i=0;i<2;i++){
    const line=strokes[i].points,curve=strokes[1-i].points;if(curve.length<5)continue;
    const a=line[0],b=line.at(-1),height=Math.abs(b[1]-a[1]);
    if(height<35||Math.abs(b[0]-a[0])>height*.12)continue;
    const xs=curve.map(p=>p[0]),ys=curve.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),width=right-left,ch=bottom-top;
    if(width<15||ch<30||height<ch*.8)continue;
    const center=(a[0]+b[0])/2;
    if(center<left+width*.25||center>right-width*.25)continue;
    const sorted=curve[0][1]<curve.at(-1)[1]?curve:[...curve].reverse();
    if(sorted[0][0]<left+width*.55||sorted.at(-1)[0]>left+width*.45)continue;
    const upper=sorted.filter(p=>p[1]<top+ch*.45),lower=sorted.filter(p=>p[1]>top+ch*.55);
    if(upper.some(p=>p[0]<left+width*.25)&&lower.some(p=>p[0]>right-width*.25))return true;
  }
  return false;
}
module.exports={recognizeX,recognizeMoney};
