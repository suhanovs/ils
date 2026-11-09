import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {generateMarket, summarizeSelection} from '../src/market.js';
const features=JSON.parse(gunzipSync(readFileSync('public/data/fl-tracts.bin'))).features;

test('market has varied bounded statewide shares and conserves the full housing universe across seeds',()=>{
 for(const seed of [0,42,43,4294967295]) {
  const a=generateMarket(features,seed), b=generateMarket(features,seed);
  assert.deepEqual(a,b);
  assert.ok(a.cedents.length>=20);
  const housing=features.reduce((sum,f)=>sum+Math.max(0,f.properties.housing_units_estimate),0);
  let residual=0, overlap=0;
  a.tracts.forEach((t,i)=>{
   const capacity=features[i].properties.housing_units_estimate;
   const allocated=t.allocations.reduce((x,y)=>x+y,0);
   assert.ok(allocated<=capacity+1e-6 && allocated>=0);
   assert.ok(t.allocations.every(x=>Number.isFinite(x)&&x>=0));
   residual+=capacity-allocated;
   if(t.allocations.filter(x=>x>0).length>1) overlap++;
  });
  assert.ok(residual/housing>=0.3);
  assert.ok(overlap>10);
  assert.ok(a.cedents.every(c=>c.share>0 && c.share<=0.1 && Math.abs(c.share-c.amount/housing)<1e-10));
  assert.ok(Math.max(...a.cedents.map(c=>c.share)) > 2*Math.min(...a.cedents.map(c=>c.share)));
  assert.ok(a.cedents.some(c=>c.centers.length>1));
  assert.equal(new Set(a.cedents.map(c=>JSON.stringify(c.centers[0]))).size,a.cedents.length);
 }
});

test('targets are approximately approached without exceeding local capacity',()=>{
 const m=generateMarket(features,42);
 assert.ok(m.cedents.every(c=>c.share<=c.target+1e-10 && c.share>=c.target*.8));
 m.tracts.forEach((t,i)=>assert.ok(t.allocations.reduce((a,b)=>a+b,0)<=features[i].properties.housing_units_estimate*.7+1e-6));
});

test('selection summary totals exactly the chosen cedents and tracks overlap',()=>{
 const m=generateMarket(features,42), s=summarizeSelection(m,[0,1]);
 assert.ok(Math.abs(s.amount-(m.cedents[0].amount+m.cedents[1].amount))<1e-5);
 assert.equal(s.tracts.length,features.length);
 assert.ok(s.tracts.some(t=>t.count>=1));
 assert.equal(summarizeSelection(m,[]).amount,0);
});
