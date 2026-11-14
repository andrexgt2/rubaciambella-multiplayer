import {COLORS,LIMIT,makeRoom,loadRoom,saveRoom,spawn,startMatch,tick,snapshot,safeInput} from './engine.js';
const ROOM_RE=/^[A-HJ-NP-Z2-9]{6}$/;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

// Ogni stanza ha un Durable Object indipendente. Il codice stanza funge da identificatore.
export class GameRoom {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.room=makeRoom('');this.sockets=new Map();
    this.timer=null;this.prevTick=Date.now();this.frames=0;this.lastSaved=0;
    ctx.blockConcurrencyWhile(async()=>{
      const stored=await ctx.storage.get('room');
      const sockets=ctx.getWebSockets();
      const connectedIds=new Set(sockets.map(ws=>ws.deserializeAttachment()?.id).filter(Boolean));
      this.room=loadRoom(stored,'');
      // Anche dopo l'ibernazione, soltanto i giocatori con un socket attivo restano presenti.
      for(const id of this.room.players.keys())if(!connectedIds.has(id))this.room.players.delete(id);
      for(const ws of sockets){const a=ws.deserializeAttachment();
        if(a?.id&&this.room.players.has(a.id))this.sockets.set(a.id,ws);
      }
      if(!this.room.players.has(this.room.hostId))this.room.hostId=this.room.players.keys().next().value||null;
      if(this.room.players.size&&(this.room.phase==='playing'||this.room.phase==='countdown'))this.ensureLoop();
      if(!this.room.players.size){this.room=makeRoom('');await ctx.storage.delete('room');}
    });
  }
  async fetch(request){
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket richiesto',{status:426});
    const origin=request.headers.get('Origin');
    const requestUrl=new URL(request.url);
    const expectedOrigin=requestUrl.origin.replace(/^ws:/,'http:').replace(/^wss:/,'https:');
    if(origin&&origin!==expectedOrigin)return new Response('Origine non consentita',{status:403});
    // ID stanza mantenuto nelle snapshot e nei link di invito.
    const code=new URL(request.url).pathname.split('/').at(-1);
    if(!this.room.code)this.room.code=code;
    // MAX 8 giocatori già registrati; connessioni provvisorie verranno chiuse se la stanza è piena.
    const pair=new WebSocketPair();const client=pair[0],server=pair[1];
    this.ctx.acceptWebSocket(server);
    return new Response(null,{status:101,webSocket:client});
  }
  send(ws,type,payload={}){try{ws.send(JSON.stringify({type,...payload}));}catch(_){}}
  broadcast(){const data=JSON.stringify({type:'state',state:snapshot(this.room)});
    for(const ws of this.sockets.values())try{ws.send(data);}catch(_){}
  }
  persist(){this.ctx.waitUntil(this.ctx.storage.put('room',saveRoom(this.room)));}
  ensureLoop(){if(this.timer||!this.room.players.size)return;
    this.prevTick=Date.now();this.timer=setInterval(()=>this.step(),50);
  }
  stopLoop(){if(this.timer){clearInterval(this.timer);this.timer=null;}}
  step(){
    if(!this.room.players.size){this.stopLoop();return;}
    const now=Date.now(),dt=Math.min(.065,(now-this.prevTick)/1000);this.prevTick=now;
    const before=this.room.phase;tick(this.room,now,dt);
    if(before!==this.room.phase){this.persist();if(this.room.phase==='results'){this.broadcast();this.stopLoop();return;}}
    if(++this.frames%2===0)this.broadcast();
    if(now-this.lastSaved>2000){this.lastSaved=now;this.persist();}
  }
  webSocketMessage(ws,message){
    if(typeof message!=='string'||message.length>1500){this.send(ws,'error',{message:'Messaggio non valido.'});return;}
    let data;try{data=JSON.parse(message);}catch(_){return;}
    if(!data||typeof data!=='object')return;
    const attached=ws.deserializeAttachment();
    if(data.type==='join'){
      if(attached?.id)return;
      if(this.room.players.size>=LIMIT){this.send(ws,'join_error',{message:'Stanza piena: massimo 8 piloti.'});ws.close(1008,'Stanza piena');return;}
      const name=String(data.name||'Pilota').trim().replace(/[\x00-\x1F\x7F]/g,'').slice(0,16)||'Pilota';
      const id=crypto.randomUUID();
      const used=new Set([...this.room.players.values()].map(p=>p.color));
      const color=COLORS.find(c=>!used.has(c))||COLORS[this.room.players.size%COLORS.length];
      const p={id,name,color,score:0};spawn(p,this.room.players.size,Math.max(2,this.room.players.size+1));
      this.room.players.set(id,p);this.sockets.set(id,ws);
      if(!this.room.hostId)this.room.hostId=id;
      ws.serializeAttachment({id});
      this.send(ws,'joined',{playerId:id});this.persist();this.broadcast();
      if(this.room.phase==='playing'||this.room.phase==='countdown')this.ensureLoop();
      return;
    }
    if(!attached?.id)return;
    const p=this.room.players.get(attached.id);if(!p)return;
    if(data.type==='input'){p.input=safeInput(data.keys);return;}
    if(data.type==='start'&&attached.id===this.room.hostId&&['lobby','results'].includes(this.room.phase)){
      startMatch(this.room);this.persist();this.broadcast();this.ensureLoop();
    }
  }
  webSocketClose(ws){this.leave(ws);}
  webSocketError(ws){this.leave(ws);}
  leave(ws){
    const id=ws.deserializeAttachment()?.id;
    if(!id||!this.room.players.has(id))return;
    this.room.players.delete(id);this.sockets.delete(id);
    if(this.room.hostId===id)this.room.hostId=this.room.players.keys().next().value||null;
    if(this.room.donut.ownerId===id){
      this.room.donut.ownerId=null;this.room.donut.x=600;this.room.donut.y=370;
      this.room.donut.lockUntil=Date.now()+500;
    }
    if(!this.room.players.size){this.stopLoop();this.room=makeRoom(this.room.code);
      this.ctx.waitUntil(this.ctx.storage.delete('room'));
    }else{this.persist();this.broadcast();}
  }
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/health')return json({ok:true,service:'RUBACIAMBELLA Cloudflare'});
    const route=/^\/api\/room\/([A-Z0-9]{6})$/.exec(url.pathname);
    if(route){
      const code=route[1];if(!ROOM_RE.test(code))return json({error:'Codice stanza non valido'},400);
      if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'Usa WebSocket'},426);
      const id=env.GAME_ROOMS.idFromName('room:'+code);
      return env.GAME_ROOMS.get(id).fetch(request);
    }
    if(url.pathname.startsWith('/api/'))return json({error:'Endpoint non trovato'},404);
    return env.ASSETS.fetch(request);
  }
};
