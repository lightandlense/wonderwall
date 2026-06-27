// src/data/bassLines.js
// Preset basslines for the Bass puck. Pure data. Each step is a scale DEGREE
// (0=root, 5=octave; scaleDegreeFreq handles octave wrap) or null (rest).
const BASS_LINES = [
  { name: 'Root Pulse',    steps: [0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null] },
  { name: 'Driving 8ths',  steps: [0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 0, null] },
  { name: 'Octave Bounce', steps: [0, null, 5, null, 0, null, 5, null, 0, null, 5, null, 0, null, 5, null] },
  { name: 'Walking',       steps: [0, null, 1, null, 2, null, 3, null, 4, null, 3, null, 2, null, 1, null] },
  { name: 'Funk',          steps: [0, null, null, 0, null, null, 2, null, 0, null, null, 2, null, 0, null, null] },
  { name: 'Offbeat',       steps: [null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null] },
  { name: 'Sub Hold',      steps: [0, null, null, null, null, null, null, null, 0, null, null, null, null, null, null, null] },
  { name: 'Riff',          steps: [0, null, 2, 3, null, 2, null, 0, 2, null, 3, null, 2, null, 0, null] },
];

const bassLines = { BASS_LINES };
if (typeof window !== 'undefined') window.bassLines = bassLines;
if (typeof module !== 'undefined') module.exports = bassLines;
