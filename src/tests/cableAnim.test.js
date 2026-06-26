const { test } = require('node:test');
const assert = require('node:assert');
const cableAnim = require('../utils/cableAnim.js');

test('flowDotDistances: dots spaced by `spacing`, all within [0,length)', () => {
  const d = cableAnim.flowDotDistances(100, 55, 55, 500); // offset=(0.5*55)%55=27.5
  assert.deepStrictEqual(d, [27.5, 82.5]);
  assert.ok(d.every(x => x >= 0 && x < 100));
});

test('flowDotDistances: advances with time', () => {
  const a = cableAnim.flowDotDistances(200, 55, 130, 0);
  const b = cableAnim.flowDotDistances(200, 55, 130, 100);
  assert.notStrictEqual(a[0], b[0]); // first dot moved
});

test('flowDotDistances: zero/negative length -> empty', () => {
  assert.deepStrictEqual(cableAnim.flowDotDistances(0, 55, 130, 0), []);
  assert.deepStrictEqual(cableAnim.flowDotDistances(-5, 55, 130, 0), []);
});

test('pulseProgress: in-window fraction, null outside', () => {
  assert.strictEqual(cableAnim.pulseProgress(1000, 1075, 150), 0.5);
  assert.strictEqual(cableAnim.pulseProgress(1000, 1000, 150), 0);
  assert.strictEqual(cableAnim.pulseProgress(1000, 1150, 150), null); // p=1 -> null
  assert.strictEqual(cableAnim.pulseProgress(1000, 900, 150), null);  // negative
  assert.strictEqual(cableAnim.pulseProgress(null, 1000, 150), null); // no hit yet
});
