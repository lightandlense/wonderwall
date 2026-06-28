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

  // ID 4: LFO — rotation controls rate (0.1..8 Hz); links to nearest oscillator or effect
  4: {
    id: 4, name: 'LFO', type: 'controller', subtype: 'lfo', color: '#c98bff', paramLabel: 'Rate',
    getParamT(angle) { return _arcT(angle); },
    getRateHz(angle) { return _expMap(_arcT(angle), 0.1, 8); }, // 0.1..8 Hz
  },

  // ID 5: Tonality — global; rotation selects root pitch class
  5: {
    id: 5, name: 'Tonality', type: 'global', subtype: 'tonality', color: '#5de0d0', paramLabel: 'Root',
    getParamT(angle) { return _arcT(angle); },
    getRoot(angle) {
      const tn = (typeof require === 'function') ? require('../utils/tonality.js') : window.tonality;
      return tn.rootFromT(_arcT(angle));
    },
  },

  // ID 6: Sequencer — gates the nearest oscillator on a 16-step melodic walk
  6: {
    id: 6, name: 'Sequencer', type: 'controller', subtype: 'sequencer', color: '#c9a7ff', paramLabel: 'Pattern',
    getParamT(angle) { return _arcT(angle); },
    getPatternIndex(angle) {
      const rp = (typeof require === 'function') ? require('../utils/rhythmPatterns.js') : window.rhythmPatterns;
      const n = rp.PATTERNS.length;
      return Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)));
    },
  },

  // ID 7: PitchShift — rotation shifts pitch ±12 semitones
  7: {
    id: 7, name: 'PitchShift', type: 'effect', subtype: 'pitchshift', color: '#ff5d8f',
    paramLabel: 'Shift',
    getParamT(angle) { return _arcT(angle); },
    centerValue(t) { return Math.round((t - 0.5) * 24); }, // -12..+12 semitones
    makeNode() { return new Tone.PitchShift(0); },
    applyParam(node, t) { node.pitch = Math.round((t - 0.5) * 24); },
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
    makeNode() { return new Tone.BitCrusher(8); },
    applyParam(node, t) { node.bits.value = Math.round(8 - t * 7); },
  },
};

if (typeof window !== 'undefined') window.MODULE_REGISTRY = MODULE_REGISTRY;
if (typeof module !== 'undefined') module.exports = MODULE_REGISTRY;
