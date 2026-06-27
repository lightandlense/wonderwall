const { test } = require('node:test');
const assert = require('node:assert');

// Stub the Tone global the registry closes over (makeNode is never called here).
global.Tone = { Filter: function () {}, FeedbackDelay: function () {}, Reverb: function () {}, Distortion: function () {} };
const tonality = require('../utils/tonality.js');
global.tonality = tonality; // registry uses global tonality in browser; mirror for Node
const MODULE_REGISTRY = require('../services/moduleRegistry.js');

test('registry has the modules with correct types', () => {
  assert.strictEqual(MODULE_REGISTRY[0].type, 'bass');
  assert.strictEqual(MODULE_REGISTRY[1].type, 'effect');
  assert.strictEqual(MODULE_REGISTRY[1].subtype, 'filter');
  assert.strictEqual(MODULE_REGISTRY[2].subtype, 'delay');
  assert.strictEqual(MODULE_REGISTRY[3].type, 'effect');
  assert.strictEqual(MODULE_REGISTRY[3].subtype, 'reverb');
  assert.strictEqual(MODULE_REGISTRY[4].type, 'lead');
  assert.strictEqual(MODULE_REGISTRY[5].subtype, 'tonality');
  assert.strictEqual(MODULE_REGISTRY[9].type, 'effect');
  assert.strictEqual(MODULE_REGISTRY[9].subtype, 'distortion');
});

test('ID 3 is Reverb; ID 6 is the Chords generator', () => {
  assert.strictEqual(MODULE_REGISTRY[3].type, 'effect');
  assert.strictEqual(MODULE_REGISTRY[3].subtype, 'reverb');
  assert.strictEqual(MODULE_REGISTRY[6].type, 'chords');
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

test('Drummer (id 7): rotation selects a groove index', () => {
  const drum = MODULE_REGISTRY[7];
  assert.strictEqual(drum.type, 'drummer');
  // _arcT(3*PI/2) saturates to 0 -> first; _arcT(PI/4) = 1 -> last.
  const n = require('../data/drumGrooves.js').DRUM_GROOVES.length;
  assert.strictEqual(drum.getGrooveIndex(3 * Math.PI / 2), 0);
  assert.strictEqual(drum.getGrooveIndex(Math.PI / 4), n - 1);
  assert.strictEqual(typeof drum.getName(3 * Math.PI / 2), 'string');
});

test('Tempo (id 8): rotation maps to 70..160 BPM', () => {
  const tempo = MODULE_REGISTRY[8];
  assert.strictEqual(tempo.type, 'global');
  assert.strictEqual(tempo.subtype, 'tempo');
  assert.strictEqual(tempo.getBpm(3 * Math.PI / 2), 70);
  assert.strictEqual(tempo.getBpm(Math.PI / 4), 160);
});

test('Bass (id 0): rotation selects a bassline; type bass', () => {
  const bass = MODULE_REGISTRY[0];
  assert.strictEqual(bass.type, 'bass');
  const n = require('../data/bassLines.js').BASS_LINES.length;
  assert.strictEqual(bass.getLineIndex(3 * Math.PI / 2), 0);
  assert.strictEqual(bass.getLineIndex(Math.PI / 4), n - 1);
  assert.strictEqual(typeof bass.getName(3 * Math.PI / 2), 'string');
});

test('Chords (id 6): rotation selects a progression; type chords', () => {
  const ch = MODULE_REGISTRY[6];
  assert.strictEqual(ch.type, 'chords');
  const n = require('../data/chordProgressions.js').CHORD_PROGRESSIONS.length;
  assert.strictEqual(ch.getProgIndex(3 * Math.PI / 2), 0);
  assert.strictEqual(ch.getProgIndex(Math.PI / 4), n - 1);
  assert.strictEqual(typeof ch.getName(3 * Math.PI / 2), 'string');
});

test('Lead (id 4): rotation selects a melody; type lead', () => {
  const lead = MODULE_REGISTRY[4];
  assert.strictEqual(lead.type, 'lead');
  const n = require('../data/melodyLines.js').MELODY_LINES.length;
  assert.strictEqual(lead.getMelodyIndex(3 * Math.PI / 2), 0);
  assert.strictEqual(lead.getMelodyIndex(Math.PI / 4), n - 1);
  assert.strictEqual(typeof lead.getName(3 * Math.PI / 2), 'string');
});
