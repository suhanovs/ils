export function sampleAtProgress(track, progress){
 if(!track?.length || !Number.isFinite(progress) || progress<0 || progress>1)return null;
 const index=progress*(track.length-1), i=Math.floor(index), t=index-i;
 const a=track[i], b=track[Math.min(i+1,track.length-1)];
 const wind=Number.isFinite(a.wind) && (t===0 || Number.isFinite(b.wind)) ? a.wind+(t===0?0:(b.wind-a.wind)*t) : null;
 return {coordinates:[a.lat+(b.lat-a.lat)*t,a.lon+(b.lon-a.lon)*t],wind};
}
