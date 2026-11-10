import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {generateMarket} from '../src/market.js';
import {layerOutcome, classifyPoint, simulatePortfolio} from '../src/loss.js';

test('occurrence layer attaches and exhausts with proportional collateral',()=>{
 const terms={attachment:100,limit:200,principal:50,rateOnLine:.1};
 assert.equal(layerOutcome(100,terms).investorLoss,0);
 assert.equal(layerOutcome(200,terms).investorLoss,25);
 const x=layerOutcome(500,terms);
 assert.equal(x.cededLoss,200); assert.equal(x.investorLoss,50);
 assert.equal(x.premium,5); assert.equal(x.netReturn,-45);
});

const ring=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d],[a,b]];
test('strongest swath wins; holes and multipolygons are respected',()=>{
 const event={type:'FeatureCollection',features:[
  {type:'Feature',properties:{RADII:34},geometry:{type:'Polygon',coordinates:[ring(0,0,10,10)]}},
  {type:'Feature',properties:{RADII:64},geometry:{type:'MultiPolygon',coordinates:[[ring(1,1,5,5),ring(2,2,3,3)],[ring(7,7,9,9)]]}},
  {type:'Feature',properties:{RADII:50},geometry:{type:'Polygon',coordinates:[ring(1,1,6,6)]}}
 ]};
 assert.equal(classifyPoint([1.5,1.5],event),64);
 assert.equal(classifyPoint([2.5,2.5],event),50);
 assert.equal(classifyPoint([8,8],event),64);
 assert.equal(classifyPoint([0,5],event),34);
 assert.equal(classifyPoint([20,20],event),0);
 assert.equal(classifyPoint([1,1],null),0);
});

test('one storm produces separate cedent losses and dollar-denominated layers',()=>{
 const features=[{geometry:{type:'Polygon',coordinates:[ring(0,0,2,2)]}},{geometry:{type:'Polygon',coordinates:[ring(10,10,12,12)]}}];
 const market={cedents:[{name:'A'},{name:'B'}],tracts:[{allocations:[2,1]},{allocations:[1,3]}]};
 const event={type:'FeatureCollection',features:[{properties:{RADII:64},geometry:{type:'Polygon',coordinates:[ring(-1,-1,3,3)]}}]};
 const positions=[0,1].map(index=>({index,weight:1,attachmentFraction:.05,limitFraction:.1,rateOnLine:.2}));
 const r=simulatePortfolio({features,market,event,positions,capital:120000});
 assert.deepEqual(r.tracts.map(t=>t.threshold),[64,0]);
 assert.deepEqual(r.positions.map(p=>p.exposure),[900000,1200000]);
 assert.deepEqual(r.positions.map(p=>p.grossLoss),[120000,60000]);
 assert.deepEqual(r.positions.map(p=>p.investorLoss),[50000,0]);
 assert.equal(r.totalPrincipal,120000); assert.equal(r.premium,24000); assert.equal(r.netReturn,-26000);
 assert.deepEqual(simulatePortfolio({features,market,event:null,positions,capital:120000}).positions.map(p=>p.grossLoss),[0,0]);
 assert.equal(simulatePortfolio({features,market,event,positions:[],capital:120000}).totalPrincipal,0);
});

test('weighted allocation caps each layer without redistributing excess',()=>{
 const features=[{geometry:{type:'Polygon',coordinates:[ring(0,0,2,2)]}}];
 const market={cedents:[{name:'A'},{name:'B'}],tracts:[{allocations:[1,1]}]};
 const positions=[{index:0,weight:3,attachmentFraction:0,limitFraction:.1,rateOnLine:0},{index:1,weight:1,attachmentFraction:0,limitFraction:.5,rateOnLine:0}];
 const r=simulatePortfolio({features,market,event:null,positions,capital:100000});
 assert.deepEqual(r.positions.map(p=>p.principal),[30000,25000]);
 assert.equal(r.unallocatedCapital,45000);
 assert.throws(()=>simulatePortfolio({features,market,event:null,positions:[positions[0],positions[0]],capital:1}),RangeError);
 assert.throws(()=>layerOutcome(1,{attachment:0,limit:1,principal:2,rateOnLine:0}),RangeError);
 assert.equal(simulatePortfolio({features,market,event:null,positions:positions.map(p=>({...p,weight:0})),capital:1}).totalPrincipal,0);
});

test('actual Ian swaths and generated Florida market form a reproducible shared event',()=>{
 const features=JSON.parse(gunzipSync(readFileSync('public/data/fl-tracts.bin'))).features;
 const event=JSON.parse(readFileSync('public/data/ian-windswath.geojson'));
 assert.deepEqual([...new Set(event.features.map(f=>f.properties.RADII))].sort((a,b)=>a-b),[34,50,64]);
 const market=generateMarket(features,42);
 const positions=[0,1].map(index=>({index,weight:1,attachmentFraction:.02,limitFraction:.08,rateOnLine:.1}));
 const r=simulatePortfolio({features,market,event,positions,capital:1000000});
 assert.ok(r.tracts.some(t=>t.threshold===64));
 assert.ok(r.tracts.some(t=>t.threshold===34));
 assert.ok(r.positions.every(p=>p.grossLoss>0 && p.investorLoss<=p.principal));
 assert.ok(r.totalPrincipal<=r.capital);
 assert.deepEqual(r,simulatePortfolio({features,market,event,positions,capital:1000000}));
});
