(() => {
'use strict';
const $=id=>document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d');
const W=1200,H=740;
const BUMPERS=[{x:315,y:225,r:41},{x:885,y:225,r:41},{x:315,y:515,r:41},{x:885,y:515,r:41}];
const OIL=[{x:595,y:168,r:49},{x:605,y:572,r:49},{x:165,y:367,r:37},{x:1035,y:367,r:37}];
const PADS=[{x:480,y:365,r:36},{x:720,y:365,r:36}];
let socket=null,playerId=null,roomCode=null,gameState=null,lastNow=Date.now(),connected=false;
let retryTimer=null,connectVersion=0;
const visuals=new Map(),keys={up:false,down:false,left:false,right:false,boost:false,blast:false};
const params=new URLSearchParams(location.search),initialRoom=(params.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
if(initialRoom) $('codeInput').value=initialRoom;
try {$('nameInput').value=localStorage.getItem('rb_name')||'';}catch(_){}
const getMe=()=>gameState?.players.find(p=>p.id===playerId);
const isHost=()=>!!gameState && gameState.hostId===playerId;
function setError(message){$('joinError').textContent=message||'';}
// WebSocket nativi: Cloudflare Workers + Durable Objects (niente Socket.IO).
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRoomCode(){
  const nums=new Uint32Array(6);crypto.getRandomValues(nums);
  return [...nums].map(n=>ALPHABET[n%ALPHABET.length]).join('');
}
function send(type,payload={}){
  if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type,...payload}));
}
function resetToJoin(){
  playerId=null;gameState=null;connected=false;
  document.body.classList.remove('game-active');
  $('overlay').classList.remove('hidden');
  $('joinPanel').classList.remove('hidden');
  $('lobbyPanel').classList.add('hidden');
  $('resultsPanel').classList.add('hidden');
}
function connect(data){
  const version=++connectVersion;
  clearTimeout(retryTimer);
  if(socket){socket.onclose=null;socket.close();socket=null;}
  roomCode=data.roomCode||newRoomCode();
  resetToJoin();
  setError('');$('joinBtn').disabled=true;$('joinBtn').textContent='CONNESSIONE...';
  function openSocket(){
    if(version!==connectVersion)return;
    const scheme=location.protocol==='https:'?'wss:':'ws:';
    socket=new WebSocket(scheme+'//'+location.host+'/api/room/'+encodeURIComponent(roomCode));
    const current=socket;
    let joined=false;
    current.addEventListener('open',()=>{
      if(version!==connectVersion)return;
      $('connectionLabel').textContent='In collegamento al garage...';
      send('join',{name:data.name});
    });
    current.addEventListener('message',event=>{
      let packet;try{packet=JSON.parse(event.data);}catch(_){return;}
      if(packet.type==='joined'){
        joined=true;connected=true;playerId=packet.playerId;
        $('joinBtn').disabled=false;$('joinBtn').textContent='ENTRA IN PISTA →';
        $('connectionLabel').textContent='Connesso al garage';
        history.replaceState(null,'',location.pathname+'?room='+encodeURIComponent(roomCode));
        $('roomLabel').textContent=roomCode;
        try{localStorage.setItem('rb_name',data.name);}catch(_){}
      }else if(packet.type==='state'){
        if(!joined)return;
        gameState=packet.state;lastNow=Date.now();updateUI();
      }else if(packet.type==='join_error'||packet.type==='error'){
        setError(packet.message||'Impossibile entrare nella stanza.');
        $('joinBtn').disabled=false;$('joinBtn').textContent='ENTRA IN PISTA →';
      }
    });
    current.addEventListener('close',()=>{
      if(version!==connectVersion)return;
      resetToJoin();
      $('connectionLabel').textContent='Connessione interrotta';
      if(joined){
        setError('Riconnessione in corso...');
        retryTimer=setTimeout(openSocket,1600);
      }else{
        if(!$('joinError').textContent)setError('Connessione non riuscita. Riprova.');
        $('joinBtn').disabled=false;$('joinBtn').textContent='ENTRA IN PISTA →';
      }
    });
    current.addEventListener('error',()=>{
      if(version===connectVersion)$('connectionLabel').textContent='Connessione non disponibile';
    });
  }
  openSocket();
}
$('joinForm').addEventListener('submit',e=>{
  e.preventDefault();
  const name=$('nameInput').value.trim().slice(0,16)||'Pilota';
  const code=$('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
  connect({name,roomCode:code});
});
$('startBtn').addEventListener('click',()=>send('start'));
$('againBtn').addEventListener('click',()=>send('start'));
$('copyBtn').addEventListener('click',async()=>{
  const link=location.origin+location.pathname+'?room='+encodeURIComponent(roomCode);
  try { await navigator.clipboard.writeText(link); $('copyBtn').textContent='COPIATO ✓'; }
  catch(_){window.prompt('Copia questo link e invialo agli amici:',link);}
  setTimeout(()=>$('copyBtn').textContent='COPIA LINK ↗',1800);
});
const padIds=['up','down','left','right','boost','blast'];
const keyName={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ShiftLeft:'boost',ShiftRight:'boost',Space:'blast'};
document.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)return;
  const name=keyName[e.code];
  if(name){e.preventDefault();keys[name]=true;}
});
document.addEventListener('keyup',e=>{const name=keyName[e.code];if(name){e.preventDefault();keys[name]=false;}});
// Il joystick virtuale usa Pointer Events: un dito guida, l'altro attiva turbo o clacson.
// Su Safari iOS impediamo anche la selezione di testo, il menu di pressione lunga e lo scroll.
const controls=$('touchControls'),stick=$('joystick'),knob=$('joystickKnob');
const pointers=new Map();
let stickPointer=null;
function clearStick(){
  stickPointer=null;
  keys.up=false;keys.down=false;keys.left=false;keys.right=false;
  knob.style.transform='translate(0px, 0px)';
  stick.classList.remove('engaged');
}
function moveStick(e){
  const rect=stick.getBoundingClientRect();
  const radius=Math.min(rect.width,rect.height)*.31;
  const x=e.clientX-(rect.left+rect.width/2),y=e.clientY-(rect.top+rect.height/2);
  const length=Math.hypot(x,y),ratio=length>radius?radius/length:1;
  const nx=x*ratio/radius,ny=y*ratio/radius;
  knob.style.transform=`translate(${(nx*radius).toFixed(1)}px, ${(ny*radius).toFixed(1)}px)`;
  const threshold=.24;
  keys.left=nx< -threshold;
  keys.right=nx>threshold;
  keys.down=ny>.38;
  // In diagonale sterzi e acceleri con lo stesso pollice.
  keys.up=ny<-.23||(Math.abs(nx)>.40&&ny<=.24);
}
stick.addEventListener('pointerdown',e=>{
  if(stickPointer!==null)return;
  e.preventDefault();
  stickPointer=e.pointerId;
  try{stick.setPointerCapture(e.pointerId);}catch(_){}
  stick.classList.add('engaged');
  moveStick(e);
});
stick.addEventListener('pointermove',e=>{
  if(e.pointerId!==stickPointer)return;
  e.preventDefault();moveStick(e);
});
function releaseStick(e){
  if(e.pointerId!==stickPointer)return;
  e.preventDefault();clearStick();
}
for(const eventName of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(eventName,releaseStick);
for(const button of document.querySelectorAll('[data-control]')){
  const control=button.dataset.control;
  button.addEventListener('pointerdown',e=>{
    e.preventDefault();
    try{button.setPointerCapture(e.pointerId);}catch(_){}
    pointers.set(e.pointerId,{control,button});keys[control]=true;
    button.classList.add('pressed');
  });
  const up=e=>{
    const pointer=pointers.get(e.pointerId);if(!pointer)return;
    e.preventDefault();pointers.delete(e.pointerId);
    keys[pointer.control]=[...pointers.values()].some(v=>v.control===pointer.control);
    pointer.button.classList.toggle('pressed',keys[pointer.control]);
  };
  for(const eventName of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(eventName,up);
}
// touchstart e touchmove esplicitamente non passivi: evitano il menu nativo di iOS.
for(const eventName of ['touchstart','touchmove']){
  controls.addEventListener(eventName,e=>{if(e.cancelable)e.preventDefault();},{passive:false});
}
for(const eventName of ['contextmenu','selectstart','dragstart']){
  controls.addEventListener(eventName,e=>e.preventDefault());
}
function releaseControls(){
  clearStick();pointers.clear();
  for(const id of padIds)keys[id]=false;
  for(const button of controls.querySelectorAll('.pressed'))button.classList.remove('pressed');
}
window.addEventListener('blur',releaseControls);
window.addEventListener('pagehide',releaseControls);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseControls();});
setInterval(()=>{if(connected&&playerId)send('input',{keys});},50);
function hms(t){const s=Math.ceil(Math.max(0,t));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function setAbility(prefix,readyAt,now,cd){
  const wait=Math.max(0,readyAt-now),fraction=1-Math.min(1,wait/cd);
  $(prefix+'Fill').style.width=(fraction*100)+'%';
  $(prefix+'State').textContent=wait>0?(wait/1000).toFixed(1)+'s':'PRONTO';
  $(prefix+'State').style.color=wait>0?'#a8b0ce':'#8bf0b4';
}
function updateUI(){
  const s=gameState;if(!s||!playerId)return;
  document.body.classList.toggle('game-active',s.phase==='playing'||s.phase==='countdown');
  $('overlay').classList.toggle('hidden',s.phase==='playing'||s.phase==='countdown');
  $('joinPanel').classList.add('hidden');
  $('lobbyPanel').classList.toggle('hidden',s.phase!=='lobby');
  $('resultsPanel').classList.toggle('hidden',s.phase!=='results');
  $('roomLabel').textContent=s.code;$('inviteCode').textContent=s.code;
  $('phaseLabel').textContent=({lobby:'ASPETTANDO I PILOTI',countdown:'PARTENZA IMMINENTE',playing:s.frenzy?'MODALITÀ FOLLIA!':'CIAMBELLA IN FUGA',results:'GARA TERMINATA'})[s.phase];
  $('timeLabel').textContent=hms(s.remaining);
  $('countdown').classList.toggle('hidden',s.phase!=='countdown');
  $('countdown').textContent=String(s.countdown||'VIA!');
  $('frenzy').classList.toggle('hidden',!s.frenzy);
  $('lobbyCount').textContent=s.players.length+'/8';
  $('lobbyPlayers').replaceChildren(...s.players.map(p=>{
    const pill=document.createElement('div');pill.className='pilot-pill';
    const dot=document.createElement('span');dot.className='dot';dot.style.background=p.color;
    const label=document.createElement('span');label.textContent=p.name+(p.id===s.hostId?' 👑':'');
    pill.append(dot,label);return pill;
  }));
  $('startBtn').disabled=!isHost();
  $('startBtn').textContent=s.players.length>1?'SI PARTE! →':'PROVA DA SOLO →';
  $('hostHint').textContent=isHost()?'Sei il capo del garage: puoi avviare la partita.':'Aspetta che il capo del garage avvii la gara.';
  const sorted=[...s.players].sort((a,b)=>b.score-a.score);
  const scoreList=$('scoreboard');scoreList.replaceChildren(...sorted.map((p,i)=>{
    const row=document.createElement('div');row.className='score-row'+(p.id===playerId?' me':'');
    const rank=document.createElement('div');rank.className='score-rank'+(i===0?' first':'');rank.textContent='#'+(i+1);
    const dot=document.createElement('div');dot.className='score-color';dot.style.background=p.color;
    const name=document.createElement('div');name.className='score-name';name.textContent=p.name;
    if(p.id===s.donut.ownerId){const icon=document.createElement('small');icon.textContent='🍩';name.append(icon);}
    const score=document.createElement('div');score.className='score-number';score.textContent=p.score;
    const points=document.createElement('small');points.textContent='PT';score.append(points);
    row.append(rank,dot,name,score);return row;
  }));
  const me=getMe();const now=s.serverNow;
  if(me){setAbility('boost',me.boostReadyAt,now,5500);setAbility('blast',me.blastReadyAt,now,6500);}
  if(s.phase==='results'){
    const winner=sorted[0];$('winnerTitle').textContent=winner?`Vince ${winner.name}!`:'Che gara!';
    $('winnerSubtitle').textContent='90 secondi di caos. Chi ha il coraggio della rivincita?';
    $('podium').replaceChildren(...sorted.slice(0,5).map((p,i)=>{
      const row=document.createElement('div');row.className='podium-row';
      const name=document.createElement('span');name.textContent=['🥇 ','🥈 ','🥉 '][i]||'🏎️ ';name.textContent+=p.name;
      const pts=document.createElement('strong');pts.textContent=p.score+' PT';row.append(name,pts);return row;
    }));
    $('againBtn').disabled=!isHost();
    $('againHint').textContent=isHost()?'Premi per una nuova sfida.':'Aspetta che il capo del garage avvii la rivincita.';
  }
}
function roundRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function drawArena(t){
  const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#28375b');bg.addColorStop(.5,'#1c2a47');bg.addColorStop(1,'#283553');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  ctx.save();ctx.globalAlpha=.23;ctx.strokeStyle='#66749a';ctx.lineWidth=1;
  for(let x=40;x<W;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=40;y<H;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  ctx.restore();
  ctx.save();ctx.strokeStyle='#404f77';ctx.lineWidth=30;ctx.strokeRect(17,17,W-34,H-34);
  ctx.strokeStyle='#d9bf72';ctx.lineWidth=5;ctx.setLineDash([19,25]);ctx.strokeRect(27,27,W-54,H-54);ctx.setLineDash([]);ctx.restore();
  // Neon stadium details.
  ctx.save();ctx.lineWidth=3;ctx.strokeStyle='#475777';
  ctx.beginPath();ctx.ellipse(W/2,H/2,350,265,0,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.ellipse(W/2,H/2,455,315,0,0,Math.PI*2);ctx.stroke();
  ctx.restore();
  ctx.save();ctx.globalAlpha=.12;ctx.translate(600,370);ctx.rotate(-.13);
  ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='900 100px sans-serif';ctx.fillText('RUBA',0,-14);ctx.fillText('CIAMBELLA',0,77);ctx.restore();
  // Oil puddles, swirling rings.
  for(const oil of OIL){
    ctx.save();ctx.translate(oil.x,oil.y);ctx.rotate(t*.0002+oil.x);
    const grad=ctx.createRadialGradient(0,0,5,0,0,oil.r);grad.addColorStop(0,'#0b0f2d');grad.addColorStop(.7,'#10152c');grad.addColorStop(1,'#41386c');
    ctx.fillStyle=grad;ctx.beginPath();ctx.ellipse(0,0,oil.r*1.05,oil.r*.72,.4,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#8466b4';ctx.lineWidth=2.5;ctx.setLineDash([11,15]);ctx.beginPath();ctx.ellipse(0,0,oil.r*.69,oil.r*.47,.4,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  // Rocket pads.
  for(let i=0;i<PADS.length;i++){
    const b=PADS[i],v=Math.sin(t*.006+i)*.5+.5;
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(i===0?0:Math.PI);
    ctx.shadowColor='#fbd760';ctx.shadowBlur=10+v*14;
    roundRect(-42,-29,84,58,11,'#806f42','#f6d76b');ctx.shadowBlur=0;
    ctx.fillStyle='#ffdd61';
    for(let j=-1;j<=1;j++){
      ctx.beginPath();ctx.moveTo(-7+j*16,-13);ctx.lineTo(15+j*16,0);ctx.lineTo(-7+j*16,13);ctx.closePath();ctx.fill();
    }
    ctx.restore();
  }
  // Bumpers.
  for(const b of BUMPERS){
    ctx.save();ctx.translate(b.x,b.y);
    ctx.fillStyle='#080e23a0';ctx.beginPath();ctx.ellipse(5,10,b.r+8,b.r*.85,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#e85b89';ctx.strokeStyle='#ffb1c9';ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,b.r,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#77284e';ctx.beginPath();ctx.arc(0,0,b.r*.64,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ffb1c9';ctx.lineWidth=3;ctx.setLineDash([5,8]);ctx.beginPath();ctx.arc(0,0,b.r*.48,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
}
function drawDonut(x,y,t,scale=1){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  ctx.rotate(t*.001);ctx.shadowColor='#ffd271';ctx.shadowBlur=22;
  ctx.fillStyle='#efb465';ctx.beginPath();ctx.arc(0,0,23,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle='#fb75a5';ctx.beginPath();ctx.arc(0,0,18,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#9b6380';ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.fill();
  for(let i=0;i<9;i++){
    const a=i*Math.PI*2/9,rad=14;
    ctx.save();ctx.translate(Math.cos(a)*rad,Math.sin(a)*rad);ctx.rotate(a);
    ctx.fillStyle=['#fff5ce','#89eeed','#e9f78a'][i%3];ctx.fillRect(-3,-1,6,2);ctx.restore();
  }
  ctx.restore();
}
function drawStar(x,y,t){
  ctx.save();ctx.translate(x,y);ctx.rotate(t*.0012);ctx.shadowBlur=13;ctx.shadowColor='#ffd85d';ctx.fillStyle='#ffe37b';ctx.strokeStyle='#fff0b1';ctx.lineWidth=2;
  ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?7:16;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
}
function drawCar(p,t){
  let v=visuals.get(p.id);
  if(!v){v={x:p.x,y:p.y,angle:p.angle};visuals.set(p.id,v);}
  v.x+=(p.x-v.x)*.28;v.y+=(p.y-v.y)*.28;
  const d=Math.atan2(Math.sin(p.angle-v.angle),Math.cos(p.angle-v.angle));v.angle+=d*.32;
  const owner=gameState?.donut.ownerId===p.id;
  const isMe=p.id===playerId;
  if(owner){
    ctx.save();ctx.strokeStyle='#ffe27a';ctx.lineWidth=4;ctx.globalAlpha=.6+Math.sin(t*.009)*.28;
    ctx.setLineDash([12,12]);ctx.beginPath();ctx.arc(v.x,v.y,39,0,Math.PI*2);ctx.stroke();ctx.restore();
    drawDonut(v.x,v.y-52+Math.sin(t*.007)*3,t,.72);
  }
  if(isMe){ctx.save();ctx.strokeStyle='#8de8ff';ctx.lineWidth=3;ctx.setLineDash([8,11]);ctx.beginPath();ctx.arc(v.x,v.y,40,0,Math.PI*2);ctx.stroke();ctx.restore();}
  if(t - p.blastAt < 420 && p.blastAt>0){
    const k=Math.max(0,(t-p.blastAt)/420);
    ctx.save();ctx.strokeStyle=`rgba(255,214,90,${.9-k*.9})`;ctx.lineWidth=7*(1-k)+1;
    ctx.beginPath();ctx.arc(v.x,v.y,25+k*124,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  ctx.save();ctx.translate(v.x,v.y);ctx.rotate(v.angle);
  if(p.boostUntil>t){
    const length=37+Math.random()*25;
    ctx.shadowBlur=15;ctx.shadowColor='#ffd657';ctx.fillStyle='#f0ad45';
    ctx.beginPath();ctx.moveTo(-27,-10);ctx.lineTo(-27-length,-2);ctx.lineTo(-27,3);ctx.fill();
    ctx.beginPath();ctx.moveTo(-27,10);ctx.lineTo(-27-length,2);ctx.lineTo(-27,-3);ctx.fill();ctx.shadowBlur=0;
  }
  ctx.fillStyle='#080d1c8a';roundRect(-27,-15+7,57,34,10,'#090c1b80');
  for(const [x,y] of [[-15,-18],[16,-18],[-15,18],[16,18]])roundRect(x-7,y-4,14,8,3,'#141726');
  ctx.shadowColor=p.color;ctx.shadowBlur=8;
  roundRect(-29,-16,58,32,11,p.color,'#ffffff55');ctx.shadowBlur=0;
  roundRect(-6,-12,25,24,7,'#27344f');
  roundRect(1,-10,12,20,4,'#a3dbea');
  roundRect(-23,-9,10,18,4,'#ffffff44');
  ctx.fillStyle='#fff5d5';roundRect(24,-12,5,8,2,'#fff5d5');roundRect(24,4,5,8,2,'#fff5d5');
  ctx.fillStyle='#f25173';roundRect(-30,-11,4,7,1,'#f25173');roundRect(-30,4,4,7,1,'#f25173');
  ctx.restore();
  ctx.save();ctx.textAlign='center';ctx.font='700 14px DM Sans,Arial,sans-serif';
  const name=p.name+(isMe?' (TU)':'');const width=Math.min(220,ctx.measureText(name).width+21);
  const y=v.y+(owner?-86:-43);
  roundRect(v.x-width/2,y-16,width,23,7,'#0c1123c9');
  ctx.fillStyle=owner?'#ffdb72':'#f4f5ff';ctx.fillText(name,v.x,y);
  ctx.restore();
}
let backgroundLoaded=false;
function draw(now){
  ctx.clearRect(0,0,W,H);drawArena(now);
  if(!gameState){
    // La schermata iniziale ha un piccolo diorama animato.
    drawDonut(600,370+Math.sin(now*.002)*5,now,1.35);
    const sample=[{x:460,y:340,angle:now*.0006,color:'#ffc95f',id:'demo1',name:'',boostUntil:0,blastAt:0},
      {x:750,y:420,angle:-now*.0004,color:'#ff6597',id:'demo2',name:'',boostUntil:0,blastAt:0}];
    for(const p of sample){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);roundRect(-32,-18,64,36,11,p.color);roundRect(-4,-13,23,26,6,'#394e74');ctx.restore();}
  } else {
    const s=gameState;
    for(const c of s.candies)drawStar(c.x,c.y,now);
    if(!s.donut.ownerId)drawDonut(s.donut.x,s.donut.y+Math.sin(now*.005)*5,now,1.1);
    const ids=new Set(s.players.map(p=>p.id));
    for(const id of visuals.keys())if(!ids.has(id))visuals.delete(id);
    for(const p of s.players)drawCar(p,s.serverNow+(Date.now()-lastNow));
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
})();
