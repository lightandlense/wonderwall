// src/services/moduleRegistry.js
// Marker ID -> audio module definition.
// Calibration IDs 10, 11, 13, 18 are reserved — never add them here.

const _ARC = Math.PI / 4; // +-45 deg stable tracking range of the topmost-edge convention

// Fold [0,2pi) smoother angle back to signed, map +-ARC -> [0,1] (saturating).
// Prevents the wrap discontinuity that made pitch jump when rotating past the edge.
function _arcT(angle) {
  const signed = angle > Math.PI ? angle - 2 * Math.PI : angle;
  return Math.max(0, Math.min(1, signed / (2 * _ARC) + 0.5));
}

// Exponential map helper for [0,1] -> [lo,hi].
function _expMap(t, lo, hi) { return lo * Math.pow(hi / lo, t); }

// Bit-crush WaveShaper curve: quantize [-1,1] to 2^bits levels. A plain WaveShaper
// (native node) replaces Tone v15's AudioWorklet BitCrusher, which didn't process audio.
function _crushCurve(bits) {
  const steps = Math.pow(2, Math.max(1, bits));
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;                                   // -1..1
    curve[i] = Math.round(((x + 1) / 2) * (steps - 1)) / (steps - 1) * 2 - 1;
  }
  return curve;
}

const MODULE_REGISTRY = {
  // ID 0: Oscillator — rotation controls pitch (C3..C6)
  0: {
    id: 0, name: 'Oscillator', type: 'oscillator', color: '#4d7cff', paramLabel: 'Pitch',
    getParamT(angle) { return _arcT(angle); },
    getFreq(angle) { return _expMap(_arcT(angle), 130.81, 1046.5); }, // C3..C6
  },

  // ID 1: Filter — rotation controls low-pass cutoff
  1: {
    id: 1, name: 'Filter', type: 'effect', subtype: 'filter', color: '#ff8a3d',
    paramLabel: 'Cutoff', modParam: 'frequency',
    getParamT(angle) { return _arcT(angle); },
    centerValue(t) { return _expMap(t, 200, 8000); }, // Hz
    makeNode() { return new Tone.Filter(_expMap(0.5, 200, 8000), 'lowpass'); },
    applyParam(node, t) { node.frequency.rampTo(this.centerValue(t), 0.05); },
  },

  // ID 2: Delay — rotation controls feedback amount (delay time fixed at 1/8 note)
  2: {
    id: 2, name: 'Delay', type: 'effect', subtype: 'delay', color: '#ff5db4',
    paramLabel: 'Feedback', modParam: 'feedback',
    getParamT(angle) { return _arcT(angle); },
    centerValue(t) { return Math.max(0, Math.min(0.85, t * 0.85)); },
    makeNode() { return new Tone.FeedbackDelay('8n', 0.4); },
    applyParam(node, t) { node.feedback.rampTo(this.centerValue(t), 0.05); },
  },

  // ID 3: Reverb — rotation controls wet/dry mix (0 = dry, full = 85% wet)
  3: {
    id: 3, name: 'Reverb', type: 'effect', subtype: 'reverb', color: '#44ccff',
    paramLabel: 'Wet',
    getParamT(angle) { return _arcT(angle); },
    centerValue(t) { return t * 0.85; },
    makeNode() { return new Tone.Reverb({ decay: 2.5, wet: 0 }); },
    applyParam(node, t) { node.wet.rampTo(t * 0.85, 0.05); },
  },

  // ID 4: Drummer — rotation selects a drum loop (category 'drums')
  4: {
    id: 4, name: 'Drummer', type: 'sampler', color: '#ff6b6b', paramLabel: 'Loop',
    getParamT(angle) { return _arcT(angle); },
    getLoopIndex(angle) {
      const lb = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
      const indices = lb.LOOP_BANK.map((e, i) => i).filter(i => lb.LOOP_BANK[i].category === 'drums');
      const n = indices.length;
      return indices[Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)))];
    },
    getName(angle) {
      const lb = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
      const e = lb.LOOP_BANK[this.getLoopIndex(angle)];
      return e ? e.name : '';
    },
  },

  // ID 5: Volume — fades the nearest sound puck. 0 = silent, center = unity (0 dB), full = +6 dB.
  5: {
    id: 5, name: 'Volume', type: 'effect', subtype: 'volume', color: '#5de0d0', paramLabel: 'Vol',
    getParamT(angle) { return _arcT(angle); },
    // lower half: -60..0 dB (silent up to unity); upper half: 0..+6 dB (boost). Center = 0 dB.
    centerValue(t) { return t <= 0.5 ? -60 + (t / 0.5) * 60 : ((t - 0.5) / 0.5) * 6; },
    makeNode() { return new Tone.Volume(0); },
    applyParam(node, t) { node.volume.rampTo(this.centerValue(t), 0.05); },
  },

  // ID 6: Chords — rotation selects a chord loop (category 'chords')
  6: {
    id: 6, name: 'Chords', type: 'sampler', color: '#ffaa44', paramLabel: 'Loop',
    getParamT(angle) { return _arcT(angle); },
    getLoopIndex(angle) {
      const lb = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
      const indices = lb.LOOP_BANK.map((e, i) => i).filter(i => lb.LOOP_BANK[i].category === 'chords');
      const n = indices.length;
      return indices[Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)))];
    },
    getName(angle) {
      const lb = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
      const e = lb.LOOP_BANK[this.getLoopIndex(angle)];
      return e ? e.name : '';
    },
  },

  // ID 7: Melody — rotation selects a Cymatics melody loop
  7: {
    id: 7, name: 'Melody', type: 'sampler', color: '#ff44ff', paramLabel: 'Loop',
    getParamT(angle) { return _arcT(angle); },
    getLoopIndex(angle) {
      const lb = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
      const indices = lb.LOOP_BANK.map((e, i) => i).filter(i => lb.LOOP_BANK[i].category === 'melody');
      const n = indices.length;
      return indices[Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)))];
    },
    getName(angle) {
      const lb = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
      const melody = lb.LOOP_BANK.filter(e => e.category === 'melody');
      const n = melody.length;
      const e = melody[Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)))];
      return e ? e.name : '';
    },
  },

  // ID 8: Tempo — global; rotation sets the Transport BPM (70..160)
  8: {
    id: 8, name: 'Tempo', type: 'global', subtype: 'tempo', color: '#ff7777', paramLabel: 'BPM',
    getParamT(angle) { return _arcT(angle); },
    getBpm(angle) { return Math.round(70 + _arcT(angle) * (160 - 70)); },
  },

  // ID 9: Distortion — rotation controls drive (0 = clean, full = heavy saturation)
  9: {
    id: 9, name: 'Distortion', type: 'effect', subtype: 'distortion', color: '#ff6633',
    paramLabel: 'Drive',
    getParamT(angle) { return _arcT(angle); },
    centerValue(t) { return t * 0.9; },
    makeNode() { return new Tone.Distortion({ distortion: 0, wet: 1 }); },
    applyParam(node, t) { node.distortion = t * 0.9; },
  },

  // ID 14: Tremolo — rotation controls rate (slow throb to rapid stutter)
  14: {
    id: 14, name: 'Tremolo', type: 'effect', subtype: 'tremolo', color: '#ffdd44',
    paramLabel: 'Rate',
    getParamT(angle) { return _arcT(angle); },
    centerValue(t) { return 1 + t * 11; }, // 1..12 Hz
    makeNode() { const tr = new Tone.Tremolo(4, 0.8); tr.start(); return tr; },
    applyParam(node, t) { node.frequency.rampTo(1 + t * 11, 0.05); },
  },

  // ID 15: BitCrusher — rotation controls bit depth (8 = clean, 1 = maximum crunch)
  15: {
    id: 15, name: 'Crusher', type: 'effect', subtype: 'bitcrusher', color: '#cc44ff',
    paramLabel: 'Crush',
    getParamT(angle) { return _arcT(angle); },
    centerValue(t) { return Math.round(8 - t * 7); }, // 8..1 bits
    makeNode() { const ws = new Tone.WaveShaper(); ws.curve = _crushCurve(this.centerValue(0)); return ws; },
    applyParam(node, t) { node.curve = _crushCurve(this.centerValue(t)); },
  },

  // ID 20: Loop — rotation selects a loop from the loop bank
  20: {
    id: 20, name: 'Loop', type: 'sampler', color: '#aaffee', paramLabel: 'Loop',
    getParamT(angle) { return _arcT(angle); },
    getLoopIndex(angle) {
      const lb = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
      const n = lb.LOOP_BANK.length;
      return Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)));
    },
    getName(angle) {
      const lb = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
      const e = lb.LOOP_BANK[this.getLoopIndex(angle)];
      return e ? e.name : '';
    },
  },

  // ID 16: Bass — rotation selects EDM bassline preset
  16: {
    id: 16, name: 'Bass', type: 'bass', color: '#44ff99', paramLabel: 'Line',
    getParamT(angle) { return _arcT(angle); },
    getLineIndex(angle) {
      const bl = (typeof require === 'function') ? require('../data/bassLines.js') : window.bassLines;
      const n = bl.BASS_LINES.length;
      return Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)));
    },
    getName(angle) {
      const bl = (typeof require === 'function') ? require('../data/bassLines.js') : window.bassLines;
      const l = bl.BASS_LINES[this.getLineIndex(angle)];
      return l ? l.name : '';
    },
  },

};

if (typeof window !== 'undefined') window.MODULE_REGISTRY = MODULE_REGISTRY;
if (typeof module !== 'undefined') module.exports = MODULE_REGISTRY;
