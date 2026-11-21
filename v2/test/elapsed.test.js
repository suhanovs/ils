import {test} from 'node:test';
import assert from 'node:assert/strict';
import {positionAtElapsed, formatElapsed, sampleAtElapsed} from '../src/elapsed.js';

test('elapsed interpolation uses actual nonuniform minutes and ends each track',()=>{
 const track=[{time:'2020-01-01T00:00:00Z',lat:0,lon:179},{time:'2020-01-01T01:30:00Z',lat:3,lon:181},{time:'2020-01-01T06:00:00Z',lat:12,lon:185}];
 assert.deepEqual(positionAtElapsed(track,45*60000),[1.5,180]);
 assert.deepEqual(positionAtElapsed(track,3*3600000),[6,182.33333333333334]);
 assert.equal(positionAtElapsed(track,6*3600000+1),null);
 assert.equal(formatElapsed(25*3600000+30*60000),'Day 2 + 1h 30m');
});

test('elapsed samples interpolate intensity without inventing missing wind',()=>{
 const track=[{time:'2020-01-01T00:00Z',lat:0,lon:179,wind:30},{time:'2020-01-01T01:30Z',lat:3,lon:181,wind:90},{time:'2020-01-01T06:00Z',lat:12,lon:185,wind:null}];
 assert.deepEqual(sampleAtElapsed(track,45*60000),{coordinates:[1.5,180],wind:60});
 assert.equal(sampleAtElapsed(track,90*60000).wind,90);
 assert.equal(sampleAtElapsed(track,3*3600000).wind,null);
 assert.equal(sampleAtElapsed(track,6*3600000+1),null);
 const later=[{time:'2020-01-01T00:00Z',lat:0,lon:0,wind:null},{time:'2020-01-01T01:30Z',lat:1,lon:1,wind:80}];
 assert.equal(sampleAtElapsed(later,90*60000).wind,80);
});
