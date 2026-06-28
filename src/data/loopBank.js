// src/data/loopBank.js
// Curated loop bank. Pure data + rate math. Every loop is pre-baked to 128 BPM
// (pitch preserved for tempo) by scripts/convert-loops-128.mjs. Each entry has a
// `category` (drums/bass/chords/melody) AND a `group` (loop bank). The active group
// is a global selected by the Loop Bank puck (id 12); sampler pucks pick a loop
// matching their category AND loopBank.activeGroup. Melodic loops are D# Minor
// (off-key sources pitch-shifted to a D# root during the bake); drums are keyless.
const LOOP_BANK = [
  // ===== OG bank =====
  // --- Drummer (drums) ---
  { name: 'Ring',        file: 'loops/_128/OG Loops/drummer/Cymatics - Ring Drum Loop - 128 BPM.wav',                                         bpm: 128, category: 'drums', group: 'og' },
  { name: 'Trade Off',   file: 'loops/_128/OG Loops/drummer/Cymatics - Trade Off Drum Loop - 98 BPM.wav',                                     bpm: 128, category: 'drums', group: 'og' },
  { name: 'Hard Club',   file: 'loops/_128/OG Loops/drummer/looperman-l-2039702-0409953-hard-club-beat-drum - 122 BPM.wav',                   bpm: 128, category: 'drums', group: 'og' },
  { name: 'Hard EDM',    file: 'loops/_128/OG Loops/drummer/looperman-l-2328394-0297437-hard-edm-drums-part-2-sicklunarozza - 155 BPM.wav',   bpm: 128, category: 'drums', group: 'og' },
  { name: 'Charli',      file: 'loops/_128/OG Loops/drummer/looperman-l-2648144-0386898-charli-xcx-x-shygirl-drums-128bpm.wav',               bpm: 128, category: 'drums', group: 'og' },
  { name: 'Basic EDM',   file: 'loops/_128/OG Loops/drummer/looperman-l-3065265-0424642-basic-edm-drums - 123 BPM.wav',                       bpm: 128, category: 'drums', group: 'og' },
  { name: 'Nation',      file: 'loops/_128/OG Loops/drummer/looperman-l-6561456-0406445-nation-edm-drum-loop - 128 BPM.wav',                  bpm: 128, category: 'drums', group: 'og' },
  { name: 'Melbourne 1', file: 'loops/_128/OG Loops/drummer/looperman-l-7344971-0409722-melbourne-bounce-drum-beats-1-without-noise - 128 BPM.wav', bpm: 128, category: 'drums', group: 'og' },
  { name: 'Melbourne 2', file: 'loops/_128/OG Loops/drummer/looperman-l-7344971-0409841-melbourne-bounce-drum-beats-2 - 128 BPM.wav',         bpm: 128, category: 'drums', group: 'og' },
  { name: 'Drums',       file: 'loops/_128/OG Loops/drummer/looperman-l-7533390-0412372-drums - 128 BPM.wav',                                 bpm: 128, category: 'drums', group: 'og' },
  // --- Melody (D# Minor) ---
  { name: 'Aquamarine',  file: 'loops/_128/OG Loops/Melody/Cymatics - Aquamarine - 134 BPM Ds Min.wav', bpm: 128, category: 'melody', group: 'og' },
  { name: 'Crypto',      file: 'loops/_128/OG Loops/Melody/Cymatics - Crypto - 143 BPM Ds Min.wav',     bpm: 128, category: 'melody', group: 'og' },
  { name: 'Gemstone',    file: 'loops/_128/OG Loops/Melody/Cymatics - Gemstone - 150 BPM Ds Min.wav',   bpm: 128, category: 'melody', group: 'og' },
  { name: 'Golden',      file: 'loops/_128/OG Loops/Melody/Cymatics - Golden - 128 BPM Ds Min.wav',     bpm: 128, category: 'melody', group: 'og' },
  { name: 'Neon Dream',  file: 'loops/_128/OG Loops/Melody/Cymatics - Neon Dream - 140 BPM Ds Min.wav', bpm: 128, category: 'melody', group: 'og' },
  { name: 'Pyramid',     file: 'loops/_128/OG Loops/Melody/Cymatics - Pyramid - 156 BPM Ds Min.wav',    bpm: 128, category: 'melody', group: 'og' },
  { name: 'Quest',       file: 'loops/_128/OG Loops/Melody/Cymatics - Quest - 140 BPM Ds Min.wav',      bpm: 128, category: 'melody', group: 'og' },
  { name: 'Razor',       file: 'loops/_128/OG Loops/Melody/Cymatics - Razor - 128 BPM Ds Min.wav',      bpm: 128, category: 'melody', group: 'og' },
  // --- Chords (D# Minor) ---
  { name: 'Phrog',           file: 'loops/_128/OG Loops/Chords/looperman-l-2212484-0214543-phrog-progressive-house-chords- 128 BPM, D#m.wav',  bpm: 128, category: 'chords', group: 'og' },
  { name: 'Short Synth',     file: 'loops/_128/OG Loops/Chords/looperman-l-5903669-0385270-short-synth-loop- 95 BPM D#m.wav',                  bpm: 128, category: 'chords', group: 'og' },
  { name: 'Psy Chorus',      file: 'loops/_128/OG Loops/Chords/looperman-l-6413071-0415019-je-8086-psy-chorus- 138 BPM D#m.wav',               bpm: 128, category: 'chords', group: 'og' },
  { name: 'Light Tribute',   file: 'loops/_128/OG Loops/Chords/looperman-l-1638381-0348772-light-tribute 140 BPM D#m.wav',                     bpm: 128, category: 'chords', group: 'og' },
  { name: 'Synth',           file: 'loops/_128/OG Loops/Chords/looperman-l-4320581-0387096-synth 110 BPM D#m.wav',                             bpm: 128, category: 'chords', group: 'og' },
  { name: 'Emotional Piano', file: 'loops/_128/OG Loops/Chords/looperman-l-5654333-0362062-emotional-piano-song-starter-wings 128 BPM D#m.wav', bpm: 128, category: 'chords', group: 'og' },
  { name: 'Paragon',         file: 'loops/_128/OG Loops/Chords/looperman-l-4055719-0426572-paragon-140bpm-b.wav',                              bpm: 128, category: 'chords', group: 'og' },
  { name: 'Broken Soul',     file: 'loops/_128/OG Loops/Chords/looperman-l-4055719-0427155-broken-soul-151bpm-bbmaj.wav',                      bpm: 128, category: 'chords', group: 'og' },
  // --- Bass (D# Minor) ---
  { name: 'Chill House', file: 'loops/_128/OG Loops/bass/looperman-l-0052497-0426346-chill-house-bass-110-bpm C.wav',                       bpm: 128, category: 'bass', group: 'og' },
  { name: 'EDM Lead',    file: 'loops/_128/OG Loops/bass/looperman-l-2328394-0297436-hard-edm-leads-part-1-sicklunarozza 155 BPM D#m.wav',  bpm: 128, category: 'bass', group: 'og' },
  { name: 'Cyber Bass',  file: 'loops/_128/OG Loops/bass/looperman-l-3189526-0283404-cyber-bass-synth 90 BPM D#m.wav',                      bpm: 128, category: 'bass', group: 'og' },
  { name: 'Yuno',        file: 'loops/_128/OG Loops/bass/looperman-l-4326607-0426177-yuno-bass 150 BPM D#m.wav',                            bpm: 128, category: 'bass', group: 'og' },
  { name: 'Sequence',    file: 'loops/_128/OG Loops/bass/looperman-l-6413071-0375484-circuential-sequence-05 140 BPM D#m.wav',              bpm: 128, category: 'bass', group: 'og' },
  { name: 'Banjo Bass',  file: 'loops/_128/OG Loops/bass/looperman-l-7155116-0375250-banjo-type-bass 133 BPM D#m.wav',                      bpm: 128, category: 'bass', group: 'og' },
  { name: 'Jupiter',     file: 'loops/_128/OG Loops/bass/looperman-l-7155116-0422599-timrgyt-jupiter-plus-bass-loop 107 BPM D#m.wav',       bpm: 128, category: 'bass', group: 'og' },
  { name: 'Iron Man',    file: 'loops/_128/OG Loops/bass/looperman-l-7155116-0424675-timzenhq-iron-man-fabfilter-twin-3-loop 108 BPM Dm.wav', bpm: 128, category: 'bass', group: 'og' },

  // ===== Futurebass bank =====
  // --- Drums (keyless) ---
  { name: 'FB Drums 1',   file: 'loops/_128/Futurebass/Drums/looperman-l-2066447-0197438-future-bass-drums 140 BPM unkown key.wav',                 bpm: 128, category: 'drums', group: 'futurebass' },
  { name: 'Simple FB',    file: 'loops/_128/Futurebass/Drums/looperman-l-2212484-0153950-simple-future-bass-drums 160 BPM Key Unknown.wav',         bpm: 128, category: 'drums', group: 'futurebass' },
  { name: 'FB Drums 110', file: 'loops/_128/Futurebass/Drums/looperman-l-2598194-0227828-fb-drums-110 Bm key.wav',                                  bpm: 128, category: 'drums', group: 'futurebass' },
  { name: 'FB Build',     file: 'loops/_128/Futurebass/Drums/looperman-l-2797176-0163260-future-bass-drums-build 150 BPM Key F.wav',                bpm: 128, category: 'drums', group: 'futurebass' },
  { name: 'FB Drums 2',   file: 'loops/_128/Futurebass/Drums/looperman-l-2986535-0158047-future-bass-drums 150 BPM Key Unknown.wav',                bpm: 128, category: 'drums', group: 'futurebass' },
  { name: 'FB Drums 3',   file: 'loops/_128/Futurebass/Drums/looperman-l-3435224-0295149-future-bass-drum-loop-150 unknown key.wav',                bpm: 128, category: 'drums', group: 'futurebass' },
  { name: 'Kawaii Drums', file: 'loops/_128/Futurebass/Drums/looperman-l-3945450-0299447-kawaii-bass-drums 160 BPM unknown key.wav',                bpm: 128, category: 'drums', group: 'futurebass' },
  { name: 'Melo Trap',    file: 'loops/_128/Futurebass/Drums/looperman-l-5940789-0389614-melo-trap-future-bass-drum-beat 130 BPM key unknown.wav',  bpm: 128, category: 'drums', group: 'futurebass' },
  // --- Bass ---
  { name: 'FB Arp',     file: 'loops/_128/Futurebass/Bass/Cymatics - Future Bass Arp Loop 4 - 150 BPM F Min.wav',        bpm: 128, category: 'bass', group: 'futurebass' },
  { name: 'FB Chord 1', file: 'loops/_128/Futurebass/Bass/Cymatics - Future Bass Chord Loop 1 - 140 BPM C# Min.wav',     bpm: 128, category: 'bass', group: 'futurebass' },
  { name: 'FB Chord 4', file: 'loops/_128/Futurebass/Bass/Cymatics - Future Bass Chord Loop 4 - 150 BPM F Min.wav',      bpm: 128, category: 'bass', group: 'futurebass' },
  { name: 'Titan Drop', file: 'loops/_128/Futurebass/Bass/Cymatics - Titan Future Bass Drop Loop 10 - 140 BPM F Min.wav', bpm: 128, category: 'bass', group: 'futurebass' },
  // --- Chords ---
  { name: 'Arp 12',        file: 'loops/_128/Futurebass/Chords/Cymatics - Arp Loop 12 - 140 BPM F# Min.wav',                        bpm: 128, category: 'chords', group: 'futurebass' },
  { name: 'Arp 3',         file: 'loops/_128/Futurebass/Chords/Cymatics - Arp Loop 3 - 150 BPM D Min.wav',                          bpm: 128, category: 'chords', group: 'futurebass' },
  { name: 'Scarlet Piano', file: 'loops/_128/Futurebass/Chords/Cymatics - Scarlet Piano Loop 19 - 150 BPM C# Min.wav',              bpm: 128, category: 'chords', group: 'futurebass' },
  { name: 'Scarlet Strng', file: 'loops/_128/Futurebass/Chords/Cymatics - Scarlet String Loop 14 - 140 BPM D Min.wav',              bpm: 128, category: 'chords', group: 'futurebass' },
  { name: 'Soft Chord 47', file: 'loops/_128/Futurebass/Chords/Cymatics - Soft Chord Loop 47 - 100 BPM A#min.wav',                  bpm: 128, category: 'chords', group: 'futurebass' },
  { name: 'Strangers',     file: 'loops/_128/Futurebass/Chords/Cymatics - Strangers Synth Loop 11 - 110 BPM G# Min.wav',            bpm: 128, category: 'chords', group: 'futurebass' },
  { name: 'Titan Chord',   file: 'loops/_128/Futurebass/Chords/Cymatics - Titan Chord Loop 50 - 150 BPM G Min.wav',                 bpm: 128, category: 'chords', group: 'futurebass' },
  { name: 'Kawaii Stack',  file: 'loops/_128/Futurebass/Chords/looperman-l-2010174-0300963-kawaii-future-bass-chord-stack 160 BPM A#.wav', bpm: 128, category: 'chords', group: 'futurebass' },
  { name: 'Kawaii Retro',  file: 'loops/_128/Futurebass/Chords/looperman-l-5305911-0327807-kawaii-retro-chords 150 BPM Key D.wav',  bpm: 128, category: 'chords', group: 'futurebass' },
  // --- Melody ---
  { name: 'Heater',        file: 'loops/_128/Futurebass/Melody/Cymatics - Heater Chord Loop 29 - 150 BPM A Min.wav',         bpm: 128, category: 'melody', group: 'futurebass' },
  { name: 'Moonlt Guitar', file: 'loops/_128/Futurebass/Melody/Cymatics - Moonlight Guitar Loop 3 - 100 BPM F Maj.wav',      bpm: 128, category: 'melody', group: 'futurebass' },
  { name: 'Moonlt String', file: 'loops/_128/Futurebass/Melody/Cymatics - Moonlight String Loop 18 - 140 BPM G# Min.wav',    bpm: 128, category: 'melody', group: 'futurebass' },
  { name: 'Prometheus 20', file: 'loops/_128/Futurebass/Melody/Cymatics - Prometheus Vocal Arp 20 - 140 BPM E Min.wav',      bpm: 128, category: 'melody', group: 'futurebass' },
  { name: 'Prometheus 30', file: 'loops/_128/Futurebass/Melody/Cymatics - Prometheus Vocal Arp 30 - 150 BPM D Min.wav',      bpm: 128, category: 'melody', group: 'futurebass' },
  { name: 'Prometheus 40', file: 'loops/_128/Futurebass/Melody/Cymatics - Prometheus Vocal Arp 40 - 160 BPM D# Min.wav',     bpm: 128, category: 'melody', group: 'futurebass' },
  { name: 'Soft Chord 48', file: 'loops/_128/Futurebass/Melody/Cymatics - Soft Chord Loop 48 - 115 BPM A#min.wav',           bpm: 128, category: 'melody', group: 'futurebass' },
  { name: 'Titan Chrd 11', file: 'loops/_128/Futurebass/Melody/Cymatics - Titan Chord Loop 11 - 100 BPM A Min.wav',          bpm: 128, category: 'melody', group: 'futurebass' },
];

const GROUPS = ['og', 'futurebass'];
const GROUP_LABELS = { og: 'OG', futurebass: 'Futurebass' };

function playbackRateFor(loopBpm, curBpm) {
  if (!(loopBpm > 0)) return 1;
  return curBpm / loopBpm;
}

const loopBank = {
  LOOP_BANK, GROUPS, GROUP_LABELS, activeGroup: 'og', setActiveGroup, playbackRateFor,
};
function setActiveGroup(g) { if (GROUPS.includes(g)) loopBank.activeGroup = g; }

if (typeof window !== 'undefined') window.loopBank = loopBank;
if (typeof module !== 'undefined') module.exports = loopBank;
