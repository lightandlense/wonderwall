const { test } = require('node:test');
const assert = require('node:assert');
const chordProgressions = require('../data/chordProgressions.js');

test('CHORD_PROGRESSIONS: each is 16 steps of degree-or-null with at least one chord', () => {
  assert.ok(Array.isArray(chordProgressions.CHORD_PROGRESSIONS) && chordProgressions.CHORD_PROGRESSIONS.length >= 1);
  for (const p of chordProgressions.CHORD_PROGRESSIONS) {
    assert.ok(typeof p.name === 'string' && p.name.length > 0);
    assert.strictEqual(p.steps.length, 16);
    assert.ok(p.steps.every(s => s === null || (Number.isInteger(s) && s >= 0)));
    assert.ok(p.steps.some(s => s !== null), `${p.name} should have at least one chord`);
  }
});
