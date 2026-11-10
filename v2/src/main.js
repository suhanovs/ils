import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import {pointLabel, clampIndex} from './model.js';
import {generateMarket, summarizeSelection} from './market.js';
import {simulatePortfolio, layerOutcome} from './loss.js';

const app = document.querySelector('#app');
app.innerHTML = `
  <div id="map" aria-label="Interactive map of Hurricane Ian's historical track and cumulative wind swath"></div>
  <header class="topbar"><a class="brand" href="/" title="Return to aboutILS"><span class="brand-mark">✳</span><span>about<span>ILS</span><small>STORM ATLAS</small></span></a><span class="header-tag"><i></i> HISTORICAL EXPLORER</span><a class="back" href="/">← <span>Back to aboutILS</span></a></header>
  <main class="panel"><div class="eyebrow"><span>STORM PROFILE</span><span>ATLANTIC / 2022</span></div><div class="title-row"><div><div class="kicker">NORTH ATLANTIC OCEAN</div><h1>Hurricane Ian</h1><p class="subtitle">A storm in perspective.</p></div><div class="storm-icon">◉</div></div>
  <div class="badges"><span>2022 SEASON</span><span>AL092022</span><span>BEST TRACK</span></div>
  <div class="divider"></div><div class="section-heading"><div><span class="overline">EXPLORE THE STORM</span><h2>Cumulative wind swath</h2></div></div>
  <p class="description">Static estimated wind extent over the full storm; not winds at the selected time.</p>
  <div class="swath-legend" aria-label="Cumulative wind thresholds"><span data-swath="34"><i></i>34 kt · 39 mph</span><span data-swath="50"><i></i>50 kt · 58 mph</span><span data-swath="64"><i></i>64 kt · 74 mph</span></div><button id="track-toggle" aria-pressed="true">Hide track</button>
  <section class="exposure"><div class="divider"></div><h2>Where homes are</h2><fieldset class="visual-options"><legend>Visualization options</legend><label><input id="tract-toggle" type="checkbox"> Housing tracts</label></fieldset><p id="tract-status" role="status"></p><button id="tract-retry" type="button" hidden>Retry loading data</button><details><summary>Find a tract</summary><label for="tract-search">Search Florida tract GEOID</label><input id="tract-search" type="search" inputmode="numeric" placeholder="Enter tract GEOID" disabled><div id="tract-results" aria-live="polite"></div><div id="tract-detail" aria-live="polite"></div></details><div class="divider"></div><div class="market-heading"><h2>Fictional cedent market</h2><span class="help"><button type="button" aria-label="About modeled cedents" aria-describedby="market-help">?</button><span id="market-help" role="tooltip">Fictional insurers use modeled housing, not actual policies. Shares include other insurers statewide.</span></span></div><div class="market-controls"><label for="market-seed">Seed</label><input id="market-seed" type="number" min="0" max="4294967295" step="1" value="42"><button id="market-generate" type="button" disabled>Generate</button><label for="market-view">View</label><select id="market-view"><option value="concentration">Concentration</option><option value="overlap">Overlap</option></select></div><p id="market-error" role="status"></p><p id="market-residual"></p><div id="cedent-list" aria-label="Select cedents"></div><p id="market-summary" aria-live="polite">Loading market…</p><section class="xol"><div class="divider"></div><h2>Junior XOL scenario</h2><p class="xol-caption">Modeled Ian loss · assumed terms</p><label for="xol-capital">Upfront capital ($)</label><input id="xol-capital" type="number" min="0" step="1000" value="1000000"><div class="xol-terms"><label>Attachment (% of exposure)<input id="xol-attachment" type="number" min="0" max="100" step="1" value="2"></label><label>Limit (% of exposure)<input id="xol-limit" type="number" min="0" max="100" step="1" value="8"></label><label>Rate on line (%)<input id="xol-rate" type="number" min="0" step="1" value="10"></label></div><p>Capital is split equally between selected cedents. Unused capital is not redistributed.</p><div id="xol-results" aria-live="polite">Select cedents to model the event.</div><details><summary>How this works</summary><p>One historical, cumulative Ian swath is applied to fictional present-day exposure. Housing units are a proxy, valued at an assumed $300,000 each; threshold damage factors are assumed. A tract midpoint may fall outside its boundary. This is not observed damage or actual claims, and excludes surge and flood.</p><p>The layer pays on cedent event loss above attachment, up to its limit. Investor loss is the funded share; premium is principal × rate on line, and net is premium less investor loss. One event and one fully earned period are shown; fees and other costs are excluded.</p></details></section><details><summary>Sources &amp; assumptions</summary><p class="market-key">Concentration: brighter teal = more exposure. Overlap: amber = one; red = multiple cedents.</p><p>Homes: 2020–2024 Census estimates on 2025 boundaries, including vacant and rented units. Cedents and territories are illustrative. Swaths show storm-lifetime extent, not losses.</p><a href="https://www.census.gov/programs-surveys/acs" target="_blank" rel="noreferrer">Census ↗</a> · <a href="https://www.floir.gov/tools-and-data/residential-market-share-reports" target="_blank" rel="noreferrer">Florida insurance data ↗</a></details></section><a class="source" href="https://www.nhc.noaa.gov/gis/archive_besttrack_results.php?id=al09&amp;name=Hurricane+IAN&amp;year=2022" target="_blank" rel="noreferrer">NOAA NHC best track & GIS data <span>↗</span></a></main>
  <div class="map-label"><span>HISTORICAL VIEW</span><b>Hurricane Ian</b><small>Atlantic Ocean · 2022</small></div>
  <section class="timeline" aria-label="Storm timeline"><div class="timeline-head"><div><span class="overline">STORM TRACK</span><strong id="point-time">Loading track…</strong></div><div class="timeline-actions"><button id="play" aria-label="Play track">▶</button><span id="point-count"></span></div></div><input id="timeline" aria-label="Track point" type="range" min="0" value="0" step="0.001"><div class="timeline-foot"><span>SEP 22</span><span>SELECTED TRACK POINT · UTC</span><span>OCT 01</span></div></section>
  <div id="error" class="error" role="alert" hidden></div>`;

const map = L.map('map', {zoomControl:false, minZoom:3}).setView([25.5,-81], 5);
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
const $ = s => document.querySelector(s);
const colors = {34:'#e3af58',50:'#eb845b',64:'#d85b52'};
const labels = {34:'34 kt · tropical storm force',50:'50 kt · sustained wind',64:'64 kt · hurricane force'};
let trackVisible=true, index=0, points=[], swath, track, marker, timer, stormFailed=false;
const data = name => fetch(`${import.meta.env.BASE_URL}data/ian-${name}.geojson`).then(r=>{if(!r.ok) throw new Error(`${name}: HTTP ${r.status}`); return r.json()});
function drawSwath() {
  if(swath) swath.remove();
  swath=L.layerGroup([34,50,64].map(wind=>L.geoJSON(window.stormSwath,{filter:f=>f.properties.RADII===wind,style:{className:`swath-layer swath-${wind}`,color:colors[wind],weight:1,opacity:.9,fillColor:colors[wind],fillOpacity:.38},interactive:false}))).addTo(map);
  if(trackVisible && track) track.bringToFront();
}
const pointTime = p => {const s=String(p.DTG);return Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8),+s.slice(8,10));};
function selectPoint(i) {
  index=clampIndex(i,points.length); const lo=Math.floor(index), hi=Math.min(lo+1,points.length-1), f=points[lo], next=points[hi], t=index-lo;
  const lerp=(a,b)=>a+(b-a)*t;
  const time=lerp(pointTime(f.properties),pointTime(next.properties));
  const intensity=lerp(f.properties.INTENSITY,next.properties.INTENSITY);
  $('#timeline').value=index; $('#point-time').textContent=t<0.001?pointLabel(f.properties):`${new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'UTC'}).format(time)} UTC · ${intensity.toFixed(1)} kt`;
  $('#point-count').textContent=t<0.001?`${lo+1} / ${points.length}`:'Interpolated';
  const coords=[lerp(f.geometry.coordinates[1],next.geometry.coordinates[1]),lerp(f.geometry.coordinates[0],next.geometry.coordinates[0])];
  const hue=Math.max(0,45-Math.max(0,intensity-30)*.38);
  if(trackVisible) {
    if(!marker) marker=L.marker(coords,{interactive:false,icon:L.divIcon({className:'storm-marker',html:'<span class="storm-symbol"><svg viewBox="0 0 40 40" aria-hidden="true"><path fill="currentColor" d="M20 3C9 3 3 10 2 20c3-5 8-8 14-8-3 2-5 5-5 8 0 5 4 9 9 9 4 0 7-2 9-6 1 8-5 14-14 14 12 2 23-6 23-18C38 10 30 3 20 3Zm0 12a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" fill-rule="evenodd"/></svg></span>',iconSize:[32,32],iconAnchor:[16,16]})}).addTo(map);
    else {marker.setLatLng(coords);if(!map.hasLayer(marker))marker.addTo(map)}
    marker.getElement()?.querySelector('.storm-symbol')?.style.setProperty('--storm-hue',hue);
  } else if(marker) marker.remove();
}
function stop() {if(timer)cancelAnimationFrame(timer);timer=null;$('#play').textContent='▶';$('#play').setAttribute('aria-label','Play track');}
function play() {
  if(timer){stop();return} if(index>=points.length-1)selectPoint(0);
  $('#play').textContent='❚❚';$('#play').setAttribute('aria-label','Pause track');
  const start=performance.now(), lo=Math.floor(index), fraction=index-lo;
  const initial=pointTime(points[lo].properties)+(pointTime(points[Math.min(lo+1,points.length-1)].properties)-pointTime(points[lo].properties))*fraction;
  const end=pointTime(points.at(-1).properties);
  function frame(now){const current=Math.min(end,initial+(now-start)*3600000/60);let i=0;while(i<points.length-2 && pointTime(points[i+1].properties)<current)i++;
    const from=pointTime(points[i].properties), to=pointTime(points[i+1].properties);selectPoint(i+(current-from)/(to-from));
    if(current>=end)stop();else timer=requestAnimationFrame(frame);
  }
  timer=requestAnimationFrame(frame);
}
Promise.all([data('pts'),data('lin'),data('windswath')]).then(([pts,lin,windData])=>{
  points=pts.features; window.stormSwath=windData; $('#timeline').max=points.length-1;
  drawSwath(); scheduleXol(); track=L.geoJSON(lin,{style:{color:'#fff',weight:2,opacity:.8,dashArray:'4 6'}}).addTo(map); selectPoint(0);
  $('#timeline').addEventListener('input',e=>{stop();selectPoint(+e.target.value)});
  $('#play').addEventListener('click',play);
  $('#track-toggle').addEventListener('click',e=>{trackVisible=!trackVisible;e.currentTarget.textContent=trackVisible?'Hide track':'Show track';e.currentTarget.setAttribute('aria-pressed',String(trackVisible));if(trackVisible){track.addTo(map)}else{track.remove()}selectPoint(index)});
}).catch(error=>{stormFailed=true;scheduleXol();console.error(error);$('#error').textContent='Storm data could not be loaded. Check your connection and reload.';$('#error').hidden=false;$('#timeline').disabled=true;$('#play').disabled=true});

// Load the compact, local Census extract independently of map visibility. Canvas avoids
// thousands of SVG DOM nodes; polygons remain clickable, with keyboard search.
let tractData, tractLayer, footprintLayer, footprintRenderer, selection, tractVisible=false, loading, market, summary;
map.createPane("housingPane").style.zIndex=380;
map.createPane("footprintPane").style.zIndex=390;
const selected=new Set();
const format = n => n.toLocaleString('en-US');
const tractStatus = $('#tract-status');
async function loadTracts() {
 if (tractData) return tractData;
 if (!loading) loading=(async()=>{
  const response=await fetch(`${import.meta.env.BASE_URL}data/fl-tracts.bin`);
  if (!response.ok) throw new Error(`tracts: HTTP ${response.status}`);
  if (!('DecompressionStream' in window)) throw new Error('This browser cannot decompress the tract file');
  const stream=response.body.pipeThrough(new DecompressionStream('gzip'));
  tractData=await new Response(stream).json(); return tractData;
 })().catch(error=>{loading=null;throw error});
 return loading;
}
function selectTract(feature) {
 const p=feature.properties;
 if(selection) selection.remove();
 selection=L.geoJSON(feature,{style:{color:'#fff',weight:3,fillOpacity:0},interactive:false}).addTo(map);
 map.fitBounds(selection.getBounds(),{padding:[30,30],maxZoom:12});
 const moe=p.housing_units_moe_90==null?'Not available':`± ${format(p.housing_units_moe_90)}`;
 $('#tract-detail').innerHTML=`<h3>Tract ${p.geoid}</h3><p>Census estimate of housing units: <strong>${format(p.housing_units_estimate)}</strong><br>90% margin of error: <strong>${moe}</strong></p><p>Housing is a proxy, not a count of policies.</p>`;
}
async function initializeTracts() {
 try {
  const data=await loadTracts();
  if(!tractLayer) tractLayer=L.geoJSON(data,{pane:'housingPane',renderer:L.canvas({pane:'housingPane',padding:0.2}),style:f=>({color:'#8dc9c4',weight:.6,fillColor:'#5cb9b2',fillOpacity:f.properties.housing_units_estimate?0.23:0.05}),onEachFeature:(f,layer)=>layer.on('click',()=>selectTract(f))});
  if(!market) regenerateMarket();
  $('#tract-search').disabled=false; $('#tract-retry').hidden=true; tractStatus.textContent='';
  if($('#tract-toggle').checked){tractLayer.addTo(map);tractVisible=true}
 } catch(error) {
  console.error(error); tractStatus.textContent='Housing data could not be loaded.'; $('#tract-retry').hidden=false;
  $('#market-summary').textContent='Market unavailable until data is loaded.';
 }
}
$('#tract-retry').addEventListener('click',initializeTracts);
$('#tract-toggle').addEventListener('change',async e=>{
 const button=e.currentTarget;
 if(!button.checked){if(tractLayer)tractLayer.remove();tractVisible=false;return}
 if(!tractData) await initializeTracts();
 if(tractLayer && button.checked){tractLayer.addTo(map);tractVisible=true}
 else button.checked=false;
});
$('#tract-search').addEventListener('input',e=>{
 const query=e.target.value.trim();const results=$('#tract-results');results.replaceChildren();
 if(!query)return;
 const matches=tractData.features.filter(f=>f.properties.geoid.includes(query)).slice(0,10);
 if(!matches.length){results.textContent='No matching tracts.';return}
 for(const f of matches){const b=document.createElement('button');b.type='button';b.textContent=`Select tract ${f.properties.geoid}`;b.addEventListener('click',()=>selectTract(f));results.append(b)}
});

function regenerateMarket() {
 const field=$('#market-seed'), raw=field.value, seed=Number(raw);
 if(raw.trim()===''||!Number.isSafeInteger(seed)||seed<0||seed>4294967295){$('#market-error').textContent='Enter a whole-number seed from 0 to 4294967295.';return}
 $('#market-error').textContent='';market=generateMarket(tractData.features,seed);$('#market-generate').disabled=false;
 const list=$('#cedent-list');list.replaceChildren();
 const represented=market.cedents.reduce((sum,c)=>sum+c.share,0);
 $('#market-residual').textContent=`Seed ${seed} · Other insurers: ${((1-represented)*100).toFixed(1)}% statewide`;
 market.cedents.forEach((c,i)=>{const label=document.createElement('label');label.className='cedent-row';const input=document.createElement('input');input.type='checkbox';input.checked=selected.has(i);input.addEventListener('change',()=>{if(input.checked)selected.add(i);else selected.delete(i);updateMarket();scheduleXol()});const text=document.createElement('span');text.textContent=`${c.name} · ${(c.share*100).toFixed(1)}%`;label.append(input,text);list.append(label)});
 updateMarket(); scheduleXol();
}
function updateMarket() {
 if(!market)return;
 summary=summarizeSelection(market,[...selected]);
 const total=tractData.features.reduce((s,f)=>s+Math.max(0,f.properties.housing_units_estimate),0);
 const max=Math.max(0,...summary.tracts.map(t=>t.value));
 const largest=Math.max(0,...[...selected].map(i=>market.cedents[i].amount));
 const countyTotals=new Map();
 summary.tracts.forEach((t,i)=>{const county=tractData.features[i].properties.geoid.slice(0,5);countyTotals.set(county,(countyTotals.get(county)||0)+t.value)});
 const largestCounty=Math.max(0,...countyTotals.values());
 $('#market-summary').textContent=`${selected.size} selected · ${(total?100*summary.amount/total:0).toFixed(1)}% of statewide market · Largest cedent ${(summary.amount?100*largest/summary.amount:0).toFixed(1)}%, county ${(summary.amount?100*largestCounty/summary.amount:0).toFixed(1)}% of selection.`;
 const byId=new Map(tractData.features.map((f,i)=>[f.properties.geoid,i]));
 if(!selected.size){
  if(footprintLayer)footprintLayer.remove();
  if(footprintRenderer)map.removeLayer(footprintRenderer);
  return;
 }
 if(!footprintLayer){
  footprintRenderer=L.canvas({pane:'footprintPane',padding:0.2});
  footprintLayer=L.geoJSON(tractData,{pane:'footprintPane',renderer:footprintRenderer,interactive:false});
 }
 footprintLayer.setStyle(f=>{
  const t=summary.tracts[byId.get(f.properties.geoid)];
  if(!t.count)return {stroke:false,fillOpacity:0};
  if($('#market-view').value==='overlap')return {stroke:false,fillColor:t.count>1?'#e44f45':'#e7a74e',fillOpacity:.55};
  return {stroke:false,fillColor:'#30e1c2',fillOpacity:.15+.5*Math.sqrt(t.value/max)};
 });
 if(!map.hasLayer(footprintLayer))footprintLayer.addTo(map);
 map.getPane('footprintPane').querySelector('canvas').classList.add('market-footprint');
}
$('#market-generate').addEventListener('click',regenerateMarket);
$('#market-view').addEventListener('change',updateMarket);

// Keep the event independent of visibility and timeline playback. Debouncing avoids
// repeated expensive swath classification while several controls change together.
let xolTimer, xolCache;
const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
function scheduleXol() {
 clearTimeout(xolTimer);
 const out=$('#xol-results');
 if(!selected.size){out.textContent='Select cedents to model the event.';return}
 if(stormFailed){out.textContent='Storm data unavailable. Reload to try again.';return}
 if(!tractData || !market || !window.stormSwath){out.textContent='Waiting for storm and housing data…';return}
 const fields=['capital','attachment','limit','rate'].map(k=>$('#xol-'+k));
 const values=fields.map(f=>Number(f.value));
 if(fields.some((f,i)=>f.value.trim()==='' || !Number.isFinite(values[i]) || values[i]<0) || values[1]+values[2]>100){out.textContent='Enter nonnegative values; attachment plus limit cannot exceed 100%.';return}
 out.textContent='Calculating modeled event…';
 xolTimer=setTimeout(()=>{
  try {
   const [capital,attachment,limit,rate]=values;
   // Classify the shared static event once per generated market. Subsequent
   // selection and term changes only recalculate the inexpensive layer math.
   if(!xolCache || xolCache.market!==market || xolCache.event!==window.stormSwath){
    const scenario=simulatePortfolio({features:tractData.features,market,event:window.stormSwath,capital:0,positions:market.cedents.map((_,index)=>({index,weight:1,attachmentFraction:0,limitFraction:0,rateOnLine:0}))});
    xolCache={market,event:window.stormSwath,positions:scenario.positions};
   }
   const positions=[...selected].sort((a,b)=>a-b).map(index=>{
    const p=xolCache.positions[index], layerLimit=p.exposure*(limit/100), principal=Math.min(capital/selected.size,layerLimit);
    return {...p,...layerOutcome(p.grossLoss,{attachment:p.exposure*(attachment/100),limit:layerLimit,principal,rateOnLine:rate/100})};
   });
   const totalPrincipal=positions.reduce((s,p)=>s+p.principal,0), investorLoss=positions.reduce((s,p)=>s+p.investorLoss,0), premium=positions.reduce((s,p)=>s+p.premium,0);
   const result={positions,totalPrincipal,investorLoss,premium,netReturn:premium-investorLoss,unallocatedCapital:capital-totalPrincipal};
   const rows=(p)=>[['Exposure',p.exposure],['Cedent event loss',p.grossLoss],['Attachment',p.attachment],['Layer limit',p.limit],['Investor capital',p.principal],['Investor loss',p.investorLoss],['Premium',p.premium],['Net',p.netReturn]].map(([label,value])=>`<div><dt>${label}</dt><dd>${money(value)}</dd></div>`).join('');
   const waterfall=p=>{
    const low=Math.min(0,p.netReturn), high=Math.max(0,p.premium), range=high-low || 1;
    const segment=(label,from,to,kind)=>`<div><span>${label}</span><i><b class="${kind}" style="left:${100*(Math.min(from,to)-low)/range}%;width:${100*Math.abs(to-from)/range}%"></b></i></div>`;
    return `<div class="xol-waterfall" aria-hidden="true">${segment('Premium',0,p.premium,'positive')}${segment('Loss',p.premium,p.netReturn,'negative')}${segment('Net',0,p.netReturn,p.netReturn<0?'negative':'positive')}</div>`;
   };
   const total={exposure:0,grossLoss:0,attachment:0,limit:0,principal:result.totalPrincipal,investorLoss:result.investorLoss,premium:result.premium,netReturn:result.netReturn};
   for(const p of result.positions) for(const key of ['exposure','grossLoss','attachment','limit']) total[key]+=p[key];
   out.innerHTML=`<div class="xol-card"><strong>Portfolio</strong>${waterfall(total)}<dl>${rows(total)}</dl><p>Unallocated capital: <b>${money(result.unallocatedCapital)}</b></p></div>${result.positions.map(p=>`<details class="xol-card"><summary>${p.name}</summary>${waterfall(p)}<dl>${rows(p)}</dl></details>`).join('')}`;
  } catch(error){console.error(error);out.textContent='Could not calculate this scenario. Check inputs and try again.'}
 },150);
}
for(const key of ['capital','attachment','limit','rate']) $('#xol-'+key).addEventListener('input',scheduleXol);

initializeTracts();
