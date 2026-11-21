// Prepared playback geometry is separate from the original advisory records.
const cache=new WeakMap();
export function prepareTrack(track){
 if(cache.has(track))return cache.get(track);
 const nodes=[];let previous;
 for(let i=0;i<track.length;i++){
  const p=track[i], lon=previous===undefined?p.lon:p.lon+360*Math.round((previous-p.lon)/360);previous=lon;
  const last=nodes.at(-1);
  if(last && last.lat===p.lat && last.lon===lon){last.end=i;continue}
  nodes.push({lat:p.lat,lon,start:i,end:i});
 }
 for(const axis of ['lat','lon']){
  const slopes=nodes.slice(1).map((p,i)=>p[axis]-nodes[i][axis]);
  for(let i=0;i<nodes.length;i++){
   const a=slopes[i-1],b=slopes[i];
   nodes[i][axis+'Slope']=i===0?(b??0):i===nodes.length-1?(a??0):a*b<=0?0:2*a*b/(a+b);
  }
 }
 const prepared={track,nodes};cache.set(track,prepared);return prepared;
}
export function progressAtIndex(track,index){
 const {nodes}=prepareTrack(track);if(nodes.length<2)return track.length>1?index/(track.length-1):0;
 for(let i=0;i<nodes.length;i++){
  if(index<=nodes[i].end)return i/(nodes.length-1);
  const next=nodes[i+1];
  if(next && index<next.start)return (i+(index-nodes[i].end)/(next.start-nodes[i].end))/(nodes.length-1);
 }
 return 1;
}
export function samplePlayback(track,progress){
 if(!track?.length || !Number.isFinite(progress) || progress<0 || progress>1)return null;
 const {nodes}=prepareTrack(track);
 if(nodes.length===1){const rawIndex=progress*(track.length-1);return {coordinates:[nodes[0].lat,nodes[0].lon],rawIndex}}
 const x=progress*(nodes.length-1), i=Math.min(Math.floor(x),nodes.length-2), t=x-i, a=nodes[i], b=nodes[i+1];
 const interpolate=axis=>{
  const h00=2*t**3-3*t**2+1,h10=t**3-2*t**2+t,h01=-2*t**3+3*t**2,h11=t**3-t**2;
  return h00*a[axis]+h10*a[axis+'Slope']+h01*b[axis]+h11*b[axis+'Slope'];
 };
 // At an exact node show its first advisory, except for the final endpoint.
 const rawIndex=progress===1?track.length-1:t===0?a.start:a.end+(b.start-a.end)*t;
 return {coordinates:[interpolate('lat'),interpolate('lon')],rawIndex};
}
export function sampleAtProgress(track,progress){
 const sample=samplePlayback(track,progress);if(!sample)return null;
 const i=Math.floor(sample.rawIndex),t=sample.rawIndex-i,a=track[i],b=track[Math.min(i+1,track.length-1)];
 const wind=Number.isFinite(a.wind) && (t===0 || Number.isFinite(b.wind))?a.wind+(t===0?0:(b.wind-a.wind)*t):null;
 return {coordinates:sample.coordinates,wind};
}
export function smoothedPath(track,steps=12){
 if(!track?.length)return [];
 const {nodes}=prepareTrack(track);
 if(nodes.length===1)return [[nodes[0].lat,nodes[0].lon]];
 const count=(nodes.length-1)*steps;
 return Array.from({length:count+1},(_,i)=>samplePlayback(track,i/count).coordinates);
}
