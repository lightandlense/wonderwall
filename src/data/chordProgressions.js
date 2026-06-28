// src/data/chordProgressions.js
// Preset chord progressions for the Chords puck. Pure data. EDM-focused.
// Non-null step = chord root scale-degree; voice stacks [d, d+2, d+4]. null = hold.
const CHORD_PROGRESSIONS = [
  { name: 'Trance',    steps: [0, null, null, null, 3, null, null, null, 4, null, null, null, 2, null, null, null] },
  { name: 'Club Stab', steps: [null, null, 0, null, null, null, 3, null, null, null, 0, null, null, null, 4, null] },
  { name: 'Rave Pad',  steps: [0, null, null, null, null, null, null, null, 3, null, null, null, null, null, null, null] },
  { name: 'Euphoric',  steps: [0, null, null, null, 4, null, null, null, 3, null, null, null, 2, null, null, null] },
  { name: 'Two Chord', steps: [0, null, null, null, null, null, null, null, 2, null, null, null, null, null, null, null] },
  { name: 'Drone',     steps: [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null] },
];

const chordProgressions = { CHORD_PROGRESSIONS };
if (typeof window !== 'undefined') window.chordProgressions = chordProgressions;
if (typeof module !== 'undefined') module.exports = chordProgressions;
