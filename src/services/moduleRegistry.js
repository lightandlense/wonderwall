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
  // ID 0: Oscillator — rotation controls pitch (continuous; tonality applied by audioEngine)
  0: {
    id: 0, name: 'Oscillator', type: 'oscillator', color: '#44aaff', paramLabel: 'Pitch',
    getParamT(angle) { return _arcT(angle); },
    getFreq(angle) { return 130.81 * Math.pow(8, _arcT(angle)); }, // C3..C6, 3 octaves
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

  // ID 3: Output / master — rotation controls overall volume
  3: {
    id: 3, name: 'Output', type: 'output', color: '#ffcc44', paramLabel: 'Volume',
    getParamT(angle) { return _arcT(angle); },
    getVolDb(angle) { return -40 + _arcT(angle) * 40; }, // -40 dB .. 0 dB
  },

  // ID 4: LFO — controller; rotation controls modulation rate
  4: {
    id: 4, name: 'LFO', type: 'controller', subtype: 'lfo', color: '#c98bff', paramLabel: 'Rate',
    getParamT(angle) { return _arcT(angle); },
    getRateHz(angle) { return _expMap(_arcT(angle), 0.1, 8); }, // 0.1 .. 8 Hz
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
};

if (typeof window !== 'undefined') window.MODULE_REGISTRY = MODULE_REGISTRY;
if (typeof module !== 'undefined') module.exports = MODULE_REGISTRY;
