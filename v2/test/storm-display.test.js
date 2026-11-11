import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareStorms, observationLabel} from '../src/storm-display.js';

test('archive sorts by year then Atlantic sequence descending',()=>{
 const storms=[{id:'AL092026',year:2026,name:'A'},{id:'AL102026',year:2026,name:'Z'},{id:'AL152025',year:2025,name:'B'}];
 assert.deepEqual(storms.sort(compareStorms).map(s=>s.id),['AL102026','AL092026','AL152025']);
});
test('observed sustained wind determines category and missing is not zero',()=>{
 for(const [wind,label] of [[null,'Wind unavailable'],[20,'Below tropical storm force'],[34,'Tropical storm force'],[64,'Category 1'],[83,'Category 2'],[96,'Category 3'],[113,'Category 4'],[137,'Category 5']]) assert.match(observationLabel(wind),new RegExp(label));
 assert.equal(observationLabel(96),'96 kt / 110 mph · Category 3 wind equivalent');
});
