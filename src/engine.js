// Motore di gioco condiviso, senza dipendenze Node.js / Socket.IO.
export const W=1200,H=740,R=23,LIMIT=8,ROUND_MS=90000;
export const COLORS=['#ffce57','#ff658b','#73e5ff','#9a8cff','#7ef0aa','#ffa36c','#ed8aff','#f5f57d'];
export const BUMPERS=[{x:315,y:225,r:41},{x:885,y:225,r:41},{x:315,y:515,r:41},{x:885,y:515,r:41}];
export const OIL=[{x:595,y:168,r:49},{x:605,y:572,r:49},{x:165,y:367,r:37},{x:1035,y:367,r:37}];
export const PADS=[{x:480,y:365,r:36},{x:720,y:365,r:36}];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const random=(a,b)=>a+Math.random()*(b-a);
const dist2=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2;
export const safeInput=data=>{
  const input=['up','down','left','right','boost','blast'].reduce((a,k)=>(a[k]=data?.[k]===true,a),{});
  // Sterzo analogico opzionale: i vecchi client con frecce/WASD funzionano comunque.
  if(typeof data?.steer==='number'&&Number.isFinite(data.steer))input.steer=clamp(data.steer,-1,1);
  return input;
};
export function makeRoom(code){return {code,players:new Map(),hostId:null,phase:'lobby',countdownEnds:0,matchEnds:0,
  donut:{x:600,y:370,ownerId:null,lockUntil:0},candies:[],nextCandy:0,pickupId:0};}
function respawnCandy(room){
  for(let i=0;i<50;i++){
    const c={id:++room.pickupId,x:random(82,W-82),y:random(86,H-86)};
    if(BUMPERS.some(b=>dist2(c,b)<(b.r+48)**2))continue;
    if(OIL.some(o=>dist2(c,o)<(o.r+23)**2))continue;
    if(room.candies.some(v=>dist2(c,v)<90**2))continue;
    room.candies.push(c);break;
  }
}
// Posizioni di partenza lontane dalle pozzanghere d'olio e dai respingenti.
// In precedenza il primo giocatore nasceva già su una chiazza d'olio!
const STARTS=[[450,255],[750,485],[550,275],[650,465],[450,475],[750,265],[550,465],[650,275]];
export function spawn(p,i,total){
  const [x,y]=STARTS[i%STARTS.length];
  p.x=x;p.y=y;p.angle=Math.atan2(H/2-y,W/2-x);
  p.speed=0;p.kx=0;p.ky=0;p.boostUntil=0;p.boostReadyAt=0;
  p.blastAt=0;p.shieldUntil=0;p.blastReadyAt=0;p.input={};p.prevInput={};
}
export function startMatch(room,now=Date.now()){
  const ps=[...room.players.values()];ps.forEach((p,i)=>{spawn(p,i,ps.length);p.score=0;});
  room.phase='countdown';room.countdownEnds=now+3000;room.matchEnds=0;
  room.donut={x:600,y:370,ownerId:null,lockUntil:0};room.candies=[];
  for(let i=0;i<5;i++)respawnCandy(room);
  room.nextCandy=now+5500;
}
function transferDonut(room,id,now){
  if(now<room.donut.lockUntil||room.donut.ownerId===id||!room.players.has(id))return false;
  room.donut.ownerId=id;room.donut.lockUntil=now+850;return true;
}
function movePlayer(p,room,now,dt){
  const inp=p.input,up=!!inp.up,down=!!inp.down,left=!!inp.left,right=!!inp.right;
  if(inp.boost&&!p.prevInput.boost&&now>=p.boostReadyAt){
    p.boostUntil=now+950;p.boostReadyAt=now+5500;p.speed=Math.max(p.speed,265);
  }
  if(inp.blast&&!p.prevInput.blast&&now>=p.blastReadyAt){
    p.blastAt=now;p.blastReadyAt=now+6500;
    for(const other of room.players.values()){
      if(other.id===p.id)continue;
      const d=Math.hypot(other.x-p.x,other.y-p.y);
      if(d<146){
        const nx=(other.x-p.x)/(d||1),ny=(other.y-p.y)/(d||1);
        const force=590*(1-d/180);other.kx+=nx*force;other.ky+=ny*force;other.speed*=.65;
        if(room.donut.ownerId===other.id&&d<112&&other.shieldUntil<now)transferDonut(room,p.id,now);
      }
    }
  }
  p.prevInput={boost:!!inp.boost,blast:!!inp.blast};
  const boosting=now<p.boostUntil;
  if(up)p.speed+=(boosting?720:440)*dt;
  else if(down){
    // Prima frena completamente; continuando a premere si va in retromarcia.
    if(p.speed>0)p.speed=Math.max(0,p.speed-760*dt);
    else p.speed-=320*dt;
  }else p.speed*=Math.exp(-2.85*dt);
  p.speed=clamp(p.speed,-125,boosting?460:275);
  const steer=typeof inp.steer==='number'?inp.steer:Number(right)-Number(left);
  const steeringFactor=clamp(Math.abs(p.speed)/165,.28,1);
  p.angle+=steer*1.75*steeringFactor*(p.speed< -5?-1:1)*dt;
  if(OIL.some(o=>dist2(p,o)<(o.r+R-8)**2)){
    // L'olio resta un ostacolo divertente, ma non ribalta più continuamente lo sterzo.
    p.angle+=Math.sin(now/210+p.x)*dt*.55;p.speed*=Math.exp(-.35*dt);
  }
  if(PADS.some(b=>dist2(p,b)<(b.r+R)**2)&&Math.abs(p.speed)>50)
    p.speed=clamp(p.speed+120*dt,-155,boosting?540:350);
  p.x+=Math.cos(p.angle)*p.speed*dt+p.kx*dt;
  p.y+=Math.sin(p.angle)*p.speed*dt+p.ky*dt;
  p.kx*=Math.exp(-4.7*dt);p.ky*=Math.exp(-4.7*dt);
  if(p.x<R+17){p.x=R+17;p.speed*=-.45;p.kx=Math.abs(p.kx)*.4;}
  if(p.x>W-R-17){p.x=W-R-17;p.speed*=-.45;p.kx=-Math.abs(p.kx)*.4;}
  if(p.y<R+17){p.y=R+17;p.speed*=-.45;p.ky=Math.abs(p.ky)*.4;}
  if(p.y>H-R-17){p.y=H-R-17;p.speed*=-.45;p.ky=-Math.abs(p.ky)*.4;}
  for(const b of BUMPERS){
    const dx=p.x-b.x,dy=p.y-b.y,d=Math.hypot(dx,dy),min=R+b.r;
    if(d<min){const nx=dx/(d||1),ny=dy/(d||1);
      p.x=b.x+nx*min;p.y=b.y+ny*min;p.kx+=nx*115;p.ky+=ny*115;p.speed*=-.4;
    }
  }
}
export function tick(room,now,dt){
  if(room.phase==='countdown'&&now>=room.countdownEnds){room.phase='playing';room.matchEnds=now+ROUND_MS;}
  if(room.phase!=='playing')return;
  if(now>=room.matchEnds){room.phase='results';return;}
  const ps=[...room.players.values()];
  for(const p of ps)movePlayer(p,room,now,dt);
  for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
    const a=ps[i],b=ps[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    if(d<R*2){const nx=dx/(d||1),ny=dy/(d||1),push=(R*2-d)/2+.1;
      a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;
      const impact=clamp((Math.abs(a.speed)+Math.abs(b.speed))*.43,95,350);
      a.kx-=nx*impact;a.ky-=ny*impact;b.kx+=nx*impact;b.ky+=ny*impact;a.speed*=.68;b.speed*=.68;
      if(room.donut.ownerId===a.id&&b.shieldUntil<now)transferDonut(room,b.id,now);
      else if(room.donut.ownerId===b.id&&a.shieldUntil<now)transferDonut(room,a.id,now);
    }
  }
  if(room.donut.ownerId&&!room.players.has(room.donut.ownerId)){
    room.donut.ownerId=null;room.donut.x=600;room.donut.y=370;room.donut.lockUntil=now+500;
  }
  const owner=room.players.get(room.donut.ownerId);
  if(owner){room.donut.x=owner.x;room.donut.y=owner.y;owner.score+=dt*(room.matchEnds-now<20000?10:5);}
  else for(const p of ps)if(dist2(p,room.donut)<(R+22)**2&&transferDonut(room,p.id,now))break;
  for(let i=room.candies.length-1;i>=0;i--){
    const candy=room.candies[i];for(const p of ps)if(dist2(p,candy)<(R+17)**2){
      p.score+=5;room.candies.splice(i,1);break;
    }
  }
  if(now>room.nextCandy&&room.candies.length<7){respawnCandy(room);room.nextCandy=now+4200;}
}
export function snapshot(room,now=Date.now()){
  return {code:room.code,hostId:room.hostId,phase:room.phase,
    countdown:room.phase==='countdown'?Math.max(0,Math.ceil((room.countdownEnds-now)/1000)):0,
    remaining:room.phase==='playing'?Math.max(0,(room.matchEnds-now)/1000):room.phase==='results'?0:90,
    frenzy:room.phase==='playing'&&room.matchEnds-now<20000,
    players:[...room.players.values()].map(p=>({id:p.id,name:p.name,color:p.color,x:p.x,y:p.y,
      angle:p.angle,speed:p.speed,score:Math.floor(p.score),boostUntil:p.boostUntil,
      boostReadyAt:p.boostReadyAt,blastReadyAt:p.blastReadyAt,blastAt:p.blastAt,
      shieldUntil:p.shieldUntil})),donut:room.donut,candies:room.candies,serverNow:now};
}
export function saveRoom(room){return {...room,players:[...room.players.values()]};}
export function loadRoom(data,code){if(!data||!Array.isArray(data.players))return makeRoom(code);
  return {...makeRoom(code),...data,code,players:new Map(data.players.map(p=>[p.id,p]))};}
