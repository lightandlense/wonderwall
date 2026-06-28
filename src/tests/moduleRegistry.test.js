const { test } = require('node:test');
const assert = require('node:assert');

// Stub Tone globals the registry closes over (makeNode is never called here).
global.Tone = {
  Filter: function () {}, FeedbackDelay: function () {}, Reverb: function () {},
  Distortion: function () {}, PitchShift: function () {}, Tremolo: function () { return { start() {} }; },
  BitCrusher: function () {},
};
const tonality = require('../utils/tonality.js');
global.tonality = tonality;
const MODULE_REGISTRY = require('../services/moduleRegistry.js');

test('registry has the modules with correct types', () => {
  assert.strictEqual(MODULE_REGISTRY[0].type, 'oscillator');
  assert.strictEqual(MODULE_REGISTRY[1].type, 'effect');
  assert.strictEqual(MODULE_REGISTRY[1].subtype, 'filter');
  assert.strictEqual(MODULE_REGISTRY[2].subtype, 'delay');
  assert.strictEqual(MODULE_REGISTRY[3].type, 'effect');
  assert.strictEqual(MODULE_REGISTRY[3].subtype, 'reverb');
  assert.strictEqual(MODULE_REGISTRY[4].type, 'controller');
  assert.strictEqual(MODULE_REGISTRY[4].subtype, 'lfo');
  assert.strictEqual(MODULE_REGISTRY[5].subtype, 'tonality');
  assert.strictEqual(MODULE_REGISTRY[6].type, 'controller');
  assert.strictEqual(MODULE_REGISTRY[6].subtype, 'sequencer');
  assert.strictEqual(MODULE_REGISTRY[7].type, 'effect');
  assert.strictEqual(MODULE_REGISTRY[7].subtype, 'pitchshift');
  assert.strictEqual(MODULE_REGISTRY[9].type, 'effect');
  assert.strictEqual(MODULE_REGISTRY[9].subtype, 'distortion');
});

test('ID 3 is Reverb; ID 6 is the Sequencer controller', () => {
  assert.strictEqual(MODULE_REGISTRY[3].type, 'effect');
  assert.strictEqual(MODULE_REGISTRY[3].subtype, 'reverb');
  assert.strictEqual(MODULE_REGISTRY[6].type, 'controller');
  assert.strictEqual(MODULE_REGISTRY[6].subtype, 'sequencer');
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

test('Oscillator (id 0): getFreq maps rotation to C3..C6 range', () => {
  const osc = MODULE_REGISTRY[0];
  assert.strictEqual(osc.type, 'oscillator');
  const lo = osc.getFreq(3 * Math.PI / 2); // saturates to t=0 -> C3
  const hi = osc.getFreq(Math.PI / 4);     // saturates to t=1 -> C6
  assert.ok(lo >= 130 && lo <= 135, `expected ~C3 (130.81), got ${lo}`);
  assert.ok(hi >= 1040 && hi <= 1050, `expected ~C6 (1046.5), got ${hi}`);
});

test('LFO (id 4): getRateHz maps rotation to 0.1..8 Hz range', () => {
  const lfo = MODULE_REGISTRY[4];
  assert.strictEqual(lfo.type, 'controller');
  assert.strictEqual(lfo.subtype, 'lfo');
  const lo = lfo.getRateHz(3 * Math.PI / 2);
  const hi = lfo.getRateHz(Math.PI / 4);
  assert.ok(lo >= 0.09 && lo <= 0.15, `expected ~0.1 Hz, got ${lo}`);
  assert.ok(hi >= 7.5 && hi <= 8.5, `expected ~8 Hz, got ${hi}`);
});

test('Sequencer (id 6): type controller/sequencer', () => {
  const seq = MODULE_REGISTRY[6];
  assert.strictEqual(seq.type, 'controller');
  assert.strictEqual(seq.subtype, 'sequencer');
  assert.ok(typeof seq.getParamT === 'function');
});

test('PitchShift (id 7): centerValue maps t to ±12 semitones', () => {
  const ps = MODULE_REGISTRY[7];
  assert.strictEqual(ps.type, 'effect');
  assert.strictEqual(ps.subtype, 'pitchshift');
  assert.strictEqual(ps.centerValue(0), -12);
  assert.strictEqual(ps.centerValue(0.5), 0);
  assert.strictEqual(ps.centerValue(1), 12);
});

test('Tempo (id 8): rotation maps to 70..160 BPM', () => {
  const tempo = MODULE_REGISTRY[8];
  assert.strictEqual(tempo.type, 'global');
  assert.strictEqual(tempo.subtype, 'tempo');
  assert.strictEqual(tempo.getBpm(3 * Math.PI / 2), 70);
  assert.strictEqual(tempo.getBpm(Math.PI / 4), 160);
});
