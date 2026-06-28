const { test } = require('node:test');
const assert = require('node:assert');
const { parseBpm, semitonesToDSharp, pitchRatioToDSharp, TARGET_BPM } = require('../../scripts/loopFilename.js');

test('parseBpm: handles "BPM", "bpm", hyphen, and number+key fallback', () => {
  assert.strictEqual(parseBpm('x 155 BPM D#m.wav'), 155);
  assert.strictEqual(parseBpm('charli-drums-128bpm.wav'), 128);
  assert.strictEqual(parseBpm('chill-house-bass-110-bpm C.wav'), 110);
  assert.strictEqual(parseBpm('fb-drums-110 Bm key.wav'), 110);            // no "BPM" word
  assert.strictEqual(parseBpm('future-bass-drum-loop-150 unknown key.wav'), 150);
  assert.strictEqual(parseBpm('kawaii-bass-drums.wav'), null);             // nothing parseable
});

test('semitonesToDSharp: known keys map to nearest D# shift; unknown -> null', () => {
  assert.strictEqual(semitonesToDSharp('x 155 BPM D#m.wav'), 0);
  assert.strictEqual(semitonesToDSharp('x 108 BPM Dm.wav'), 1);
  assert.strictEqual(semitonesToDSharp('x 110-bpm C.wav'), 3);
  assert.strictEqual(semitonesToDSharp('x 134 BPM Ds Min.wav'), 0);        // "Ds" == D#
  assert.strictEqual(semitonesToDSharp('x 150 BPM F Min.wav'), -2);
  assert.strictEqual(semitonesToDSharp('x 140 BPM C# Min.wav'), 2);
  assert.strictEqual(semitonesToDSharp('x 140 BPM F# Min.wav'), -3);
  assert.strictEqual(semitonesToDSharp('x 150 BPM D Min.wav'), 1);
  assert.strictEqual(semitonesToDSharp('x 100 BPM A#min.wav'), 5);         // no space
  assert.strictEqual(semitonesToDSharp('x 110 BPM G# Min.wav'), -5);
  assert.strictEqual(semitonesToDSharp('x 150 BPM G Min.wav'), -4);
  assert.strictEqual(semitonesToDSharp('x 160 BPM A#.wav'), 5);
  assert.strictEqual(semitonesToDSharp('x 150 BPM Key D.wav'), 1);
  assert.strictEqual(semitonesToDSharp('x 140 BPM unkown key.wav'), null);
  assert.strictEqual(semitonesToDSharp('x 160 BPM Key Unknown.wav'), null);
});

test('pitchRatioToDSharp: ratio = 2^(semitones/12), 1 when keyless', () => {
  assert.ok(Math.abs(pitchRatioToDSharp('x 108 BPM Dm.wav') - Math.pow(2, 1 / 12)) < 1e-9);
  assert.strictEqual(pitchRatioToDSharp('x 140 BPM unkown key.wav'), 1);
  assert.strictEqual(TARGET_BPM, 128);
});
