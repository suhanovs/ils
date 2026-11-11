export function compareStorms(a,b) {
 return b.year-a.year || Number(b.id.slice(2,4))-Number(a.id.slice(2,4)) || a.name.localeCompare(b.name);
}
export function observationLabel(wind) {
 if(!Number.isFinite(wind)||wind<0) return 'Wind unavailable';
 const category=wind>=137?5:wind>=113?4:wind>=96?3:wind>=83?2:wind>=64?1:0;
 const force=category?`Category ${category} wind equivalent`:wind>=34?'Tropical storm force':'Below tropical storm force';
 return `${wind} kt / ${Math.round(wind*1.15078)} mph · ${force}`;
}
export function intensityColor(wind) {
 if(!Number.isFinite(wind)||wind<0) return '#c5cbd0';
 return wind>=137?'#b080f2':wind>=113?'#df65cf':wind>=96?'#fa5961':wind>=83?'#ff8750':wind>=64?'#ffb955':wind>=34?'#ffe776':'#d7f4ff';
}

export function defaultStorm(storms) {
 const sorted=[...storms].sort(compareStorms);
 return sorted.find(s=>Array.isArray(s.statusValues) && s.statusValues.includes("HU")) || sorted[0];
}
