import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {WORLD,ROAD_WIDTH,TRACK_LENGTH,LAP_COUNT,pointAt,closestTrack,forwardDelta} from '../public/track.js';
import {makeRoom,spawn,startMatch,tick,safeInput,standings,snapshot,saveRoom,loadRoom,advanceGates} from '../src/engine.js';
import {GameRoom} from '../src/index.js';
import worker from '../src/index.js';

globalThis.crypto??={randomUUID};
class FakeSocket{
  constructor(){this.attachment=null;this.messages=[];this.closed=false;}
  serializeAttachment(value){this.attachment=value;}
  deserializeAttachment(){return this.attachment;}
  send(message){this.messages.push(JSON.parse(message));}
  close(){this.closed=true;}
  last(type){return this.messages.filter(p=>p.type===type).at(-1);}
}
class FakeCtx{
  constructor(db=new Map(),live=[]){
    this.db=db;this.live=live;this.promises=[];
    this.storage={get:async k=>db.get(k),put:async (k,v)=>db.set(k,structuredClone(v)),delete:async k=>db.delete(k)};
  }
  blockConcurrencyWhile(fn){this.ready=Promise.resolve().then(fn);}
  getWebSockets(){return this.live;}
  acceptWebSocket(s){this.live.push(s);}
  waitUntil(p){this.promises.push(p);}
  async flush(){await Promise.all(this.promises.splice(0));}
}
const message=(r,ws,x)=>r.webSocketMessage(ws,JSON.stringify(x));

test('circuito chiuso: spline, tangenti, limiti e coordinate coerenti',()=>{
  assert(TRACK_LENGTH>4500&&TRACK_LENGTH<8500);
  for(let s=0;s<TRACK_LENGTH;s+=40){
    const p=pointAt(s),near=closestTrack(p.x,p.y);
    assert(near.distance<.001);assert(Math.hypot(p.tx,p.ty)>.98);
    assert(p.x>50&&p.y>50&&p.x<WORLD.width-50&&p.y<WORLD.height-50);
  }
  assert(Math.abs(forwardDelta(TRACK_LENGTH-3,5)-8)<1e-6);
});

test('controlli analogici sanitizzati e frenata stabile',()=>{
  assert.deepEqual(safeInput({steer:100,gas:1,brake:true}),{steer:1,gas:false,brake:true});
  assert.deepEqual(safeInput({steer:-.45,gas:true,brake:false}),{steer:-.45,gas:true,brake:false});
  const room=makeRoom('ABC234'),p={id:'a',name:'Test',color:'#ffcd44'};
  room.players.set(p.id,p);startMatch(room,1000);tick(room,5000,.05);
  assert.equal(room.phase,'racing');
  const start={x:p.x,y:p.y};
  for(let n=0;n<25;n++){const now=5010+n*45;p.input=safeInput({gas:true,steer:.18});p.lastInputAt=now;tick(room,now,.045);}
  assert(p.speed>80);assert(Math.hypot(p.x-start.x,p.y-start.y)>20);
  assert(Math.abs(p.angle)>0.05);
  const before=p.speed;
  for(let n=0;n<12;n++){const now=7000+n*45;p.input=safeInput({brake:true});p.lastInputAt=now;tick(room,now,.045);}
  assert(p.speed<before,'il freno deve ridurre la velocità');
});

test('barriere pista: l’auto non può tagliare fuori dal circuito',()=>{
  const room=makeRoom('ABC234'),p={id:'a',name:'Test',color:'#fff'};
  room.players.set(p.id,p);startMatch(room,1000);tick(room,5001,.05);
  const c=pointAt(600);p.x=c.x-c.ty*(ROAD_WIDTH/2+240);p.y=c.y+c.tx*(ROAD_WIDTH/2+240);
  p.input=safeInput({gas:true});p.lastInputAt=5050;tick(room,5050,.05);
  assert(closestTrack(p.x,p.y).distance<=ROAD_WIDTH/2+33.5);
  assert(p.hits>0);
});

test('tre giri: checkpoint sequenziali, giro validato e classifica finale',()=>{
  const p={id:'a',progress:100,nextGate:1,laps:0,lapStartedAt:1000,lastLap:0,bestLap:0,finishedAt:0};
  const segment=TRACK_LENGTH/4;
  // Non è possibile saltare un checkpoint passando soltanto sul traguardo.
  p.progress=TRACK_LENGTH-5;advanceGates(p,7,3000);assert.equal(p.laps,0);
  for(let lap=0;lap<LAP_COUNT;lap++){
    for(let gate=1;gate<=4;gate++){
      const cross=gate===4?TRACK_LENGTH:segment*gate;
      p.progress=(cross-6+TRACK_LENGTH)%TRACK_LENGTH;
      advanceGates(p,(cross+6)%TRACK_LENGTH,4000+lap*65000+gate*10000);
    }
    assert.equal(p.laps,lap+1);
  }
  assert(p.finishedAt>0);assert(p.lastLap>0);
  const room=makeRoom('ABC234');const slower={...p,id:'b',laps:1,finishedAt:0};
  room.players.set(p.id,p);room.players.set(slower.id,slower);
  assert.equal(standings(room)[0].id,p.id);
});

test('Durable Object: stanza multiplayer, host, join in corsa e rivincita',async()=>{
  const ctx=new FakeCtx(),r=new GameRoom(ctx,{});await ctx.ready;r.room.code='ABC234';
  const a=new FakeSocket(),b=new FakeSocket();message(r,a,{type:'join',name:'A'});message(r,b,{type:'join',name:'B'});
  assert.equal(r.room.players.size,2);assert.equal(r.room.hostId,a.attachment.id);
  message(r,b,{type:'start'});assert.equal(r.room.phase,'lobby');
  message(r,a,{type:'start'});assert.equal(r.room.phase,'countdown');
  const c=new FakeSocket();message(r,c,{type:'join',name:'C'});
  assert.equal(r.room.players.get(c.attachment.id).spectator,true);
  r.stopLoop();tick(r.room,Date.now()+4100,.05);
  assert.equal(r.room.phase,'racing');
  message(r,a,{type:'input',keys:{gas:true,steer:.5}});
  assert.equal(r.room.players.get(a.attachment.id).input.steer,.5);
  const state=snapshot(r.room);assert.equal(state.players.length,3);
  tick(r.room,r.room.raceEnds+1,.05);assert.equal(r.room.phase,'results');
  message(r,a,{type:'start'});r.stopLoop();assert.equal(r.room.phase,'countdown');
  assert.equal(r.room.players.get(c.attachment.id).spectator,false);
  await ctx.flush();
});

test('reconnect mobile: ripristina posto, tempi e identità del pilota',async()=>{
  const ctx=new FakeCtx(),r=new GameRoom(ctx,{});await ctx.ready;r.room.code='ABC234';
  const a=new FakeSocket();message(r,a,{type:'join',name:'Pilota'});
  const savedId=a.attachment.id,token=a.last('joined').resumeToken;
  r.webSocketClose(a);assert.equal(r.room.players.size,1);
  assert(r.room.players.get(savedId).disconnectedAt>0);
  const b=new FakeSocket();message(r,b,{type:'join',name:'Pilota',resume:token});
  assert.equal(b.attachment.id,savedId);assert.equal(r.room.players.size,1);
  assert.equal(r.room.players.get(savedId).disconnectedAt,0);
  r.stopLoop();await ctx.flush();
  const ctx2=new FakeCtx(ctx.db,[b]),r2=new GameRoom(ctx2,{});await ctx2.ready;
  assert.equal(r2.room.players.size,1);
  r2.stopLoop();
});

test('limite 8 piloti, nuova versione storage, API health e assets',async()=>{
  const ctx=new FakeCtx(),r=new GameRoom(ctx,{});await ctx.ready;r.room.code='ABC234';
  const sockets=[];for(let i=0;i<8;i++){const ws=new FakeSocket();message(r,ws,{type:'join',name:'P'+i});sockets.push(ws);}
  const ninth=new FakeSocket();message(r,ninth,{type:'join',name:'P9'});
  assert.equal(r.room.players.size,8);assert.equal(ninth.last('join_error').type,'join_error');
  assert.equal(loadRoom({players:[],version:4},'ABC234').phase,'lobby');
  assert.equal(loadRoom(saveRoom(r.room),'ABC234').players.size,8);
  const env={ASSETS:{fetch:async()=>new Response('STATIC')}};
  const health=await worker.fetch(new Request('https://game.test/api/health'),env);
  assert.equal((await health.json()).version,6);
  const page=await worker.fetch(new Request('https://game.test/'),env);assert.equal(await page.text(),'STATIC');
  const err=await worker.fetch(new Request('https://game.test/api/room/ABC123'),env);assert.equal(err.status,400);
  r.stopLoop();await ctx.flush();
});


test('record server-side: giri validi, ordinamento e persistenza globale tra stanze e restart',async()=>{
  const boardStorage=new Map(),boardCtx=new FakeCtx(boardStorage),board=new GameRoom(boardCtx,{});
  await boardCtx.ready;
  const namespace={idFromName:name=>name,get:()=>({fetch:req=>board.fetch(req)})};
  const env={GAME_ROOMS:namespace,ASSETS:{fetch:async()=>new Response('STATIC')}};
  const boardUrl='https://internal/internal/records';
  const report=(name,ms)=>board.fetch(new Request(boardUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,ms})}));
  assert.equal((await report('GiroFalso',3000)).status,400,'scarta tempi impossibili');
  const roomCtx=new FakeCtx(),race=new GameRoom(roomCtx,env);await roomCtx.ready;
  const ws=new FakeSocket();message(race,ws,{type:'join',name:'Luna'});race.room.code='ABC234';
  const p=race.room.players.get(ws.attachment.id);
  p.laps=1;p.lastLap=67000;p.recordedLaps=0;p.finishedAt=Date.now();race.room.phase='racing';
  race.room.startedAt=Date.now()-80000;race.room.raceEnds=Date.now()+50000;
  race.step();race.stopLoop();await roomCtx.flush();
  let result=await worker.fetch(new Request('https://game.test/api/leaderboard'),env);
  assert.equal(result.status,200);
  assert.deepEqual((await result.json()).records.map(r=>[r.name,r.ms]),[['Luna',67000]]);
  await report('Luna',69000);await report('Nico',62000);await report('Luna',61000);
  result=await worker.fetch(new Request('https://game.test/api/leaderboard'),env);
  assert.deepEqual((await result.json()).records.map(r=>[r.name,r.ms]),[['Luna',61000],['Nico',62000]]);
  assert.equal((await worker.fetch(new Request('https://game.test/api/leaderboard',{method:'POST'}),env)).status,405);
  const rebootCtx=new FakeCtx(boardStorage),reboot=new GameRoom(rebootCtx,{});await rebootCtx.ready;
  const data=await reboot.fetch(new Request(boardUrl));
  assert.deepEqual((await data.json()).records.map(r=>r.ms),[61000,62000]);
  race.stopLoop();reboot.stopLoop();board.stopLoop();
});

test('classifica: massimo 20 piloti, nessuna collisione di nomi con maiuscole e parità migliori tempi',async()=>{
  const ctx=new FakeCtx(),board=new GameRoom(ctx,{});await ctx.ready;
  const post=(name,ms)=>board.fetch(new Request('https://internal/internal/records',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,ms})
  }));
  await Promise.all(Array.from({length:26},(_,i)=>post('Pilot'+i,40000+i*1000)));
  let records=(await (await board.fetch(new Request('https://internal/internal/records'))).json()).records;
  assert.equal(records.length,20);assert.equal(records[0].name,'Pilot0');assert.equal(records.at(-1).name,'Pilot19');
  await post('PILOT0',39000);records=(await (await board.fetch(new Request('https://internal/internal/records'))).json()).records;
  assert.equal(records.length,20);assert.equal(records[0].ms,39000);
  assert.equal(records.filter(r=>r.key==='pilot0').length,1);
});

// V7: la marcia cambia nel motore autorevole, non in base a messaggi del browser.
test('trasmissione a sei rapporti: salita, scalata, calo RPM e nessun cambio ripetuto', async()=>{
  const {nextGear,rpmForSpeed,UPSHIFT_AT,DOWNSHIFT_BELOW}=await import('../public/transmission.js');
  assert.equal(UPSHIFT_AT.length,5);
  assert.equal(DOWNSHIFT_BELOW.length,6);
  assert.equal(nextGear(1,70),2);
  assert.equal(nextGear(2,128),3);
  assert.equal(nextGear(3,195),4);
  assert.equal(nextGear(4,269),5);
  assert.equal(nextGear(5,354),6);
  assert.equal(nextGear(6,438),6);
  assert.equal(nextGear(5,180),4);
  assert.equal(nextGear(3,60),2);
  assert.equal(nextGear(2,90),2,'isteresi evita il continuo passaggio tra due marce');
  assert(rpmForSpeed(1,69,true)>rpmForSpeed(2,70,true)+2500,'inserendo seconda il regime cala nettamente');
  assert(rpmForSpeed(5,350,true)>rpmForSpeed(6,354,true)+2000);
  const room=makeRoom('ABC234'),p={id:'a',name:'Marce',color:'#fff'};
  room.players.set(p.id,p);startMatch(room,1000);tick(room,5000,.05);
  p.speed=72;p.gear=1;p.input=safeInput({gas:true});p.lastInputAt=5050;
  tick(room,5050,.05);
  assert.equal(p.gear,2);assert.equal(p.shiftSeq,1);
  assert(p.shiftUntil>5050);
  const saved=snapshot(room,5050).players[0];
  assert.equal(saved.gear,2);assert.equal(saved.shiftSeq,1);assert(saved.rpm>=2800);
  tick(room,5100,.05);assert.equal(p.shiftSeq,1,'non cambia subito marcia una seconda volta');
});
