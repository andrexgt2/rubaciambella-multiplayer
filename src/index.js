import {LIMIT,COLORS,makeRoom,loadRoom,saveRoom,spawn,startMatch,tick,snapshot,safeInput} from './engine.js';
const ROOM_RE=/^[A-HJ-NP-Z2-9]{6}$/;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

// Un Durable Object per stanza: simulazione, collisioni, checkpoint e giri sono autoritativi.
export class GameRoom {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.room=makeRoom('');this.sockets=new Map();
    this.timer=null;this.lastTick=Date.now();this.frames=0;this.lastSaved=0;
    ctx.blockConcurrencyWhile(async()=>{
      const persisted=await ctx.storage.get('room');
      this.room=loadRoom(persisted,'');
      const live=ctx.getWebSockets();
      for(const ws of live){const id=ws.deserializeAttachment()?.id;
        if(id&&this.room.players.has(id)){this.sockets.set(id,ws);const p=this.room.players.get(id);p.connected=true;p.disconnectedAt=0;}
      }
      for(const [id,p] of this.room.players)if(!this.sockets.has(id)){p.disconnectedAt=p.disconnectedAt||Date.now();p.input=safeInput({});}
      if(!this.room.players.has(this.room.hostId))this.room.hostId=this.room.players.keys().next().value||null;
      if(this.room.players.size&&(['countdown','racing'].includes(this.room.phase)||[...this.room.players.values()].some(p=>p.disconnectedAt)))this.ensureLoop();
      if(!this.room.players.size){this.room=makeRoom('');await ctx.storage.delete('room');}
    });
  }
  async fetch(request){
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket richiesto',{status:426});
    const origin=request.headers.get('Origin'),url=new URL(request.url);
    const expected=url.origin.replace(/^ws:/,'http:').replace(/^wss:/,'https:');
    if(origin&&origin!==expected)return new Response('Origine non consentita',{status:403});
    const code=url.pathname.split('/').at(-1);if(!this.room.code)this.room.code=code;
    const pair=new WebSocketPair();this.ctx.acceptWebSocket(pair[1]);
    return new Response(null,{status:101,webSocket:pair[0]});
  }
  send(ws,type,payload={}){try{ws.send(JSON.stringify({type,...payload}));}catch(_){}}
  broadcast(){const msg=JSON.stringify({type:'state',state:snapshot(this.room)});
    for(const ws of this.sockets.values())try{ws.send(msg);}catch(_){}
  }
  persist(){this.ctx.waitUntil(this.ctx.storage.put('room',saveRoom(this.room)));}
  ensureLoop(){if(this.timer||!this.room.players.size)return;
    this.lastTick=Date.now();this.timer=setInterval(()=>this.step(),50);
  }
  stopLoop(){if(this.timer){clearInterval(this.timer);this.timer=null;}}
  step(){
    if(!this.room.players.size){this.stopLoop();return;}
    const now=Date.now(),dt=Math.min(.07,Math.max(0,(now-this.lastTick)/1000));this.lastTick=now;
    const before=this.room.phase;tick(this.room,now,dt);
    let expired=false;for(const [id,p] of this.room.players){
      if(p.disconnectedAt&&now-p.disconnectedAt>12000){this.room.players.delete(id);expired=true;}
    }
    if(expired){if(!this.room.players.has(this.room.hostId))this.room.hostId=this.room.players.keys().next().value||null;
      if(!this.room.players.size){this.stopLoop();this.room=makeRoom(this.room.code);this.ctx.waitUntil(this.ctx.storage.delete('room'));return;}
      this.persist();this.broadcast();
    }
    if(before!==this.room.phase){this.persist();this.broadcast();if(this.room.phase==='results'&&![...this.room.players.values()].some(p=>p.disconnectedAt)){this.stopLoop();return;}}
    if(++this.frames%2===0)this.broadcast();
    if(now-this.lastSaved>2000){this.lastSaved=now;this.persist();}
    if(!['countdown','racing'].includes(this.room.phase)&&![...this.room.players.values()].some(p=>p.disconnectedAt))this.stopLoop();
  }
  webSocketMessage(ws,message){
    if(typeof message!=='string'||message.length>1800)return;
    let data;try{data=JSON.parse(message);}catch(_){return;}
    if(!data||typeof data!=='object')return;
    const attached=ws.deserializeAttachment();
    if(data.type==='join'){
      if(attached?.id&&this.room.players.has(attached.id))return;
      const token=typeof data.resume==='string'&&data.resume.length<100?data.resume:'';
      const previous=token?[...this.room.players.values()].find(p=>p.resumeToken===token):null;
      if(previous){
        const old=this.sockets.get(previous.id);if(old&&old!==ws){try{old.close(1000,'Reconnected');}catch(_){}}
        previous.connected=true;previous.disconnectedAt=0;previous.lastInputAt=0;previous.input=safeInput({});
        this.sockets.set(previous.id,ws);ws.serializeAttachment({id:previous.id});
        this.send(ws,'joined',{playerId:previous.id,resumeToken:previous.resumeToken});this.persist();this.broadcast();return;
      }
      if(this.room.players.size>=LIMIT){this.send(ws,'join_error',{message:'Stanza piena: massimo 8 piloti.'});ws.close(1008,'Stanza piena');return;}
      const name=String(data.name||'Pilota').trim().replace(/[\x00-\x1F\x7F]/g,'').slice(0,16)||'Pilota';
      const id=crypto.randomUUID(),used=new Set([...this.room.players.values()].map(p=>p.color));
      const color=COLORS.find(c=>!used.has(c))||COLORS[this.room.players.size%COLORS.length];
      const player={id,name,color,resumeToken:crypto.randomUUID(),connected:true,disconnectedAt:0};spawn(player,this.room.players.size);
      player.spectator=['racing','countdown'].includes(this.room.phase);
      this.room.players.set(id,player);this.sockets.set(id,ws);
      if(!this.room.hostId)this.room.hostId=id;
      ws.serializeAttachment({id});this.send(ws,'joined',{playerId:id,resumeToken:player.resumeToken});this.persist();this.broadcast();
      return;
    }
    if(!attached?.id)return;
    const p=this.room.players.get(attached.id);if(!p)return;
    if(data.type==='input'){
      p.input=safeInput(data.keys);p.lastInputAt=Date.now();return;
    }
    if(data.type==='start'&&attached.id===this.room.hostId&&['lobby','results'].includes(this.room.phase)){
      startMatch(this.room);this.persist();this.broadcast();this.ensureLoop();
    }
  }
  webSocketClose(ws){this.leave(ws);}
  webSocketError(ws){this.leave(ws);}
  leave(ws){
    const id=ws.deserializeAttachment()?.id;
    if(!id||!this.room.players.has(id)||this.sockets.get(id)!==ws)return;
    const p=this.room.players.get(id);this.sockets.delete(id);
    p.connected=false;p.disconnectedAt=Date.now();p.input=safeInput({});
    this.persist();this.broadcast();this.ensureLoop();
    // Manteniamo il posto per 12 secondi: il refresh di Safari non elimina il pilota.
  }
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/health')return json({ok:true,service:'GRIDLINE GP',version:5});
    const match=/^\/api\/room\/([A-Z0-9]{6})$/.exec(url.pathname);
    if(match){
      if(!ROOM_RE.test(match[1]))return json({error:'Codice stanza non valido'},400);
      if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'Usa WebSocket'},426);
      const id=env.GAME_ROOMS.idFromName('room:'+match[1]);
      return env.GAME_ROOMS.get(id).fetch(request);
    }
    if(url.pathname.startsWith('/api/'))return json({error:'Endpoint non trovato'},404);
    return env.ASSETS.fetch(request);
  }
};
