// Deliberately small fast path: crossed straight strokes need no language model.
function recognizeX(strokes){
  if(!Array.isArray(strokes)||strokes.length!==2)return null;
  const lines=[];
  for(const stroke of strokes){
    const points=stroke.points;
    if(stroke.erase||!Array.isArray(points)||points.length<2||points.length>10000)return null;
    if(points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))return null;
    const a=points[0],b=points.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    if(Math.abs(dx)<8||Math.abs(dy)<8||length<15||Math.abs(dx/dy)>4||Math.abs(dy/dx)>4)return null;
    const error=points.reduce((sum,p)=>sum+Math.abs(dy*(p[0]-a[0])-dx*(p[1]-a[1]))/length,0)/points.length;
    if(error>length*.12)return null;
    lines.push({a,b,dx,dy});
  }
  const [p,q]=lines,den=p.dx*q.dy-p.dy*q.dx;
  if(!den||Math.sign(p.dx*p.dy)===Math.sign(q.dx*q.dy))return null;
  const x=q.a[0]-p.a[0],y=q.a[1]-p.a[1];
  const t=(x*q.dy-y*q.dx)/den,u=(x*p.dy-y*p.dx)/den;
  if(t<.15||t>.85||u<.15||u>.85)return null;
  return {x:p.a[0]+t*p.dx,y:p.a[1]+t*p.dy};
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
