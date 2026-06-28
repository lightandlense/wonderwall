// src/data/drumGrooves.js
// Preset 16-step drum grooves for the Drummer puck. Pure data. EDM-focused.
// Each track is a 16-element array of 0/1 hits (1 bar of 16th notes; beats at 0,4,8,12).
const DRUM_GROOVES = [
  { name: 'Four on Floor',
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },
  { name: 'Techno',
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,1],
    hat:   [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1] },
  { name: 'Drum & Bass',
    kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,1, 0,0,1,0, 0,0,0,0],
    hat:   [1,0,1,1, 0,1,0,0, 1,0,1,1, 0,1,0,0] },
  { name: 'Trap',
    kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:   [1,1,0,1, 1,0,1,1, 1,1,0,1, 1,0,1,1] },
  { name: 'Big Room',
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0],
    hat:   [0,0,1,0, 0,0,1,1, 0,0,1,0, 0,1,1,0] },
  { name: 'UK Garage',
    kick:  [1,0,0,0, 0,1,0,0, 1,0,0,1, 0,0,0,0],
    snare: [0,0,1,0, 1,0,0,0, 0,0,1,0, 1,0,0,0],
    hat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },
  { name: 'Trance',
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:   [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1] },
  { name: 'Minimal',
    kick:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0] },
];

const drumGrooves = { DRUM_GROOVES };
if (typeof window !== 'undefined') window.drumGrooves = drumGrooves;
if (typeof module !== 'undefined') module.exports = drumGrooves;
