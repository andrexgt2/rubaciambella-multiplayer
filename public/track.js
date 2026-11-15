// Modello geometrico condiviso tra client e server.
// Gli omaggi ai circuiti reali conservano le proporzioni principali e sono adattamenti
// compatti da gioco, non planimetrie ufficiali o georeferenziate.
export const WORLD={width:2600,height:1600};
export const ROAD_WIDTH=164;
export const LAP_COUNT=3;
export const RACE_LIMIT_MS=6*60*1000;

export const TRACK_OPTIONS=Object.freeze([
  {id:'creste',name:'Circuito delle Creste',short:'LE CRESTE',detail:'Originale · misto'},
  {id:'monza',name:'Monza',short:'MONZA',detail:'Italia · rettilinei veloci'},
  {id:'spa',name:'Spa-Francorchamps',short:'SPA',detail:'Belgio · curve tecniche'},
  {id:'monaco',name:'Monaco',short:'MONACO',detail:'Principato · guida di precisione'},
  {id:'silverstone',name:'Silverstone',short:'SILVERSTONE',detail:'Regno Unito · curve veloci'}
]);
export const sanitizeTrackId=id=>TRACK_OPTIONS.some(t=>t.id===id)?id:'creste';

const ORIGINAL_NODES=[
  [360,750],[385,485],[610,280],[980,250],[1220,385],
  [1450,410],[1710,260],[2040,265],[2320,470],
  [2290,755],[2110,905],[1930,805],[1750,930],
  [1880,1190],[1590,1370],[1220,1350],[980,1210],
  [760,1210],[560,1350],[320,1180],[285,970]
];
// Centrolinee disegnate a mano sulla base delle forme dei tracciati:
// Monza: Rettifilo, Curva Grande, Lesmo, Serraglio, Ascari, Parabolica.
// Spa: La Source, Eau Rouge/Raidillon, Kemmel, Les Combes,
// Pouhon, Stavelot, Blanchimont, Bus Stop.
const SHAPES={
  creste:ORIGINAL_NODES,
  monza:[
    [1730,1290],[1430,1290],[1120,1290],[820,1290],[540,1280],
    [380,1180],[320,1040],[360,880],[405,730],[460,630],
    [445,530],[400,425],[445,325],[585,275],[730,265],
    [860,350],[980,460],[1080,560],[1250,715],[1480,875],
    [1610,905],[1740,855],[1830,905],[1940,955],
    [2170,975],[2390,980],[2490,1070],[2470,1220],
    [2340,1335],[2110,1380],[1880,1335]
  ],
  spa:[
    [540,1160],[450,1165],[355,1070],[350,920],[450,760],
    [590,540],[790,340],[1050,185],[1350,170],[1640,170],
    [1900,200],[2140,320],[2170,440],[2070,510],[1900,450],
    [1780,540],[1740,665],[1780,790],[2000,800],[2230,840],
    [2310,940],[2280,1070],[2160,1210],[1980,1240],
    [1800,1110],[1600,990],[1440,915],[1250,920],
    [1060,1050],[885,1160],[700,1295]
  ],
  // Ricostruzioni stilizzate e allargate per la giocabilita' della monoposto.
  // Monaco: Sainte Devote, salita al Casino, Grand Hotel, tunnel,
  // chicane del porto, Piscine, Rascasse.
  monaco:[
    [330,1120],[235,1195],[160,1140],[200,970],[290,785],[390,600],
    [530,390],[730,235],[900,165],[1030,260],[1180,365],
    [1370,465],[1530,580],[1670,700],[1800,735],[1880,690],
    [1930,520],[1940,390],[2080,340],[2300,330],[2420,435],
    [2310,570],[2260,710],[2440,740],[2460,840],
    [2250,1010],[2050,1120],[1810,1165],[1550,1130],
    [1320,1045],[1100,955],[875,830],[720,730],
    [610,790],[550,920],[470,1030],[410,1090]
  ],
  // Silverstone: Copse, Maggotts/Becketts, Hangar, Stowe e Club.
  silverstone:[
    [370,420],[350,270],[460,180],[600,220],[680,350],[720,520],
    [740,660],[830,760],[930,795],[1050,740],[1160,620],
    [1360,420],[1560,240],[1690,190],[1790,240],[1820,330],
    [1740,450],[1620,565],[1750,700],[1960,750],
    [2110,760],[2250,940],[2270,1180],[2130,1320],
    [1840,1380],[1570,1370],[1310,1375],[1140,1430],[1010,1390],
    [840,1430],[710,1380],[590,1430],[440,1370],
    [300,1280],[190,1080],[200,870],[300,700],[390,560]
  ]
};
function fitProportionally(nodes){
  const xs=nodes.map(n=>n[0]),ys=nodes.map(n=>n[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  // Il fattore e' IDENTICO su entrambi gli assi: non deformiamo il layout.
  const factor=Math.min(2030/(maxX-minX),1150/(maxY-minY));
  const ox=(WORLD.width-(maxX-minX)*factor)/2,oy=(WORLD.height-(maxY-minY)*factor)/2;
  return nodes.map(([x,y])=>[ox+(x-minX)*factor,oy+(y-minY)*factor]);
}
const spline=(p0,p1,p2,p3,t)=>{
  const t2=t*t,t3=t2*t;
  return .5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3);
};
function makeGeometry(id){
  const nodes=id==='creste'?ORIGINAL_NODES:fitProportionally(SHAPES[id]);
  const points=[];
  for(let i=0;i<nodes.length;i++)for(let j=0;j<18;j++){
    const t=j/18,N=nodes.length;
    const a=nodes[(i-1+N)%N],b=nodes[i],c=nodes[(i+1)%N],d=nodes[(i+2)%N];
    points.push({x:spline(a[0],b[0],c[0],d[0],t),y:spline(a[1],b[1],c[1],d[1],t)});
  }
  let length=0;
  const segments=points.map((a,i)=>{
    const b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    const seg={x:a.x,y:a.y,dx,dy,len,s:length,tx:dx/len,ty:dy/len};
    length+=len;return seg;
  });
  function pointAt(s){
    s=((s%length)+length)%length;
    let lo=0,hi=segments.length-1;
    while(lo<hi){const mid=(lo+hi+1)>>1;if(segments[mid].s<=s)lo=mid;else hi=mid-1;}
    const p=segments[lo],t=(s-p.s)/p.len;
    return {x:p.x+p.dx*t,y:p.y+p.dy*t,tx:p.tx,ty:p.ty,angle:Math.atan2(p.ty,p.tx)};
  }
  function closestTrack(x,y){
    let d2=Infinity,best=null;
    for(const p of segments){
      const t=Math.max(0,Math.min(1,((x-p.x)*p.dx+(y-p.y)*p.dy)/(p.len*p.len)));
      const qx=p.x+t*p.dx,qy=p.y+t*p.dy,dd=(x-qx)**2+(y-qy)**2;
      if(dd<d2){d2=dd;best={x:qx,y:qy,s:p.s+p.len*t,tx:p.tx,ty:p.ty,
        side:(x-qx)*(-p.ty)+(y-qy)*p.tx};}
    }
    best.distance=Math.sqrt(d2);return best;
  }
  function forwardDelta(a,b){
    let d=b-a;if(d>length/2)d-=length;if(d< -length/2)d+=length;return d;
  }
  const checkpointS=[length*.25,length*.5,length*.75,0];
  return {id,world:WORLD,roadWidth:ROAD_WIDTH,nodes,centerline:points,segments,
    length,pointAt,closestTrack,forwardDelta,checkpointS,
    startAt:pointAt(0),sectors:checkpointS.map(s=>pointAt(s))};
}
const geometries=new Map(TRACK_OPTIONS.map(t=>[t.id,makeGeometry(t.id)]));
export const getTrack=id=>geometries.get(sanitizeTrackId(id));

// Compatibilita' con le API del tracciato originale e i test esistenti.
const original=getTrack('creste');
export const NODES=ORIGINAL_NODES;
export const CENTERLINE=original.centerline;
export const SEGMENTS=original.segments;
export const TRACK_LENGTH=original.length;
export const pointAt=original.pointAt;
export const closestTrack=original.closestTrack;
export const forwardDelta=original.forwardDelta;
export const checkpointS=original.checkpointS;
export const startAt=original.startAt;
export const sectors=original.sectors;
