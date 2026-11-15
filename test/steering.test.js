import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSteering} from '../public/steering.js';

class FakePad extends EventTarget{
  constructor(){
    super();this.style={};this.pressed=false;
    this.classList={
      remove:()=>{this.pressed=false;},
      toggle:(_name,yes)=>{this.pressed=Boolean(yes);}
    };
  }
  getBoundingClientRect(){return {left:0,width:183};}
  setPointerCapture(){}
  contains(node){return node===this;}
}
function emit(target,type,fields={}){
  const event=new Event(type,{cancelable:true});Object.assign(event,fields);
  target.dispatchEvent(event);
}
function create(){
  const pad=new FakePad(),thumb={style:{}},root=new EventTarget(),doc=new EventTarget();
  let steer=0;
  const control=bindSteering({pad,thumb,root,doc,onChange:v=>{steer=v;}});
  return {pad,thumb,root,doc,control,get steer(){return steer;}};
}
test('rilascio su window azzera sterzo e grafica anche senza pointerup sul pad',()=>{
  const c=create();emit(c.pad,'pointerdown',{pointerId:5,clientX:180,pointerType:'touch'});
  assert(c.steer>.95);assert(c.pad.pressed);
  emit(c.root,'pointerup',{pointerId:5});
  assert.equal(c.steer,0);assert.equal(c.thumb.style.transform,'translateX(0px)');
  assert.equal(c.pad.pressed,false);
});
test('sollevare GAS non azzera lo sterzo: riconosce il dito giusto',()=>{
  const c=create();emit(c.pad,'pointerdown',{pointerId:5,clientX:180,pointerType:'touch'});
  emit(c.doc,'touchstart',{changedTouches:[{identifier:10,target:c.pad}],touches:[{identifier:10,target:c.pad}]});
  emit(c.doc,'touchend',{changedTouches:[{identifier:11}],touches:[{identifier:10,target:c.pad}]});
  assert(c.steer>.95);
  emit(c.doc,'touchend',{changedTouches:[{identifier:10,target:c.pad}],touches:[{identifier:11}]});
  assert.equal(c.steer,0);
});
test('touchcancel azzera sterzo e un nuovo tocco recupera pointer rimasto bloccato',()=>{
  const c=create();emit(c.pad,'pointerdown',{pointerId:5,clientX:180,pointerType:'touch'});
  emit(c.doc,'touchcancel',{changedTouches:[{identifier:10}],touches:[]});
  assert.equal(c.steer,0);
  emit(c.pad,'pointerdown',{pointerId:8,clientX:2,pointerType:'touch'});
  assert(c.steer<-.95);
  emit(c.root,'lostpointercapture',{pointerId:5});
  assert(c.steer<-.95);
  emit(c.root,'pointercancel',{pointerId:8});
  assert.equal(c.steer,0);
});
test('un nuovo tocco rimpiazza un vecchio pointer senza riavviare il gioco',()=>{
  const c=create();emit(c.pad,'pointerdown',{pointerId:1,clientX:2,pointerType:'touch'});
  assert(c.steer<-.95);
  emit(c.pad,'pointerdown',{pointerId:2,clientX:180,pointerType:'touch'});
  assert(c.steer>.95);
  emit(c.root,'pointerup',{pointerId:1});
  assert(c.steer>.95);
  c.control.reset();assert.equal(c.steer,0);
});
