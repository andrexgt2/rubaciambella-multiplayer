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
  assert.equal((await health.json()).version,5);
  const page=await worker.fetch(new Request('https://game.test/'),env);assert.equal(await page.text(),'STATIC');
  const err=await worker.fetch(new Request('https://game.test/api/room/ABC123'),env);assert.equal(err.status,400);
  r.stopLoop();await ctx.flush();
});
