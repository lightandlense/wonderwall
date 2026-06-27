// src/data/melodyLines.js
// Preset lead melodies for the Melody/Lead puck. Pure data. Each step is a scale DEGREE
// (0=root; scaleDegreeFreq handles octave wrap, so 5/7 climb into the next octave) or null (rest).
const MELODY_LINES = [
  { name: 'Simple Hook',     steps: [4, null, 3, null, 2, null, null, null, 3, null, 4, null, 2, null, null, null] },
  { name: 'Rising Arp',      steps: [0, 2, 4, 5, 4, 2, null, null, 0, 2, 4, 5, 7, 5, null, null] },
  { name: 'Call & Response', steps: [0, null, 2, null, 4, null, null, null, 4, null, 2, null, 0, null, null, null] },
  { name: 'Pentatonic Riff', steps: [4, 3, null, 2, 4, null, 3, 2, 0, null, 2, 3, 2, null, 0, null] },
  { name: 'Sparse Stabs',    steps: [4, null, null, null, null, null, 2, null, null, null, null, null, 0, null, null, null] },
  { name: 'Descending',      steps: [7, null, 5, null, 4, null, 3, null, 2, null, 1, null, 0, null, null, null] },
  { name: 'Syncopated',      steps: [0, null, null, 2, null, 4, null, null, 3, null, null, 2, null, 0, null, null] },
  { name: 'Octave Jumps',    steps: [0, null, 5, null, 0, null, 5, null, 2, null, 7, null, 2, null, 7, null] },
];

const melodyLines = { MELODY_LINES };
if (typeof window !== 'undefined') window.melodyLines = melodyLines;
if (typeof module !== 'undefined') module.exports = melodyLines;
