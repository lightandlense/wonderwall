const { test } = require('node:test');
const assert = require('node:assert');
const drumGrooves = require('../data/drumGrooves.js');

test('DRUM_GROOVES: each groove has 16-step kick/snare/hat of 0/1', () => {
  assert.ok(Array.isArray(drumGrooves.DRUM_GROOVES) && drumGrooves.DRUM_GROOVES.length >= 1);
  for (const g of drumGrooves.DRUM_GROOVES) {
    assert.ok(typeof g.name === 'string' && g.name.length > 0);
    for (const track of ['kick', 'snare', 'hat']) {
      assert.strictEqual(g[track].length, 16, `${g.name}.${track} should be 16 steps`);
      assert.ok(g[track].every(v => v === 0 || v === 1), `${g.name}.${track} should be 0/1`);
    }
  }
});
