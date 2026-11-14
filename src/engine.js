import {WORLD, ROAD_WIDTH, TRACK_LENGTH, LAP_COUNT, RACE_LIMIT_MS, closestTrack,
  pointAt, forwardDelta, checkpointS} from '../public/track.js';

export const LIMIT=8;
export const COLORS=['#ffce45','#f95b71','#5de2ee','#9875ff','#64eb9d','#ff984c','#e7a6ff','#f5f4ec'];
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
export const safeInput=data=>({
  steer:clamp(Number.isFinite(data?.steer)?data.steer:
    (data?.right===true?1:0)-(data?.left===true?1:0),-1,1),
  gas:data?.gas===true||data?.up===true,
  brake:data?.brake===true||data?.down===true
});
export function makeRoom(code){return {version:5,code,hostId:null,phase:'lobby',players:new Map(),
  countdownEnds:0,startedAt:0,raceEnds:0,resultsAt:0,finishedOrder:[]};}
export function spawn(p,index=0){
  // Griglia reale a due colonne, con il muso diretto verso il primo rettilineo.
  const row=Math.floor(index/2),lane=index%2===0?-37:37;
  const pos=pointAt(260-row*68);
  p.x=pos.x-pos.ty*lane;p.y=pos.y+pos.tx*lane;p.angle=pos.angle;
  p.vx=0;p.vy=0;p.speed=0;p.input=safeInput({});p.lastInputAt=0;
  p.laps=0;p.nextGate=1;p.progress=closestTrack(p.x,p.y).s;
  p.lapStartedAt=0;p.bestLap=0;p.lastLap=0;p.finishedAt=0;p.recordedLaps=0;
  p.spectator=false;p.offroad=false;p.hits=0;
}
export function startMatch(room,now=Date.now()){
  const players=[...room.players.values()];
  players.forEach((p,i)=>spawn(p,i));
  room.phase='countdown';room.countdownEnds=now+4000;room.startedAt=0;
  room.raceEnds=0;room.resultsAt=0;room.finishedOrder=[];
}
function movePlayer(p,dt,now){
  const input=(now-(p.lastInputAt||0)<800)?p.input:safeInput({});
  const before=closestTrack(p.x,p.y);
  p.offroad=before.distance>ROAD_WIDTH*.5-9;
  const gripping=p.offroad?.55:1;
  const engine=330*gripping,brakes=510;
  if(input.gas&&!input.brake){p.speed+=engine*dt;}
  else if(input.brake){
    p.speed=p.speed>4?Math.max(0,p.speed-brakes*dt):p.speed-230*dt;
  } else {p.speed*=Math.exp(-1.25*dt);}
  const maximum=p.offroad?200:438;
  p.speed=clamp(p.speed,-100,maximum);
  if(Math.abs(p.speed)<1&&!input.gas&&!input.brake)p.speed=0;
  // Lo sterzo è analogico, progressivo, e non può ruotare l'auto da ferma.
  const steer=clamp(input.steer||0,-1,1);
  const turnRate=(.25+1.45*Math.min(1,Math.abs(p.speed)/205))*(p.speed< -3?-1:1);
  p.angle+=steer*turnRate*dt*(p.offroad?.78:1);
  // Grip laterale: niente scatti o giri sul posto. Una lieve deriva resta alle alte velocità.
  const grip=(p.offroad?3.5:8.5)/(1+Math.abs(p.speed)/1000);
  const desiredVX=Math.cos(p.angle)*p.speed,desiredVY=Math.sin(p.angle)*p.speed;
  const smoothing=1-Math.exp(-grip*dt);
  p.vx+=(desiredVX-p.vx)*smoothing;p.vy+=(desiredVY-p.vy)*smoothing;
  p.x+=p.vx*dt;p.y+=p.vy*dt;
  const nearest=closestTrack(p.x,p.y),barrier=ROAD_WIDTH*.5+33;
  if(nearest.distance>barrier){
    const nx=(p.x-nearest.x)/(nearest.distance||1),ny=(p.y-nearest.y)/(nearest.distance||1);
    p.x=nearest.x+nx*barrier;p.y=nearest.y+ny*barrier;
    const outward=p.vx*nx+p.vy*ny;
    if(outward>0){p.vx-=nx*outward*1.45;p.vy-=ny*outward*1.45;}
    p.speed*=.74;p.hits++;
  }
  p.x=clamp(p.x,40,WORLD.width-40);p.y=clamp(p.y,40,WORLD.height-40);
  const track=closestTrack(p.x,p.y);
  const delta=forwardDelta(p.progress,track.s);
  if(track.distance<=ROAD_WIDTH*.5+4&&delta>0&&delta<Math.max(70,Math.abs(p.speed)*dt*2.3)){
    advanceGates(p,track.s,now);
  }else p.progress=track.s;
}
// Avanzamento dei soli checkpoint in ordine. Si chiama dal motore dopo la validazione
// della distanza fisica percorsa; separato per testare ogni attraversamento di giro.
export function advanceGates(p,newProgress,now){
  const delta=forwardDelta(p.progress,newProgress);
  if(delta>0&&delta<TRACK_LENGTH/8){
    const target=checkpointS[p.nextGate-1];
    const distanceToGate=(target-p.progress+TRACK_LENGTH)%TRACK_LENGTH;
    if(distanceToGate<=delta+1){
      if(p.nextGate===4){
        p.laps++;
        const lapTime=now-(p.lapStartedAt||now);
        p.lastLap=lapTime;
        if(!p.bestLap||lapTime<p.bestLap)p.bestLap=lapTime;
        p.lapStartedAt=now;p.nextGate=1;
        if(p.laps>=LAP_COUNT)p.finishedAt=now;
      }else p.nextGate++;
    }
  }
  p.progress=newProgress;
}
function collisions(players){
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){
    const a=players[i],b=players[j];if(a.spectator||b.spectator||a.finishedAt||b.finishedAt)continue;
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),limit=43;
    if(d>=limit)continue;
    const nx=dx/(d||1),ny=dy/(d||1),overlap=(limit-d)/2+.1;
    a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;
    const push=Math.min(90,Math.max(22,(Math.abs(a.speed)+Math.abs(b.speed))*.16));
    a.vx-=nx*push;a.vy-=ny*push;b.vx+=nx*push;b.vy+=ny*push;
    a.speed*=.90;b.speed*=.90;a.hits++;b.hits++;
  }
}
export function standings(room){
  const racers=[...room.players.values()].filter(p=>!p.spectator);
  const value=p=>{
    if(p.finishedAt)return 1e9-p.finishedAt/1e10;
    const base=(p.nextGate-1)*TRACK_LENGTH/4;
    const max=(p.nextGate)*TRACK_LENGTH/4;
    const local=(p.nextGate===1&&p.progress>TRACK_LENGTH*.85)?0:clamp(p.progress,base,max);
    return p.laps*TRACK_LENGTH+local;
  };
  return racers.sort((a,b)=>{
    if(a.finishedAt&&b.finishedAt)return a.finishedAt-b.finishedAt;
    if(a.finishedAt)return -1;if(b.finishedAt)return 1;
    return value(b)-value(a);
  });
}
export function tick(room,now,dt){
  if(room.phase==='countdown'){
    if(now>=room.countdownEnds){room.phase='racing';room.startedAt=now;
      room.raceEnds=now+RACE_LIMIT_MS;
      for(const p of room.players.values())p.lapStartedAt=now;
    }else return;
  }
  if(room.phase!=='racing')return;
  const racers=[...room.players.values()].filter(p=>!p.spectator);
  for(const p of racers){if(!p.finishedAt)movePlayer(p,Math.min(dt,.07),now);}
  collisions(racers);
  room.finishedOrder=standings(room).filter(p=>p.finishedAt).map(p=>p.id);
  if(now>=room.raceEnds||(racers.length>0&&racers.every(p=>p.finishedAt))){
    room.phase='results';room.resultsAt=now;
  }
}
export function snapshot(room,now=Date.now()){
  const ranked=standings(room);
  return {code:room.code,hostId:room.hostId,phase:room.phase,
    lapsTotal:LAP_COUNT,serverNow:now,
    countdown:room.phase==='countdown'?Math.max(0,Math.ceil((room.countdownEnds-now)/1000)):0,
    elapsed:room.startedAt?Math.max(0,(now-room.startedAt)/1000):0,
    remaining:room.phase==='racing'?Math.max(0,(room.raceEnds-now)/1000):RACE_LIMIT_MS/1000,
    players:[...room.players.values()].map(p=>({id:p.id,name:p.name,color:p.color,
      x:p.x,y:p.y,angle:p.angle,speed:p.speed,vx:p.vx,vy:p.vy,laps:p.laps,
      nextGate:p.nextGate,progress:p.progress,lastLap:p.lastLap,bestLap:p.bestLap,
      finishedAt:p.finishedAt,hits:p.hits,spectator:p.spectator,offroad:p.offroad,connected:p.connected!==false,
      rank:p.spectator?null:ranked.indexOf(p)+1})),
    finishedOrder:room.finishedOrder};
}
export const saveRoom=room=>({...room,players:[...room.players.values()]});
export function loadRoom(data,code){
  if(!data||data.version!==5||!Array.isArray(data.players))return makeRoom(code);
  const room={...makeRoom(code),...data,code,players:new Map(data.players.map(p=>[p.id,p]))};
  return room;
}
