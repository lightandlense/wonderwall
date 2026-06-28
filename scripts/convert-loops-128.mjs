// scripts/convert-loops-128.mjs
// Pre-bake every melody + drum + chord + bass loop to a common 128 BPM (pitch preserved
// for tempo) so all loops are inherently locked at runtime. Source loops are masters and
// are left untouched; converted copies go to loops/_128/<subdir>/ with the same name.
//
// Native BPM is parsed from each filename ("... 134 BPM ..." / "...128bpm" / "...110-bpm").
// The musical key is parsed from the token after the BPM marker ("... 128 BPM D#m",
// "... 108 BPM Dm", "... 110-bpm C"); any keyed loop whose root is not D# is pitch-shifted
// to a D# root so the whole bank sits in D# minor. Keyless loops (drums) are left at pitch.
//
// Existing outputs are skipped, so re-running only fills in missing loops and never
// clobbers assets that were committed (e.g. manually pitch-shifted chord loops).
// Requires ffmpeg with the rubberband filter on PATH.
// Run from the project root: node scripts/convert-loops-128.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const TARGET_BPM = 128;
const TARGET_PC = 3; // D# pitch class (C=0)
const SRC_DIRS = ['loops/Melody', 'loops/drummer', 'loops/Chords', 'loops/bass'];
const OUT_ROOT = 'loops/_128';
const NOTE_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function nativeBpm(file) {
  const m = file.match(/(\d{2,3})[\s-]*bpm/i);
  if (!m) throw new Error(`No BPM found in filename: ${file}`);
  return Number(m[1]);
}

// Frequency multiplier to move this loop's root to D#. 1 when keyless or already D#.
// Looperman writes sharps as either "#" or "s" (e.g. "Ds Min" == D#).
function pitchRatio(file) {
  const m = file.match(/bpm[,\s-]*([a-g])\s*([#bs])?\s*(m|min|maj|maj7)?/i);
  if (!m) return 1; // no key token after BPM (drums) → leave at pitch
  let pc = NOTE_PC[m[1].toLowerCase()];
  const acc = (m[2] || '').toLowerCase();
  if (acc === '#' || acc === 's') pc = (pc + 1) % 12;
  else if (acc === 'b') pc = (pc + 11) % 12;
  let shift = (((TARGET_PC - pc) % 12) + 12) % 12; // 0..11 semitones up
  if (shift > 6) shift -= 12;                      // take the nearest direction
  return Math.pow(2, shift / 12);
}

function ensureFfmpeg() {
  try { execFileSync('ffmpeg', ['-hide_banner', '-version'], { stdio: 'ignore' }); }
  catch { throw new Error('ffmpeg not found on PATH — install ffmpeg (with rubberband) first.'); }
}

ensureFfmpeg();
let count = 0, skipped = 0;
for (const dir of SRC_DIRS) {
  if (!existsSync(dir)) continue;
  const outDir = join(OUT_ROOT, basename(dir)); // loops/_128/Melody | drummer | Chords | bass
  mkdirSync(outDir, { recursive: true });
  for (const file of readdirSync(dir)) {
    if (!file.toLowerCase().endsWith('.wav')) continue;
    const src = join(dir, file);
    const dst = join(outDir, file);
    if (existsSync(dst)) { skipped++; continue; } // never clobber committed/baked loops
    const bpm = nativeBpm(file);
    const tempo = (TARGET_BPM / bpm).toFixed(6); // >1 speeds up, <1 slows down
    const pitch = pitchRatio(file);
    const af = pitch === 1
      ? `rubberband=tempo=${tempo}`
      : `rubberband=tempo=${tempo}:pitch=${pitch.toFixed(6)}`;
    const keyNote = pitch === 1 ? 'in key' : `pitch x${pitch.toFixed(4)} -> D#`;
    console.log(`[convert] ${file}  ${bpm} -> ${TARGET_BPM} BPM (tempo=${tempo}, ${keyNote})`);
    execFileSync('ffmpeg', [
      '-y', '-i', src,
      '-af', af,
      '-c:a', 'pcm_s16le',
      dst,
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    count++;
  }
}
console.log(`[convert] done: ${count} converted, ${skipped} skipped (already baked) -> ${OUT_ROOT}/`);
