// Curva di regime continua: il motore segue il carico e la velocita', non le marce.
// Usata sia dal server (fisica) sia dal client (interpolazione audio locale).
export const IDLE_RPM=1900;
export const REDLINE_RPM=12600;
export const TOP_SPEED=438;
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));

export function targetRPM(speed=0,gas=false,brake=false){
  const v=clamp(Math.max(0,Number(speed)||0)/TOP_SPEED,0,1);
  const throttle=gas&&!brake?1:0;
  // Il movimento trascina il motore; il gas aggiunge un transitorio di carico.
  // La combinazione e' intenzionalmente semplificata, ma non crea salti di rapporto.
  const rev=(.72*Math.pow(v,.86)+throttle*(.18+.035*v));
  return clamp(IDLE_RPM+(REDLINE_RPM-IDLE_RPM)*rev,IDLE_RPM,REDLINE_RPM);
}

export function advanceRPM(current,target,dt){
  const v=Number.isFinite(current)?current:IDLE_RPM;
  const aim=clamp(Number.isFinite(target)?target:IDLE_RPM,IDLE_RPM,REDLINE_RPM);
  const step=clamp(Number.isFinite(dt)?dt:0,0,.09);
  const tau=aim>v?.22:.34; // salita reattiva, rilascio piu' inerziale
  const eased=(aim-v)*(1-Math.exp(-step/tau));
  const delta=clamp(eased,-5600*step,6800*step);
  return clamp(v+delta,IDLE_RPM,REDLINE_RPM);
}
