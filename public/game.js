import {WORLD,ROAD_WIDTH,LAP_COUNT,CENTERLINE,TRACK_LENGTH,pointAt,closestTrack} from './track.js';
import {makeRaceAudio} from './audio.js';
const $=id=>document.getElementById(id),clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const canvas=$('trackCanvas'),ctx=canvas.getContext('2d',{alpha:false});
const state={socket:null,room:null,playerId:null,server:null,connected:false,version:0,lastPacket:0,
  keys:{gas:false,brake:false,steer:0},name:'',oldPhase:'',lastLap:0,lastHit:0,lastCountdown:0,toastTimer:0,recordsOpen:false};
const visual=new Map();let camera={x:WORLD.width/2,y:WORLD.height/2,zoom:1},lastFrame=0;
const roomFromUrl=(new URLSearchParams(location.search).get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
$('codeInput').value=roomFromUrl;
try{$('nameInput').value=localStorage.getItem('gridline_name')||localStorage.getItem('rb_name')||'';}catch(_){ }
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(){const a=new Uint32Array(6);crypto.getRandomValues(a);return [...a].map(n=>ALPHABET[n%ALPHABET.length]).join('');}
const isHost=()=>state.server?.hostId===state.playerId;
const getMe=()=>state.server?.players?.find(p=>p.id===state.playerId);
const clock=t=>{const v=Math.max(0,Math.floor(t)),m=Math.floor(v/60);return String(m).padStart(2,'0')+':'+String(v%60).padStart(2,'0');};
const lapTime=ms=>ms?`${(ms/1000).toFixed(2)}s`:'—';
function toast(message){const el=$('toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.add('hidden'),1800);}
function send(type,fields={}){if(state.socket?.readyState===WebSocket.OPEN)state.socket.send(JSON.stringify({type,...fields}));}
const sound=makeRaceAudio();
const unlockAudio=()=>sound.unlock();
const beep=(freq,length)=>sound.tone(freq,length);
$('soundToggle').textContent=sound.isOn()?'♫':'♫̸';
$('soundToggle').setAttribute('aria-pressed',String(sound.isOn()));
$('soundToggle').addEventListener('click',()=>{
  const on=sound.toggle();$('soundToggle').textContent=on?'♫':'♫̸';
  $('soundToggle').setAttribute('aria-pressed',String(on));
  $('soundToggle').setAttribute('aria-label',on?'Disattiva audio':'Attiva audio');
});
// Accesso ai record anche prima di creare una stanza. Nessuna credenziale richiesta.
let cachedRecords=[];
function renderRecords(message=''){
  const list=$('recordList');list.replaceChildren();
  if(message){const p=document.createElement('p');p.textContent=message;list.append(p);return;}
  if(!cachedRecords.length){const p=document.createElement('p');p.textContent='Ancora nessun giro registrato. Il primo record può essere il tuo!';list.append(p);return;}
  for(const [i,r] of cachedRecords.entries()){
    const row=document.createElement('div');row.className='record-row';
    const pos=document.createElement('span');pos.className='record-rank';pos.textContent='#'+(i+1);
    const name=document.createElement('span');name.className='record-name';name.textContent=r.name;
    const time=document.createElement('strong');time.textContent=lapTime(r.ms);
    row.append(pos,name,time);list.append(row);
  }
}
async function loadRecords(){
  try{
    const response=await fetch('/api/leaderboard',{cache:'no-store'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const json=await response.json();
    cachedRecords=Array.isArray(json.records)?json.records.slice(0,20):[];
    renderRecords();
  }catch(_){renderRecords('Classifica non disponibile: verifica la connessione e riprova.');}
}
function openRecords(){
  if(['racing','countdown'].includes(state.server?.phase))return;
  state.recordsOpen=true;$('overlay').classList.remove('hidden');
  for(const id of ['entryPanel','lobbyPanel','resultsPanel'])$(id).classList.add('hidden');
  $('recordsPanel').classList.remove('hidden');loadRecords();
}
function closeRecords(){state.recordsOpen=false;$('recordsPanel').classList.add('hidden');
  if(state.server)updateUI();else $('entryPanel').classList.remove('hidden');}
for(const button of document.querySelectorAll('[data-open-records]'))button.addEventListener('click',()=>{unlockAudio();openRecords();});
$('closeRecords').addEventListener('click',closeRecords);
$('refreshRecords').addEventListener('click',loadRecords);
loadRecords();

function connect(name,code){
  const v=++state.version;state.name=name;state.room=code||newCode();state.playerId=null;state.connected=false;state.server=null;
  if(state.socket){state.socket.onclose=null;state.socket.close();}
  $('joinError').textContent='';$('joinBtn').disabled=true;$('joinBtn').innerHTML='CONNESSIONE...';
  $('connectionLabel').textContent='COLLEGAMENTO IN CORSO';
  function open(){
    if(state.version!==v)return;
    const protocol=location.protocol==='https:'?'wss:':'ws:';
    const ws=new WebSocket(`${protocol}//${location.host}/api/room/${encodeURIComponent(state.room)}`);
    state.socket=ws;let joined=false;
    ws.addEventListener('open',()=>{
      if(state.version!==v)return;
      let resume='';try{resume=sessionStorage.getItem('gridline_resume_'+state.room)||'';}catch(_){ }
      send('join',{name,resume});
    });
    ws.addEventListener('message',e=>{
      let msg;try{msg=JSON.parse(e.data);}catch(_){return;}
      if(msg.type==='joined'){
        joined=true;state.connected=true;state.playerId=msg.playerId;
        if(msg.resumeToken)try{sessionStorage.setItem('gridline_resume_'+state.room,msg.resumeToken);}catch(_){ }
        $('joinBtn').disabled=false;$('joinBtn').innerHTML='ENTRA IN GRIGLIA <span>↗</span>';
        $('connectionLabel').textContent='COLLEGATO ALLA GRIGLIA';
        history.replaceState(null,'',location.pathname+'?room='+state.room);
        try{localStorage.setItem('gridline_name',name);}catch(_){ }
      }else if(msg.type==='state'){
        if(!joined)return;
        state.server=msg.state;state.lastPacket=performance.now();updateUI();
      }else if(msg.type==='join_error'||msg.type==='error'){
        $('joinError').textContent=msg.message||'Impossibile entrare nella stanza.';
        $('joinBtn').disabled=false;$('joinBtn').textContent='RIPROVA';
      }
    });
    ws.addEventListener('close',()=>{
      if(state.version!==v)return;
      state.connected=false;releaseAll();$('connectionLabel').textContent='RICONNESSIONE...';
      if(joined){toast('Riconnessione alla gara...');setTimeout(open,1300);}
      else{$('joinError').textContent='Connessione non riuscita. Premi di nuovo ENTRA IN GRIGLIA.';
        $('joinBtn').disabled=false;$('joinBtn').textContent='RIPROVA';}
    });
  }
  open();
}
$('joinForm').addEventListener('submit',event=>{
  event.preventDefault();
  unlockAudio(); // anche gli invitati attivano i suoni prima del semaforo.
  connect($('nameInput').value.trim().slice(0,16)||'Pilota', $('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
});
$('startBtn').addEventListener('click',()=>{unlockAudio();send('start');try{screen.orientation?.lock?.('landscape').catch(()=>{});}catch(_){}});
$('againBtn').addEventListener('click',()=>{unlockAudio();send('start');});
$('copyBtn').addEventListener('click',async()=>{
  const link=location.origin+location.pathname+'?room='+state.room;
  try{await navigator.clipboard.writeText(link);$('copyBtn').textContent='COPIATO ✓';toast('Invito copiato!');}
  catch(_){prompt('Copia il link:',link);}
  setTimeout(()=>$('copyBtn').textContent='COPIA INVITO ↗',1900);
});
function updateUI(){
  const s=state.server;if(!s)return;
  const me=getMe();
  const active=['racing','countdown'].includes(s.phase);
  if(active)state.recordsOpen=false;
  const currentPhase=me?.spectator&&active?'spectator':s.phase;
  document.body.classList.toggle('game-active',active);
  $('hud').classList.toggle('hidden',!active);
  $('overlay').classList.toggle('hidden',active&&!me?.spectator&&!state.recordsOpen);
  $('entryPanel').classList.add('hidden');
  $('recordsPanel').classList.toggle('hidden',!state.recordsOpen);
  $('lobbyPanel').classList.toggle('hidden',state.recordsOpen||!(s.phase==='lobby'||currentPhase==='spectator'));
  $('resultsPanel').classList.toggle('hidden',state.recordsOpen||s.phase!=='results');
  $('countdown').classList.toggle('hidden',s.phase!=='countdown');
  $('countdown').classList.toggle('go',false);
  if(s.phase==='countdown')$('countdown').querySelector('span').textContent=s.countdown||'VIA';
  if(s.phase==='countdown'&&s.countdown&&state.lastCountdown!==s.countdown){state.lastCountdown=s.countdown;beep(410+s.countdown*90,.09);}
  if(s.phase!=='countdown'&&state.oldPhase==='countdown'){toast('VIA!');beep(900,.20);}
  if(state.oldPhase!=='results'&&s.phase==='results'){sound.finish();setTimeout(loadRecords,1300);}
  if(state.oldPhase==='results'&&s.phase==='countdown'){state.lastLap=0;state.lastHit=0;state.lastCountdown=0;}
  state.oldPhase=s.phase;
  $('inviteCode').textContent=s.code;$('lobbyCount').textContent=s.players.length+' / 8';
  $('hudRoom').textContent=s.code;
  $('lobbyPlayers').replaceChildren(...s.players.map(p=>{
    const el=document.createElement('span');el.className='pilot-pill';
    const dot=document.createElement('i');dot.style.background=p.color;
    const n=document.createElement('span');n.textContent=p.name+(p.id===s.hostId?' ★':'');
    el.append(dot,n);return el;
  }));
  $('startBtn').disabled=!isHost();
  $('startBtn').firstChild.textContent=s.players.filter(p=>!p.spectator).length>1?'ACCENDI I SEMAFORI ':'GARA DI PROVA ';
  $('hostHint').textContent=me?.spectator?'Gara in corso: entrerai in pista alla prossima partenza.':
    isHost()?'Sei il capostanza. Dai il via quando siete pronti.':'Aspetta che il capostanza avvii la gara.';
  if(me){
    $('positionValue').innerHTML=String(me.rank??'—')+'<span> / '+s.players.filter(p=>!p.spectator).length+'</span>';
    $('lapValue').innerHTML=String(Math.min(me.laps+1,LAP_COUNT))+'<span> / '+LAP_COUNT+'</span>';
    $('speedValue').textContent=String(Math.round(Math.max(0,me.speed)*.59)).padStart(3,'0');
    $('gearValue').textContent=me.speed<-3?'R':String(me.gear||1);
    $('rpmValue').style.setProperty('--rev',String(Math.min(100,Math.round(((me.rpm||5100)-5100)/7900*100)))+'%');
    if(me.laps&&me.lastLap!==state.lastLap){state.lastLap=me.lastLap;toast('GIRO '+me.laps+' · '+lapTime(me.lastLap));beep(960,.13);setTimeout(loadRecords,1300);}
    if(me.hits>state.lastHit){state.lastHit=me.hits;sound.hit();}
    else if(me.hits<state.lastHit)state.lastHit=me.hits;
  }
  $('timerValue').textContent=clock(s.elapsed);
  const sorted=[...s.players].filter(p=>!p.spectator).sort((a,b)=>(a.rank||99)-(b.rank||99));
  $('raceStandings').classList.toggle('hidden',!active);
  $('raceStandings').replaceChildren(...sorted.slice(0,5).map(p=>{
    const el=document.createElement('div');el.className='racer'+(p.id===state.playerId?' me':'');el.style.setProperty('--racer',p.color);
    const rank=document.createElement('i');rank.textContent=String(p.rank)+'.';
    const name=document.createElement('span');name.textContent=p.name.slice(0,11);
    el.append(rank,name);return el;
  }));
  if(s.phase==='results'){
    const winner=sorted[0];$('resultsTitle').innerHTML=winner?'GARA <em>FINITA.</em>':'FINISH <em>LINE.</em>';
    $('resultsSubtitle').textContent=winner?'Vince '+winner.name+' · Il prossimo giro è tuo.':'Un circuito. Otto storie diverse.';
    $('podium').replaceChildren(...sorted.map(p=>{
      const row=document.createElement('div');row.className='podium-row';
      const name=document.createElement('span');name.textContent=`#${p.rank}  ${p.name}`;
      const time=document.createElement('strong');time.textContent=p.finishedAt?'FINITO':p.laps+' / '+LAP_COUNT+' GIRI';
      row.append(name,time);return row;
    }));
    $('againBtn').disabled=!isHost();$('againHint').textContent=isHost()?'Sei tu a dare il via alla prossima gara.':'Aspetta il via del capostanza.';
  }
}
// Comandi touch: una mano sterza, l'altra tiene premuti i pedali.
const steerPad=$('steerPad'),steerThumb=$('steerThumb'),controls=$('touchControls');
let steerPointer=null;const pedalPointers=new Map();
function steerTo(e){
  const r=steerPad.getBoundingClientRect(),range=Math.max(1,(r.width-83)/2),x=e.clientX-(r.left+r.width/2);
  const v=clamp(x/range,-1,1);state.keys.steer=Math.abs(v)<.10?0:v;
  steerThumb.style.transform=`translateX(${(state.keys.steer*range).toFixed(1)}px)`;
  steerPad.classList.toggle('pressed',Math.abs(state.keys.steer)>.12);
}
steerPad.addEventListener('pointerdown',e=>{
  if(steerPointer!==null)return;e.preventDefault();unlockAudio();steerPointer=e.pointerId;
  try{steerPad.setPointerCapture(e.pointerId);}catch(_){ }steerTo(e);
});
steerPad.addEventListener('pointermove',e=>{if(e.pointerId===steerPointer){e.preventDefault();steerTo(e);}});
function releaseSteer(e){if(e.pointerId!==steerPointer)return;steerPointer=null;state.keys.steer=0;steerThumb.style.transform='translateX(0px)';steerPad.classList.remove('pressed');}
for(const ev of ['pointerup','pointercancel','lostpointercapture'])steerPad.addEventListener(ev,releaseSteer);
for(const button of controls.querySelectorAll('[data-control]')){
  const key=button.dataset.control;
  button.addEventListener('pointerdown',e=>{
    e.preventDefault();unlockAudio();try{button.setPointerCapture(e.pointerId);}catch(_){ }
    pedalPointers.set(e.pointerId,key);state.keys[key]=true;button.classList.add('pressed');
  });
  const release=e=>{
    if(!pedalPointers.has(e.pointerId))return;
    const control=pedalPointers.get(e.pointerId);pedalPointers.delete(e.pointerId);
    state.keys[control]=[...pedalPointers.values()].includes(control);
    button.classList.toggle('pressed',state.keys[control]);
  };
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(ev,release);
}
for(const ev of ['touchstart','touchmove'])controls.addEventListener(ev,e=>{if(e.cancelable)e.preventDefault();},{passive:false});
for(const ev of ['contextmenu','selectstart','dragstart'])controls.addEventListener(ev,e=>e.preventDefault());
function releaseAll(){state.keys.gas=false;state.keys.brake=false;state.keys.steer=0;
  steerPointer=null;pedalPointers.clear();steerThumb.style.transform='translateX(0px)';steerPad.classList.remove('pressed');
  for(const button of controls.querySelectorAll('.pressed'))button.classList.remove('pressed');
}
window.addEventListener('blur',releaseAll);window.addEventListener('pagehide',releaseAll);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();});
const held=new Set();
document.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;
  if(['KeyW','ArrowUp','KeyS','ArrowDown','Space','KeyA','ArrowLeft','KeyD','ArrowRight'].includes(e.code)){e.preventDefault();held.add(e.code);syncKeys();}
});
document.addEventListener('keyup',e=>{held.delete(e.code);syncKeys();});
function syncKeys(){state.keys.gas=held.has('KeyW')||held.has('ArrowUp');state.keys.brake=held.has('KeyS')||held.has('ArrowDown')||held.has('Space');
  state.keys.steer=(held.has('KeyD')||held.has('ArrowRight')?1:0)-(held.has('KeyA')||held.has('ArrowLeft')?1:0);
}
setInterval(()=>{if(state.connected&&state.playerId)send('input',{keys:state.keys});},50);
// Sfondo del circuito pre-renderizzato (una sola volta) per preservare FPS su telefoni.
const surface=document.createElement('canvas');surface.width=WORLD.width;surface.height=WORLD.height;
const sc=surface.getContext('2d',{alpha:false});
function seeded(seed){let x=seed;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
const rand=seeded(84563);
function roadPath(c){c.beginPath();c.moveTo(CENTERLINE[0].x,CENTERLINE[0].y);
  for(let i=1;i<CENTERLINE.length;i++)c.lineTo(CENTERLINE[i].x,CENTERLINE[i].y);c.closePath();}
function paintSurface(){
  const bg=sc.createLinearGradient(0,0,WORLD.width,WORLD.height);bg.addColorStop(0,'#3d644d');bg.addColorStop(.6,'#365946');bg.addColorStop(1,'#2c4f42');sc.fillStyle=bg;sc.fillRect(0,0,WORLD.width,WORLD.height);
  // Fasce d'erba, trame e vegetazione fuori dal tracciato.
  for(let i=0;i<32;i++){sc.fillStyle=i%2?'#ffffff04':'#061d0e0a';sc.fillRect(0,i*53,WORLD.width,26);}
  for(let i=0;i<720;i++){
    const x=rand()*WORLD.width,y=rand()*WORLD.height;
    if(closestTrack(x,y).distance<ROAD_WIDTH/2+90)continue;
    const r=1.5+rand()*4.2;sc.fillStyle=rand()>.5?'#72956c49':'#172f2a9a';sc.beginPath();sc.arc(x,y,r,0,Math.PI*2);sc.fill();
  }
  // Sicurezza esterna, ghiaia, bordo e asfalto.
  sc.save();sc.lineJoin='round';sc.lineCap='round';
  roadPath(sc);sc.strokeStyle='#152e2b64';sc.lineWidth=ROAD_WIDTH+88;sc.stroke();
  roadPath(sc);sc.strokeStyle='#a8a38d';sc.lineWidth=ROAD_WIDTH+60;sc.stroke();
  roadPath(sc);sc.strokeStyle='#4b534f';sc.lineWidth=ROAD_WIDTH+23;sc.stroke();
  roadPath(sc);sc.strokeStyle='#e0ddd0';sc.lineWidth=ROAD_WIDTH+10;sc.stroke();
  roadPath(sc);sc.strokeStyle='#343d43';sc.lineWidth=ROAD_WIDTH;sc.stroke();
  roadPath(sc);sc.lineWidth=ROAD_WIDTH-33;sc.strokeStyle='#3d454a';sc.stroke();
  roadPath(sc);sc.lineWidth=ROAD_WIDTH-54;sc.strokeStyle='#394247';sc.stroke();
  sc.restore();
  // Cordoli a bande rosse e crema su entrambi i lati.
  for(let s=0;s<TRACK_LENGTH;s+=19){
    const p=pointAt(s),p2=pointAt(s+19.5);
    for(const side of [-1,1]){
      const offset=side*(ROAD_WIDTH/2+1);
      const nx=-p.ty*offset,ny=p.tx*offset,n2x=-p2.ty*offset,n2y=p2.tx*offset;
      sc.fillStyle=Math.floor(s/19)%2?'#f5eee2':'#d94e45';sc.beginPath();
      sc.moveTo(p.x+nx,p.y+ny);sc.lineTo(p2.x+n2x,p2.y+n2y);
      sc.lineTo(p2.x+n2x-p2.ty*side*12,p2.y+n2y+p2.tx*side*12);
      sc.lineTo(p.x+nx-p.ty*side*12,p.y+ny+p.tx*side*12);sc.closePath();sc.fill();
    }
  }
  // Segni di corda e zone di frenata nelle curve.
  sc.strokeStyle='#ffffff28';sc.lineWidth=2;sc.setLineDash([24,30]);
  roadPath(sc);sc.stroke();sc.setLineDash([]);
  // Start/finish a scacchi.
  const line=pointAt(0);sc.save();sc.translate(line.x,line.y);sc.rotate(line.angle);
  for(let a=0;a<2;a++)for(let b=0;b<12;b++){
    sc.fillStyle=(a+b)%2?'#171e25':'#f6f2e6';sc.fillRect(a*12-12,-ROAD_WIDTH/2+b*ROAD_WIDTH/12,12,ROAD_WIDTH/12+.5);
  }
  sc.restore();
  // Griglia di partenza e indicazioni laterali.
  for(let i=0;i<8;i++){
    const pos=pointAt(260-Math.floor(i/2)*68),side=i%2===0?-37:37;
    sc.save();sc.translate(pos.x-pos.ty*side,pos.y+pos.tx*side);sc.rotate(pos.angle);
    sc.strokeStyle='#eef5d37c';sc.lineWidth=3;sc.strokeRect(-30,-18,59,36);sc.restore();
  }
  // Zona paddock che segnala l'inizio del giro.
  const stand=pointAt(70);sc.save();sc.translate(stand.x-stand.ty*250,stand.y+stand.tx*250);sc.rotate(stand.angle);
  sc.fillStyle='#122829';sc.fillRect(-120,-54,240,108);sc.fillStyle='#e6f052';sc.fillRect(-120,-54,240,9);
  for(let j=0;j<6;j++){sc.fillStyle=j%2?'#1b4742':'#235c4a';sc.fillRect(-110+j*37,-35,29,69);}sc.restore();
  // Strutture e alberi nel prato fuori dai limiti.
  for(let i=0;i<140;i++){
    const x=70+rand()*(WORLD.width-140),y=70+rand()*(WORLD.height-140);
    if(closestTrack(x,y).distance<ROAD_WIDTH/2+100)continue;
    const radius=9+rand()*12;
    sc.fillStyle='#102d28a0';sc.beginPath();sc.ellipse(x+7,y+9,radius,radius*.75,0,0,Math.PI*2);sc.fill();
    sc.fillStyle=rand()>.5?'#52774f':'#496b46';sc.beginPath();sc.arc(x,y,radius,0,Math.PI*2);sc.fill();
    sc.fillStyle='#73905b';sc.beginPath();sc.arc(x-radius*.25,y-radius*.2,radius*.55,0,Math.PI*2);sc.fill();
  }
  // Sector markers are painted outside the asphalt; the server validates them invisibly.
  for(let i=1;i<=3;i++){const p=pointAt(TRACK_LENGTH*i/4);sc.save();sc.translate(p.x,p.y);sc.rotate(p.angle);
    sc.fillStyle='#e9f65b';sc.fillRect(-4,-ROAD_WIDTH/2-20,8,18);sc.fillRect(-4,ROAD_WIDTH/2+2,8,18);sc.restore();}
}
paintSurface();
function carShape(p,isMe,elapsed){
  const speed=Math.hypot(p.vx||0,p.vy||0),fast=speed>230;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
  ctx.fillStyle='#07121675';ctx.beginPath();ctx.ellipse(5,5,33,18,0,0,Math.PI*2);ctx.fill();
  if(fast){ctx.fillStyle='#d6e3e42c';ctx.fillRect(-55,-15,20,3);ctx.fillRect(-55,12,20,3);}
  // Ruote scoperte, ala posteriore, fondo e ala anteriore: davanti sempre a destra.
  ctx.fillStyle='#12181d';ctx.strokeStyle='#060e12';ctx.lineWidth=2;
  for(const x of [-17,18])for(const y of [-17,17]){ctx.beginPath();ctx.roundRect(x-10,y-6.5,20,13,4);ctx.fill();ctx.stroke();}
  ctx.fillStyle='#131d20';ctx.fillRect(-24,-15,6,30);
  ctx.fillStyle=p.color;ctx.beginPath();ctx.roundRect(-22,-10,39,20,6);ctx.fill();
  ctx.beginPath();ctx.moveTo(7,-9);ctx.lineTo(31,-4);ctx.lineTo(34,0);ctx.lineTo(31,4);ctx.lineTo(7,9);ctx.closePath();ctx.fill();
  ctx.fillStyle='#10191e';ctx.beginPath();ctx.ellipse(-3,0,11,7.2,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#f7f4e5';ctx.beginPath();ctx.arc(-3,0,4.5,0,Math.PI*2);ctx.fill();
  // Muso fluorescente e alerone frontale visivamente inconfondibili.
  ctx.fillStyle='#fff4d8';ctx.fillRect(31,-14,6,28);ctx.fillStyle='#e9f75c';ctx.fillRect(34,-12,4,24);
  ctx.fillStyle='#f8514e';ctx.fillRect(-26,-12,5,7);ctx.fillRect(-26,5,5,7);
  ctx.strokeStyle='#ffffff7c';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-7,-8);ctx.lineTo(22,-4);ctx.stroke();
  ctx.restore();
  if(isMe){
    ctx.save();ctx.strokeStyle='#eafb68';ctx.lineWidth=2;ctx.globalAlpha=.8+.2*Math.sin(elapsed*.008);ctx.setLineDash([8,5]);ctx.beginPath();ctx.arc(p.x,p.y,36,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    ctx.translate(p.x+Math.cos(p.angle)*50,p.y+Math.sin(p.angle)*50);ctx.rotate(p.angle);
    ctx.fillStyle='#edff6e';ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(-8,-7);ctx.lineTo(-8,7);ctx.closePath();ctx.fill();ctx.restore();
  }
  ctx.save();ctx.textAlign='center';ctx.font='800 12px DM Sans,Arial,sans-serif';ctx.fillStyle='#0b151de8';
  const w=clamp(ctx.measureText(p.name).width+18,46,170);ctx.beginPath();ctx.roundRect(p.x-w/2,p.y-54,w,20,4);ctx.fill();
  ctx.fillStyle=p.finishedAt?'#e6f45b':'#f4fbf4';ctx.fillText(p.name,p.x,p.y-40);ctx.restore();
}
function fitCanvas(){const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
  const width=Math.max(1,Math.round(r.width*dpr)),height=Math.max(1,Math.round(r.height*dpr));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  return {w:r.width,h:r.height,dpr};
}
const visible=new Map();
function draw(now){
  const d=Math.min(.05,Math.max(.005,(now-lastFrame)/1000||.016));lastFrame=now;
  const {w,h,dpr}=fitCanvas();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const server=state.server,me=getMe();
  sound.update({speed:me?.speed||0,gas:state.keys.gas,brake:state.keys.brake,
    racing:server?.phase==='racing'&&!me?.spectator,offroad:!!me?.offroad,
    gear:me?.gear||1,rpm:me?.rpm||5100,shiftSeq:me?.shiftSeq||0});
  const racing=server&&['racing','countdown'].includes(server.phase)&&me&&!me.spectator;
  let targetX=WORLD.width/2,targetY=WORLD.height/2,targetZoom=Math.min(w/WORLD.width*.92,h/WORLD.height*.92);
  if(racing){
    let mine=visible.get(me.id);
    if(!mine)mine={x:me.x,y:me.y,angle:me.angle};
    // Un filo di look-ahead, ma non abbastanza da far uscire la macchina dall'inquadratura.
    targetX=mine.x+Math.cos(mine.angle)*Math.min(65,Math.max(0,me.speed)*.16);
    targetY=mine.y+Math.sin(mine.angle)*Math.min(45,Math.max(0,me.speed)*.10);
    targetZoom=clamp(Math.min(w/810,h/390)*.98,.76,1.37);
  }
  const smooth=1-Math.exp(-(racing?7:3)*d);
  camera.x+=(targetX-camera.x)*smooth;camera.y+=(targetY-camera.y)*smooth;
  camera.zoom+=(targetZoom-camera.zoom)*smooth;
  const zoom=camera.zoom;
  ctx.save();ctx.translate(w/2,h*(racing?.46:.5));ctx.scale(zoom,zoom);ctx.translate(-camera.x,-camera.y);
  ctx.drawImage(surface,0,0);
  if(server){
    const age=Math.min(.11,(now-state.lastPacket)/1000);
    for(const p of server.players){
      if(p.spectator)continue;
      let v=visible.get(p.id);
      if(!v){v={x:p.x,y:p.y,angle:p.angle};visible.set(p.id,v);}
      const tx=p.x+(p.vx||0)*age*.48,ty=p.y+(p.vy||0)*age*.48;
      const interp=1-Math.exp(-16*d);v.x+=(tx-v.x)*interp;v.y+=(ty-v.y)*interp;
      const da=Math.atan2(Math.sin(p.angle-v.angle),Math.cos(p.angle-v.angle));v.angle+=da*interp;
      carShape({...p,x:v.x,y:v.y,angle:v.angle},p.id===state.playerId,now);
    }
    const ids=new Set(server.players.map(p=>p.id));for(const id of visible.keys())if(!ids.has(id))visible.delete(id);
  }else{
    // Vetrina del circuito: due monoposto ferme sulla griglia.
    const cars=[{name:'YOU',color:'#e4f156',...pointAt(220)},{name:'RIVAL',color:'#f56663',...pointAt(160)}];
    cars.forEach(p=>carShape({...p,vx:0,vy:0},false,now));
  }
  ctx.restore();
  // Ombreggiatura ai bordi, per staccare visivamente HUD e pedali.
  const shade=ctx.createLinearGradient(0,h*.55,0,h);shade.addColorStop(0,'#06100e00');shade.addColorStop(1,'#06100e56');ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
