const { test } = require('node:test');
const assert = require('node:assert');

// Stub the Tone global the registry closes over (makeNode is never called here).
global.Tone = { Filter: function () {}, FeedbackDelay: function () {} };
const tonality = require('../utils/tonality.js');
global.tonality = tonality; // registry uses global tonality in browser; mirror for Node
const MODULE_REGISTRY = require('../services/moduleRegistry.js');

test('registry has the modules with correct types', () => {
  assert.strictEqual(MODULE_REGISTRY[0].type, 'oscillator');
  assert.strictEqual(MODULE_REGISTRY[1].type, 'effect');
  assert.strictEqual(MODULE_REGISTRY[1].subtype, 'filter');
  assert.strictEqual(MODULE_REGISTRY[2].subtype, 'delay');
  assert.strictEqual(MODULE_REGISTRY[3].type, 'global');
  assert.strictEqual(MODULE_REGISTRY[4].subtype, 'lfo');
  assert.strictEqual(MODULE_REGISTRY[5].subtype, 'tonality');
});

test('ID 3 is now a global Volume control; ID 6 is the Sequencer controller', () => {
  assert.strictEqual(MODULE_REGISTRY[3].type, 'global');
  assert.strictEqual(MODULE_REGISTRY[3].subtype, 'volume');
  assert.strictEqual(MODULE_REGISTRY[6].type, 'controller');
  assert.strictEqual(MODULE_REGISTRY[6].subtype, 'sequencer');
});

test('Sequencer getPatternIndex spans the bank across rotation', () => {
  const seq = MODULE_REGISTRY[6];
  const lo = seq.getPatternIndex(-Math.PI / 4);  // paramT ~ 0
  const hi = seq.getPatternIndex(Math.PI / 4);   // paramT ~ 1
  assert.ok(hi >= lo);
  assert.ok(lo >= 0);
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

test('Loop (id 7): rotation selects a bank index', () => {
  const loop = MODULE_REGISTRY[7];
  assert.strictEqual(loop.type, 'sampler');
  // _arcT(3*PI/2) saturates to 0 -> first; _arcT(PI/4) = 1 -> last.
  const n = require('../data/loopBank.js').LOOP_BANK.length;
  assert.strictEqual(loop.getLoopIndex(3 * Math.PI / 2), 0);
  assert.strictEqual(loop.getLoopIndex(Math.PI / 4), n - 1);
  assert.strictEqual(typeof loop.getName(3 * Math.PI / 2), 'string');
});

test('Tempo (id 8): rotation maps to 70..160 BPM', () => {
  const tempo = MODULE_REGISTRY[8];
  assert.strictEqual(tempo.type, 'global');
  assert.strictEqual(tempo.subtype, 'tempo');
  assert.strictEqual(tempo.getBpm(3 * Math.PI / 2), 70);
  assert.strictEqual(tempo.getBpm(Math.PI / 4), 160);
});
