import {rpmForSpeed,IDLE_RPM,REDLINE_RPM} from './transmission.js';

// Registrazioni CC0 campionate a due regimi: layer portante reale, non oscillatore puro.
// Fonti: domasx2, https://opengameart.org/content/racing-car-engine-sound-loops
// NOTA: campioni di automobile da corsa, NON registrazioni di una vera F1.
// Il firing V6 e il cambio sono modellati sopra i campioni.
const ENGINE_LOW='/sfx/engine-low.wav';
const ENGINE_HIGH='/sfx/engine-high.wav';
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export function makeRaceAudio(){
  let ctx=null,master=null,comp=null,engineGain=null,engineFilter=null;
  let samples=[],samplesReady=false,loading=false;
  let combustion=null,combustionGain=null,air=null,airGain=null,airFilter=null,whine=null,whineGain=null;
  let muted=false,lastGear=null,lastShiftSeq=null,lastShiftAt=-10000,lastDirection=0;
  try{muted=localStorage.getItem('gridline_muted')==='1';}catch(_){}
  const isOn=()=>!muted;

  function nodeGain(value){const g=ctx.createGain();g.gain.value=value;return g;}
  function tone(frequency=750,duration=.11,kind='triangle',level=.09){
    if(muted||!ctx||ctx.state!=='running')return;
    const now=ctx.currentTime,o=ctx.createOscillator(),g=nodeGain(.0001),end=now+Math.max(.065,duration);
    o.type=kind;o.frequency.setValueAtTime(Math.max(35,frequency),now);
    g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(Math.max(.002,level),now+.008);
    g.gain.exponentialRampToValueAtTime(.0001,end);
    o.connect(g);g.connect(comp);o.start(now);o.stop(end+.03);
  }
  function noiseBurst(duration=.11,level=.065,frequency=1200){
    if(!ctx||muted||ctx.state!=='running')return;
    const now=ctx.currentTime,n=Math.max(64,Math.floor(ctx.sampleRate*duration));
    const buffer=ctx.createBuffer(1,n,ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<n;i++)data[i]=Math.random()*2-1;
    const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=nodeGain(.0001);
    src.buffer=buffer;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.7;
    g.gain.setValueAtTime(.0001,now);g.gain.linearRampToValueAtTime(level,now+.006);
    g.gain.exponentialRampToValueAtTime(.0001,now+duration);
    src.connect(filter);filter.connect(g);g.connect(comp);src.start(now);src.stop(now+duration);
  }
  function init(){
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    ctx=new AC();
    master=nodeGain(muted?0:.7);comp=ctx.createDynamicsCompressor();
    comp.threshold.value=-14;comp.knee.value=14;comp.ratio.value=4.5;comp.attack.value=.007;comp.release.value=.22;
    comp.connect(master);master.connect(ctx.destination);
    engineGain=nodeGain(0);engineFilter=ctx.createBiquadFilter();engineFilter.type='lowpass';
    engineFilter.frequency.value=3000;engineGain.connect(engineFilter);engineFilter.connect(comp);
    // V6 quattro tempi = tre combustioni per giro. Piccola componente sovrapposta
    // ai veri sample per conservare il timbro acuto del motore racing ad alto regime.
    combustion=ctx.createOscillator();combustion.type='sawtooth';combustion.frequency.value=250;
    combustionGain=nodeGain(0);const mids=ctx.createBiquadFilter();mids.type='bandpass';mids.frequency.value=1350;mids.Q.value=.65;
    combustion.connect(mids);mids.connect(combustionGain);combustionGain.connect(engineGain);combustion.start();
    // Aspirazione e vento filtrati, senza loop elettronico monotono.
    const n=Math.floor(ctx.sampleRate*.8),buf=ctx.createBuffer(1,n,ctx.sampleRate),v=buf.getChannelData(0);
    let seed=141219;for(let i=0;i<n;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;v[i]=((seed>>>0)/2147483648)-1;}
    air=ctx.createBufferSource();air.buffer=buf;air.loop=true;
    airFilter=ctx.createBiquadFilter();airFilter.type='highpass';airFilter.frequency.value=1900;
    airGain=nodeGain(.0);air.connect(airFilter);airFilter.connect(airGain);airGain.connect(engineGain);air.start();
    whine=ctx.createOscillator();whine.type='triangle';whine.frequency.value=160;
    whineGain=nodeGain(0);whine.connect(whineGain);whineGain.connect(comp);whine.start();
    loadSamples();
  }
  async function loadSamples(){
    if(loading||!ctx||typeof window.fetch!=='function')return;
    loading=true;
    try{
      const buffers=await Promise.all([ENGINE_LOW,ENGINE_HIGH].map(async path=>{
        const response=await window.fetch(path,{cache:'force-cache'});
        if(!response.ok)throw new Error(`Motore non disponibile: ${response.status}`);
        return ctx.decodeAudioData(await response.arrayBuffer());
      }));
      for(const [i,buffer] of buffers.entries()){
        const src=ctx.createBufferSource(),gain=nodeGain(0);
        src.buffer=buffer;src.loop=true;
        src.connect(gain);gain.connect(engineGain);src.start();
        samples.push({src,gain,base:i===0?6100:8100});
      }
      samplesReady=true;
    }catch(_){
      // Fallback sonoro se il browser non riesce a decodificare uno dei WAV.
      samplesReady=false;
    }
  }
  function unlock(){
    if(muted)return;
    try{if(!ctx)init();if(ctx?.state==='suspended')ctx.resume().catch(()=>{});}catch(_){}
  }
  function toggle(){
    muted=!muted;try{localStorage.setItem('gridline_muted',muted?'1':'0');}catch(_){}
    if(!muted)unlock();
    if(ctx&&master)master.gain.setTargetAtTime(muted?0:.7,ctx.currentTime,.025);
    return !muted;
  }
  function gearClack(direction){
    // Molto breve: il momento importante e' il calo reale di RPM nel motore.
    noiseBurst(direction>0?.067:.078,direction>0?.080:.063,direction>0?2100:1500);
    if(direction<0)tone(245,.065,'triangle',.033); // blip di scalata
  }
  function hit(){noiseBurst(.15,.12,480);tone(82,.12,'triangle',.07);}
  function finish(){tone(650,.15);setTimeout(()=>tone(830,.19),155);setTimeout(()=>tone(1040,.25),330);}
  function update(o={}){
    if(!ctx||ctx.state!=='running')return;
    const {speed=0,gas=false,brake=false,racing=false,offroad=false,gear=1,rpm,shiftSeq=0}=o;
    const t=ctx.currentTime;
    const actualRpm=clamp(Number.isFinite(rpm)&&rpm>1000?rpm:rpmForSpeed(gear,speed,gas,brake),IDLE_RPM,REDLINE_RPM);
    const throttle=gas&&!brake?1:0,load=racing&&!muted;
    const shift=lastShiftSeq!==null&&shiftSeq!==lastShiftSeq;
    if(load&&shift){
      lastShiftAt=t;lastDirection=gear>(lastGear||gear)?1:-1;gearClack(lastDirection);
    }
    lastGear=gear;lastShiftSeq=shiftSeq;
    const elapsed=t-lastShiftAt;
    const cut=elapsed<.085?.16:elapsed<.23?.16+.84*((elapsed-.085)/.145):1;
    if(samplesReady){
      const hi=clamp((actualRpm-6200)/5700,0,1);
      for(const [i,s] of samples.entries()){
        const rate=clamp(actualRpm/s.base, .58,2.6);
        s.src.playbackRate.setTargetAtTime(rate,t,.024);
        s.gain.gain.setTargetAtTime((i===0?1-hi*.8:hi*.87)*.64,t,.055);
      }
    }
    const fallback=samplesReady?.015:.27;
    combustion.frequency.setTargetAtTime(actualRpm/20,t,.035);
    combustionGain.gain.setTargetAtTime(fallback*(.45+.55*throttle),t,.045);
    airFilter.frequency.setTargetAtTime(1400+actualRpm*.31,t,.08);
    airGain.gain.setTargetAtTime(.012+throttle*.016+Math.abs(speed)/438*.014,t,.09);
    whine.frequency.setTargetAtTime(120+(actualRpm/30),t,.04);
    whineGain.gain.setTargetAtTime(load?.007:0,t,.06);
    engineFilter.frequency.setTargetAtTime(1900+actualRpm*.33+throttle*700,t,.06);
    engineGain.gain.setTargetAtTime(load?(offroad?.78:1)*(.34+.26*throttle)*cut:0,t,elapsed<.23?.012:.055);
  }
  return {unlock,tone,hit,finish,update,toggle,isOn};
}
