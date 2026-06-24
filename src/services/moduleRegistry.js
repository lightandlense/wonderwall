// src/services/moduleRegistry.js
// Marker ID → audio module definition.
// Calibration IDs 10, 11, 13, 18 are reserved — never add them here.

const MODULE_REGISTRY = {
  // ID 0: Oscillator — rotation controls pitch
  0: {
    id: 0,
    name: 'Oscillator',
    type: 'oscillator',
    color: '#44aaff',
    paramLabel: 'Pitch',
    // C3 (130.81 Hz) at 0° → C6 (1046.5 Hz) at 360° (3 octaves, exponential)
    getFreq(smoothedAngle) {
      return 130.81 * Math.pow(8, smoothedAngle / (2 * Math.PI));
    },
  },

  // ID 5: Output / master — rotation controls overall volume
  5: {
    id: 5,
    name: 'Output',
    type: 'output',
    color: '#ffcc44',
    paramLabel: 'Volume',
    // -40 dB (near-silent) at 0° → 0 dB (full) at 360°
    getVolDb(smoothedAngle) {
      return -40 + (smoothedAngle / (2 * Math.PI)) * 40;
    },
  },
};

window.MODULE_REGISTRY = MODULE_REGISTRY;
