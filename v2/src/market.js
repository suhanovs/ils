// Fictional market: smooth, bounded territories and fractional housing proxies.
function random(seed) {
 let state=seed >>> 0;
 return ()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296};
}
function center(geometry) {
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 function visit(a){if(typeof a[0]==='number'){minX=Math.min(minX,a[0]);maxX=Math.max(maxX,a[0]);minY=Math.min(minY,a[1]);maxY=Math.max(maxY,a[1]);}else a.forEach(visit)}
 visit(geometry.coordinates); return [(minX+maxX)/2,(minY+maxY)/2];
}
function distance(a,b){const y=(a[1]-b[1])*69, x=(a[0]-b[0])*69*Math.cos((a[1]+b[1])*Math.PI/360);return Math.hypot(x,y)}
export function generateMarket(features, seed) {
 if(!Number.isSafeInteger(seed)||seed<0||seed>4294967295) throw new RangeError('Seed must be an integer from 0 to 4294967295');
 const rand=random(seed), locations=features.map(f=>center(f.geometry));
 const housing=features.map(f=>Math.max(0,Number(f.properties.housing_units_estimate)||0));
 const total=housing.reduce((a,b)=>a+b,0);
 const eligible=housing.map((h,i)=>h>0?i:-1).filter(i=>i>=0);
 if(!eligible.length) throw new RangeError('Housing data is empty');
 // Distinct primary anchors; secondary anchors need not coincide with another company.
 const pool=[...eligible];
 const cedents=Array.from({length:Math.min(36,eligible.length)},(_,i)=>{
  const pick=Math.floor(rand()*pool.length), primary=pool.splice(pick,1)[0];
  const centers=[locations[primary]];
  if(i%3===0) for(let j=0;j<1+(i%9===0?1:0);j++) centers.push(locations[eligible[Math.floor(rand()*eligible.length)]]);
  const target=i<3?[.075,.065,.055][i]:.005+rand()*.011;
  return {name:`Cedent ${String(i+1).padStart(2,'0')}`,centers,radius:75+rand()*105,target,amount:0,share:0};
 });
 // Each firm has a target, not a guaranteed outcome. Competition for tract
 // capacity reduces allocations proportionally and leaves at least 30% elsewhere.
 const scores=features.map((f,i)=>cedents.map(c=>{
  let best=0;
  for(const anchor of c.centers) best=Math.max(best,Math.max(0,1-distance(locations[i],anchor)/c.radius)**2);
  return best*housing[i];
 }));
 const tracts=features.map(()=>({allocations:cedents.map(()=>0)}));
 const remaining=housing.map(h=>h*.7);
 for(let round=0;round<20;round++) {
  const totals=cedents.map((_,j)=>scores.reduce((sum,row,i)=>sum+(remaining[i]>1e-10?row[j]*remaining[i]/(housing[i]||1):0),0));
  const needs=cedents.map(c=>Math.max(0,c.target*total-c.amount));
  if(Math.max(...needs)<total*1e-8) break;
  tracts.forEach((t,i)=>{
   if(remaining[i]<=1e-10) return;
   const proposals=cedents.map((c,j)=>totals[j]?needs[j]*scores[i][j]*(remaining[i]/housing[i])/totals[j]:0);
   const sum=proposals.reduce((a,b)=>a+b,0), scale=sum?Math.min(1,remaining[i]/sum):0;
   proposals.forEach((x,j)=>{const value=x*scale;t.allocations[j]+=value;cedents[j].amount+=value;remaining[i]-=value});
   remaining[i]=Math.max(0,remaining[i]);
  });
 }
 cedents.forEach(c=>{c.share=c.amount/total});
 return {seed,cedents,tracts};
}
export function summarizeSelection(market,selected) {
 const indices=[...new Set(selected)].filter(i=>Number.isInteger(i)&&i>=0&&i<market.cedents.length);
 let amount=0;
 const tracts=market.tracts.map(t=>{let value=0,count=0;for(const i of indices){value+=t.allocations[i];if(t.allocations[i]>0)count++}amount+=value;return {value,count}});
 return {amount,tracts};
}
