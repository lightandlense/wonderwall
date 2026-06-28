// scripts/loopFilename.js
// Pure helpers to parse BPM and musical key from a loop's filename, and compute the
// time-stretch + pitch-shift needed to land it at 128 BPM in a D# (minor) root.
// CommonJS so both the ESM convert script and the node:test suite can share one copy.

const TARGET_BPM = 128;
const TARGET_PC = 3; // D# pitch class (C=0)
const NOTE_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

// Native BPM from the filename, or null if none can be found.
//   1) "<n> BPM" / "<n>bpm" / "<n>-bpm"
//   2) "<n> <key-ish word>" — a number space-joined to a key / "key" / "unknown"
//      token (looperman ids are hyphen-joined with no spaces, so they don't match).
function parseBpm(file) {
  const m1 = file.match(/(\d{2,3})[\s-]*bpm/i);
  if (m1) return Number(m1[1]);
  const m2 = file.match(/(\d{2,3})\s+(?:key|unknown|unkown|[a-g](?:[#bs])?\s*m(?:in|aj)?\b|[a-g]m\b|bm\b)/i);
  if (m2) return Number(m2[1]);
  return null;
}

// Nearest semitone shift (ties go up) to move the filename's root to D#.
// Returns null when the key is absent or explicitly unknown. Reliable for files
// that contain a BPM marker (all melodic loops do); drum files bypass pitch anyway.
function semitonesToDSharp(file) {
  if (/unknown|unkown/i.test(file)) return null;
  let tail = file;
  const bpm = file.match(/bpm/i);
  if (bpm) tail = file.slice(bpm.index + bpm[0].length); // key sits after the BPM token
  const m = tail.match(/(?:key\s+)?([a-g])\s*([#bs])?\s*(?:maj|min|m)?/i);
  if (!m) return null;
  let pc = NOTE_PC[m[1].toLowerCase()];
  if (pc == null) return null;
  const acc = (m[2] || '').toLowerCase();
  if (acc === '#' || acc === 's') pc = (pc + 1) % 12; // looperman writes sharp as "s"
  else if (acc === 'b') pc = (pc + 11) % 12;
  let shift = (((TARGET_PC - pc) % 12) + 12) % 12; // 0..11 up
  if (shift > 6) shift -= 12;                      // take the nearest direction
  return shift;
}

// Frequency multiplier for rubberband's pitch=. 1.0 when keyless/unknown.
function pitchRatioToDSharp(file) {
  const s = semitonesToDSharp(file);
  return s == null ? 1 : Math.pow(2, s / 12);
}

module.exports = { TARGET_BPM, parseBpm, semitonesToDSharp, pitchRatioToDSharp };
