// src/data/loopBank.js
// Curated loop bank. Pure data + rate math.
// Every loop is pre-baked to 128 BPM (pitch preserved) by scripts/convert-loops-128.mjs
// into loops/_128/; the `bpm` field is 128 for all, and playbackRate = Transport.bpm / 128
// lets the Tempo puck globally re-rate every loop together. Melody loops are all D# Minor;
// drums are keyless. Source masters remain under loops/Melody and loops/drummer.
const LOOP_BANK = [
  // --- Drummer loops (category 'drums') ---
  { name: 'Ring',        file: 'loops/_128/drummer/Cymatics - Ring Drum Loop - 128 BPM.wav',                                         bpm: 128, category: 'drums' },
  { name: 'Trade Off',   file: 'loops/_128/drummer/Cymatics - Trade Off Drum Loop - 98 BPM.wav',                                     bpm: 128, category: 'drums' },
  { name: 'Hard Club',   file: 'loops/_128/drummer/looperman-l-2039702-0409953-hard-club-beat-drum - 122 BPM.wav',                   bpm: 128, category: 'drums' },
  { name: 'Hard EDM',    file: 'loops/_128/drummer/looperman-l-2328394-0297437-hard-edm-drums-part-2-sicklunarozza - 155 BPM.wav',   bpm: 128, category: 'drums' },
  { name: 'Charli',      file: 'loops/_128/drummer/looperman-l-2648144-0386898-charli-xcx-x-shygirl-drums-128bpm.wav',               bpm: 128, category: 'drums' },
  { name: 'Basic EDM',   file: 'loops/_128/drummer/looperman-l-3065265-0424642-basic-edm-drums - 123 BPM.wav',                       bpm: 128, category: 'drums' },
  { name: 'Nation',      file: 'loops/_128/drummer/looperman-l-6561456-0406445-nation-edm-drum-loop - 128 BPM.wav',                  bpm: 128, category: 'drums' },
  { name: 'Melbourne 1', file: 'loops/_128/drummer/looperman-l-7344971-0409722-melbourne-bounce-drum-beats-1-without-noise - 128 BPM.wav', bpm: 128, category: 'drums' },
  { name: 'Melbourne 2', file: 'loops/_128/drummer/looperman-l-7344971-0409841-melbourne-bounce-drum-beats-2 - 128 BPM.wav',         bpm: 128, category: 'drums' },
  { name: 'Drums',       file: 'loops/_128/drummer/looperman-l-7533390-0412372-drums - 128 BPM.wav',                                 bpm: 128, category: 'drums' },
  // --- Melody loops (category 'melody', all D# Minor) ---
  { name: 'Aquamarine',  file: 'loops/_128/Melody/Cymatics - Aquamarine - 134 BPM Ds Min.wav', bpm: 128, category: 'melody' },
  { name: 'Crypto',      file: 'loops/_128/Melody/Cymatics - Crypto - 143 BPM Ds Min.wav',     bpm: 128, category: 'melody' },
  { name: 'Gemstone',    file: 'loops/_128/Melody/Cymatics - Gemstone - 150 BPM Ds Min.wav',   bpm: 128, category: 'melody' },
  { name: 'Golden',      file: 'loops/_128/Melody/Cymatics - Golden - 128 BPM Ds Min.wav',     bpm: 128, category: 'melody' },
  { name: 'Neon Dream',  file: 'loops/_128/Melody/Cymatics - Neon Dream - 140 BPM Ds Min.wav', bpm: 128, category: 'melody' },
  { name: 'Pyramid',     file: 'loops/_128/Melody/Cymatics - Pyramid - 156 BPM Ds Min.wav',    bpm: 128, category: 'melody' },
  { name: 'Quest',       file: 'loops/_128/Melody/Cymatics - Quest - 140 BPM Ds Min.wav',      bpm: 128, category: 'melody' },
  { name: 'Razor',       file: 'loops/_128/Melody/Cymatics - Razor - 128 BPM Ds Min.wav',      bpm: 128, category: 'melody' },
  // --- Chord loops (category 'chords', all D# Minor) ---
  { name: 'Phrog',           file: 'loops/_128/Chords/looperman-l-2212484-0214543-phrog-progressive-house-chords- 128 BPM, D#m.wav',                      bpm: 128, category: 'chords' },
  { name: 'Short Synth',     file: 'loops/_128/Chords/looperman-l-5903669-0385270-short-synth-loop- 95 BPM D#m.wav',                                       bpm: 128, category: 'chords' },
  { name: 'Psy Chorus',      file: 'loops/_128/Chords/looperman-l-6413071-0415019-je-8086-psy-chorus- 138 BPM D#m.wav',                                    bpm: 128, category: 'chords' },
  { name: 'Light Tribute',   file: 'loops/_128/Chords/looperman-l-1638381-0348772-light-tribute 140 BPM D#m.wav',                                          bpm: 128, category: 'chords' },
  { name: 'Synth',           file: 'loops/_128/Chords/looperman-l-4320581-0387096-synth 110 BPM D#m.wav',                                                  bpm: 128, category: 'chords' },
  { name: 'Rage',            file: 'loops/_128/Chords/looperman-l-4946014-0300692-rage-002-gab3-x-outtatown-x-starboy-type-loop 154 BPM D#m.wav',          bpm: 128, category: 'chords' },
  { name: 'Emotional Piano', file: 'loops/_128/Chords/looperman-l-5654333-0362062-emotional-piano-song-starter-wings 128 BPM D#m.wav',                     bpm: 128, category: 'chords' },
  { name: 'Rhino Charge',    file: 'loops/_128/Chords/looperman-l-7155116-0380287-timrgyt-rhino-charge-loop 195 BPM D#m.wav',                              bpm: 128, category: 'chords' },
];

function playbackRateFor(loopBpm, curBpm) {
  if (!(loopBpm > 0)) return 1;
  return curBpm / loopBpm;
}

const loopBank = { LOOP_BANK, playbackRateFor };
if (typeof window !== 'undefined') window.loopBank = loopBank;
if (typeof module !== 'undefined') module.exports = loopBank;
