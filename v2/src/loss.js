function nonnegative(n,name) { if(!Number.isFinite(n)||n<0) throw new RangeError(`${name} must be finite and nonnegative`); }
// Returns 0 outside, 1 inside, 2 on boundary, including a hole boundary.
function ringPosition([x,y],ring) {
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
  const [ax,ay]=ring[j], [bx,by]=ring[i];
  const cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax);
  if(Math.abs(cross)<1e-12 && x>=Math.min(ax,bx)-1e-12 && x<=Math.max(ax,bx)+1e-12 && y>=Math.min(ay,by)-1e-12 && y<=Math.max(ay,by)+1e-12) return 2;
  if((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
 }
 return inside?1:0;
}
function polygonContains(point,rings) {
 const outer=ringPosition(point,rings[0]);
 if(!outer) return false;
 for(const hole of rings.slice(1)) {const p=ringPosition(point,hole); if(p===1) return false; if(p===2) return true;}
 return true;
}
export function classifyPoint(point,event) {
 if(!Array.isArray(point)||point.length<2||!point.slice(0,2).every(Number.isFinite)) throw new RangeError('invalid point');
 if(event==null) return 0;
 if(event.type!=='FeatureCollection'||!Array.isArray(event.features)) throw new TypeError('event must be a GeoJSON FeatureCollection');
 let result=0;
 for(const f of event.features) {
  const radius=Number(f.properties?.RADII);
  if(![34,50,64].includes(radius)||radius<=result) continue;
  const g=f.geometry;
  if(g?.type!=='Polygon'&&g?.type!=='MultiPolygon') throw new TypeError('swath geometry must be Polygon or MultiPolygon');
  const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;
  if(polygons.some(p=>polygonContains(point,p))) result=radius;
 }
 return result;
}
export function layerOutcome(loss,{attachment,limit,principal,rateOnLine}) {
 for(const [k,v] of Object.entries({loss,attachment,limit,principal,rateOnLine})) nonnegative(v,k);
 if(principal>limit) throw new RangeError('principal exceeds layer limit');
 const share=limit ? principal/limit : 0;
 const cededLoss=Math.min(limit,Math.max(0,loss-attachment));
 const investorLoss=cededLoss*share, premium=principal*rateOnLine;
 return {attachment,limit,principal,rateOnLine,share,cededLoss,investorLoss,premium,netReturn:premium-investorLoss};
}

// Same bounding-box midpoint used by generateMarket; not necessarily in tract.
function representativePoint(geometry) {
 if(!geometry || !['Polygon','MultiPolygon'].includes(geometry.type)) throw new TypeError('tract geometry must be Polygon or MultiPolygon');
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 function visit(a) {
  if(!Array.isArray(a)||!a.length) throw new TypeError('invalid tract coordinates');
  if(typeof a[0]==='number') {
   if(!Number.isFinite(a[0])||!Number.isFinite(a[1])) throw new TypeError('invalid tract coordinates');
   minX=Math.min(minX,a[0]); maxX=Math.max(maxX,a[0]); minY=Math.min(minY,a[1]); maxY=Math.max(maxY,a[1]);
  } else a.forEach(visit);
 }
 visit(geometry.coordinates);
 return [(minX+maxX)/2,(minY+maxY)/2];
}
export function simulatePortfolio({features,market,event,positions,capital}) {
 nonnegative(capital,'capital');
 if(!Array.isArray(features)||!market||!Array.isArray(market.cedents)||!Array.isArray(market.tracts)||features.length!==market.tracts.length||!Array.isArray(positions)) throw new TypeError('invalid market, features or positions');
 const seen=new Set(); let totalWeight=0;
 for(const p of positions) {
  if(!Number.isInteger(p.index)||p.index<0||p.index>=market.cedents.length||seen.has(p.index)) throw new RangeError('invalid or duplicate cedent index');
  seen.add(p.index);
  for(const k of ['weight','attachmentFraction','limitFraction','rateOnLine']) nonnegative(p[k],k);
  if(p.attachmentFraction+p.limitFraction>1) throw new RangeError('attachment plus limit exceeds exposure');
  totalWeight+=p.weight;
 }
 if(!Number.isFinite(totalWeight)) throw new RangeError('invalid total weight');
 const factors={0:0,34:.01,50:.05,64:.2}, values=positions.map(()=>({units:0,grossLoss:0}));
 const tracts=features.map((feature,i)=>{
  const point=representativePoint(feature.geometry), threshold=classifyPoint(point,event), damageFactor=factors[threshold];
  const allocations=market.tracts[i]?.allocations;
  if(!Array.isArray(allocations)||allocations.length!==market.cedents.length) throw new TypeError('invalid tract allocations');
  positions.forEach((p,j)=>{
   const units=allocations[p.index]; nonnegative(units,'allocation');
   values[j].units+=units; values[j].grossLoss+=units*300000*damageFactor;
  });
  return {point,threshold,damageFactor};
 });
 const results=positions.map((p,j)=>{
  const {units,grossLoss}=values[j], exposure=units*300000;
  const attachment=exposure*p.attachmentFraction, limit=exposure*p.limitFraction;
  const budget=totalWeight?capital*p.weight/totalWeight:0, principal=Math.min(limit,budget);
  return {index:p.index,name:market.cedents[p.index].name,weight:p.weight,units,exposure,grossLoss,budget,...layerOutcome(grossLoss,{attachment,limit,principal,rateOnLine:p.rateOnLine})};
 });
 const sum=key=>results.reduce((a,p)=>a+p[key],0);
 const totalPrincipal=sum('principal'), investorLoss=sum('investorLoss'), premium=sum('premium');
 return {tracts,positions:results,capital,totalPrincipal,unallocatedCapital:capital-totalPrincipal,investorLoss,premium,netReturn:premium-investorLoss,returnOnPrincipal:totalPrincipal?(premium-investorLoss)/totalPrincipal:null};
}
