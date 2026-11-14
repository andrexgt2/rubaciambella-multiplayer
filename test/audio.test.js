import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRaceAudio} from '../public/audio.js';

class AudioParamFake{
  constructor(){this.value=0;this.events=[];}
  setTargetAtTime(value){this.value=value;this.events.push(value);}
  setValueAtTime(value){this.value=value;}
  exponentialRampToValueAtTime(value){this.value=value;}
  linearRampToValueAtTime(value){this.value=value;}
}
class AudioNodeFake{
  constructor(){this.gain=new AudioParamFake();this.frequency=new AudioParamFake();
    this.threshold=new AudioParamFake();this.knee=new AudioParamFake();this.ratio=new AudioParamFake();
    this.attack=new AudioParamFake();this.release=new AudioParamFake();this.Q=new AudioParamFake();
    this.playbackRate=new AudioParamFake();this.started=false;}
  connect(node){return node;}
  start(){this.started=true;}
  stop(){}
}
class AudioContextFake{
  constructor(){this.sampleRate=22050;this.state='running';this.currentTime=0;this.destination=new AudioNodeFake();}
  createGain(){return new AudioNodeFake();}
  createDynamicsCompressor(){return new AudioNodeFake();}
  createBiquadFilter(){return new AudioNodeFake();}
  createBufferSource(){return new AudioNodeFake();}
  createOscillator(){return new AudioNodeFake();}
  createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};}
  resume(){this.state='running';return Promise.resolve();}
}

test('WebAudio: texture motore inizializzate, cambiata, collisione, mute e riattivazione',()=>{
  const prev=globalThis.window,oldStorage=globalThis.localStorage;
  globalThis.window={AudioContext:AudioContextFake};
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
  try{
    const audio=makeRaceAudio();
    assert.equal(audio.isOn(),true);
    audio.unlock();
    for(let gear=1;gear<=9;gear++){
      audio.update({speed:60*gear,gas:true,racing:true,gear,shiftSeq:gear,rpm:11000});
    }
    audio.update({speed:125,brake:true,racing:true,gear:3,shiftSeq:8,rpm:5400});
    audio.hit();audio.tone(740,.12);audio.finish();
    assert.equal(audio.toggle(),false);
    audio.update({speed:0,racing:false});
    assert.equal(audio.toggle(),true);
  }finally{globalThis.window=prev;globalThis.localStorage=oldStorage;}
});


test('campioni CC0 locali: lettura, decodifica e stratificazione su due registri',async()=>{
  const oldWin=globalThis.window,oldStorage=globalThis.localStorage;
  const urls=[];let starts=0,decodes=0;
  class SampleAudioContext extends AudioContextFake{
    async decodeAudioData(bytes){assert(bytes instanceof ArrayBuffer);decodes++;return {duration:1.0};}
    createBufferSource(){const n=super.createBufferSource(),old=n.start.bind(n);n.start=(...args)=>{starts++;old(...args);};return n;}
  }
  globalThis.window={AudioContext:SampleAudioContext,fetch:async url=>{urls.push(url);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(24)};}};
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
  try{
    const audio=makeRaceAudio();audio.unlock();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(urls,['/sfx/engine-low.wav','/sfx/engine-high.wav']);
    assert.equal(decodes,2);
    assert(starts>=3,'partono i due WAV e il rumore dell’aspirazione');
    audio.update({racing:true,gas:true,gear:9,rpm:12700,shiftSeq:8,speed:435});
    assert.equal(audio.isOn(),true);
  }finally{globalThis.window=oldWin;globalThis.localStorage=oldStorage;}
});


test('anteprima F1 V8: URL remoto, solo opt-in e volume limitato',()=>{
  const oldWin=globalThis.window,oldStorage=globalThis.localStorage;
  const created=[];
  class FakeMedia{
    constructor(){this.paused=true;this.readyState=4;this.volume=0;this.playbackRate=1;this.loop=false;created.push(this);}
    addEventListener(){}
    play(){this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;}
  }
  globalThis.window={AudioContext:AudioContextFake,Audio:FakeMedia};
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
  try{
    const audio=makeRaceAudio();
    assert.equal(audio.isV8On(),false);
    audio.unlock();
    assert.equal(created.length,0,'l\'MP3 non viene caricato senza consenso');
    assert.equal(audio.toggleV8(),true);
    assert.equal(created.length,1);
    assert.equal(created[0].src,'https://www.myinstants.com/media/sounds/f1-v8.mp3');
    audio.update({racing:true,gas:true,gear:4,shiftSeq:2,rpm:10000,speed:240});
    for(let i=0;i<20;i++)audio.update({racing:true,gas:true,gear:4,shiftSeq:2,rpm:10000,speed:240});
    assert(created[0].volume<=.14,'protezione volume per il campione segnalato come forte');
    assert(created[0].playbackRate>1);
    assert.equal(audio.toggleV8(),false);
    assert(created[0].paused);
  }finally{globalThis.window=oldWin;globalThis.localStorage=oldStorage;}
});
