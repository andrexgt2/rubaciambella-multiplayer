// Geometria del circuito condivisa da client e server: il server decide giri e limiti pista.
export const WORLD={width:2600,height:1600};
export const ROAD_WIDTH=164;
export const LAP_COUNT=3;
export const RACE_LIMIT_MS=6*60*1000;
export const NODES=[
  [360,750],[385,485],[610,280],[980,250],[1220,385],
  [1450,410],[1710,260],[2040,265],[2320,470],
  [2290,755],[2110,905],[1930,805],[1750,930],
  [1880,1190],[1590,1370],[1220,1350],[980,1210],
  [760,1210],[560,1350],[320,1180],[285,970]
];
const lerp=(a,b,t)=>a+(b-a)*t;
const spline=(p0,p1,p2,p3,t)=>{
  const t2=t*t,t3=t2*t;
  return .5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3);
};
const pts=[];
for(let i=0;i<NODES.length;i++){
  for(let n=0;n<18;n++){
    const t=n/18,N=NODES.length;
    const a=NODES[(i-1+N)%N],b=NODES[i],c=NODES[(i+1)%N],d=NODES[(i+2)%N];
    pts.push({x:spline(a[0],b[0],c[0],d[0],t),y:spline(a[1],b[1],c[1],d[1],t)});
  }
}
let length=0;
export const SEGMENTS=pts.map((a,i)=>{
  const b=pts[(i+1)%pts.length],dx=b.x-a.x,dy=b.y-a.y;
  const len=Math.hypot(dx,dy);const seg={x:a.x,y:a.y,dx,dy,len,s:length,tx:dx/len,ty:dy/len};
  length+=len;
  return seg;
});
export const TRACK_LENGTH=length;
export const CENTERLINE=pts;
export function pointAt(s){
  s=((s%length)+length)%length;
  let lo=0,hi=SEGMENTS.length-1;
  while(lo<hi){const mid=(lo+hi+1)>>1;if(SEGMENTS[mid].s<=s)lo=mid;else hi=mid-1;}
  const p=SEGMENTS[lo],t=(s-p.s)/p.len;
  return {x:p.x+p.dx*t,y:p.y+p.dy*t,tx:p.tx,ty:p.ty,angle:Math.atan2(p.ty,p.tx)};
}
export function closestTrack(x,y){
  let d2=Infinity,best=null;
  for(const p of SEGMENTS){
    const t=Math.max(0,Math.min(1,((x-p.x)*p.dx+(y-p.y)*p.dy)/(p.len*p.len)));
    const qx=p.x+t*p.dx,qy=p.y+t*p.dy,dd=(x-qx)**2+(y-qy)**2;
    if(dd<d2){d2=dd;best={x:qx,y:qy,s:p.s+p.len*t,tx:p.tx,ty:p.ty,
      side:(x-qx)*(-p.ty)+(y-qy)*p.tx};}
  }
  best.distance=Math.sqrt(d2);return best;
}
export const checkpointS=[TRACK_LENGTH*.25,TRACK_LENGTH*.5,TRACK_LENGTH*.75,0];
export const startAt=pointAt(0);
export const sectors=checkpointS.map(s=>pointAt(s));
export function forwardDelta(a,b){
  let d=b-a;if(d>length/2)d-=length;if(d< -length/2)d+=length;return d;
}
