import {rpmForSpeed} from './transmission.js';

// Motore racing originale. Due texture audio campionate proceduralmente, filtrate
// in Web Audio: combustione/aspirazione, meccanica, cambio 6 marce, rilascio.
// Il segnale non è un campione registrato di una monoposto reale.
export function makeRaceAudio(){
  let ctx=null,master=null,comp=null,engineGain=null,engineFilter=null;
  let exhaust=null,intake=null,airFilter=null,intakeGain=null,whine=null,whineGain=null;
  let muted=false,lastGear=null,lastShiftSeq=null,lastGas=false,lastShiftAt=-Infinity,lastUpdateAt=0;
  try{muted=localStorage.getItem('gridline_muted')==='1';}catch(_){}
  const isOn=()=>!muted;
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));

  function texture(context,kind){
    const sr=context.sampleRate,N=sr*1,buffer=context.createBuffer(1,N,sr),out=buffer.getChannelData(0);
    const noise=new Float32Array(N);let seed=kind==='exhaust'?51017:28807;
    for(let i=0;i<N;i++){
      seed=(Math.imul(seed,1664525)+1013904223)|0;
      noise[i]=((seed>>>0)/2147483648)-1;
    }
    // Unisce i bordi dell'anello in modo che il loop non produca click.
    const edge=2048;for(let i=0;i<edge;i++){
      const t=i/edge,v=noise[i]*(t)+noise[N-edge+i]*(1-t);
      noise[i]=v;noise[N-edge+i]=v;
    }
    let low=0,previous=0;
    for(let i=0;i<N;i++){
      const t=i/sr;
      const revPhase=2*Math.PI*100*t; // 6000 rpm di riferimento.
      const fire=revPhase*3;           // tre impulsi per giro, V6 quattro tempi.
      const pulse=Math.pow(Math.max(0,Math.cos(fire)),12);
      const harmonics=Math.sin(fire)+.37*Math.sin(2*fire-.55)+.20*Math.sin(3*fire+.2)
        +.14*Math.sin(4*fire-.12)+.09*Math.sin(6*fire+.4);
      low+=(noise[i]-low)*(kind==='exhaust'?.045:.23);
      const high=noise[i]-low;
      if(kind==='exhaust'){
        const base=Math.tanh((.42*harmonics+.64*(pulse-.19)+.37*low*(.2+.8*pulse))*1.65);
        out[i]=base*.54+.08*Math.sin(revPhase-.4)+.09*Math.sin(revPhase*2+.2);
      }else{
        // Aspirazione e fruscio di trasmissione, un po' ruvido e irregolare.
        const rattling=.47*Math.sin(fire*2+.4)+.2*Math.sin(fire*4-.7);
        out[i]=Math.tanh((high*(.35+.8*pulse)+.19*rattling)*1.6)*.48;
      }
      previous=out[i];
    }
    // Crossfade del segnale al confine (la componente sinusoidale è periodica).
    for(let i=0;i<1024;i++){
      const w=i/1024;
      const v=out[i]*w+out[N-1024+i]*(1-w);
      out[i]=v;out[N-1024+i]=v;
    }
    return buffer;
  }
  function init(){
    const A=window.AudioContext||window.webkitAudioContext;if(!A)return;
    ctx=new A();
    master=ctx.createGain();master.gain.value=muted?0:.58;
    comp=ctx.createDynamicsCompressor();comp.threshold.value=-18;comp.knee.value=12;
    comp.ratio.value=5;comp.attack.value=.005;comp.release.value=.16;
    comp.connect(master);master.connect(ctx.destination);
    engineGain=ctx.createGain();engineGain.gain.value=0;
    engineFilter=ctx.createBiquadFilter();engineFilter.type='lowpass';engineFilter.frequency.value=1800;
    engineGain.connect(engineFilter);engineFilter.connect(comp);
    exhaust=ctx.createBufferSource();exhaust.buffer=texture(ctx,'exhaust');exhaust.loop=true;
    const exhaustGain=ctx.createGain();exhaustGain.gain.value=.75;
    exhaust.connect(exhaustGain);exhaustGain.connect(engineGain);exhaust.start();
    intake=ctx.createBufferSource();intake.buffer=texture(ctx,'intake');intake.loop=true;
    airFilter=ctx.createBiquadFilter();airFilter.type='bandpass';airFilter.frequency.value=1200;airFilter.Q.value=.65;
    intakeGain=ctx.createGain();intakeGain.gain.value=.1;
    intake.connect(airFilter);airFilter.connect(intakeGain);intakeGain.connect(engineGain);intake.start();
    // Leggero fischio della trasmissione: quasi impercettibile al minimo.
    whine=ctx.createOscillator();whine.type='triangle';whine.frequency.value=150;
    whineGain=ctx.createGain();whineGain.gain.value=0;
    whine.connect(whineGain);whineGain.connect(comp);whine.start();
  }
  function unlock(){
    if(muted)return;
    try{if(!ctx)init();if(ctx?.state==='suspended')ctx.resume().catch(()=>{});}catch(_){}
  }
  function toggle(){
    muted=!muted;try{localStorage.setItem('gridline_muted',muted?'1':'0');}catch(_){}
    if(!muted)unlock();
    if(ctx&&master)master.gain.setTargetAtTime(muted?0:.58,ctx.currentTime,.03);
    return !muted;
  }
  function tone(frequency=750,duration=.11,kind='triangle',level=.10){
    if(muted||!ctx||ctx.state!=='running')return;
    const now=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();
    o.type=kind;o.frequency.setValueAtTime(Math.max(40,frequency),now);
    g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(Math.max(.003,level),now+.012);
    g.gain.exponentialRampToValueAtTime(.0001,now+Math.max(.06,duration));
    o.connect(g);g.connect(comp);o.start(now);o.stop(now+Math.max(.06,duration)+.04);
  }
  function noiseBurst(duration=.14,level=.14,cutoff=1400){
    if(muted||!ctx||ctx.state!=='running')return;
    const now=ctx.currentTime,N=Math.ceil(ctx.sampleRate*duration),buffer=ctx.createBuffer(1,N,ctx.sampleRate);
    const out=buffer.getChannelData(0);for(let i=0;i<N;i++)out[i]=Math.random()*2-1;
    const node=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    node.buffer=buffer;filter.type='bandpass';filter.frequency.value=cutoff;filter.Q.value=.7;
    gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(level,now+.009);
    gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    node.connect(filter);filter.connect(gain);gain.connect(comp);node.start(now);node.stop(now+duration);
  }
  function gearClack(direction){
    // Scatto meccanico + breve sfiato della valvola + interruzione della coppia.
    noiseBurst(.11,.075,direction>0?1500:1050);
    tone(direction>0?165:240,.085,'triangle',.055);
  }
  function hit(){noiseBurst(.14,.16,420);tone(75,.11,'triangle',.09);}
  function finish(){tone(660,.17);setTimeout(()=>tone(880,.22),160);setTimeout(()=>tone(1180,.27),335);}
  function update(options={}){
    if(!ctx||!engineGain||!exhaust||!intake||!whine)return;
    const {speed=0,gas=false,brake=false,racing=false,offroad=false,gear=1,rpm,shiftSeq=0}=options;
    if(ctx.state!=='running')return;
    const now=ctx.currentTime,v=clamp(Math.abs(speed)/438,0,1);
    const currentRpm=clamp(Number.isFinite(rpm)&&rpm>1000?rpm:rpmForSpeed(gear,speed,gas,brake),2800,12200);
    const pitch=clamp(currentRpm/6000,.45,2.08);
    const throttle=gas&&!brake?1:0;
    const engaged=racing&&!muted;
    if(engaged&&lastGear!==null&&lastGear!==gear&&lastShiftSeq!==shiftSeq){
      lastShiftAt=now;gearClack(gear>lastGear?1:-1);
    }
    const shiftEnvelope=clamp((now-lastShiftAt-.045)/.16,0,1);
    const torqueCut=now-lastShiftAt<.045?.27:.27+.73*shiftEnvelope;
    exhaust.playbackRate.setTargetAtTime(pitch,now,.042);
    intake.playbackRate.setTargetAtTime(pitch*1.02,now,.06);
    whine.frequency.setTargetAtTime(145+v*510+(gear-1)*42,now,.055);
    engineFilter.frequency.setTargetAtTime(1100+v*3100+throttle*1150,now,.055);
    airFilter.frequency.setTargetAtTime(900+v*2600,now,.08);
    intakeGain.gain.setTargetAtTime(.10+v*.16+throttle*.12,now,.08);
    const gain=engaged?(offroad?.7:1)*(.26+v*.24+throttle*.14)*torqueCut:0;
    engineGain.gain.setTargetAtTime(gain,now,.07);
    whineGain.gain.setTargetAtTime(engaged?.005+v*.018:0,now,.09);
    lastGear=gear;lastShiftSeq=shiftSeq;lastGas=!!gas;lastUpdateAt=now;
  }
  return {unlock,tone,hit,finish,update,toggle,isOn};
}
