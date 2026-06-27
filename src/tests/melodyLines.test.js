const { test } = require('node:test');
const assert = require('node:assert');
const melodyLines = require('../data/melodyLines.js');

test('MELODY_LINES: each is 16 steps of degree-or-null with at least one note', () => {
  assert.ok(Array.isArray(melodyLines.MELODY_LINES) && melodyLines.MELODY_LINES.length >= 1);
  for (const m of melodyLines.MELODY_LINES) {
    assert.ok(typeof m.name === 'string' && m.name.length > 0);
    assert.strictEqual(m.steps.length, 16);
    assert.ok(m.steps.every(s => s === null || (Number.isInteger(s) && s >= 0)));
    assert.ok(m.steps.some(s => s !== null), `${m.name} should have at least one note`);
  }
});
