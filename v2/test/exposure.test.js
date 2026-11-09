import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {allocate} from '../src/exposure.js';

test('tract dataset has unique Florida GEOIDs and expected housing counts',()=>{
 const data=JSON.parse(gunzipSync(readFileSync('public/data/fl-tracts.bin')));
 const ids=data.features.map(f=>f.properties.geoid);
 assert.equal(ids.length,5122); assert.equal(new Set(ids).size,ids.length);
 assert.ok(ids.every(id=>/^12\d{9}$/.test(id)));
 assert.equal(data.features.reduce((n,f)=>n+f.properties.housing_units_estimate,0),10256470);
 for (const feature of data.features) {
  const n=feature.properties.housing_units_estimate; const rows=allocate(n);
  assert.equal(rows.reduce((sum,row)=>sum+row.units,0),n);
  for (const row of rows) assert.ok(Math.abs(row.units-n*row.weight)<1);
 }
});
test('fictional allocation conserves units including zero and rounding',()=>{
 for(const n of [0,1,2,2499,100000]) {const result=allocate(n); assert.equal(result.reduce((a,b)=>a+b.units,0),n); assert.ok(result.every(x=>Number.isInteger(x.units)&&x.units>=0));}
 assert.deepEqual(allocate(10).map(x=>x.units),[5,3,2]);
});
