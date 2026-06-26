// src/data/loopBank.js
// Curated DIVERSE loop bank (downloaded by scripts/fetch-loops.sh). Pure data + rate math.
// bpm = the loop's native tempo (used to lock it to the Transport via playbackRate).
// Loops whose native tempo is unknown use 110 (the default Transport BPM) so they play at
// native speed by default; the Tempo puck still scales them.
const LOOP_BANK = [
  { name: 'Break 108', file: 'assets/loops/breakbeat_108.mp3', bpm: 108, category: 'drums' },
  { name: 'House 140', file: 'assets/loops/house_140.wav',     bpm: 140, category: 'drums' },
  { name: 'Funk Bass', file: 'assets/loops/bass_funk.wav',     bpm: 110, category: 'bass'  },
  { name: 'Arp 130',   file: 'assets/loops/arp_130.ogg',       bpm: 130, category: 'synth' },
  { name: 'Samba',     file: 'assets/loops/samba_perc.wav',    bpm: 110, category: 'perc'  },
  { name: 'Piano',     file: 'assets/loops/piano_chords.wav',  bpm: 110, category: 'keys'  },
];

function playbackRateFor(loopBpm, curBpm) {
  if (!(loopBpm > 0)) return 1;
  return curBpm / loopBpm;
}

const loopBank = { LOOP_BANK, playbackRateFor };
if (typeof window !== 'undefined') window.loopBank = loopBank;
if (typeof module !== 'undefined') module.exports = loopBank;
