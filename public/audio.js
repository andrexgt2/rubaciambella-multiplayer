// Sintesi originale in Web Audio: nessun file esterno, nessun suono in autoplay.
export function makeRaceAudio(){
  let ctx=null,master=null,engineOsc=null,engineGain=null,engineFilter=null;
  let muted=false;
  try{muted=localStorage.getItem('gridline_muted')==='1';}catch(_){}
  const isOn=()=>!muted;
  function unlock(){
    try{
      if(!ctx){
        const A=window.AudioContext||window.webkitAudioContext;
        if(!A)return;
        ctx=new A();master=ctx.createGain();master.gain.value=muted?0:.6;master.connect(ctx.destination);
        engineFilter=ctx.createBiquadFilter();engineFilter.type='lowpass';engineFilter.frequency.value=480;
        engineGain=ctx.createGain();engineGain.gain.value=0;
        engineOsc=ctx.createOscillator();engineOsc.type='sawtooth';engineOsc.frequency.value=65;
        engineOsc.connect(engineFilter);engineFilter.connect(engineGain);engineGain.connect(master);
        engineOsc.start();
      }
      if(ctx.state==='suspended')ctx.resume().catch(()=>{});
    }catch(_){}
  }
  function toggle(){muted=!muted;try{localStorage.setItem('gridline_muted',muted?'1':'0');}catch(_){}
    if(!muted)unlock();
    if(ctx&&master)master.gain.setTargetAtTime(muted?0:.6,ctx.currentTime,.025);
    return !muted;
  }
  function tone(frequency=750,duration=.11,kind='triangle',level=.10){
    if(muted||!ctx||ctx.state!=='running'||!master)return;
    try{
      const o=ctx.createOscillator(),g=ctx.createGain(),start=ctx.currentTime;
      o.type=kind;o.frequency.setValueAtTime(Math.max(40,frequency),start);
      g.gain.setValueAtTime(.001,start);
      g.gain.exponentialRampToValueAtTime(Math.max(.002,level),start+.015);
      g.gain.exponentialRampToValueAtTime(.001,start+Math.max(.045,duration));
      o.connect(g);g.connect(master);o.start(start);o.stop(start+Math.max(.045,duration)+.02);
    }catch(_){}
  }
  function hit(){tone(95,.12,'sawtooth',.18);tone(59,.19,'triangle',.11);}
  function finish(){tone(660,.17);setTimeout(()=>tone(880,.22),150);setTimeout(()=>tone(1175,.30),320);}
  function update(speed=0,gas=false,racing=false,offroad=false){
    if(!ctx||!engineGain||!engineOsc)return;
    try{
      const t=ctx.currentTime,v=Math.max(0,Math.min(1,Math.abs(speed)/438));
      engineOsc.frequency.setTargetAtTime(65+v*170+(gas?22:0),t,.075);
      engineFilter.frequency.setTargetAtTime(380+v*1100+(gas?240:0),t,.11);
      engineGain.gain.setTargetAtTime(racing&&!muted?(.035+v*.045+(gas?.025:0))*(offroad?.85:1):0,t,.07);
    }catch(_){}
  }
  return {unlock,tone,hit,finish,update,toggle,isOn};
}
