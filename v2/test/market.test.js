import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {generateMarket, summarizeSelection} from '../src/market.js';
const features=JSON.parse(gunzipSync(readFileSync('public/data/fl-tracts.bin'))).features;

test('seeded market is reproducible, geographically compact and respects housing capacity',()=>{
 const a=generateMarket(features,42), b=generateMarket(features,42), c=generateMarket(features,43);
 assert.deepEqual(a,b); assert.notDeepEqual(a,c);
 assert.equal(a.cedents.length,6);
 let overlap=0, total=0;
 a.tracts.forEach((t,i)=>{
  const housing=features[i].properties.housing_units_estimate;
  const allocated=t.allocations.reduce((x,y)=>x+y,0);
  assert.ok(allocated<=housing*0.65+1e-7); assert.ok(allocated>=0);
  assert.ok(t.allocations.every(x=>Number.isFinite(x)&&x>=0));
  if(t.allocations.filter(x=>x>0).length>1) overlap++;
  t.allocations.forEach((x,j)=>{if(x>0) assert.ok(t.distances[j]<=a.cedents[j].radius+1e-9)});
  total+=allocated;
 });
 assert.ok(overlap>10); assert.ok(total>0);
 assert.ok(Math.abs(total-a.cedents.reduce((s,c)=>s+c.amount,0))<1e-5);
 assert.ok(a.cedents.every(c=>c.amount>0&&c.share>0&&c.share<1));
 assert.ok(Math.abs(a.cedents.reduce((s,c)=>s+c.share,0)-1)<1e-9);
});

test('selection summary totals exactly the chosen cedents and tracks overlap',()=>{
 const m=generateMarket(features,42), s=summarizeSelection(m,[0,1]);
 assert.ok(Math.abs(s.amount-(m.cedents[0].amount+m.cedents[1].amount))<1e-5);
 assert.equal(s.tracts.length,features.length);
 assert.ok(s.tracts.some(t=>t.count===2));
 assert.equal(summarizeSelection(m,[]).amount,0);
});
