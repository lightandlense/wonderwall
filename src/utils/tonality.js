// src/utils/tonality.js
// Pure musical-quantization helpers. No DOM, no Tone.

const SCALE_MINOR_PENTATONIC = [0, 3, 5, 7, 10];

function _midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function _freqToMidi(f) { return 69 + 12 * Math.log2(f / 440); }

const tonality = {
  SCALE_MINOR_PENTATONIC,

  // [0,1] param -> pitch class 0..11
  rootFromT(t) {
    const c = Math.max(0, Math.min(0.999999, t));
    return Math.max(0, Math.min(11, Math.floor(c * 12)));
  },

  // Snap freq to the nearest minor-pentatonic note of `root` pitch class.
  quantizeFreqToScale(freq, root) {
    const m = _freqToMidi(freq);
    const base = Math.round(m);
    // Search outward from the rounded MIDI note for the nearest in-scale note.
    for (let delta = 0; delta <= 6; delta++) {
      for (const cand of (delta === 0 ? [base] : [base - delta, base + delta])) {
        const pc = ((cand - root) % 12 + 12) % 12;
        if (SCALE_MINOR_PENTATONIC.includes(pc)) {
          return _midiToFreq(cand);
        }
      }
    }
    return _midiToFreq(base); // unreachable for a 5-note scale, defensive
  },
};

if (typeof window !== 'undefined') window.tonality = tonality;
if (typeof module !== 'undefined') module.exports = tonality;
