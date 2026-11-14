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
    for(let gear=1;gear<=6;gear++){
      audio.update({speed:60*gear,gas:true,racing:true,gear,shiftSeq:gear,rpm:11000});
    }
    audio.update({speed:125,brake:true,racing:true,gear:3,shiftSeq:8,rpm:5400});
    audio.hit();audio.tone(740,.12);audio.finish();
    assert.equal(audio.toggle(),false);
    audio.update({speed:0,racing:false});
    assert.equal(audio.toggle(),true);
  }finally{globalThis.window=prev;globalThis.localStorage=oldStorage;}
});
