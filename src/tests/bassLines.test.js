const { test } = require('node:test');
const assert = require('node:assert');
const bassLines = require('../data/bassLines.js');

test('BASS_LINES: each line is 16 steps of degree-or-null', () => {
  assert.ok(Array.isArray(bassLines.BASS_LINES) && bassLines.BASS_LINES.length >= 1);
  for (const l of bassLines.BASS_LINES) {
    assert.ok(typeof l.name === 'string' && l.name.length > 0);
    assert.strictEqual(l.steps.length, 16);
    assert.ok(l.steps.every(s => s === null || (Number.isInteger(s) && s >= 0)));
  }
});
