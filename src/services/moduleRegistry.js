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
  // ID 0: Bass — self-playing bassline generator; rotation picks the line, key from Tonality.
  // (Replaced the Oscillator; oscillator audio code left dormant.)
  0: {
    id: 0, name: 'Bass', type: 'bass', color: '#4d7cff', paramLabel: 'Line',
    getParamT(angle) { return _arcT(angle); },
    getLineIndex(angle) {
      const bl = (typeof require === 'function') ? require('../data/bassLines.js') : window.bassLines;
      const n = bl.BASS_LINES.length;
      return Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)));
    },
    getName(angle) {
      const bl = (typeof require === 'function') ? require('../data/bassLines.js') : window.bassLines;
      return bl.BASS_LINES[this.getLineIndex(angle)].name;
    },
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

  // ID 4: Lead — self-playing melody generator; rotation picks the line, key from Tonality.
  // (Replaced the LFO; LFO audio code left dormant.)
  4: {
    id: 4, name: 'Lead', type: 'lead', color: '#c98bff', paramLabel: 'Melody',
    getParamT(angle) { return _arcT(angle); },
    getMelodyIndex(angle) {
      const ml = (typeof require === 'function') ? require('../data/melodyLines.js') : window.melodyLines;
      const n = ml.MELODY_LINES.length;
      return Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)));
    },
    getName(angle) {
      const ml = (typeof require === 'function') ? require('../data/melodyLines.js') : window.melodyLines;
      return ml.MELODY_LINES[this.getMelodyIndex(angle)].name;
    },
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

  // ID 6: Chords — self-playing chord-pad generator; rotation picks the progression, key from Tonality.
  // (Replaced the Sequencer; sequencer audio code left dormant.)
  6: {
    id: 6, name: 'Chords', type: 'chords', color: '#c9a7ff', paramLabel: 'Chords',
    getParamT(angle) { return _arcT(angle); },
    getProgIndex(angle) {
      const cp = (typeof require === 'function') ? require('../data/chordProgressions.js') : window.chordProgressions;
      const n = cp.CHORD_PROGRESSIONS.length;
      return Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)));
    },
    getName(angle) {
      const cp = (typeof require === 'function') ? require('../data/chordProgressions.js') : window.chordProgressions;
      return cp.CHORD_PROGRESSIONS[this.getProgIndex(angle)].name;
    },
  },

  // ID 7: Drummer — drum-machine generator; rotation selects a preset groove.
  // (Replaced the Loop/sampler puck; loopBank.js + assets/loops kept for future reuse.)
  7: {
    id: 7, name: 'Drummer', type: 'drummer', color: '#ff5d8f', paramLabel: 'Groove',
    getParamT(angle) { return _arcT(angle); },
    getGrooveIndex(angle) {
      const dg = (typeof require === 'function') ? require('../data/drumGrooves.js') : window.drumGrooves;
      const n = dg.DRUM_GROOVES.length;
      return Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)));
    },
    getName(angle) {
      const dg = (typeof require === 'function') ? require('../data/drumGrooves.js') : window.drumGrooves;
      return dg.DRUM_GROOVES[this.getGrooveIndex(angle)].name;
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

  // ID 12: Chorus — rotation controls depth (thin to thick/detuned)
  12: {
    id: 12, name: 'Chorus', type: 'effect', subtype: 'chorus', color: '#44ff88',
    paramLabel: 'Depth',
    getParamT(angle) { return _arcT(angle); },
    centerValue(t) { return t * 0.9; },
    makeNode() { const c = new Tone.Chorus(4, 2.5, 0); c.start(); return c; },
    applyParam(node, t) { node.depth = t * 0.9; },
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
