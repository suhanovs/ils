import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../public/data/storms/', import.meta.url));
const readGz = p => JSON.parse(gunzipSync(readFileSync(path.join(root, p))).toString());

test('hurricane catalogue, complete tracks and validated swath assets agree', () => {
  const { storms, throughYear } = JSON.parse(readFileSync(path.join(root, 'catalog.json')));
  const tracks = readGz('tracks.bin');
  assert.equal(throughYear, 2025);
  assert.equal(storms.length, 1582);
  assert.equal(Object.keys(tracks).length, storms.length);
  const ids = new Set();
  for (const [i, s] of storms.entries()) {
    assert.match(s.id, /^(AL|EP|CP)\d{6}$/);
    assert(!ids.has(s.id)); ids.add(s.id);
    assert.equal(Number(s.id.slice(4)), s.year);
    assert(s.year <= 2025);
    if (i) assert(storms[i - 1].year >= s.year);
    const points = tracks[s.id];
    assert(points.length > 0);
    assert.equal(points[0].time, s.start);
    assert.equal(points.at(-1).time, s.end);
    assert.equal(Math.max(...points.map(p => p.wind ?? -Infinity)), s.peakWindKt);
    for (const [j, p] of points.entries()) {
      assert(Number.isFinite(p.lat) && p.lat >= -90 && p.lat <= 90);
      assert(Number.isFinite(p.lon) && p.lon >= -180 && p.lon <= 180);
      assert(p.wind === null || Number.isFinite(p.wind));
      assert(!Number.isNaN(Date.parse(p.time)));
      if (j) assert(points[j - 1].time <= p.time);
    }
    if (s.hasSwath) {
      const data = readGz(`swaths/${s.id}.bin`);
      assert.equal(data.type, 'FeatureCollection');
      assert(data.features.length > 0);
      for (const f of data.features) {
        assert.equal(f.properties.STORMID.toUpperCase(), s.id);
        assert([34, 50, 64].includes(f.properties.RADII));
        assert(['Polygon', 'MultiPolygon'].includes(f.geometry.type));
      }
    }
  }
  assert.equal(storms.filter(s => s.hasSwath).length, 259);
  assert.deepEqual(readdirSync(path.join(root, 'swaths')).sort(), storms.filter(s => s.hasSwath).map(s => `${s.id}.bin`).sort());
  assert.equal(storms.find(s => s.id === 'AL092022').hasSwath, true);
  assert.equal(storms.find(s => s.id === 'AL092017').hasSwath, false);
});
