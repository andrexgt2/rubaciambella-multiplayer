import {IDLE_RPM,REDLINE_RPM,targetRPM,advanceRPM} from './powertrain.js';

// Motore GRIDLINE GP V10: due loop WAV CC0 di auto da corsa, miscelati e
// riprodotti in UN grafo WebAudio a pitch continuo, con un tenue firing V8.
// NON c'e' HTMLAudioElement, streaming esterno, restart o cambio marcia.
const ENGINE_LOW='/sfx/engine-low.wav';
const ENGINE_HIGH='/sfx/engine-high.wav';
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));

export function makeRaceAudio(){
  let ctx=null,master=null,comp=null,engineGain=null,engineFilter=null;
  let samples=[],samplesReady=false,loading=false;
  let firing=null,firingGain=null,intake=null,intakeGain=null,intakeFilter=null;
  let rpm=IDLE_RPM,muted=false;
  try{muted=localStorage.getItem('gridline_muted')==='1';}catch(_){}
  const isOn=()=>!muted;
  const getRPM=()=>rpm;
  function gain(value=0){const n=ctx.createGain();n.gain.value=value;return n;}
  function tone(frequency=750,duration=.11,kind='triangle',level=.085){
    if(muted||!ctx||ctx.state!=='running')return;
    const now=ctx.currentTime,o=ctx.createOscillator(),g=gain(.0001);
    const end=now+Math.max(.065,duration);
    o.type=kind;o.frequency.setValueAtTime(Math.max(35,frequency),now);
    g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(Math.max(.002,level),now+.012);
    g.gain.exponentialRampToValueAtTime(.0001,end);
    o.connect(g);g.connect(comp);o.start(now);o.stop(end+.025);
  }
  function noiseBurst(duration=.11,level=.065,frequency=1100){
    if(muted||!ctx||ctx.state!=='running')return;
    const now=ctx.currentTime,len=Math.max(64,Math.floor(ctx.sampleRate*duration));
    const buffer=ctx.createBuffer(1,len,ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<len;i++)data[i]=Math.random()*2-1;
    const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=gain(.0001);
    src.buffer=buffer;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.75;
    g.gain.setValueAtTime(.0001,now);g.gain.linearRampToValueAtTime(level,now+.008);
    g.gain.exponentialRampToValueAtTime(.0001,now+duration);
    src.connect(filter);filter.connect(g);g.connect(comp);src.start(now);src.stop(now+duration);
  }
  function init(){
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    ctx=new AC();
    master=gain(muted?0:.57);comp=ctx.createDynamicsCompressor();
    comp.threshold.value=-16;comp.knee.value=14;comp.ratio.value=4;
    comp.attack.value=.006;comp.release.value=.24;
    comp.connect(master);master.connect(ctx.destination);
    engineGain=gain(0);engineFilter=ctx.createBiquadFilter();
    engineFilter.type='lowpass';engineFilter.frequency.value=2600;
    engineGain.connect(engineFilter);engineFilter.connect(comp);
    // V8 quattro tempi: otto cilindri / due giri = quattro accensioni per giro.
    // Componente MOLTO leggera: i due loop campionati definiscono il timbro.
    firing=ctx.createOscillator();firing.type='triangle';firing.frequency.value=IDLE_RPM/15;
    const resonator=ctx.createBiquadFilter();resonator.type='bandpass';resonator.frequency.value=1060;resonator.Q.value=.7;
    firingGain=gain(0);firing.connect(resonator);resonator.connect(firingGain);
    firingGain.connect(engineGain);firing.start();
    // L'aspirazione e' rumore filtrato: varia con il gas, non con le marce.
    const len=Math.floor(ctx.sampleRate*.6),buf=ctx.createBuffer(1,len,ctx.sampleRate),data=buf.getChannelData(0);
    let seed=17381;for(let i=0;i<len;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data[i]=(seed>>>0)/2147483648-1;}
    intake=ctx.createBufferSource();intake.buffer=buf;intake.loop=true;
    intakeFilter=ctx.createBiquadFilter();intakeFilter.type='bandpass';intakeFilter.frequency.value=2700;intakeFilter.Q.value=.55;
    intakeGain=gain(0);intake.connect(intakeFilter);intakeFilter.connect(intakeGain);intakeGain.connect(engineGain);
    intake.start();
    loadSamples();
  }
  async function loadSamples(){
    if(loading||!ctx||typeof window.fetch!=='function')return;
    loading=true;
    try{
      const buffers=await Promise.all([ENGINE_LOW,ENGINE_HIGH].map(async url=>{
        const res=await window.fetch(url,{cache:'force-cache'});
        if(!res.ok)throw new Error('Campione motore non disponibile');
        return ctx.decodeAudioData(await res.arrayBuffer());
      }));
      for(const [i,buffer] of buffers.entries()){
        const src=ctx.createBufferSource(),g=gain(0);
        src.buffer=buffer;src.loop=true;
        src.connect(g);g.connect(engineGain);src.start();
        samples.push({src,g,reference:i===0?6100:8100});
      }
      samplesReady=true;
    }catch(_){samplesReady=false;}
  }
  function unlock(){
    if(muted)return;
    try{if(!ctx)init();if(ctx?.state==='suspended')ctx.resume().catch(()=>{});}catch(_){}
  }
  function toggle(){
    muted=!muted;
    try{localStorage.setItem('gridline_muted',muted?'1':'0');}catch(_){}
    if(!muted)unlock();
    if(ctx&&master)master.gain.setTargetAtTime(muted?0:.57,ctx.currentTime,.045);
    return !muted;
  }
  function hit(){noiseBurst(.14,.10,520);tone(84,.13,'triangle',.07);}
  function finish(){tone(650,.15);setTimeout(()=>tone(830,.19),155);setTimeout(()=>tone(1040,.24),330);}
  function update({speed=0,gas=false,brake=false,racing=false,offroad=false,dt=.016}={}){
    // Il regime si integra a 60 FPS dal segnale locale GAS e dalla velocita' fisica.
    // I pacchetti multiplayer arrivano piu' lentamente, ma non possono fare saltare il pitch.
    const step=clamp(Number.isFinite(dt)?dt:.016,.001,.065);
    rpm=advanceRPM(rpm,targetRPM(speed,gas,brake),step);
    if(!racing)rpm=advanceRPM(rpm,IDLE_RPM,step);
    if(!ctx||ctx.state!=='running')return rpm;
    const time=ctx.currentTime,throttle=gas&&!brake?1:0;
    const active=racing&&!muted;
    if(samplesReady){
      const hi=clamp((rpm-4600)/7200,0,1);
      // Crossfade a potenza costante, senza restart dei buffer durante la gara.
      const gains=[Math.cos(hi*Math.PI/2),Math.sin(hi*Math.PI/2)];
      samples.forEach(({src,g,reference},i)=>{
        src.playbackRate.setTargetAtTime(clamp(rpm/reference,.44,1.72),time,.095);
        g.gain.setTargetAtTime(gains[i]*.65,time,.13);
      });
    }
    firing.frequency.setTargetAtTime(rpm/15,time,.10);
    firingGain.gain.setTargetAtTime(samplesReady?.018:.11,time,.12);
    intakeFilter.frequency.setTargetAtTime(1800+rpm*.14+throttle*900,time,.12);
    intakeGain.gain.setTargetAtTime(.016+throttle*.022,time,.12);
    engineFilter.frequency.setTargetAtTime(1650+rpm*.28+throttle*550,time,.11);
    // A fine gara / in lobby il motore diventa realmente SILENZIOSO.
    const load=(.22+.16*throttle+.08*clamp(Math.max(0,speed)/438,0,1))*(offroad?.85:1);
    engineGain.gain.setTargetAtTime(active?load:0,time,active?.12:.075);
    return rpm;
  }
  return {unlock,tone,hit,finish,update,toggle,isOn,getRPM};
}
