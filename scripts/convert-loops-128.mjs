// scripts/convert-loops-128.mjs
// Pre-bake every melody + drum loop to a common 128 BPM (pitch preserved) so all
// loops are inherently locked and in key at runtime. Source loops are masters and
// are left untouched; converted copies go to loops/_128/<subdir>/ with the same name.
// Native BPM is parsed from each filename ("... 134 BPM ..." or "...128bpm").
// Requires ffmpeg with the rubberband filter on PATH.
// Run from the project root: node scripts/convert-loops-128.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const TARGET_BPM = 128;
const SRC_DIRS = ['loops/Melody', 'loops/drummer', 'loops/Chords'];
const OUT_ROOT = 'loops/_128';

function nativeBpm(file) {
  const m = file.match(/(\d{2,3})\s*bpm/i);
  if (!m) throw new Error(`No BPM found in filename: ${file}`);
  return Number(m[1]);
}

function ensureFfmpeg() {
  try { execFileSync('ffmpeg', ['-hide_banner', '-version'], { stdio: 'ignore' }); }
  catch { throw new Error('ffmpeg not found on PATH — install ffmpeg (with rubberband) first.'); }
}

ensureFfmpeg();
let count = 0;
for (const dir of SRC_DIRS) {
  const outDir = join(OUT_ROOT, basename(dir)); // loops/_128/Melody | loops/_128/drummer
  mkdirSync(outDir, { recursive: true });
  for (const file of readdirSync(dir)) {
    if (!file.toLowerCase().endsWith('.wav')) continue;
    const bpm = nativeBpm(file);
    const tempo = (TARGET_BPM / bpm).toFixed(6); // >1 speeds up, <1 slows down
    const src = join(dir, file);
    const dst = join(outDir, file);
    console.log(`[convert] ${file}  ${bpm} -> ${TARGET_BPM} BPM (tempo=${tempo})`);
    execFileSync('ffmpeg', [
      '-y', '-i', src,
      '-af', `rubberband=tempo=${tempo}`,
      '-c:a', 'pcm_s16le',
      dst,
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    count++;
  }
}
console.log(`[convert] done: ${count} loops -> ${OUT_ROOT}/`);
