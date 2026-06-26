const { test } = require('node:test');
const assert = require('node:assert');
const tonality = require('../utils/tonality.js');

test('rootFromT maps [0,1] to 12 pitch classes', () => {
  assert.strictEqual(tonality.rootFromT(0), 0);
  assert.strictEqual(tonality.rootFromT(0.999), 11);
  assert.strictEqual(tonality.rootFromT(0.5), 6);
  // clamps out-of-range input
  assert.strictEqual(tonality.rootFromT(-1), 0);
  assert.strictEqual(tonality.rootFromT(2), 11);
});

test('A4 (440) with root A(9) is already in scale -> unchanged', () => {
  const f = tonality.quantizeFreqToScale(440, 9);
  assert.ok(Math.abs(f - 440) < 0.5);
});

test('a frequency between scale notes snaps to the nearest scale note', () => {
  // C(0) minor pentatonic = C, Eb, F, G, Bb. A 'D' (MIDI 62, ~293.66 Hz)
  // is not in the scale; nearest members are C (60) and Eb (63).
  const dFreq = 293.66;
  const snapped = tonality.quantizeFreqToScale(dFreq, 0);
  const cFreq = 261.63;  // C4
  const ebFreq = 311.13; // Eb4
  const nearOne = Math.min(Math.abs(snapped - cFreq), Math.abs(snapped - ebFreq));
  assert.ok(nearOne < 1.0, `expected snap to C4 or Eb4, got ${snapped}`);
});

test('quantized note is a member of the scale (pitch class check)', () => {
  const snapped = tonality.quantizeFreqToScale(500, 2); // root D(2)
  const midi = Math.round(69 + 12 * Math.log2(snapped / 440));
  const pc = ((midi - 2) % 12 + 12) % 12;
  assert.ok(tonality.SCALE_MINOR_PENTATONIC.includes(pc));
});

test('scaleDegreeFreq: degree 0 is the root pitch class, in scale', () => {
  const f = tonality.scaleDegreeFreq(261.63, 0, 0); // C root
  const midi = Math.round(69 + 12 * Math.log2(f / 440));
  assert.strictEqual(((midi - 0) % 12 + 12) % 12, 0); // pitch class C
});

test('scaleDegreeFreq: ascending degrees are monotonically higher', () => {
  let prev = 0;
  for (let d = 0; d < 10; d++) {
    const f = tonality.scaleDegreeFreq(261.63, 0, d);
    assert.ok(f > prev, `degree ${d} should be higher`);
    prev = f;
  }
});

test('scaleDegreeFreq: degree 5 is one octave above degree 0', () => {
  const f0 = tonality.scaleDegreeFreq(261.63, 0, 0);
  const f5 = tonality.scaleDegreeFreq(261.63, 0, 5);
  assert.ok(Math.abs(f5 / f0 - 2) < 0.02, 'pentatonic has 5 notes/octave');
});
