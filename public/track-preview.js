// Miniatura generata dalla stessa geometria usata dalla pista e dal server.
// Nessuna immagine esterna, distorsione o download aggiuntivo.
export function previewTransform(geometry,width,height,padding=12){
  const points=geometry.centerline;
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
  const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
  const scale=Math.min((width-padding*2)/(maxX-minX),(height-padding*2)/(maxY-minY));
  return {scale,dx:(width-(maxX-minX)*scale)/2-minX*scale,
    dy:(height-(maxY-minY)*scale)/2-minY*scale};
}
export function drawTrackPreview(canvas,geometry){
  if(!canvas||!geometry)return;
  const c=canvas.getContext('2d');
  if(!c)return;
  const w=canvas.width,h=canvas.height;
  c.clearRect(0,0,w,h);
  c.fillStyle='#0c1d23';c.fillRect(0,0,w,h);
  const {scale,dx,dy}=previewTransform(geometry,w,h,14);
  c.save();c.translate(dx,dy);c.scale(scale,scale);
  const line=(width,color)=>{
    c.lineWidth=width/scale;c.strokeStyle=color;c.stroke();
  };
  c.beginPath();c.moveTo(geometry.centerline[0].x,geometry.centerline[0].y);
  for(const p of geometry.centerline)c.lineTo(p.x,p.y);
  c.closePath();c.lineJoin='round';c.lineCap='round';
  line(16,'#34624e');line(11,'#b4c6b3');line(7,'#424f54');
  line(2.5,'#e9f65d');
  const start=geometry.pointAt(0);
  c.save();c.translate(start.x,start.y);c.rotate(start.angle);
  c.strokeStyle='#f7faf0';c.lineWidth=3/scale;
  c.beginPath();c.moveTo(0,-8/scale);c.lineTo(0,8/scale);c.stroke();
  c.restore();c.restore();
}
