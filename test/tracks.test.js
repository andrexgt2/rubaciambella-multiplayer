import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {WORLD,ROAD_WIDTH,TRACK_OPTIONS,getTrack,sanitizeTrackId} from '../public/track.js';
import {makeRoom,startMatch,snapshot,advanceGates,loadRoom,saveRoom} from '../src/engine.js';
import {GameRoom} from '../src/index.js';

globalThis.crypto??={randomUUID};

test('cinque piste disponibili, ID sanitizzati e geometrie chiuse proporzionali',()=>{
  assert.deepEqual(TRACK_OPTIONS.map(t=>t.id),['creste','monza','spa','monaco','silverstone']);
  assert.equal(sanitizeTrackId('unknown'),'creste');
  for(const {id} of TRACK_OPTIONS){
    const track=getTrack(id);
    assert(track.length>4000&&track.length<7500);
    assert(Math.hypot(track.pointAt(0).x-track.pointAt(track.length).x,
      track.pointAt(0).y-track.pointAt(track.length).y)<.001);
    for(let s=0;s<track.length;s+=35){
      const p=track.pointAt(s);
      assert(p.x>ROAD_WIDTH&&p.x<WORLD.width-ROAD_WIDTH);
      assert(p.y>ROAD_WIDTH&&p.y<WORLD.height-ROAD_WIDTH);
      assert(track.closestTrack(p.x,p.y).distance<.001);
    }
  }
});

test('server usa il circuito della stanza per griglia, checkpoint e snapshot',()=>{
  for(const trackId of ['monza','spa','monaco','silverstone']){
    const room=makeRoom('ABC234',trackId),track=getTrack(trackId);
    const p={id:'pilot',name:'Pilot',color:'#ffce45'};
    room.players.set('pilot',p);
    startMatch(room,1000);
    assert.equal(room.trackId,trackId);
    assert(track.closestTrack(p.x,p.y).distance<ROAD_WIDTH/2);
    assert.equal(snapshot(room).trackId,trackId);
    p.nextGate=1;p.progress=0;p.laps=0;p.lapStartedAt=2000;
    for(let s=30;s<track.length+30;s+=30)advanceGates(p,s%track.length,30000+s,track);
    assert.equal(p.laps,1,'giro completo riconosciuto su '+trackId);
  }
});
test('persistenza delle stanze mantiene il circuito, il vecchio salvataggio usa Creste',()=>{
  const room=makeRoom('ABC234','monza');
  assert.equal(loadRoom(saveRoom(room),'ABC234').trackId,'monza');
  const legacy=saveRoom(room);delete legacy.trackId;
  assert.equal(loadRoom(legacy,'ABC234').trackId,'creste');
});
class FakeSocket{
  constructor(){this.attachment=null;this.messages=[];}
  deserializeAttachment(){return this.attachment;}
  serializeAttachment(v){this.attachment=v;}
  send(msg){this.messages.push(JSON.parse(msg));}
  close(){}
}
class FakeCtx{
  constructor(){
    const store=new Map();
    this.storage={
      get:async key=>store.get(key),
      put:async(key,value)=>store.set(key,value),
      delete:async key=>store.delete(key)
    };
  }
  blockConcurrencyWhile(fn){this.ready=Promise.resolve().then(fn);}
  getWebSockets(){return [];}
  waitUntil(){}
}
test('solo il primo pilota decide la pista; gli invitati non possono cambiarla',async()=>{
  const ctx=new FakeCtx(),room=new GameRoom(ctx,{});
  await ctx.ready;
  room.room.code='ABC234';
  const host=new FakeSocket(),guest=new FakeSocket();
  room.webSocketMessage(host,JSON.stringify({type:'join',name:'Host',trackId:'monza'}));
  assert.equal(room.room.trackId,'monza');
  room.webSocketMessage(guest,JSON.stringify({type:'join',name:'Guest',trackId:'spa'}));
  assert.equal(room.room.trackId,'monza');
  assert.equal(host.messages.find(m=>m.type==='state').state.trackId,'monza');
  assert.equal(guest.messages.find(m=>m.type==='state').state.trackId,'monza');
});

test('i record delle cinque piste sono indipendenti',async()=>{
  const ctx=new FakeCtx(),board=new GameRoom(ctx,{});
  await ctx.ready;
  const post=(trackId,name,ms)=>board.fetch(new Request('https://internal/internal/records',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,ms,trackId})
  }));
  assert.equal((await post('creste','PilotaOriginale',58000)).status,200);
  assert.equal((await post('monza','PilotaMonza',44000)).status,200);
  assert.equal((await post('spa','PilotaSpa',73000)).status,200);
  assert.equal((await post('monaco','PilotaMonaco',69000)).status,200);
  assert.equal((await post('silverstone','PilotaSilver',67000)).status,200);
  for(const [id,name] of [['creste','PilotaOriginale'],['monza','PilotaMonza'],['spa','PilotaSpa'],['monaco','PilotaMonaco'],['silverstone','PilotaSilver']]){
    const response=await board.fetch(new Request('https://internal/internal/records?track='+id));
    const data=await response.json();
    assert.deepEqual(data.records.map(r=>r.name),[name]);
    assert.equal(data.track,id);
  }
});
