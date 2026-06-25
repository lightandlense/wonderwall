// src/services/moduleRegistry.js
// Marker ID → audio module definition.
// Calibration IDs 10, 11, 13, 18 are reserved — never add them here.

// Map a smoother angle (in [0,2π)) to a [0,1] parameter using a ±ARC window.
// The tracker's topmost-edge convention keeps raw angles in (-π/2, +π/2), so
// values near 2π in the smoother's output are actually negative rotations.
// Folding back to the signed domain and clamping to ±ARC prevents the wrap
// discontinuity that caused pitch to jump when rotating past the edge boundary.
const _ARC = Math.PI / 4; // ±45° — matches the stable tracking range of the topmost-edge convention

function _arcT(angle) {
  // Fold [0,2π) back to (-π, π] to recover the signed rotation
  const signed = angle > Math.PI ? angle - 2 * Math.PI : angle;
  // Map ±ARC → [0, 1], clamped (saturates at extremes instead of wrapping)
  return Math.max(0, Math.min(1, signed / (2 * _ARC) + 0.5));
}

const MODULE_REGISTRY = {
  // ID 0: Oscillator — rotation controls pitch
  0: {
    id: 0,
    name: 'Oscillator',
    type: 'oscillator',
    color: '#44aaff',
    paramLabel: 'Pitch',
    // [0,1] mapped value — shared with visual display to prevent wrap artifacts
    getParamT(angle) { return _arcT(angle); },
    // Flat (0°) = midpoint C4#. Rotate ±45° to sweep C3–C6 (3 octaves, exp).
    getFreq(angle) {
      return 130.81 * Math.pow(8, _arcT(angle));
    },
  },

  // ID 3: Output / master — rotation controls overall volume
  3: {
    id: 3,
    name: 'Output',
    type: 'output',
    color: '#ffcc44',
    paramLabel: 'Volume',
    // [0,1] mapped value — shared with visual display to prevent wrap artifacts
    getParamT(angle) { return _arcT(angle); },
    // Flat (0°) = -20 dB. Rotate ±45° to sweep -40 dB → 0 dB.
    getVolDb(angle) {
      return -40 + _arcT(angle) * 40;
    },
  },
};

window.MODULE_REGISTRY = MODULE_REGISTRY;
