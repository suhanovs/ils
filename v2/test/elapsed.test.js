import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sampleAtProgress} from '../src/elapsed.js';

test('uniform observation steps ignore irregular timestamps',()=>{
 const track=[{time:'2020-01-01T00:00Z',lat:0,lon:179,wind:30},{time:'2020-01-01T00:01Z',lat:3,lon:181,wind:90},{time:'2020-01-05T00:00Z',lat:12,lon:185,wind:null},{time:'2020-02-05T00:00Z',lat:12,lon:186,wind:80}];
 assert.deepEqual(sampleAtProgress(track,1/3),{coordinates:[3,181],wind:90});
 assert.deepEqual(sampleAtProgress(track,2/3),{coordinates:[12,185],wind:null});
 assert.deepEqual(sampleAtProgress(track,1/6),{coordinates:[1.5,180],wind:60});
 assert.deepEqual(sampleAtProgress(track,1),{coordinates:[12,186],wind:80});
 assert.equal(sampleAtProgress(track,-.01),null);
 assert.equal(sampleAtProgress(track,1.01),null);
 assert.equal(sampleAtProgress([],0),null);
 assert.deepEqual(sampleAtProgress([track[0]],.5),{coordinates:[0,179],wind:30});
 assert.equal(sampleAtProgress(track,.5).wind,null);
});
