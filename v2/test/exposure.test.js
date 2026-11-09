import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';

test('tract dataset has unique Florida GEOIDs and expected housing counts',()=>{
 const data=JSON.parse(gunzipSync(readFileSync('public/data/fl-tracts.bin')));
 const ids=data.features.map(f=>f.properties.geoid);
 assert.equal(ids.length,5122); assert.equal(new Set(ids).size,ids.length);
 assert.ok(ids.every(id=>/^12\d{9}$/.test(id)));
 assert.equal(data.features.reduce((n,f)=>n+f.properties.housing_units_estimate,0),10256470);
 for (const feature of data.features) assert.ok(feature.properties.housing_units_estimate>=0);
});
