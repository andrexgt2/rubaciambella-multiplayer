import test from 'node:test';
import assert from 'node:assert/strict';
import {getTrack,TRACK_OPTIONS} from '../public/track.js';
import {previewTransform,drawTrackPreview} from '../public/track-preview.js';

test('miniature: tutti i tracciati mantengono la proporzione e restano nel canvas',()=>{
  for(const {id} of TRACK_OPTIONS){
    const track=getTrack(id);
    const width=250,height=130;
    const {scale,dx,dy}=previewTransform(track,width,height,14);
    assert(scale>0,'scala valida per '+id);
    for(const point of track.centerline){
      const x=point.x*scale+dx,y=point.y*scale+dy;
      assert(x>=13.99&&x<=width-13.99,'x dentro miniatura '+id);
      assert(y>=13.99&&y<=height-13.99,'y dentro miniatura '+id);
    }
  }
});

test('miniature: disegna il tracciato e la linea di partenza senza DOM aggiuntivo',()=>{
  let strokes=0,lines=0;
  const ctx={
    clearRect(){},fillRect(){},save(){},restore(){},translate(){},scale(){},rotate(){},
    beginPath(){},moveTo(){},lineTo(){lines++;},closePath(){},
    stroke(){strokes++;},set fillStyle(_v){},set strokeStyle(_v){},
    set lineWidth(_v){},set lineJoin(_v){},set lineCap(_v){}
  };
  const canvas={width:250,height:130,getContext:mode=>mode==='2d'?ctx:null};
  drawTrackPreview(canvas,getTrack('silverstone'));
  assert(strokes>=5,'asfalto, margini, centreline e start visibili');
  assert(lines>getTrack('silverstone').centerline.length,'disegno dell’intero tracciato');
});
