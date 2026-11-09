import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointLabel } from '../src/model.js';
test('formats NOAA point time and intensity honestly', () => { assert.equal(pointLabel({DTG:2022092818,INTENSITY:130}), 'Sep 28, 2022 · 18:00 UTC · 130 kt'); });
import { clampIndex } from '../src/model.js';
test('timeline index stays within the available points', () => {
  assert.equal(clampIndex(-1, 36), 0);
  assert.equal(clampIndex(99, 36), 35);
  assert.equal(clampIndex(12, 36), 12);
});
