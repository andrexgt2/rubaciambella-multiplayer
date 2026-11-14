import test from 'node:test';
import assert from 'node:assert/strict';
import {GameRoom} from '../src/index.js';
import app from '../src/index.js';
import {makeRoom,spawn,startMatch,tick,snapshot,saveRoom,loadRoom,safeInput} from '../src/engine.js';

class FakeSocket {
  constructor(){this.attachment=null;this.messages=[];this.closed=false;}
  serializeAttachment(value){this.attachment=value;}
  deserializeAttachment(){return this.attachment;}
  send(value){this.messages.push(JSON.parse(value));}
  close(){this.closed=true;}
  last(type){return this.messages.filter(m=>m.type===type).at(-1);}
}
class FakeCtx {
  constructor(existing=new Map(),sockets=[]){
    this.db=existing;this.sockets=sockets;this.work=[];
    this.storage={get:async key=>this.db.get(key),put:async (key,value)=>{this.db.set(key,structuredClone(value));},delete:async key=>{this.db.delete(key);}};
  }
  blockConcurrencyWhile(fn){this.ready=Promise.resolve().then(fn);}
  getWebSockets(){return this.sockets;}
  acceptWebSocket(ws){this.sockets.push(ws);}
  waitUntil(p){this.work.push(p);}
  async flush(){await Promise.all(this.work.splice(0));}
}
const msg=(room,ws,data)=>room.webSocketMessage(ws,JSON.stringify(data));

// Esportazioni pure testabili senza rete o infrastruttura Cloudflare.
test('motore: countdown, sterzo, turbo, risultati, snapshot e serializzazione',()=>{
  const room=makeRoom('ABC234');const p={id:'a',name:'Alice',score:0};spawn(p,0,2);room.players.set(p.id,p);
  const t=Date.now();startMatch(room,t);assert.equal(room.phase,'countdown');
  tick(room,t+3100,.05);assert.equal(room.phase,'playing');
  const before=p.y;p.input=safeInput({up:true,boost:true});
  for(let n=0;n<20;n++)tick(room,t+3200+n*50,.05);
  assert.notEqual(p.y,before);assert(p.boostReadyAt>t);
  assert.equal(safeInput({up:1,down:true}).up,false);
  const saved=saveRoom(room),restored=loadRoom(saved,'ABC234');
  assert.equal(restored.players.size,1);assert.equal(snapshot(restored).players[0].name,'Alice');
  tick(restored,restored.matchEnds+1,.05);assert.equal(restored.phase,'results');
});

test('Durable Object: stanza condivisa, limite, host, rivincita, disconnessione',async()=>{
  const ctx=new FakeCtx(),room=new GameRoom(ctx,{});await ctx.ready;
  room.room.code='ABC234';
  const a=new FakeSocket(),b=new FakeSocket();
  msg(room,a,{type:'join',name:'Alice'});msg(room,b,{type:'join',name:'Bob'});
  assert.equal(room.room.players.size,2);
  assert.equal(a.last('joined').playerId,room.room.hostId);
  assert.equal(b.last('state').state.players.length,2);
  msg(room,b,{type:'start'});assert.equal(room.room.phase,'lobby','solo host inizia');
  msg(room,a,{type:'start'});assert.equal(room.room.phase,'countdown');room.stopLoop();
  const id=a.last('joined').playerId;
  msg(room,a,{type:'input',keys:{up:true,boost:true}});
  assert.equal(room.room.players.get(id).input.boost,true);
  const now=Date.now();tick(room.room,now+3200,.05);assert.equal(room.room.phase,'playing');
  tick(room.room,room.room.matchEnds+1,.05);assert.equal(room.room.phase,'results');
  msg(room,a,{type:'start'});room.stopLoop();assert.equal(room.room.phase,'countdown');
  room.webSocketClose(a);assert.equal(room.room.hostId,b.last('joined').playerId);
  assert.equal(room.room.players.size,1);
  room.webSocketClose(b);assert.equal(room.room.players.size,0);
  assert.equal(room.timer,null);await ctx.flush();
});

test('Durable Object: ricostruzione stato da storage e attachment dopo ibernazione',async()=>{
  const ctx1=new FakeCtx(),room1=new GameRoom(ctx1,{});await ctx1.ready;
  room1.room.code='ABC234';const ws=new FakeSocket();msg(room1,ws,{type:'join',name:'Turbo'});
  await ctx1.flush();
  const ctx2=new FakeCtx(ctx1.db,[ws]),room2=new GameRoom(ctx2,{});await ctx2.ready;
  assert.equal(room2.room.players.size,1);
  assert.equal(room2.room.hostId,ws.deserializeAttachment().id);
  msg(room2,ws,{type:'start'});room2.stopLoop();assert.equal(room2.room.phase,'countdown');
});

test('Worker: health, assets e convalida codice stanza',async()=>{
  const env={ASSETS:{fetch:async()=>new Response('HTML')}};
  let result=await app.fetch(new Request('https://game.example/api/health'),env);
  assert.equal((await result.json()).ok,true);
  result=await app.fetch(new Request('https://game.example/index.html'),env);
  assert.equal(await result.text(),'HTML');
  result=await app.fetch(new Request('https://game.example/api/room/ABC123'),env);
  assert.equal(result.status,400,'cifre 1 non consentite');
  result=await app.fetch(new Request('https://game.example/api/room/ABC234'),env);
  assert.equal(result.status,426,'websocket richiesto');
});

test('Durable Object: il nono partecipante viene rifiutato',async()=>{
  const ctx=new FakeCtx(),room=new GameRoom(ctx,{});await ctx.ready;
  room.room.code='XYZ234';
  const members=[];
  for(let i=0;i<8;i++){const ws=new FakeSocket();msg(room,ws,{type:'join',name:'P'+i});members.push(ws);}
  const ninth=new FakeSocket();msg(room,ninth,{type:'join',name:'Troppo'});
  assert.equal(room.room.players.size,8);
  assert.equal(ninth.last('join_error').message,'Stanza piena: massimo 8 piloti.');
  assert.equal(ninth.closed,true);
  for(const ws of members)room.webSocketClose(ws);
  await ctx.flush();
});
