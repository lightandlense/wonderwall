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

test('meterToUnit: maps dB to [0,1], clamps, handles -Infinity', () => {
  assert.strictEqual(cableAnim.meterToUnit(0), 1);
  assert.strictEqual(cableAnim.meterToUnit(-48), 0);
  assert.strictEqual(cableAnim.meterToUnit(-24), 0.5);
  assert.strictEqual(cableAnim.meterToUnit(6), 1);
  assert.strictEqual(cableAnim.meterToUnit(-60), 0);
  assert.strictEqual(cableAnim.meterToUnit(-Infinity), 0);
  assert.strictEqual(cableAnim.meterToUnit(NaN), 0);
});

test('flowSpeed: audio scales with level (52..130 px/s)', () => {
  assert.strictEqual(cableAnim.flowSpeed({ level: 0 }), 52);
  assert.strictEqual(cableAnim.flowSpeed({ level: 1 }), 130);
  assert.strictEqual(cableAnim.flowSpeed({ level: 0.5 }), 91);
  assert.strictEqual(cableAnim.flowSpeed(), 52); // default level 0
});

test('waveSamples: sample count includes both endpoints', () => {
  const a = cableAnim.waveSamples(60, { shape: 'sine', wavelength: 40, amplitude: 10, step: 6 });
  assert.strictEqual(a.length, 11);
  const b = cableAnim.waveSamples(10, { shape: 'sine', wavelength: 40, amplitude: 10, step: 6 });
  assert.strictEqual(b.length, 3);
});

test('waveSamples: empty for non-positive length or zero wavelength', () => {
  assert.deepStrictEqual(cableAnim.waveSamples(0, { shape: 'sine', wavelength: 40, amplitude: 10 }), []);
  assert.deepStrictEqual(cableAnim.waveSamples(60, { shape: 'sine', wavelength: 0, amplitude: 10 }), []);
});

test('waveSamples: sine/saw stay within [-amp, amp]; first sample uses phase', () => {
  const amp = 12;
  const s = cableAnim.waveSamples(120, { shape: 'sine', wavelength: 40, amplitude: amp, phase: 0, step: 6 });
  assert.ok(s.every(v => v >= -amp - 1e-9 && v <= amp + 1e-9));
  const saw = cableAnim.waveSamples(120, { shape: 'saw', wavelength: 40, amplitude: amp, phase: 0, step: 6 });
  assert.ok(Math.abs(saw[0] + amp) < 1e-9);
});

test('_shape: softsaw is finite and roughly bounded', () => {
  for (let t = 0; t < 3; t += 0.13) {
    const v = cableAnim._shape('softsaw', t);
    assert.ok(Number.isFinite(v) && Math.abs(v) < 2);
  }
});

test('echoEnvelope: full at source, steps down toward dest, in (0,1]', () => {
  assert.strictEqual(cableAnim.echoEnvelope(0, 100, { count: 3, decay: 0.5 }), 1);
  assert.strictEqual(cableAnim.echoEnvelope(99, 100, { count: 3, decay: 0.5 }), 0.25);
  const a = cableAnim.echoEnvelope(10, 100, {});
  const b = cableAnim.echoEnvelope(90, 100, {});
  assert.ok(b <= a && a <= 1 && b > 0);
  assert.strictEqual(cableAnim.echoEnvelope(10, 0, {}), 0);
});

test('peakEnvelope: n buckets, each the max abs, in [0,1]', () => {
  const s = [0, 0.2, -0.9, 0.1, 0.5, -0.3];
  const env = cableAnim.peakEnvelope(s, 3);
  assert.deepStrictEqual(env, [0.2, 0.9, 0.5]);
  assert.ok(env.every(v => v >= 0 && v <= 1));
});

test('peakEnvelope: empty / non-positive n -> []', () => {
  assert.deepStrictEqual(cableAnim.peakEnvelope([], 4), []);
  assert.deepStrictEqual(cableAnim.peakEnvelope([0.5, 0.5], 0), []);
});
