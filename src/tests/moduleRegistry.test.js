const { test } = require('node:test');
const assert = require('node:assert');

// Stub the Tone global the registry closes over (makeNode is never called here).
global.Tone = { Filter: function () {}, FeedbackDelay: function () {} };
const tonality = require('../utils/tonality.js');
global.tonality = tonality; // registry uses global tonality in browser; mirror for Node
const MODULE_REGISTRY = require('../services/moduleRegistry.js');

test('registry has the six Phase 3 modules with correct types', () => {
  assert.strictEqual(MODULE_REGISTRY[0].type, 'oscillator');
  assert.strictEqual(MODULE_REGISTRY[1].type, 'effect');
  assert.strictEqual(MODULE_REGISTRY[1].subtype, 'filter');
  assert.strictEqual(MODULE_REGISTRY[2].subtype, 'delay');
  assert.strictEqual(MODULE_REGISTRY[3].type, 'output');
  assert.strictEqual(MODULE_REGISTRY[4].subtype, 'lfo');
  assert.strictEqual(MODULE_REGISTRY[5].subtype, 'tonality');
});

test('calibration IDs are NOT in the registry', () => {
  for (const id of [10, 11, 13, 18]) {
    assert.strictEqual(MODULE_REGISTRY[id], undefined);
  }
});

test('getParamT is shared and bounded [0,1] at the rotation extremes', () => {
  for (const id of [0, 1, 2, 3]) {
    const def = MODULE_REGISTRY[id];
    assert.ok(def.getParamT(0) >= 0 && def.getParamT(0) <= 1);
    assert.ok(def.getParamT(Math.PI) >= 0 && def.getParamT(Math.PI) <= 1);
  }
});

test('filter cutoff center rises with rotation; delay feedback within bounds', () => {
  const filt = MODULE_REGISTRY[1];
  assert.ok(filt.centerValue(0.1) < filt.centerValue(0.9));
  const dly = MODULE_REGISTRY[2];
  assert.ok(dly.centerValue(0) >= 0 && dly.centerValue(1) <= 0.85);
});
