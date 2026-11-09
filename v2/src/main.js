import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import {pointLabel, clampIndex} from './model.js';
import {generateMarket, summarizeSelection} from './market.js';

const app = document.querySelector('#app');
app.innerHTML = `
  <div id="map" aria-label="Interactive map of Hurricane Ian's historical track and cumulative wind swath"></div>
  <header class="topbar"><a class="brand" href="/" title="Return to aboutILS"><span class="brand-mark">✳</span><span>about<span>ILS</span><small>STORM ATLAS</small></span></a><span class="header-tag"><i></i> HISTORICAL EXPLORER</span><a class="back" href="/">← <span>Back to aboutILS</span></a></header>
  <main class="panel"><div class="eyebrow"><span>STORM PROFILE</span><span>ATLANTIC / 2022</span></div><div class="title-row"><div><div class="kicker">NORTH ATLANTIC OCEAN</div><h1>Hurricane Ian</h1><p class="subtitle">A storm in perspective.</p></div><div class="storm-icon">◉</div></div>
  <div class="badges"><span>2022 SEASON</span><span>AL092022</span><span>BEST TRACK</span></div>
  <div class="divider"></div><div class="section-heading"><div><span class="overline">EXPLORE THE STORM</span><h2>Cumulative wind swath</h2></div><span class="info-icon" title="Estimated extent, accumulated over the storm's life">i</span></div>
  <p class="description">Estimated areas potentially affected by sustained winds over Ian’s lifetime. Select a wind threshold.</p>
  <div class="thresholds" role="group" aria-label="Wind speed threshold"><button data-wind="34" aria-pressed="true"><b>34 kt</b><small>39 mph</small></button><button data-wind="50" aria-pressed="false"><b>50 kt</b><small>58 mph</small></button><button data-wind="64" aria-pressed="false"><b>64 kt</b><small>74 mph</small></button></div>
  <div class="legend"><span class="legend-color"></span><span id="legend-label">34 kt · tropical storm force</span><button id="track-toggle" aria-pressed="true">Hide track</button></div>
  <p class="description">Estimated wind extent over the full storm.</p>
  <section class="exposure"><div class="divider"></div><span class="overline">FLORIDA HOUSING</span><h2>Where homes are</h2><p class="description">Explore homes by neighborhood, based on Census estimates.</p><button id="tract-toggle" aria-pressed="false">Show housing tracts</button><p id="tract-status" role="status">Enable the overlay to load tract data.</p><label for="tract-search">Search Florida tract GEOID</label><input id="tract-search" type="search" inputmode="numeric" placeholder="Enter tract GEOID" disabled><div id="tract-results" aria-live="polite"></div><div id="tract-detail" aria-live="polite"></div><div class="divider"></div><span class="overline">INVESTOR GEOGRAPHY</span><h2>Fictional cedent market</h2><p class="description">Generate a modeled market and select cedents to see their combined footprint. Shares are of the modeled market, not actual insurance policies.</p><label for="market-seed">Market seed</label><div class="market-seed"><input id="market-seed" type="number" min="0" max="4294967295" step="1" value="42"><button id="market-generate" type="button" disabled>Generate market</button></div><p id="market-error" role="status"></p><div id="cedent-list"></div><label for="market-view">Map view</label><select id="market-view"><option value="concentration">Selected concentration</option><option value="overlap">Cedent overlap</option></select><p id="market-summary" aria-live="polite">Show housing tracts to generate a market.</p><p class="market-key">Map: brighter teal = more modeled housing; overlap view: amber = one, red = two or more cedents.</p><details><summary>Sources &amp; assumptions</summary><p>Homes: 2020–2024 Census estimates, mapped on 2025 boundaries. Cedents, territories and shares are modeled, not actual policies. Housing includes vacant and rented units. Overlap means shared geography, not separate storms.</p><a href="https://www.census.gov/programs-surveys/acs" target="_blank" rel="noreferrer">Census data ↗</a> · <a href="https://www.floir.gov/tools-and-data/residential-market-share-reports" target="_blank" rel="noreferrer">Florida insurance data ↗</a></details></section><a class="source" href="https://www.nhc.noaa.gov/gis/archive_besttrack_results.php?id=al09&amp;name=Hurricane+IAN&amp;year=2022" target="_blank" rel="noreferrer">NOAA NHC best track & GIS data <span>↗</span></a></main>
  <div class="map-label"><span>HISTORICAL VIEW</span><b>Hurricane Ian</b><small>Atlantic Ocean · 2022</small></div>
  <section class="timeline" aria-label="Storm timeline"><div class="timeline-head"><div><span class="overline">STORM TRACK</span><strong id="point-time">Loading track…</strong></div><div class="timeline-actions"><button id="play" aria-label="Play track">▶</button><span id="point-count"></span></div></div><input id="timeline" aria-label="Track point" type="range" min="0" value="0" step="1"><div class="timeline-foot"><span>SEP 22</span><span>SELECTED TRACK POINT · UTC</span><span>OCT 01</span></div></section>
  <div id="error" class="error" role="alert" hidden></div>`;

const map = L.map('map', {zoomControl:false, minZoom:3}).setView([25.5,-81], 5);
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
const $ = s => document.querySelector(s);
const colors = {34:'#e3af58',50:'#eb845b',64:'#d85b52'};
const labels = {34:'34 kt · tropical storm force',50:'50 kt · sustained wind',64:'64 kt · hurricane force'};
let wind=34, trackVisible=true, index=0, points=[], swath, track, marker, timer;
const data = name => fetch(`${import.meta.env.BASE_URL}data/ian-${name}.geojson`).then(r=>{if(!r.ok) throw new Error(`${name}: HTTP ${r.status}`); return r.json()});
function drawSwath() {
  if(swath) swath.remove();
  swath=L.geoJSON(window.stormSwath,{filter:f=>f.properties.RADII===wind,style:{color:colors[wind],weight:1,opacity:.85,fillColor:colors[wind],fillOpacity:.25},interactive:false}).addTo(map);
  if(trackVisible && track) track.bringToFront();
}
function selectPoint(i) {
  index=clampIndex(i,points.length); const f=points[index];
  $('#timeline').value=index; $('#point-time').textContent=pointLabel(f.properties); $('#point-count').textContent=`${index+1} / ${points.length}`;
  if(marker) marker.remove();
  if(trackVisible) marker=L.circleMarker([f.geometry.coordinates[1],f.geometry.coordinates[0]],{radius:7,color:'#fff',weight:2,fillColor:'#e6ae62',fillOpacity:1}).addTo(map).bindTooltip(pointLabel(f.properties));
}
function stop() {clearInterval(timer);timer=null;$('#play').textContent='▶';$('#play').setAttribute('aria-label','Play track');}
Promise.all([data('pts'),data('lin'),data('windswath')]).then(([pts,lin,windData])=>{
  points=pts.features; window.stormSwath=windData; $('#timeline').max=points.length-1;
  drawSwath(); track=L.geoJSON(lin,{style:{color:'#fff',weight:2,opacity:.8,dashArray:'4 6'}}).addTo(map); selectPoint(0);
  $('#timeline').addEventListener('input',e=>{stop();selectPoint(+e.target.value)});
  $('#play').addEventListener('click',()=>{if(timer){stop();return} if(index===points.length-1) selectPoint(0); $('#play').textContent='❚❚';$('#play').setAttribute('aria-label','Pause track');timer=setInterval(()=>{if(index>=points.length-1){stop();return}selectPoint(index+1)},650)});
  document.querySelectorAll('[data-wind]').forEach(button=>button.addEventListener('click',()=>{wind=+button.dataset.wind;document.querySelectorAll('[data-wind]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('#legend-label').textContent=labels[wind];$('.legend-color').style.background=colors[wind];drawSwath()}));
  $('#track-toggle').addEventListener('click',e=>{trackVisible=!trackVisible;e.currentTarget.textContent=trackVisible?'Hide track':'Show track';e.currentTarget.setAttribute('aria-pressed',String(trackVisible));if(trackVisible){track.addTo(map)}else{track.remove()}selectPoint(index)});
}).catch(error=>{console.error(error);$('#error').textContent='Storm data could not be loaded. Check your connection and reload.';$('#error').hidden=false;$('#timeline').disabled=true;$('#play').disabled=true});

// Load the compact, local Census extract only when requested. Canvas avoids
// thousands of SVG DOM nodes; polygons remain clickable, with keyboard search.
let tractData, tractLayer, selection, tractVisible=false, loading, market, summary;
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
$('#tract-toggle').addEventListener('click',async e=>{
 const button=e.currentTarget;
 if(tractVisible){tractLayer.remove();if(selection) selection.remove();tractVisible=false;button.textContent='Show housing tracts';button.setAttribute('aria-pressed','false');tractStatus.textContent='Housing overlay hidden.';$('#tract-search').disabled=true;$('#tract-results').replaceChildren();return}
 button.disabled=true;tractStatus.textContent='Loading Florida tracts…';
 try {
  const data=await loadTracts();
  if(!tractLayer) tractLayer=L.geoJSON(data,{renderer:L.canvas({padding:0.2}),style:f=>({color:'#8dc9c4',weight:.6,fillColor:'#5cb9b2',fillOpacity:f.properties.housing_units_estimate?0.23:0.05}),onEachFeature:(f,layer)=>layer.on('click',()=>selectTract(f))});
  if(!market) regenerateMarket();
  tractLayer.addTo(map);updateMarket();if(selection) selection.addTo(map);tractVisible=true;
  button.textContent='Hide housing tracts';button.setAttribute('aria-pressed','true');$('#tract-search').disabled=false;tractStatus.textContent='5,122 tracts loaded. Search by 11-digit GEOID or select a tract on the map.';
 }catch(error){console.error(error);tractStatus.textContent='Tract data could not be loaded. Try again or use a browser supporting gzip decompression.'}finally{button.disabled=false}
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
 market.cedents.forEach((c,i)=>{const label=document.createElement('label');label.className='cedent-row';const input=document.createElement('input');input.type='checkbox';input.checked=selected.has(i);input.addEventListener('change',()=>{if(input.checked)selected.add(i);else selected.delete(i);updateMarket()});const text=document.createElement('span');text.textContent=`${c.name} · ${(c.share*100).toFixed(1)}% of modeled market`;label.append(input,text);list.append(label)});
 updateMarket();
}
function updateMarket() {
 if(!market)return;
 summary=summarizeSelection(market,[...selected]);
 const overlaps=summary.tracts.filter(t=>t.count>1).length;
 const total=market.cedents.reduce((s,c)=>s+c.amount,0);
 const max=Math.max(0,...summary.tracts.map(t=>t.value));
 const top=max&&summary.amount?max/summary.amount*100:0;
 $('#market-summary').textContent=`${selected.size} selected · ${summary.amount.toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1})} housing-unit equivalents · ${(total?100*summary.amount/total:0).toFixed(1)}% of modeled market · ${format(overlaps)} tracts with overlap. Largest tract: ${top.toFixed(1)}% of selection.`;
 const byId=new Map(tractData.features.map((f,i)=>[f.properties.geoid,i]));
 if(tractLayer)tractLayer.setStyle(f=>{
  const t=summary.tracts[byId.get(f.properties.geoid)];
  if(!selected.size)return {color:'#8dc9c4',weight:.6,fillColor:'#5cb9b2',fillOpacity:f.properties.housing_units_estimate?0.23:0.05};
  if(!t.count)return {color:'#7a9698',weight:.4,fillColor:'#5cb9b2',fillOpacity:.03};
  if($('#market-view').value==='overlap')return {color:t.count>1?'#fc8178':'#f4c16d',weight:.6,fillColor:t.count>1?'#e44f45':'#e7a74e',fillOpacity:.65};
  return {color:'#8dc9c4',weight:.5,fillColor:'#30e1c2',fillOpacity:.16+.7*Math.sqrt(t.value/max)};
 });
}
$('#market-generate').addEventListener('click',regenerateMarket);
$('#market-view').addEventListener('change',updateMarket);
