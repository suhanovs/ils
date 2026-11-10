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

test('default policy deductible reduces cedent loss before the occurrence layer',()=>{
 const features=[{geometry:{type:'Polygon',coordinates:[ring(0,0,2,2)]}}];
 const market={cedents:[{name:'A'}],tracts:[{allocations:[2]}]};
 const event={type:'FeatureCollection',features:[{properties:{RADII:64},geometry:{type:'Polygon',coordinates:[ring(-1,-1,3,3)]}}]};
 const positions=[{index:0,weight:1,attachmentFraction:.05,limitFraction:.1,rateOnLine:.2}];
 const p=simulatePortfolio({features,market,event,positions,capital:30000}).positions[0];
 assert.equal(p.grossDamage,120000);
 assert.equal(p.deductible,12000);
 assert.equal(p.coveredLoss,108000);
 assert.equal(p.cedentLoss,108000);
 assert.equal(p.cededLoss,60000);
 assert.equal(p.investorLoss,30000);
});

test('policy terms reject invalid or hostile fractions even without an event',()=>{
 const features=[{geometry:{type:'Polygon',coordinates:[ring(0,0,2,2)]}}];
 const market={cedents:[{name:'A'}],tracts:[{allocations:[1]}]};
 const base={index:0,weight:1,attachmentFraction:0,limitFraction:.1,rateOnLine:.1};
 for(const key of ['policyDeductibleFraction','policyLimitFraction']) for(const bad of [-1,1.1,NaN,Infinity,null,'0.1',{},[],true]) {
  assert.throws(()=>simulatePortfolio({features,market,event:null,positions:[{...base,[key]:bad}],capital:1}),RangeError,`${key}: ${String(bad)}`);
 }
});

test('policy damage below, equal to and above deductible and at limit',()=>{
 const features=[{geometry:{type:'Polygon',coordinates:[ring(0,0,2,2)]}}];
 const market={cedents:[{name:'A'}],tracts:[{allocations:[1]}]};
 const position={index:0,weight:1,attachmentFraction:0,limitFraction:1,rateOnLine:0,policyDeductibleFraction:.05,policyLimitFraction:.1};
 const run=(radius,p=position)=>simulatePortfolio({features,market,event:radius===0?null:{type:'FeatureCollection',features:[{properties:{RADII:radius},geometry:{type:'Polygon',coordinates:[ring(-1,-1,3,3)]}}]},positions:[p],capital:300000}).positions[0];
 assert.deepEqual([0,34,50,64].map(r=>run(r).coveredLoss),[0,0,0,30000]);
 assert.equal(run(34).deductible,3000);
 assert.equal(run(50).deductible,15000);
 assert.equal(run(64).deductible,15000);
 assert.equal(run(64,{...position,policyLimitFraction:0}).coveredLoss,0);
 assert.equal(run(64,{...position,policyDeductibleFraction:0,policyLimitFraction:1}).coveredLoss,60000);
 assert.equal(run(64).cededLoss,30000);
});

test('cached zero-capital scenario retains tract and cedent covered loss',()=>{
 const features=[{geometry:{type:'Polygon',coordinates:[ring(0,0,2,2)]}}];
 const market={cedents:[{name:'A'},{name:'B'}],tracts:[{allocations:[2,1]}]};
 const event={type:'FeatureCollection',features:[{properties:{RADII:64},geometry:{type:'Polygon',coordinates:[ring(-1,-1,3,3)]}}]};
 const positions=[0,1].map(index=>({index,weight:1,attachmentFraction:0,limitFraction:0,rateOnLine:0}));
 const cached=simulatePortfolio({features,market,event,positions,capital:0});
 assert.deepEqual([cached.tracts[0].grossDamage,cached.tracts[0].deductible,cached.tracts[0].coveredLoss],[180000,18000,162000]);
 assert.equal(cached.positions.reduce((sum,p)=>sum+p.cedentLoss,0),cached.tracts[0].coveredLoss);
 const p=cached.positions[0];
 const replay=layerOutcome(p.cedentLoss,{attachment:30000,limit:60000,principal:30000,rateOnLine:.2});
 const direct=simulatePortfolio({features,market,event,positions:[{...positions[0],attachmentFraction:.05,limitFraction:.1,rateOnLine:.2}],capital:30000}).positions[0];
 assert.equal(replay.investorLoss,direct.investorLoss);
 assert.equal(replay.premium,direct.premium);
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
 assert.deepEqual(r.positions.map(p=>p.investorLoss),[42000,0]);
 assert.deepEqual(r.positions.map(p=>p.cedentLoss),[108000,54000]);
 assert.equal(r.positions.reduce((a,p)=>a+p.cedentLoss,0),162000);
 assert.equal(r.totalPrincipal,120000); assert.equal(r.premium,24000); assert.equal(r.netReturn,-18000);
 const noEvent=simulatePortfolio({features,market,event:null,positions,capital:120000});
 assert.deepEqual(noEvent.positions.map(p=>[p.grossDamage,p.deductible,p.coveredLoss,p.cedentLoss,p.investorLoss]),[[0,0,0,0,0],[0,0,0,0,0]]);
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
