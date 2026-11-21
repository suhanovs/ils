export function formatElapsed(ms){
 const minutes=Math.floor(ms/60000), day=Math.floor(minutes/1440)+1, hours=Math.floor(minutes%1440/60), min=minutes%60;
 return `Day ${day} + ${hours}h${min?` ${min}m`:''}`;
}
export function sampleAtElapsed(track, elapsed){
 if(!track?.length)return null;
 const time=Date.parse(track[0].time)+elapsed, end=Date.parse(track.at(-1).time);
 if(time>end || elapsed<0)return null;
 let i=0;while(i<track.length-2 && Date.parse(track[i+1].time)<time)i++;
 const a=track[i],b=track[Math.min(i+1,track.length-1)],span=Date.parse(b.time)-Date.parse(a.time), t=span?(time-Date.parse(a.time))/span:0;
 const wind=t===1?(Number.isFinite(b.wind)?b.wind:null):Number.isFinite(a.wind)&&(t===0 || Number.isFinite(b.wind))?a.wind+(t===0?0:(b.wind-a.wind)*t):null;
 return {coordinates:[a.lat+(b.lat-a.lat)*t,a.lon+(b.lon-a.lon)*t],wind};
}
export function positionAtElapsed(track,elapsed){return sampleAtElapsed(track,elapsed)?.coordinates || null}
