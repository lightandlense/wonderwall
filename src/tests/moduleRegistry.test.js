const { test } = require('node:test');
const assert = require('node:assert');

// Stub the Tone globals the registry closes over (makeNode is never called here).
global.Tone = {
  Filter: function () {}, FeedbackDelay: function () {}, Reverb: function () {},
  Distortion: function () {}, Tremolo: function () { return { start() {} }; },
  BitCrusher: function () {},
};
const tonality = require('../utils/tonality.js');
global.tonality = tonality;
const MODULE_REGISTRY = require('../services/moduleRegistry.js');

test('registry has the modules with correct types', () => {
  assert.strictEqual(MODULE_REGISTRY[0].type, 'oscillator');
  assert.strictEqual(MODULE_REGISTRY[1].subtype, 'filter');
  assert.strictEqual(MODULE_REGISTRY[2].subtype, 'delay');
  assert.strictEqual(MODULE_REGISTRY[3].subtype, 'reverb');
  assert.strictEqual(MODULE_REGISTRY[4].type, 'sampler');   // Drummer is now a loop sampler
  assert.strictEqual(MODULE_REGISTRY[5].type, 'effect');    // Tonality replaced by Volume
  assert.strictEqual(MODULE_REGISTRY[5].subtype, 'volume');
  assert.strictEqual(MODULE_REGISTRY[6].type, 'sampler');
  assert.strictEqual(MODULE_REGISTRY[7].type, 'sampler');   // Melody
  assert.strictEqual(MODULE_REGISTRY[8].subtype, 'tempo');
  assert.strictEqual(MODULE_REGISTRY[9].subtype, 'distortion');
  assert.strictEqual(MODULE_REGISTRY[16].type, 'sampler');  // Bass is now a loop sampler
  assert.strictEqual(MODULE_REGISTRY[12].type, 'global');      // Loop Bank switcher
  assert.strictEqual(MODULE_REGISTRY[12].subtype, 'loopgroup');
  assert.strictEqual(MODULE_REGISTRY[20].type, 'sampler');  // Loop
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

test('Oscillator (id 0): getFreq maps rotation to C3..C6 range', () => {
  const osc = MODULE_REGISTRY[0];
  const lo = osc.getFreq(3 * Math.PI / 2); // saturates to t=0 -> C3
  const hi = osc.getFreq(Math.PI / 4);     // saturates to t=1 -> C6
  assert.ok(lo >= 130 && lo <= 135, `expected ~C3, got ${lo}`);
  assert.ok(hi >= 1040 && hi <= 1050, `expected ~C6, got ${hi}`);
});

test('Drummer (id 4): is a sampler that only selects drum-category loops', () => {
  require('../data/loopBank.js').setActiveGroup('og');
  const drum = MODULE_REGISTRY[4];
  const lb = require('../data/loopBank.js');
  assert.strictEqual(drum.type, 'sampler');
  // Across the rotation arc, every selected index must be a drum-category loop.
  for (const angle of [3 * Math.PI / 2, 0, Math.PI / 8, Math.PI / 4]) {
    const idx = drum.getLoopIndex(angle);
    assert.strictEqual(lb.LOOP_BANK[idx].category, 'drums', `angle ${angle} -> non-drum`);
  }
  // Extremes saturate to first/last drum loop; getName returns a non-empty label.
  assert.strictEqual(lb.LOOP_BANK[drum.getLoopIndex(3 * Math.PI / 2)].name, 'Ring');
  assert.strictEqual(lb.LOOP_BANK[drum.getLoopIndex(Math.PI / 4)].name, 'Drums');
  assert.ok(typeof drum.getName(0) === 'string' && drum.getName(0).length > 0);
});

test('Chords (id 6): is a sampler that only selects chord-category loops', () => {
  require('../data/loopBank.js').setActiveGroup('og');
  const ch = MODULE_REGISTRY[6];
  const lb = require('../data/loopBank.js');
  assert.strictEqual(ch.type, 'sampler');
  for (const angle of [3 * Math.PI / 2, 0, Math.PI / 8, Math.PI / 4]) {
    const idx = ch.getLoopIndex(angle);
    assert.strictEqual(lb.LOOP_BANK[idx].category, 'chords', `angle ${angle} -> non-chord`);
  }
  assert.strictEqual(lb.LOOP_BANK[ch.getLoopIndex(3 * Math.PI / 2)].name, 'Phrog');
  assert.strictEqual(lb.LOOP_BANK[ch.getLoopIndex(Math.PI / 4)].name, 'Broken Soul');
  assert.ok(typeof ch.getName(0) === 'string' && ch.getName(0).length > 0);
});

test('Bass (id 16): is a sampler that only selects bass-category loops', () => {
  require('../data/loopBank.js').setActiveGroup('og');
  const bass = MODULE_REGISTRY[16];
  const lb = require('../data/loopBank.js');
  assert.strictEqual(bass.type, 'sampler');
  for (const angle of [3 * Math.PI / 2, 0, Math.PI / 8, Math.PI / 4]) {
    const idx = bass.getLoopIndex(angle);
    assert.strictEqual(lb.LOOP_BANK[idx].category, 'bass', `angle ${angle} -> non-bass`);
  }
  assert.strictEqual(lb.LOOP_BANK[bass.getLoopIndex(3 * Math.PI / 2)].name, 'Chill House');
  assert.strictEqual(lb.LOOP_BANK[bass.getLoopIndex(Math.PI / 4)].name, 'Iron Man');
  assert.ok(typeof bass.getName(0) === 'string' && bass.getName(0).length > 0);
});

test('Tempo (id 8): rotation maps to 70..160 BPM', () => {
  const tempo = MODULE_REGISTRY[8];
  assert.strictEqual(tempo.type, 'global');
  assert.strictEqual(tempo.subtype, 'tempo');
  assert.strictEqual(tempo.getBpm(3 * Math.PI / 2), 70);
  assert.strictEqual(tempo.getBpm(Math.PI / 4), 160);
});

test('Loop Bank (id 12): rotation maps arc to og / futurebass', () => {
  const lbp = MODULE_REGISTRY[12];
  assert.strictEqual(lbp.type, 'global');
  assert.strictEqual(lbp.getGroup(3 * Math.PI / 2), 'og');        // t=0 -> first group
  assert.strictEqual(lbp.getGroup(Math.PI / 4), 'futurebass');    // t=1 -> last group
  assert.ok(typeof lbp.getName(0) === 'string' && lbp.getName(0).length > 0);
});

test('Samplers select within the active group only', () => {
  const lb = require('../data/loopBank.js');
  const bass = MODULE_REGISTRY[16];
  lb.setActiveGroup('og');
  let idx = bass.getLoopIndex(0);
  assert.strictEqual(lb.LOOP_BANK[idx].group, 'og');
  assert.strictEqual(lb.LOOP_BANK[idx].category, 'bass');
  lb.setActiveGroup('futurebass');
  idx = bass.getLoopIndex(0);
  assert.strictEqual(lb.LOOP_BANK[idx].group, 'futurebass');
  assert.strictEqual(lb.LOOP_BANK[idx].category, 'bass');
  lb.setActiveGroup('og'); // restore
});
