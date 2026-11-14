// Trasmissione automatica racing: una logica, condivisa tra server e test.
// Velocità in unità del mondo di gioco; RPM visualizzati/audio sono simulati.
export const MAX_GEAR=6;
export const UPSHIFT_AT=[70,128,195,269,354];
export const DOWNSHIFT_BELOW=[0,43,94,155,220,296];
export const GEAR_MIN_SPEED=[0,38,92,151,212,288];
export const GEAR_TOP_SPEED=[70,128,195,269,354,448];
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function nextGear(gear,speed,canShift=true){
  let g=clamp(Math.round(gear)||1,1,MAX_GEAR);
  if(!canShift)return g;
  if(speed>=UPSHIFT_AT[g-1]&&g<MAX_GEAR)return g+1;
  if(g>1&&speed<DOWNSHIFT_BELOW[g-1])return g-1;
  return g;
}
export function rpmForSpeed(gear,speed,gas=false,brake=false){
  const g=clamp(Math.round(gear)||1,1,MAX_GEAR);
  const value=clamp(Math.abs(speed),0,450);
  const t=clamp((value-GEAR_MIN_SPEED[g-1])/(GEAR_TOP_SPEED[g-1]-GEAR_MIN_SPEED[g-1]),0,1);
  // Un V6 ad alto regime: il rapporto superiore fa scendere i giri.
  return Math.round(clamp(3300+8300*t+(gas&&!brake?320:0),3000,11900));
}
