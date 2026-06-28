// src/data/loopBank.js
// Curated loop bank. Pure data + rate math.
// bpm = the loop's native tempo. At runtime each loop is played with
// playbackRate = Transport.bpm / bpm, so the Tempo puck locks every loop to one global
// tempo (default 128). Melody loops are all D# Minor; drums are keyless.
const LOOP_BANK = [
  // --- Drummer loops (category 'drums') ---
  { name: 'Ring',        file: 'loops/drummer/Cymatics - Ring Drum Loop - 128 BPM.wav',                                         bpm: 128, category: 'drums' },
  { name: 'Trade Off',   file: 'loops/drummer/Cymatics - Trade Off Drum Loop - 98 BPM.wav',                                     bpm: 98,  category: 'drums' },
  { name: 'Hard Club',   file: 'loops/drummer/looperman-l-2039702-0409953-hard-club-beat-drum - 122 BPM.wav',                   bpm: 122, category: 'drums' },
  { name: 'Hard EDM',    file: 'loops/drummer/looperman-l-2328394-0297437-hard-edm-drums-part-2-sicklunarozza - 155 BPM.wav',   bpm: 155, category: 'drums' },
  { name: 'Charli',      file: 'loops/drummer/looperman-l-2648144-0386898-charli-xcx-x-shygirl-drums-128bpm.wav',               bpm: 128, category: 'drums' },
  { name: 'Basic EDM',   file: 'loops/drummer/looperman-l-3065265-0424642-basic-edm-drums - 123 BPM.wav',                       bpm: 123, category: 'drums' },
  { name: 'Nation',      file: 'loops/drummer/looperman-l-6561456-0406445-nation-edm-drum-loop - 128 BPM.wav',                  bpm: 128, category: 'drums' },
  { name: 'Melbourne 1', file: 'loops/drummer/looperman-l-7344971-0409722-melbourne-bounce-drum-beats-1-without-noise - 128 BPM.wav', bpm: 128, category: 'drums' },
  { name: 'Melbourne 2', file: 'loops/drummer/looperman-l-7344971-0409841-melbourne-bounce-drum-beats-2 - 128 BPM.wav',         bpm: 128, category: 'drums' },
  { name: 'Drums',       file: 'loops/drummer/looperman-l-7533390-0412372-drums - 128 BPM.wav',                                 bpm: 128, category: 'drums' },
  // --- Melody loops (category 'melody', all D# Minor) ---
  { name: 'Aquamarine',  file: 'loops/Melody/Cymatics - Aquamarine - 134 BPM Ds Min.wav', bpm: 134, category: 'melody' },
  { name: 'Crypto',      file: 'loops/Melody/Cymatics - Crypto - 143 BPM Ds Min.wav',     bpm: 143, category: 'melody' },
  { name: 'Gemstone',    file: 'loops/Melody/Cymatics - Gemstone - 150 BPM Ds Min.wav',   bpm: 150, category: 'melody' },
  { name: 'Golden',      file: 'loops/Melody/Cymatics - Golden - 128 BPM Ds Min.wav',     bpm: 128, category: 'melody' },
  { name: 'Neon Dream',  file: 'loops/Melody/Cymatics - Neon Dream - 140 BPM Ds Min.wav', bpm: 140, category: 'melody' },
  { name: 'Pyramid',     file: 'loops/Melody/Cymatics - Pyramid - 156 BPM Ds Min.wav',    bpm: 156, category: 'melody' },
  { name: 'Quest',       file: 'loops/Melody/Cymatics - Quest - 140 BPM Ds Min.wav',      bpm: 140, category: 'melody' },
  { name: 'Razor',       file: 'loops/Melody/Cymatics - Razor - 128 BPM Ds Min.wav',      bpm: 128, category: 'melody' },
];

function playbackRateFor(loopBpm, curBpm) {
  if (!(loopBpm > 0)) return 1;
  return curBpm / loopBpm;
}

const loopBank = { LOOP_BANK, playbackRateFor };
if (typeof window !== 'undefined') window.loopBank = loopBank;
if (typeof module !== 'undefined') module.exports = loopBank;
