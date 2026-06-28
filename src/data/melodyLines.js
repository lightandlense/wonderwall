// src/data/melodyLines.js
// Preset lead melodies for the Melody puck. Pure data. EDM-focused.
// Each step is a scale DEGREE (0=root; scaleDegreeFreq handles octave) or null (rest).
const MELODY_LINES = [
  { name: 'Trance Lead',    steps: [4, null, 3, null, 2, null, 4, null, 3, null, null, null, 2, null, null, null] },
  { name: 'Big Room Hook',  steps: [4, null, null, null, 4, null, 3, null, null, null, 2, null, null, null, null, null] },
  { name: 'Acid Arp',       steps: [0, 2, 4, 2, 0, 2, 4, 2, 3, 2, 4, 2, 0, 2, 3, 2] },
  { name: 'Pluck Stab',     steps: [4, null, null, 3, null, null, 4, null, null, 2, null, null, 4, null, null, null] },
  { name: 'Techno Motif',   steps: [0, null, 2, null, null, null, 1, null, 0, null, null, null, 2, null, 1, null] },
  { name: 'Rising Tension', steps: [0, null, 1, null, 2, null, 3, null, 4, null, 3, null, 4, null, null, null] },
  { name: 'Synth Pop',      steps: [3, null, 3, null, 4, null, 2, null, 3, null, null, null, 0, null, null, null] },
  { name: 'Drop Riff',      steps: [4, null, 4, null, 3, null, 2, null, 4, null, null, null, 3, null, null, null] },
];

const melodyLines = { MELODY_LINES };
if (typeof window !== 'undefined') window.melodyLines = melodyLines;
if (typeof module !== 'undefined') module.exports = melodyLines;
