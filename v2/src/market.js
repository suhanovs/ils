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
 const eligible=features.map((f,i)=>f.properties.housing_units_estimate>0?i:-1).filter(i=>i>=0);
 if(!eligible.length) throw new RangeError('Housing data is empty');
 const anchors=Array.from({length:3},()=>locations[eligible[Math.floor(rand()*eligible.length)]]);
 const cedents=Array.from({length:6},(_,i)=>({name:`Cedent ${String.fromCharCode(65+i)}`,center:anchors[Math.floor(i/2)],radius:100+rand()*100,weight:0.5+rand(),amount:0,share:0}));
 const tracts=features.map((f,i)=>{
  const distances=cedents.map(c=>distance(locations[i],c.center));
  const scores=cedents.map((c,j)=>c.weight*Math.max(0,1-distances[j]/c.radius)**2);
  const sum=scores.reduce((a,b)=>a+b,0), housing=Math.max(0,f.properties.housing_units_estimate);
  const allocations=scores.map((s,j)=>{const value=housing*0.65*s/(1+sum);cedents[j].amount+=value;return value});
  return {allocations,distances};
 });
 const total=cedents.reduce((s,c)=>s+c.amount,0);cedents.forEach(c=>{c.share=total?c.amount/total:0});
 return {seed,cedents,tracts};
}
export function summarizeSelection(market,selected) {
 const indices=[...new Set(selected)].filter(i=>Number.isInteger(i)&&i>=0&&i<market.cedents.length);
 let amount=0;
 const tracts=market.tracts.map(t=>{let value=0,count=0;for(const i of indices){value+=t.allocations[i];if(t.allocations[i]>0)count++}amount+=value;return {value,count}});
 return {amount,tracts};
}
