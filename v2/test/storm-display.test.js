import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareStorms, observationLabel, defaultStorm, intensityColor} from '../src/storm-display.js';

test('archive sorts by year then Atlantic sequence descending',()=>{
 const storms=[{id:'AL092026',year:2026,name:'A'},{id:'AL102026',year:2026,name:'Z'},{id:'AL152025',year:2025,name:'B'}];
 assert.deepEqual(storms.sort(compareStorms).map(s=>s.id),['AL102026','AL092026','AL152025']);
});
test('observed sustained wind determines category and missing is not zero',()=>{
 for(const [wind,label] of [[null,'Wind unavailable'],[20,'Below tropical storm force'],[34,'Tropical storm force'],[64,'Category 1'],[83,'Category 2'],[96,'Category 3'],[113,'Category 4'],[137,'Category 5']]) assert.match(observationLabel(wind),new RegExp(label));
 assert.equal(observationLabel(96),'96 kt / 110 mph · Category 3 wind equivalent');
});

test("default selects latest known hurricane, or latest event when no hurricane metadata exists",()=>{
 const entries=[{id:"AL102026",year:2026,name:"Josephine",statusValues:["SS"]},{id:"AL092026",year:2026,name:"Isaias",statusValues:["HU"]},{id:"AL082025",year:2025,name:"Prior",statusValues:["HU"]}];
 assert.equal(defaultStorm(entries).id,"AL092026");
 assert.equal(defaultStorm([{id:"AL012024",year:2024,name:"A"}]).id,"AL012024");
 assert.equal(defaultStorm([]),undefined);
});

test('intensity markers change at wind thresholds and use a neutral missing value',()=>{
 const thresholds=[0,34,64,83,96,113,137];
 assert.equal(new Set(thresholds.map(intensityColor)).size,thresholds.length);
 for(const v of thresholds.slice(1)) assert.notEqual(intensityColor(v-1),intensityColor(v));
 assert.equal(intensityColor(null),intensityColor(NaN));
 assert.notEqual(intensityColor(null),intensityColor(0));
});
