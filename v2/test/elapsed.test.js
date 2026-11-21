import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sampleAtProgress, samplePlayback, progressAtIndex} from '../src/elapsed.js';
import * as timeline from '../src/elapsed.js';

test('uniform observation steps ignore irregular timestamps',()=>{
 const track=[{time:'2020-01-01T00:00Z',lat:0,lon:179,wind:30},{time:'2020-01-01T00:01Z',lat:3,lon:181,wind:90},{time:'2020-01-05T00:00Z',lat:12,lon:185,wind:null},{time:'2020-02-05T00:00Z',lat:12,lon:186,wind:80}];
 assert.deepEqual(sampleAtProgress(track,1/3),{coordinates:[3,181],wind:90});
 assert.deepEqual(sampleAtProgress(track,2/3),{coordinates:[12,185],wind:null});
 assert.equal(sampleAtProgress(track,1/6).wind,60);
 assert.deepEqual(sampleAtProgress(track,1),{coordinates:[12,186],wind:80});
 assert.equal(sampleAtProgress(track,-.01),null);
 assert.equal(sampleAtProgress(track,1.01),null);
 assert.equal(sampleAtProgress([],0),null);
 assert.deepEqual(sampleAtProgress([track[0]],.5),{coordinates:[0,179],wind:30});
 assert.equal(sampleAtProgress(track,.5).wind,null);
});


test('real Isaias and Fay never dwell on consecutive playback frames', async()=>{
 const {readFileSync}=await import('node:fs');
 const {gunzipSync}=await import('node:zlib');
 const tracks=JSON.parse(gunzipSync(readFileSync(new URL('../public/data/storms/tracks.bin',import.meta.url))));
 for(const id of ['AL092026','AL062020']){
  const track=tracks[id], before=JSON.stringify(track);
  let previous=sampleAtProgress(track,0).coordinates;
  for(let frame=1;frame<=180;frame++){
   const current=sampleAtProgress(track,frame/180).coordinates;
   assert.ok(Math.hypot(current[0]-previous[0],current[1]-previous[1])>1e-10,`${id} stopped at frame ${frame}`);
   previous=current;
  }
  assert.equal(JSON.stringify(track),before);
 }
});


test('cubic interpolation is C1 and bounded across turns and reversals',()=>{
 const track=[{lat:0,lon:179},{lat:3,lon:-179},{lat:8,lon:-176},{lat:6,lon:-174}];
 for(let segment=0;segment<3;segment++){
  const a=samplePlayback(track,segment/3).coordinates,b=samplePlayback(track,(segment+1)/3).coordinates;
  for(let j=0;j<=100;j++){const p=samplePlayback(track,(segment+j/100)/3).coordinates;for(let axis=0;axis<2;axis++)assert.ok(p[axis]>=Math.min(a[axis],b[axis])-1e-10 && p[axis]<=Math.max(a[axis],b[axis])+1e-10)}
 }
 for(const x of [1/3,2/3]){const h=1e-6,a=samplePlayback(track,x-h).coordinates,b=samplePlayback(track,x).coordinates,c=samplePlayback(track,x+h).coordinates;for(let axis=0;axis<2;axis++)assert.ok(Math.abs((b[axis]-a[axis])/h-(c[axis]-b[axis])/h)<.001)}
 assert.equal(samplePlayback(track,1).coordinates[1],186);
});

test('duplicate advisory mapping preserves indices and handles stationary or two-point tracks',()=>{
 const track=[{lat:1,lon:2,wind:10},{lat:1,lon:2,wind:20},{lat:3,lon:4,wind:null},{lat:3,lon:4,wind:40},{lat:5,lon:6,wind:50}];
 assert.equal(progressAtIndex(track,0),0);assert.equal(progressAtIndex(track,1),0);assert.equal(progressAtIndex(track,2),.5);assert.equal(progressAtIndex(track,3),.5);
 assert.equal(samplePlayback(track,.25).rawIndex,1.5);assert.equal(samplePlayback(track,1).rawIndex,4);
 assert.equal(sampleAtProgress(track,.25).wind,null);
 assert.deepEqual(samplePlayback(track.slice(0,2),.5).coordinates,[1,2]);
 assert.deepEqual(samplePlayback([track[0],track[4]],.5).coordinates,[3,4]);
});

test('displayed path follows the same curve as the moving marker',()=>{
 const track=[{lat:0,lon:179},{lat:2,lon:-179},{lat:6,lon:-176},{lat:4,lon:-174}];
 assert.equal(typeof timeline.smoothedPath,'function');
 const path=timeline.smoothedPath(track,12);
 assert.equal(path.length,37);
 for(let i=0;i<path.length;i++)assert.deepEqual(path[i],samplePlayback(track,i/(path.length-1)).coordinates);
 assert.deepEqual(timeline.smoothedPath([{lat:1,lon:2},{lat:1,lon:2}],12),[[1,2]]);
});
