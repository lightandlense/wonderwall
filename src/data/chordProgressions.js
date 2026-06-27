// src/data/chordProgressions.js
// Preset chord progressions for the Chords/Pad puck. Pure data. Each non-null step is the
// chord's ROOT scale-degree; the voice stacks [d, d+2, d+4]. null = hold the previous chord.
const CHORD_PROGRESSIONS = [
  { name: 'Pop',        steps: [0, null, null, null, 4, null, null, null, 2, null, null, null, 3, null, null, null] },
  { name: 'Sustained',  steps: [0, null, null, null, null, null, null, null, 3, null, null, null, null, null, null, null] },
  { name: 'Minor Walk', steps: [0, null, null, null, 1, null, null, null, 2, null, null, null, 1, null, null, null] },
  { name: 'Two-Chord',  steps: [0, null, null, null, null, null, null, null, 2, null, null, null, null, null, null, null] },
  { name: 'Climb',      steps: [0, null, null, null, 2, null, null, null, 4, null, null, null, 3, null, null, null] },
  { name: 'Drone',      steps: [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null] },
];

const chordProgressions = { CHORD_PROGRESSIONS };
if (typeof window !== 'undefined') window.chordProgressions = chordProgressions;
if (typeof module !== 'undefined') module.exports = chordProgressions;
