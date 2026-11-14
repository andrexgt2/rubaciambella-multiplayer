// GRIDLINE GP: cambio sequenziale simulato a NOVE rapporti avanti.
// E' una scelta di gameplay F1-inspired (le monoposto F1 reali hanno 8 avanti + R).
// Tutta la logica e' deterministica e condivisa tra Worker e browser.
export const MAX_GEAR=9;
export const IDLE_RPM=5100;
export const REDLINE_RPM=13000;
// Velocita' nel sistema fisico del gioco (massimo in pista 438).
export const UPSHIFT_AT=[42,83,126,174,223,271,321,378];
export const DOWNSHIFT_BELOW=[0,28,66,106,153,201,249,299,354];
export const GEAR_MIN_SPEED=[0,29,68,109,154,204,253,303,359];
export const GEAR_TOP_SPEED=[47,91,136,186,236,285,338,397,454];
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function nextGear(gear,speed,canShift=true){
  const g=clamp(Math.round(gear)||1,1,MAX_GEAR);
  if(!canShift)return g;
  const v=Math.max(0,Number(speed)||0);
  if(g<MAX_GEAR&&v>=UPSHIFT_AT[g-1])return g+1;
  if(g>1&&v<DOWNSHIFT_BELOW[g-1])return g-1;
  return g;
}
export function rpmForSpeed(gear,speed,gas=false,brake=false){
  const g=clamp(Math.round(gear)||1,1,MAX_GEAR);
  const v=clamp(Math.max(0,Number(speed)||0),0,454);
  const t=clamp((v-GEAR_MIN_SPEED[g-1])/(GEAR_TOP_SPEED[g-1]-GEAR_MIN_SPEED[g-1]),0,1);
  const usable=g===1?t:.35+.65*t;
  return Math.round(clamp(IDLE_RPM+7600*usable+(gas&&!brake?140:0),IDLE_RPM,REDLINE_RPM));
}
