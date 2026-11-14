import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRaceAudio} from '../public/audio.js';
import {IDLE_RPM,targetRPM} from '../public/powertrain.js';
class Param{
  constructor(){this.value=0;this.events=[];}
  setTargetAtTime(value){this.value=value;this.events.push(value);}
  setValueAtTime(value){this.value=value;}
  exponentialRampToValueAtTime(value){this.value=value;}
  linearRampToValueAtTime(value){this.value=value;}
}
class Node{
  constructor(){this.gain=new Param();this.frequency=new Param();this.playbackRate=new Param();
    for(const name of ['threshold','knee','ratio','attack','release','Q'])this[name]=new Param();
    this.starts=0;this.stops=0;}
  connect(to){return to;}
  start(){this.starts++;}
  stop(){this.stops++;}
}
class Ctx{
  static last=null;
  constructor(){this.sampleRate=22050;this.state='running';this.currentTime=0;this.destination=new Node();
    this.nodes=[];Ctx.last=this;}
  createGain(){const x=new Node();this.nodes.push(x);return x;}
  createDynamicsCompressor(){return this.createGain();}
  createBiquadFilter(){return this.createGain();}
  createBufferSource(){return this.createGain();}
  createOscillator(){return this.createGain();}
  createBuffer(_channels,n){return {getChannelData:()=>new Float32Array(n)};}
  resume(){this.state='running';return Promise.resolve();}
}
const setup=(fetch)=>{
  const oldW=globalThis.window,oldStorage=globalThis.localStorage;
  globalThis.window={AudioContext:Ctx,...fetch?{fetch}:{} };
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
  return ()=>{globalThis.window=oldW;globalThis.localStorage=oldStorage;};
};

test('regime audio fluido: 0-438 senza salti da marce o aggiornamenti di rete',()=>{
  const cleanup=setup();
  try{
    const a=makeRaceAudio();a.unlock();
    assert.equal(a.getRPM(),IDLE_RPM);
    let last=a.getRPM();
    for(let speed=0;speed<=438;speed+=4){
      const current=a.update({speed,gas:true,racing:true,dt:.016});
      assert(current>=last);
      assert(current-last<110,"variazioni smussate fra un frame e l’altro");
      last=current;
    }
    for(let i=0;i<100;i++)a.update({speed:200,gas:false,racing:true,dt:.016});
    assert(a.getRPM()<last,'rilasciando il gas il motore decelera');
    a.hit();a.tone(740,.12);a.finish();
    assert.equal(a.toggle(),false);
    assert.equal(a.toggle(),true);
  }finally{cleanup();}
});

test('campioni originali locali: due loop continui, pitch filtrato e nessun MP3 esterno',async()=>{
  const urls=[];let starts=0;
  class SampleCtx extends Ctx{
    async decodeAudioData(data){assert(data instanceof ArrayBuffer);return {duration:1};}
    createBufferSource(){const x=super.createBufferSource(),start=x.start.bind(x);
      x.start=()=>{starts++;start();};return x;}
  }
  const cleanup=setup(async url=>{urls.push(url);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(32)};});
  globalThis.window.AudioContext=SampleCtx;
  globalThis.window.Audio=class {constructor(){throw new Error('Non usare player audio esterni');}};
  try{
    const audio=makeRaceAudio();audio.unlock();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(urls,['/sfx/engine-low.wav','/sfx/engine-high.wav']);
    assert.equal(starts,3,'due campioni e aspirazione avviati una sola volta');
    for(let i=0;i<160;i++)audio.update({speed:Math.min(438,i*4),gas:true,racing:true,dt:.016});
    assert.equal(starts,3,'non bisogna riavviare audio nei singoli frame');
    assert(audio.getRPM()>IDLE_RPM);
    assert.equal(audio.isOn(),true);
  }finally{cleanup();}
});

test('a gara terminata il motore si dissolve a zero e non riparte da solo',()=>{
  const cleanup=setup();
  try{
    const a=makeRaceAudio();a.unlock();
    const ctx=Ctx.last;
    a.update({speed:350,gas:true,racing:true,dt:.04});
    a.update({speed:350,racing:false,dt:.04});
    const values=ctx.nodes.filter(x=>x.gain.events.length).flatMap(x=>x.gain.events);
    assert(values.includes(0),"master del motore a zero quando la gara non è attiva");
    assert.equal(a.isV8On,undefined,'nessuna opzione MP3 remota');
  }finally{cleanup();}
});
