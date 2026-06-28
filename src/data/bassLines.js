// src/data/bassLines.js
// Preset basslines for the Bass puck. Pure data. EDM-focused.
// Each step is a scale DEGREE (0=root, 5=octave up) or null (rest).
const BASS_LINES = [
  { name: 'Sidechain Pulse', steps: [0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null] },
  { name: 'Acid 303',        steps: [0, null, 0, 0, null, null, 5, null, 0, null, 0, 0, null, 5, null, null] },
  { name: 'Tech House',      steps: [0, null, null, 2, null, null, 0, null, null, 2, null, 0, null, null, 2, null] },
  { name: 'Reese Drive',     steps: [0, null, 0, null, null, null, 0, null, 0, null, null, null, 0, null, null, null] },
  { name: 'Trance Running',  steps: [0, null, 0, null, 0, null, 0, null, 2, null, 2, null, 3, null, 3, null] },
  { name: 'Sub Hold',        steps: [0, null, null, null, null, null, null, null, 3, null, null, null, null, null, null, null] },
  { name: 'Offbeat Stab',    steps: [null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null, 0, null] },
  { name: 'Riff',            steps: [0, null, 2, 3, null, 2, null, 0, 2, null, 3, null, 5, null, 3, null] },
];

const bassLines = { BASS_LINES };
if (typeof window !== 'undefined') window.bassLines = bassLines;
if (typeof module !== 'undefined') module.exports = bassLines;
