// scripts/convert-loops-128.mjs
// Pre-bake every loop to 128 BPM, pitching melodic loops to a D# root so each bank
// sits in D# minor. Source masters are left untouched; converted copies go to
// loops/_128/<group>/<category>/ with the same filename. Existing outputs are
// skipped, so re-running only fills in missing loops (never clobbers committed bakes).
// BPM/key parsing lives in scripts/loopFilename.js. Requires ffmpeg with rubberband.
// Run from the project root: node scripts/convert-loops-128.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pkg from './loopFilename.js';
const { TARGET_BPM, parseBpm, pitchRatioToDSharp } = pkg;

// Each mapping: a source category folder -> its baked output folder. `drums: true`
// forces pitch=1 (drums are keyless; never pitch-shift even if a key is in the name).
const MAPPINGS = [
  { src: 'loops/bass',              out: 'loops/_128/OG Loops/bass',      drums: false },
  { src: 'loops/Chords',            out: 'loops/_128/OG Loops/Chords',    drums: false },
  { src: 'loops/drummer',           out: 'loops/_128/OG Loops/drummer',   drums: true  },
  { src: 'loops/Melody',            out: 'loops/_128/OG Loops/Melody',    drums: false },
  { src: 'loops/Futurebass/Bass',   out: 'loops/_128/Futurebass/Bass',    drums: false },
  { src: 'loops/Futurebass/Chords', out: 'loops/_128/Futurebass/Chords',  drums: false },
  { src: 'loops/Futurebass/Drums',  out: 'loops/_128/Futurebass/Drums',   drums: true  },
  { src: 'loops/Futurebass/Melody', out: 'loops/_128/Futurebass/Melody',  drums: false },
];

function ensureFfmpeg() {
  try { execFileSync('ffmpeg', ['-hide_banner', '-version'], { stdio: 'ignore' }); }
  catch { throw new Error('ffmpeg not found on PATH — install ffmpeg (with rubberband) first.'); }
}

ensureFfmpeg();
let count = 0, skipped = 0, warned = 0;
for (const map of MAPPINGS) {
  if (!existsSync(map.src)) continue;
  mkdirSync(map.out, { recursive: true });
  for (const file of readdirSync(map.src)) {
    if (!file.toLowerCase().endsWith('.wav')) continue;
    const dst = join(map.out, file);
    if (existsSync(dst)) { skipped++; continue; } // never clobber an existing bake
    let bpm = parseBpm(file);
    if (bpm == null) { bpm = TARGET_BPM; warned++; console.warn(`[warn] no BPM in "${file}" — assuming ${TARGET_BPM}`); }
    const tempo = (TARGET_BPM / bpm).toFixed(6);
    const pitch = map.drums ? 1 : pitchRatioToDSharp(file);
    const af = pitch === 1
      ? `rubberband=tempo=${tempo}`
      : `rubberband=tempo=${tempo}:pitch=${pitch.toFixed(6)}`;
    const note = pitch === 1 ? 'in key / keyless' : `pitch x${pitch.toFixed(4)} -> D#`;
    console.log(`[convert] ${file}  ${bpm} -> ${TARGET_BPM} BPM (${note})`);
    execFileSync('ffmpeg', ['-y', '-i', join(map.src, file), '-af', af, '-c:a', 'pcm_s16le', dst],
      { stdio: ['ignore', 'ignore', 'inherit'] });
    count++;
  }
}
console.log(`[convert] done: ${count} converted, ${skipped} skipped, ${warned} BPM-defaulted -> loops/_128/`);
