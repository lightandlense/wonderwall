// src/utils/cableAnim.js
// Pure helpers for cable flow animation. No DOM. Time-driven (performance.now()).
const cableAnim = {
  // Distances along a cable of `length` px where flowing dots should be drawn.
  flowDotDistances(length, spacing, speed, nowMs) {
    if (!(length > 0) || !(spacing > 0)) return [];
    const offset = ((nowMs / 1000) * speed) % spacing;
    const out = [];
    for (let d = offset; d < length; d += spacing) out.push(d);
    return out;
  },
  // Map a meter reading in dB to [0,1]. floor dB -> 0, 0 dB -> 1, clipping clamps.
  meterToUnit(db, floor = -48) {
    if (!(db > floor)) return 0;            // handles <=floor, -Infinity, NaN
    const u = (db - floor) / (0 - floor);
    return u > 1 ? 1 : u;
  },
  // Scroll speed (px/sec) for an audio cable's signal animation: 52..130 px/s by level.
  flowSpeed({ level = 0 } = {}) {
    const lv = level < 0 ? 0 : (level > 1 ? 1 : level);
    return 130 * (0.4 + 0.6 * lv);
  },
  // Perpendicular offsets along a cable: offset(d) = amplitude * shape(phase + d/wavelength).
  // Samples at d = 0, step, 2*step, ... plus a final sample at exactly `len`.
  waveSamples(len, { shape, wavelength, amplitude, phase = 0, step = 6 } = {}) {
    if (!(len > 0) || !(wavelength > 0) || !(amplitude >= 0)) return [];
    const out = [];
    let last = 0;
    for (let d = 0; d <= len; d += step) {
      out.push(amplitude * this._shape(shape, phase + d / wavelength));
      last = d;
    }
    if (last !== len) out.push(amplitude * this._shape(shape, phase + len / wavelength));
    return out;
  },
  // Unit waveform in ~[-1,1]. t is in cycles.
  _shape(shape, t) {
    const frac = t - Math.floor(t);          // [0,1)
    if (shape === 'saw') return 2 * frac - 1;
    if (shape === 'softsaw') {
      const w = 2 * Math.PI * t;
      return (Math.sin(w) + Math.sin(2 * w) / 2 + Math.sin(3 * w) / 3) / 1.5;
    }
    return Math.sin(2 * Math.PI * t);        // 'sine' / default
  },
  // Delay echo amplitude multiplier: 1 at the source end, decaying in `count` steps to dest.
  echoEnvelope(d, len, { count = 3, decay = 0.5 } = {}) {
    if (!(len > 0)) return 0;
    const frac = d <= 0 ? 0 : (d >= len ? 1 - 1e-9 : d / len);
    const band = Math.min(count - 1, Math.floor(frac * count));
    return Math.pow(decay, band);
  },
  // Downsample a sample array into n peak magnitudes (max abs per bucket), in [0,1].
  peakEnvelope(samples, n) {
    const len = samples ? samples.length : 0;
    if (len === 0 || !(n > 0)) return [];
    const out = [];
    for (let i = 0; i < n; i++) {
      const start = Math.floor((i * len) / n);
      const end = Math.max(start + 1, Math.floor(((i + 1) * len) / n));
      let peak = 0;
      for (let j = start; j < end && j < len; j++) {
        const a = Math.abs(samples[j]);
        if (a > peak) peak = a;
      }
      out.push(peak > 1 ? 1 : peak);
    }
    return out;
  },
};

if (typeof window !== 'undefined') window.cableAnim = cableAnim;
if (typeof module !== 'undefined') module.exports = cableAnim;
