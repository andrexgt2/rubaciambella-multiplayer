// Gestione resiliente dello sterzo: Pointer Events primari, Touch Events di recupero.
// Su Safari mobile il rilascio del dito puo' non tornare all'elemento catturante.
export function bindSteering({pad,thumb,onChange,onStart=()=>{},root=window,doc=document}){
  let activePointer=null,activeTouch=null;
  function reset(){
    activePointer=null;activeTouch=null;onChange(0);
    thumb.style.transform='translateX(0px)';pad.classList.remove('pressed');
  }
  function steerTo(e){
    const r=pad.getBoundingClientRect();
    const range=Math.max(1,(r.width-83)/2);
    const v=Math.max(-1,Math.min(1,(e.clientX-(r.left+r.width/2))/range));
    const steer=Math.abs(v)<.10?0:v;
    onChange(steer);
    thumb.style.transform=`translateX(${(steer*range).toFixed(1)}px)`;
    pad.classList.toggle('pressed',Math.abs(steer)>.12);
  }
  pad.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    e.preventDefault();onStart();
    // Un nuovo dito sullo sterzo sostituisce un eventuale pointer rimasto orfano.
    activePointer=e.pointerId;activeTouch=null;
    try{pad.setPointerCapture(e.pointerId);}catch(_){ }
    steerTo(e);
  });
  pad.addEventListener('pointermove',e=>{
    if(e.pointerId!==activePointer)return;
    e.preventDefault();steerTo(e);
  });
  function endPointer(e){if(e.pointerId===activePointer)reset();}
  for(const ev of ['pointerup','pointercancel','lostpointercapture']){
    pad.addEventListener(ev,endPointer);
    root.addEventListener(ev,endPointer,true);
  }
  // Rileva quale dito e' lo sterzo, anche quando un altro dito tiene GAS premuto.
  doc.addEventListener('touchstart',e=>{
    if(activePointer===null||activeTouch!==null)return;
    for(const touch of Array.from(e.changedTouches)){
      if(pad.contains(touch.target)){activeTouch=touch.identifier;break;}
    }
  },{capture:true,passive:true});
  function reconcileTouches(e){
    if(activePointer===null)return;
    if(activeTouch!==null){
      if(!Array.from(e.touches).some(t=>t.identifier===activeTouch))reset();
    }else if((e.type==='touchend'||e.type==='touchcancel')&&e.touches.length===0){
      reset();
    }
  }
  for(const ev of ['touchmove','touchend','touchcancel'])
    doc.addEventListener(ev,reconcileTouches,{capture:true,passive:true});
  return {reset};
}
