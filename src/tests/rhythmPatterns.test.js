const { test } = require('node:test');
const assert = require('node:assert');
const rp = require('../utils/rhythmPatterns.js');

test('every pattern is exactly 16 booleans with a name', () => {
  assert.ok(rp.PATTERNS.length >= 6);
  for (const p of rp.PATTERNS) {
    assert.strictEqual(typeof p.name, 'string');
    assert.strictEqual(p.steps.length, 16);
    assert.ok(p.steps.every(s => typeof s === 'boolean'));
  }
});

test('four-on-the-floor hits steps 0,4,8,12 only', () => {
  const f = rp.PATTERNS.find(p => p.name.toLowerCase().includes('four'));
  assert.ok(f, 'four-on-the-floor pattern exists');
  f.steps.forEach((s, i) => assert.strictEqual(s, i % 4 === 0));
});

test('patterns are ordered sparse -> busy by hit count', () => {
  const counts = rp.PATTERNS.map(p => p.steps.filter(Boolean).length);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1], `pattern ${i} not >= previous`);
});
