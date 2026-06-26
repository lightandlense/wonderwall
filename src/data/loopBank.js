// src/data/loopBank.js
// Curated loop bank (downloaded by scripts/fetch-loops.sh). Pure data + rate math.
const LOOP_BANK = [
  { name: 'LoFi 85',     file: 'assets/loops/LoFi_HipHop_85bpm_01.wav', bpm: 85,  category: 'drums' },
  { name: 'BoomBap 90',  file: 'assets/loops/BoomBap_90bpm_01.wav',     bpm: 90,  category: 'drums' },
  { name: 'Afro 100',    file: 'assets/loops/Afrobeats_100bpm_01.wav',  bpm: 100, category: 'drums' },
  { name: 'House 124',   file: 'assets/loops/House_124bpm_01.wav',      bpm: 124, category: 'drums' },
  { name: 'Trap 140',    file: 'assets/loops/Trap_140bpm_01.wav',       bpm: 140, category: 'drums' },
  { name: 'FutBass 150', file: 'assets/loops/FutureBass_150bpm_01.wav', bpm: 150, category: 'synth' },
];

function playbackRateFor(loopBpm, curBpm) {
  if (!(loopBpm > 0)) return 1;
  return curBpm / loopBpm;
}

const loopBank = { LOOP_BANK, playbackRateFor };
if (typeof window !== 'undefined') window.loopBank = loopBank;
if (typeof module !== 'undefined') module.exports = loopBank;
