// src/data/drumGrooves.js
// Preset 16-step drum grooves for the Drummer puck. Pure data.
// Each track is a 16-element array of 0/1 hits (1 bar of 16th notes; beats at 0,4,8,12).
// kick / snare / hat. Rotation selects the groove.
const DRUM_GROOVES = [
  { name: 'House',
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0] },
  { name: 'BoomBap',
    kick:  [1,0,0,0, 0,0,0,0, 1,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },
  { name: 'Rock',
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },
  { name: 'Funk',
    kick:  [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0],
    hat:   [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1] },
  { name: 'Trap',
    kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hat:   [1,0,1,1, 1,0,1,0, 1,1,1,0, 1,0,1,1] },
  { name: 'Break',
    kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0],
    hat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },
  { name: 'Disco',
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0] },
  { name: 'Bossa',
    kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
    snare: [0,0,1,0, 0,1,0,0, 1,0,0,1, 0,0,1,0],
    hat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },
];

const drumGrooves = { DRUM_GROOVES };
if (typeof window !== 'undefined') window.drumGrooves = drumGrooves;
if (typeof module !== 'undefined') module.exports = drumGrooves;
