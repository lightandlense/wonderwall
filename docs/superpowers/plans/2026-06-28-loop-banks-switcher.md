# Loop Banks + Switcher Puck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global "Loop Bank" puck (marker ID 12) that switches the four sampler pucks between two curated loop sets — OG and Futurebass — and bake the Futurebass loops to 128 BPM + D# minor.

**Architecture:** Tag every `LOOP_BANK` entry with a `group` ('og' | 'futurebass') alongside `category`. A module-level `activeGroup` flag (default 'og') is read by each sampler's `getLoopIndex`. The new global puck writes `activeGroup`; flipping it re-points all samplers through the existing per-frame loop-swap path. Filename parsing for conversion is extracted into a pure, testable CommonJS module.

**Tech Stack:** Vanilla JS (browser globals + CommonJS for Node tests), Tone.js, `node --test`, ffmpeg+rubberband for the offline bake.

## Global Constraints

- All loops are pre-baked to **128 BPM**; `bpm: 128` on every `LOOP_BANK` entry; runtime `playbackRate = Transport.bpm / 128`.
- Melodic loops target **D# minor** (root pitch class 3); drums are keyless and never pitch-shifted.
- Groups are `['og', 'futurebass']`; default active group is `'og'`.
- Switcher puck is marker **ID 12**, `type: 'global'`, `subtype: 'loopgroup'`. Reserved calibration IDs (10, 11, 13, 18) must never be added to the registry.
- Baked asset paths: OG → `loops/_128/OG Loops/<bass|Chords|drummer|Melody>/`, Futurebass → `loops/_128/Futurebass/<Bass|Chords|Drums|Melody>/`.
- Tests run with `npm test` (`node --test`). Follow the existing dual-export pattern (`window.X` in browser, `module.exports` in Node).

---

### Task 1: Filename parser module (`loopFilename.js`)

Pure, testable BPM + key→pitch parsing extracted so both the ESM convert script and the test suite use one implementation.

**Files:**
- Create: `scripts/loopFilename.js`
- Test: `src/tests/loopFilename.test.js`

**Interfaces:**
- Produces:
  - `parseBpm(file: string) => number | null` — native BPM, or null if unparseable.
  - `semitonesToDSharp(file: string) => number | null` — nearest semitone shift to a D# root (ties up), or null when keyless/unknown.
  - `pitchRatioToDSharp(file: string) => number` — `2^(semitones/12)`, or `1` when keyless/unknown.
  - `TARGET_BPM = 128`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/loopFilename.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseBpm, semitonesToDSharp, pitchRatioToDSharp, TARGET_BPM } = require('../../scripts/loopFilename.js');

test('parseBpm: handles "BPM", "bpm", hyphen, and number+key fallback', () => {
  assert.strictEqual(parseBpm('x 155 BPM D#m.wav'), 155);
  assert.strictEqual(parseBpm('charli-drums-128bpm.wav'), 128);
  assert.strictEqual(parseBpm('chill-house-bass-110-bpm C.wav'), 110);
  assert.strictEqual(parseBpm('fb-drums-110 Bm key.wav'), 110);            // no "BPM" word
  assert.strictEqual(parseBpm('future-bass-drum-loop-150 unknown key.wav'), 150);
  assert.strictEqual(parseBpm('kawaii-bass-drums.wav'), null);             // nothing parseable
});

test('semitonesToDSharp: known keys map to nearest D# shift; unknown -> null', () => {
  assert.strictEqual(semitonesToDSharp('x 155 BPM D#m.wav'), 0);
  assert.strictEqual(semitonesToDSharp('x 108 BPM Dm.wav'), 1);
  assert.strictEqual(semitonesToDSharp('x 110-bpm C.wav'), 3);
  assert.strictEqual(semitonesToDSharp('x 134 BPM Ds Min.wav'), 0);        // "Ds" == D#
  assert.strictEqual(semitonesToDSharp('x 150 BPM F Min.wav'), -2);
  assert.strictEqual(semitonesToDSharp('x 140 BPM C# Min.wav'), 2);
  assert.strictEqual(semitonesToDSharp('x 140 BPM F# Min.wav'), -3);
  assert.strictEqual(semitonesToDSharp('x 150 BPM D Min.wav'), 1);
  assert.strictEqual(semitonesToDSharp('x 100 BPM A#min.wav'), 5);         // no space
  assert.strictEqual(semitonesToDSharp('x 110 BPM G# Min.wav'), -5);
  assert.strictEqual(semitonesToDSharp('x 150 BPM G Min.wav'), -4);
  assert.strictEqual(semitonesToDSharp('x 160 BPM A#.wav'), 5);
  assert.strictEqual(semitonesToDSharp('x 150 BPM Key D.wav'), 1);
  assert.strictEqual(semitonesToDSharp('x 140 BPM unkown key.wav'), null);
  assert.strictEqual(semitonesToDSharp('x 160 BPM Key Unknown.wav'), null);
});

test('pitchRatioToDSharp: ratio = 2^(semitones/12), 1 when keyless', () => {
  assert.ok(Math.abs(pitchRatioToDSharp('x 108 BPM Dm.wav') - Math.pow(2, 1 / 12)) < 1e-9);
  assert.strictEqual(pitchRatioToDSharp('x 140 BPM unkown key.wav'), 1);
  assert.strictEqual(TARGET_BPM, 128);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../scripts/loopFilename.js'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/loopFilename.js`:

```js
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
  const m = tail.match(/(?:key\s+)?([a-g])\s*([#bs])?\s*(?:maj|min|m)?\b/i);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all three `loopFilename` tests green; existing suite unaffected).

- [ ] **Step 5: Commit**

```bash
git add scripts/loopFilename.js src/tests/loopFilename.test.js
git commit -m "feat: add testable loop-filename BPM/key parser"
```

---

### Task 2: Group-aware convert script + bake Futurebass

Rewrite the converter to use group source→output mappings and the parser module, then bake the 29 Futurebass loops. OG outputs already exist on disk, so skip-if-exists leaves them untouched.

**Files:**
- Modify: `scripts/convert-loops-128.mjs` (full rewrite)

**Interfaces:**
- Consumes: `scripts/loopFilename.js` (`parseBpm`, `pitchRatioToDSharp`).
- Produces (on disk): `loops/_128/Futurebass/<Bass|Chords|Drums|Melody>/*.wav` (29 files).

- [ ] **Step 1: Rewrite the convert script**

Replace the entire contents of `scripts/convert-loops-128.mjs`:

```js
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
```

- [ ] **Step 2: Run the converter**

Run: `node scripts/convert-loops-128.mjs`
Expected: ~29 `[convert]` lines for Futurebass files, OG files reported as skipped, `0 BPM-defaulted` (every real file now has a parseable BPM), ending with `[convert] done: 29 converted, ...`.

- [ ] **Step 3: Verify the baked output**

Run: `ls "loops/_128/Futurebass/Bass" "loops/_128/Futurebass/Chords" "loops/_128/Futurebass/Drums" "loops/_128/Futurebass/Melody" | cat`
Expected: 4 / 9 / 8 / 8 `.wav` files respectively (29 total).

- [ ] **Step 4: Commit**

```bash
git add scripts/convert-loops-128.mjs "loops/_128/Futurebass"
git commit -m "feat: group-aware loop converter; bake Futurebass to 128 BPM D#m"
```

---

### Task 3: Loop bank data model (`loopBank.js`)

Add the `group` dimension, fix OG paths, add the 29 Futurebass entries, and the active-group state.

**Files:**
- Modify: `src/data/loopBank.js` (full rewrite)
- Test: `src/tests/loopBank.test.js` (update)

**Interfaces:**
- Produces: `loopBank.LOOP_BANK` (entries now have `group`), `loopBank.GROUPS = ['og','futurebass']`, `loopBank.GROUP_LABELS`, `loopBank.activeGroup` (default `'og'`), `loopBank.setActiveGroup(g)`, `loopBank.playbackRateFor(loopBpm, curBpm)` (unchanged).

- [ ] **Step 1: Update the failing test**

Replace `src/tests/loopBank.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const loopBank = require('../data/loopBank.js');

test('LOOP_BANK: every entry well-formed (128 BPM, under loops/_128/, valid group+category)', () => {
  assert.ok(Array.isArray(loopBank.LOOP_BANK) && loopBank.LOOP_BANK.length >= 1);
  for (const e of loopBank.LOOP_BANK) {
    assert.ok(typeof e.name === 'string' && e.name.length > 0, 'name');
    assert.ok(e.file.startsWith('loops/_128/'), `file path: ${e.file}`);
    assert.ok(e.file.toLowerCase().endsWith('.wav'), `wav: ${e.file}`);
    assert.strictEqual(e.bpm, 128, `bpm 128: ${e.name}`);
    assert.ok(['drums', 'melody', 'chords', 'bass'].includes(e.category), `category: ${e.category}`);
    assert.ok(loopBank.GROUPS.includes(e.group), `group: ${e.group}`);
  }
});

test('LOOP_BANK: per-(group,category) counts', () => {
  const by = (g, c) => loopBank.LOOP_BANK.filter(e => e.group === g && e.category === c).length;
  assert.strictEqual(by('og', 'drums'), 10, 'og drums');
  assert.strictEqual(by('og', 'bass'), 8, 'og bass');
  assert.strictEqual(by('og', 'chords'), 8, 'og chords');
  assert.strictEqual(by('og', 'melody'), 8, 'og melody');
  assert.strictEqual(by('futurebass', 'drums'), 8, 'fb drums');
  assert.strictEqual(by('futurebass', 'bass'), 4, 'fb bass');
  assert.strictEqual(by('futurebass', 'chords'), 9, 'fb chords');
  assert.strictEqual(by('futurebass', 'melody'), 8, 'fb melody');
  assert.strictEqual(loopBank.LOOP_BANK.length, 63, 'total');
});

test('activeGroup: defaults to og, setActiveGroup validates', () => {
  assert.strictEqual(loopBank.activeGroup, 'og');
  loopBank.setActiveGroup('futurebass');
  assert.strictEqual(loopBank.activeGroup, 'futurebass');
  loopBank.setActiveGroup('bogus');                 // ignored
  assert.strictEqual(loopBank.activeGroup, 'futurebass');
  loopBank.setActiveGroup('og');                    // restore for other tests
  assert.strictEqual(loopBank.activeGroup, 'og');
});

test('playbackRateFor: ratio of current to loop bpm, guarded', () => {
  assert.strictEqual(loopBank.playbackRateFor(128, 128), 1);
  assert.strictEqual(loopBank.playbackRateFor(98, 128), 128 / 98);
  assert.strictEqual(loopBank.playbackRateFor(0, 110), 1);
  assert.strictEqual(loopBank.playbackRateFor(-5, 110), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `GROUPS` undefined / count + path assertions fail.

- [ ] **Step 3: Rewrite `loopBank.js`**

Replace the entire contents of `src/data/loopBank.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (loopBank tests green). The moduleRegistry suite may now fail on sampler name/first-last assertions — fixed in Task 4.

- [ ] **Step 5: Verify every referenced file exists on disk**

Run:
```bash
node -e "const b=require('./src/data/loopBank.js');let miss=0;for(const e of b.LOOP_BANK){if(!require('fs').existsSync(e.file)){console.log('MISS',e.file);miss++}}console.log(miss?miss+' missing':'all '+b.LOOP_BANK.length+' present')"
```
Expected: `all 63 present`. If any `MISS`, fix the path/filename to match disk before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/data/loopBank.js src/tests/loopBank.test.js
git commit -m "feat: add loop groups (OG + Futurebass) to loopBank with active-group state"
```

---

### Task 4: Sampler group filter + Loop Bank puck (`moduleRegistry.js`)

Make the four samplers filter by active group, and add the ID 12 switcher. Introduce a shared helper so the four samplers stop duplicating selection logic.

**Files:**
- Modify: `src/services/moduleRegistry.js`
- Test: `src/tests/moduleRegistry.test.js` (update)

**Interfaces:**
- Consumes: `loopBank.LOOP_BANK`, `loopBank.activeGroup`, `loopBank.GROUPS`, `loopBank.GROUP_LABELS`.
- Produces: `MODULE_REGISTRY[12]` (`type:'global'`, `subtype:'loopgroup'`, `getGroup(angle)`, `getName(angle)`); samplers 4/6/7/16 select by `category && activeGroup`.

- [ ] **Step 1: Update the failing test**

In `src/tests/moduleRegistry.test.js`, change the registry-types test to add ID 12 and add two new tests. First, add this line inside the existing `test('registry has the modules with correct types', …)` block, after the `MODULE_REGISTRY[16]` assertion:

```js
  assert.strictEqual(MODULE_REGISTRY[12].type, 'global');      // Loop Bank switcher
  assert.strictEqual(MODULE_REGISTRY[12].subtype, 'loopgroup');
```

Then append these tests at the end of the file:

```js
test('Loop Bank (id 12): rotation maps arc to og / futurebass', () => {
  const lbp = MODULE_REGISTRY[12];
  assert.strictEqual(lbp.type, 'global');
  assert.strictEqual(lbp.getGroup(3 * Math.PI / 2), 'og');        // t=0 -> first group
  assert.strictEqual(lbp.getGroup(Math.PI / 4), 'futurebass');    // t=1 -> last group
  assert.ok(typeof lbp.getName(0) === 'string' && lbp.getName(0).length > 0);
});

test('Samplers select within the active group only', () => {
  const lb = require('../data/loopBank.js');
  const bass = MODULE_REGISTRY[16];
  lb.setActiveGroup('og');
  let idx = bass.getLoopIndex(0);
  assert.strictEqual(lb.LOOP_BANK[idx].group, 'og');
  assert.strictEqual(lb.LOOP_BANK[idx].category, 'bass');
  lb.setActiveGroup('futurebass');
  idx = bass.getLoopIndex(0);
  assert.strictEqual(lb.LOOP_BANK[idx].group, 'futurebass');
  assert.strictEqual(lb.LOOP_BANK[idx].category, 'bass');
  lb.setActiveGroup('og'); // restore
});
```

Also update the two existing first/last name assertions to set the group first. In `test('Drummer (id 4): …')` add `require('../data/loopBank.js').setActiveGroup('og');` as the first line of the test body; do the same in `test('Chords (id 6): …')` and `test('Bass (id 16): …')`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `MODULE_REGISTRY[12]` is undefined.

- [ ] **Step 3: Add the shared helper and refactor samplers**

In `src/services/moduleRegistry.js`, add these helpers immediately **before** `const MODULE_REGISTRY = {`:

```js
// Shared loop-selection for sampler pucks: pick within a category AND the active group.
function _lb() { return (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank; }
function _samplerLoopIndex(category, angle) {
  const lb = _lb();
  const indices = lb.LOOP_BANK.map((e, i) => i)
    .filter(i => lb.LOOP_BANK[i].category === category && lb.LOOP_BANK[i].group === lb.activeGroup);
  if (indices.length === 0) return -1;
  const t = _arcT(angle);
  return indices[Math.max(0, Math.min(indices.length - 1, Math.floor(t * indices.length)))];
}
function _samplerName(category, angle) {
  const lb = _lb();
  const i = _samplerLoopIndex(category, angle);
  return (i >= 0 && lb.LOOP_BANK[i]) ? lb.LOOP_BANK[i].name : '';
}
```

Replace the **Drummer (id 4)** body's `getLoopIndex` and `getName` with:

```js
    getLoopIndex(angle) { return _samplerLoopIndex('drums', angle); },
    getName(angle) { return _samplerName('drums', angle); },
```

Replace the **Chords (id 6)** body's `getLoopIndex` and `getName` with:

```js
    getLoopIndex(angle) { return _samplerLoopIndex('chords', angle); },
    getName(angle) { return _samplerName('chords', angle); },
```

Replace the **Melody (id 7)** body's `getLoopIndex` and `getName` with:

```js
    getLoopIndex(angle) { return _samplerLoopIndex('melody', angle); },
    getName(angle) { return _samplerName('melody', angle); },
```

Replace the **Bass (id 16)** body's `getLoopIndex` and `getName` with:

```js
    getLoopIndex(angle) { return _samplerLoopIndex('bass', angle); },
    getName(angle) { return _samplerName('bass', angle); },
```

- [ ] **Step 4: Add the Loop Bank puck (ID 12)**

In `src/services/moduleRegistry.js`, add this entry inside `MODULE_REGISTRY` (place it right after the `9: { … }` Distortion block, before `14:`):

```js
  // ID 12: Loop Bank — global; rotation selects the active loop group (OG / Futurebass)
  12: {
    id: 12, name: 'Loop Bank', type: 'global', subtype: 'loopgroup', color: '#aa88ff', paramLabel: 'Bank',
    getParamT(angle) { return _arcT(angle); },
    getGroup(angle) {
      const lb = _lb();
      const n = lb.GROUPS.length;
      return lb.GROUPS[Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)))];
    },
    getName(angle) {
      const lb = _lb();
      return lb.GROUP_LABELS[this.getGroup(angle)] || this.getGroup(angle);
    },
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (moduleRegistry + loopBank suites green).

- [ ] **Step 6: Commit**

```bash
git add src/services/moduleRegistry.js src/tests/moduleRegistry.test.js
git commit -m "feat: samplers filter by active group; add Loop Bank puck (id 12)"
```

---

### Task 5: Wire the switcher into the audio engine (`audioEngine.js`)

When a Loop Bank puck is present, its rotation sets `loopBank.activeGroup` each frame; samplers swap via the existing per-frame loop-swap path.

**Files:**
- Modify: `src/services/audioEngine.js:_updateModule`
- Test: `src/tests/browserLoad.test.js` (add a scenario)

**Interfaces:**
- Consumes: `MODULE_REGISTRY[12].getGroup`, `loopBank.setActiveGroup`.

- [ ] **Step 1: Add the failing test**

In `src/tests/browserLoad.test.js`, append:

```js
test('Loop Bank puck sets the active group from rotation', async () => {
  const ctx = makeSandbox();
  loadAll(ctx);
  const fakeCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 1280, height: 720 } : k === 'createLinearGradient' ? (() => ({ addColorStop() {} })) : () => {}) });
  ctx.__fakeCtx = fakeCtx;
  vm.runInContext('visualEngine.init({getContext:()=>window.__fakeCtx},{getContext:()=>window.__fakeCtx})', ctx);
  vm.runInContext(`window.onMarkersDetected = function (d) {
    reconcileModules(d); const a = getActiveModules();
    const p = routingGraph.update(a, { w: 1280, h: 720 }); applyRoutingPlan(p);
  };`, ctx);
  await vm.runInContext('initAudio()', ctx);

  // Rotate the Loop Bank puck (id 12) to the top of the arc -> last group (futurebass).
  const bank = { id: 12, wx: 600, wy: 600, angle: Math.PI / 4 };
  for (let i = 0; i < 3; i++) ctx.onMarkersDetected([bank]);
  assert.strictEqual(vm.runInContext('window.loopBank.activeGroup', ctx), 'futurebass');

  // Rotate to the bottom of the arc -> first group (og).
  const bankOg = { id: 12, wx: 600, wy: 600, angle: 3 * Math.PI / 2 };
  for (let i = 0; i < 3; i++) ctx.onMarkersDetected([bankOg]);
  assert.strictEqual(vm.runInContext('window.loopBank.activeGroup', ctx), 'og');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `activeGroup` stays `'og'` after rotating to the top (no handler yet).

- [ ] **Step 3: Add the `loopgroup` branch**

In `src/services/audioEngine.js`, in `_updateModule`, find the tempo branch:

```js
  } else if (m.def.type === 'global' && m.def.subtype === 'tempo') {
    const bpm = m.def.getBpm(angle);
    Tone.Transport.bpm.rampTo(bpm, 0.1);
    _applyLoopRates(bpm);
  }
```

Replace it with (adds a `loopgroup` branch after tempo):

```js
  } else if (m.def.type === 'global' && m.def.subtype === 'tempo') {
    const bpm = m.def.getBpm(angle);
    Tone.Transport.bpm.rampTo(bpm, 0.1);
    _applyLoopRates(bpm);
  } else if (m.def.type === 'global' && m.def.subtype === 'loopgroup') {
    _loopBank.setActiveGroup(m.def.getGroup(angle));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (the new scenario plus the existing browserLoad VM tests stay green — no reference errors).

- [ ] **Step 5: Commit**

```bash
git add src/services/audioEngine.js src/tests/browserLoad.test.js
git commit -m "feat: Loop Bank puck sets active loop group each frame"
```

---

### Task 6: Active-bank HUD pill (`visualEngine.js`)

Show which bank is live. The puck's below-label already renders `getName` (group name); this adds a top-right HUD pill mirroring the Tempo pill.

**Files:**
- Modify: `src/components/visualEngine.js` (after the Tempo HUD pill block)

**Interfaces:**
- Consumes: `getActiveModules()` entries with `def.subtype === 'loopgroup'` and `def.getName(angle)`.

- [ ] **Step 1: Add the HUD pill**

In `src/components/visualEngine.js`, find the end of the Tempo HUD pill block:

```js
      visCtx.fillText(`TEMPO  ${bpm} BPM`, px2 + 16, py2 + 22);
      visCtx.restore();
    }

    if (window.showOverlay !== false) _drawDebugOverlay(detectedWorldMarkers, W, H);
```

Replace it with (inserts a BANK pill below the Tempo pill):

```js
      visCtx.fillText(`TEMPO  ${bpm} BPM`, px2 + 16, py2 + 22);
      visCtx.restore();
    }

    // Loop Bank HUD pill (below the Tempo pill) when a Loop Bank puck is present
    const bankMod = getActiveModules().find(m => m.def.subtype === 'loopgroup');
    if (bankMod) {
      visCtx.save();
      visCtx.fillStyle   = 'rgba(20,14,30,0.85)';
      visCtx.strokeStyle = '#3a2a5a';
      const px3 = W - 360, py3 = 104;
      visCtx.beginPath();
      if (visCtx.roundRect) visCtx.roundRect(px3, py3, 220, 34, 17); else visCtx.rect(px3, py3, 220, 34);
      visCtx.fill();
      visCtx.stroke();
      visCtx.fillStyle = '#c4a8ff';
      visCtx.font      = '14px monospace';
      visCtx.textAlign = 'left';
      visCtx.fillText(`BANK  ${bankMod.def.getName(bankMod.angle)}`, px3 + 16, py3 + 22);
      visCtx.restore();
    }

    if (window.showOverlay !== false) _drawDebugOverlay(detectedWorldMarkers, W, H);
```

- [ ] **Step 2: Run the full suite to verify no regressions**

Run: `npm test`
Expected: PASS — all suites green (the browserLoad VM test executes `visualEngine.draw`, exercising this block without throwing).

- [ ] **Step 3: Commit**

```bash
git add src/components/visualEngine.js
git commit -m "feat: BANK HUD pill showing the active loop group"
```

---

## Manual Verification (after all tasks)

The automated suite can't confirm audio. Once tasks are done, serve and listen:

- [ ] Run `npm start`, open `http://localhost:<port>` (NOT `file://` — loops fetch over http).
- [ ] Confirm the console logs `loops loaded: 63 / 63` with no `MISSING buffer` warnings.
- [ ] With a Drummer/Bass/etc. puck active, place marker **#12** and rotate it: the BANK pill flips OG ↔ Futurebass and the active sampler pucks audibly swap loop sets, staying in time.

## Notes / Out of Scope

- The 4 loose unsorted `.wav` files at `loops/` root are not part of either bank.
- Tonality code remains latent and untouched.
- `kawaii-bass-drums.wav` has no parseable BPM → baked at native speed (128 default); acceptable per the best-effort policy.
