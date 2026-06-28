# Loop-based Drummer with Pre-baked 128 BPM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the synthesized Tone.js drummer with real drum WAV loops, with every loop pre-baked to 128 BPM so drummer + melody stay locked in tempo and in key, controlled by the existing Tempo puck.

**Architecture:** Loops are converted offline to a common 128 BPM (pitch-preserved via ffmpeg `rubberband`); melodies are already all D# Minor so key is unchanged. The drummer puck (marker ID 4) becomes a `sampler` cycling all 10 drum loops, flowing through the existing sampler playback path. No runtime tempo resolver is added — the Tempo puck (ID 8) remains the single global tempo control, and the existing `_applyLoopRates` re-rates all samplers together. All synthesized-drum code is removed.

**Tech Stack:** Vanilla JS (CommonJS modules + browser globals), Tone.js, Node's built-in `node:test`, ffmpeg (`rubberband` filter), Node 22 ESM for the conversion script.

## Global Constraints

- Loop assets live under `loops/` and are **untracked** in git (local assets) — do NOT `git add loops/`. Commit only code/scripts/tests.
- Loop file paths in the bank are root-relative and served by `serve.js` over `http://localhost:8080/` (the app MUST be run via `npm start`, never `file://`).
- All bank entries are **128 BPM** after this work; `bpm` field stays for `playbackRateFor(loopBpm, Transport.bpm)`.
- Melody loops are all **D# Minor**; drums are keyless. Key is not modified.
- Test runner: `npm test` (`node --test`). Test files use `require('node:test')`.
- **Pre-existing baseline:** 6 tests fail before this work — `loopBank.test.js` (stale `assets/loops/` path) and 5 in `moduleRegistry.test.js` (stale assertions for LFO@4 / Sequencer@6 / PitchShift@7, which no longer exist). This plan fixes all 6 incidentally because it rewrites those two test files to match the real registry/bank. The bar at the end is a **fully green** suite.

---

### Task 1: Offline conversion script → 128 BPM assets

**Files:**
- Create: `scripts/convert-loops-128.mjs`
- Generates (untracked): `loops/_128/Melody/*.wav` (12), `loops/_128/drummer/*.wav` (10)

**Interfaces:**
- Produces: converted WAVs at `loops/_128/<Melody|drummer>/<original-filename>.wav`, all at 128 BPM. The bank (Task 2) references these paths.

- [ ] **Step 1: Write the conversion script**

Create `scripts/convert-loops-128.mjs`:

```js
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
const SRC_DIRS = ['loops/Melody', 'loops/drummer'];
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
```

- [ ] **Step 2: Run the script**

Run (from project root):
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node scripts/convert-loops-128.mjs
```
Expected: a `[convert] ...` line per file and `[convert] done: 22 loops -> loops/_128/`.

- [ ] **Step 3: Verify outputs exist (counts)**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && ls "loops/_128/Melody" | wc -l && ls "loops/_128/drummer" | wc -l
```
Expected: `12` then `10`.

- [ ] **Step 4: Verify a known stretch lengthened correctly**

A 134-BPM loop slowed to 128 must get LONGER by ~134/128 = 1.047×. Compare source vs converted duration:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && \
ffprobe -v error -show_entries format=duration -of csv=p=0 "loops/Melody/Cymatics - Aquamarine - 134 BPM Ds Min.wav" && \
ffprobe -v error -show_entries format=duration -of csv=p=0 "loops/_128/Melody/Cymatics - Aquamarine - 134 BPM Ds Min.wav"
```
Expected: second value ≈ first × 1.047 (longer). Confirms pitch-preserved tempo change applied.

- [ ] **Step 5: Commit the script**

```bash
cd "E:/Antigravity/Projects/Reactable Wall" && git add scripts/convert-loops-128.mjs && git commit -m "feat: add offline loop conversion script (all loops -> 128 BPM)"
```

---

### Task 2: Loop bank — all 128 BPM, 10 drum loops, `loops/_128/` paths

**Files:**
- Modify: `src/data/loopBank.js` (full rewrite of `LOOP_BANK`)
- Test: `src/tests/loopBank.test.js` (full rewrite)

**Interfaces:**
- Produces: `loopBank.LOOP_BANK` — array of `{ name, file, bpm: 128, category: 'drums'|'melody' }`; 10 `drums` then 8 `melody`. `loopBank.playbackRateFor(loopBpm, curBpm)` unchanged.
- Consumes (Task 3): `LOOP_BANK` entries filtered by `category` for puck loop selection.

- [ ] **Step 1: Rewrite the failing test**

Replace the entire contents of `src/tests/loopBank.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const loopBank = require('../data/loopBank.js');

test('LOOP_BANK: every entry well-formed, all 128 BPM, under loops/_128/', () => {
  assert.ok(Array.isArray(loopBank.LOOP_BANK) && loopBank.LOOP_BANK.length >= 1);
  for (const e of loopBank.LOOP_BANK) {
    assert.ok(typeof e.name === 'string' && e.name.length > 0, 'name');
    assert.ok(e.file.startsWith('loops/_128/'), `file path: ${e.file}`);
    assert.ok(e.file.toLowerCase().endsWith('.wav'), `wav: ${e.file}`);
    assert.strictEqual(e.bpm, 128, `bpm 128: ${e.name}`);
    assert.ok(e.category === 'drums' || e.category === 'melody', `category: ${e.category}`);
  }
});

test('LOOP_BANK: 10 drum loops and 8 melody loops', () => {
  const drums = loopBank.LOOP_BANK.filter(e => e.category === 'drums');
  const melody = loopBank.LOOP_BANK.filter(e => e.category === 'melody');
  assert.strictEqual(drums.length, 10, 'drum count');
  assert.strictEqual(melody.length, 8, 'melody count');
});

test('playbackRateFor: ratio of current to loop bpm, guarded', () => {
  assert.strictEqual(loopBank.playbackRateFor(128, 128), 1);
  assert.strictEqual(loopBank.playbackRateFor(128, 140), 140 / 128);
  assert.strictEqual(loopBank.playbackRateFor(0, 110), 1);
  assert.strictEqual(loopBank.playbackRateFor(-5, 110), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/loopBank.test.js
```
Expected: FAIL — current bank uses `loops/...` paths and non-128 bpm values, and lacks the 10/8 split.

- [ ] **Step 3: Rewrite the loop bank**

Replace the entire contents of `src/data/loopBank.js`:

```js
// src/data/loopBank.js
// Curated loop bank. Pure data + rate math.
// All loops are pre-baked to 128 BPM (see scripts/convert-loops-128.mjs); the static
// `bpm` field feeds playbackRateFor so the Tempo puck can globally re-rate every loop.
// Melody loops are all D# Minor; drums are keyless.
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
];

function playbackRateFor(loopBpm, curBpm) {
  if (!(loopBpm > 0)) return 1;
  return curBpm / loopBpm;
}

const loopBank = { LOOP_BANK, playbackRateFor };
if (typeof window !== 'undefined') window.loopBank = loopBank;
if (typeof module !== 'undefined') module.exports = loopBank;
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/loopBank.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd "E:/Antigravity/Projects/Reactable Wall" && git add src/data/loopBank.js src/tests/loopBank.test.js && git commit -m "feat: bank all loops at 128 BPM + add 10 drum loops"
```

---

### Task 3: Drummer puck (ID 4) → drum-loop sampler

**Files:**
- Modify: `src/services/moduleRegistry.js` (ID 4 definition)
- Test: `src/tests/moduleRegistry.test.js` (full rewrite to match real registry + new drummer)

**Interfaces:**
- Consumes: `loopBank.LOOP_BANK` (Task 2), `category === 'drums'`.
- Produces: `MODULE_REGISTRY[4]` = `{ id:4, name:'Drummer', type:'sampler', color:'#ff6b6b', paramLabel:'Loop', getParamT(angle), getLoopIndex(angle), getName(angle) }`. `getLoopIndex` returns an index into `LOOP_BANK` whose entry is `category:'drums'`.

- [ ] **Step 1: Rewrite the test file**

Replace the entire contents of `src/tests/moduleRegistry.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');

// Stub the Tone globals the registry closes over (makeNode is never called here).
global.Tone = {
  Filter: function () {}, FeedbackDelay: function () {}, Reverb: function () {},
  Distortion: function () {}, Tremolo: function () { return { start() {} }; },
  BitCrusher: function () {},
};
const tonality = require('../utils/tonality.js');
global.tonality = tonality;
const MODULE_REGISTRY = require('../services/moduleRegistry.js');

test('registry has the modules with correct types', () => {
  assert.strictEqual(MODULE_REGISTRY[0].type, 'oscillator');
  assert.strictEqual(MODULE_REGISTRY[1].subtype, 'filter');
  assert.strictEqual(MODULE_REGISTRY[2].subtype, 'delay');
  assert.strictEqual(MODULE_REGISTRY[3].subtype, 'reverb');
  assert.strictEqual(MODULE_REGISTRY[4].type, 'sampler');   // Drummer is now a loop sampler
  assert.strictEqual(MODULE_REGISTRY[5].subtype, 'tonality');
  assert.strictEqual(MODULE_REGISTRY[6].type, 'chords');
  assert.strictEqual(MODULE_REGISTRY[7].type, 'sampler');   // Melody
  assert.strictEqual(MODULE_REGISTRY[8].subtype, 'tempo');
  assert.strictEqual(MODULE_REGISTRY[9].subtype, 'distortion');
  assert.strictEqual(MODULE_REGISTRY[16].type, 'bass');
  assert.strictEqual(MODULE_REGISTRY[20].type, 'sampler');  // Loop
});

test('calibration IDs are NOT in the registry', () => {
  for (const id of [10, 11, 13, 18]) {
    assert.strictEqual(MODULE_REGISTRY[id], undefined);
  }
});

test('getParamT is shared and bounded [0,1] at the rotation extremes', () => {
  for (const id of [0, 1, 2, 3]) {
    const def = MODULE_REGISTRY[id];
    assert.ok(def.getParamT(0) >= 0 && def.getParamT(0) <= 1);
    assert.ok(def.getParamT(Math.PI) >= 0 && def.getParamT(Math.PI) <= 1);
  }
});

test('Oscillator (id 0): getFreq maps rotation to C3..C6 range', () => {
  const osc = MODULE_REGISTRY[0];
  const lo = osc.getFreq(3 * Math.PI / 2); // saturates to t=0 -> C3
  const hi = osc.getFreq(Math.PI / 4);     // saturates to t=1 -> C6
  assert.ok(lo >= 130 && lo <= 135, `expected ~C3, got ${lo}`);
  assert.ok(hi >= 1040 && hi <= 1050, `expected ~C6, got ${hi}`);
});

test('Drummer (id 4): is a sampler that only selects drum-category loops', () => {
  const drum = MODULE_REGISTRY[4];
  const lb = require('../data/loopBank.js');
  assert.strictEqual(drum.type, 'sampler');
  // Across the rotation arc, every selected index must be a drum-category loop.
  for (const angle of [3 * Math.PI / 2, 0, Math.PI / 8, Math.PI / 4]) {
    const idx = drum.getLoopIndex(angle);
    assert.strictEqual(lb.LOOP_BANK[idx].category, 'drums', `angle ${angle} -> non-drum`);
  }
  // Extremes saturate to first/last drum loop; getName returns a non-empty label.
  assert.strictEqual(lb.LOOP_BANK[drum.getLoopIndex(3 * Math.PI / 2)].name, 'Ring');
  assert.strictEqual(lb.LOOP_BANK[drum.getLoopIndex(Math.PI / 4)].name, 'Drums');
  assert.ok(typeof drum.getName(0) === 'string' && drum.getName(0).length > 0);
});

test('Tempo (id 8): rotation maps to 70..160 BPM', () => {
  const tempo = MODULE_REGISTRY[8];
  assert.strictEqual(tempo.type, 'global');
  assert.strictEqual(tempo.subtype, 'tempo');
  assert.strictEqual(tempo.getBpm(3 * Math.PI / 2), 70);
  assert.strictEqual(tempo.getBpm(Math.PI / 4), 160);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/moduleRegistry.test.js
```
Expected: FAIL — `MODULE_REGISTRY[4].type` is currently `'drummer'`, not `'sampler'`; `getLoopIndex` not defined on ID 4.

- [ ] **Step 3: Convert ID 4 in the registry**

In `src/services/moduleRegistry.js`, replace the ID 4 block (currently lines ~55–69):

```js
  // ID 4: Drummer — rotation selects EDM groove preset
  4: {
    id: 4, name: 'Drummer', type: 'drummer', color: '#ff6b6b', paramLabel: 'Groove',
    getParamT(angle) { return _arcT(angle); },
    getGrooveIndex(angle) {
      const dg = (typeof require === 'function') ? require('../data/drumGrooves.js') : window.drumGrooves;
      const n = dg.DRUM_GROOVES.length;
      return Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)));
    },
    getName(angle) {
      const dg = (typeof require === 'function') ? require('../data/drumGrooves.js') : window.drumGrooves;
      const g = dg.DRUM_GROOVES[this.getGrooveIndex(angle)];
      return g ? g.name : '';
    },
  },
```

with:

```js
  // ID 4: Drummer — rotation selects a drum loop (category 'drums')
  4: {
    id: 4, name: 'Drummer', type: 'sampler', color: '#ff6b6b', paramLabel: 'Loop',
    getParamT(angle) { return _arcT(angle); },
    getLoopIndex(angle) {
      const lb = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
      const indices = lb.LOOP_BANK.map((e, i) => i).filter(i => lb.LOOP_BANK[i].category === 'drums');
      const n = indices.length;
      return indices[Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)))];
    },
    getName(angle) {
      const lb = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
      const e = lb.LOOP_BANK[this.getLoopIndex(angle)];
      return e ? e.name : '';
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/moduleRegistry.test.js
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd "E:/Antigravity/Projects/Reactable Wall" && git add src/services/moduleRegistry.js src/tests/moduleRegistry.test.js && git commit -m "feat: convert Drummer puck (id 4) to a drum-loop sampler"
```

---

### Task 4: Remove the synthesized-drum code from `audioEngine.js`

After Task 3 no module has `type === 'drummer'`, so the synth-drum path is dead. Remove it. Each edit below is an exact old→new replacement in `src/services/audioEngine.js`.

**Files:**
- Modify: `src/services/audioEngine.js`
- Test: `src/tests/browserLoad.test.js` (integration — must still pass; no edit in this task)

- [ ] **Step 1: Remove the `_drumGrooves` import (line ~20)**

Delete this line:
```js
const _drumGrooves = (typeof require === 'function') ? require('../data/drumGrooves.js') : window.drumGrooves;
```

- [ ] **Step 2: Remove `_makeDrums` (lines ~31–39)**

Delete the comment + function:
```js
// Build the three drum voices for a Drummer puck, mixed into one output node.
function _makeDrums() {
  const out = new Tone.Gain();
  const kick = new Tone.MembraneSynth({ octaves: 6, pitchDecay: 0.05, envelope: { attack: 0.001, decay: 0.4, sustain: 0 } });
  const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.18, sustain: 0 }, volume: -6 });
  const hat = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.06, release: 0.01 }, harmonicity: 5.1, modulationIndex: 32, resonance: 6000, octaves: 1.5, volume: -18 });
  kick.connect(out); snare.connect(out); hat.connect(out);
  return { out, kick, snare, hat };
}
```

- [ ] **Step 3: Drop kick/snare gathering in `_onStep` (lines ~110–136)**

Replace:
```js
  // --- Cross-modulation: gather this-step intent for all band pucks ---
  let _xm_kickFired = false, _xm_snareFired = false;
  let _xm_chordDeg = null, _xm_bassDeg = null, _xm_melodyDeg = null;
  let _xm_bassStepCount = 0;

  Object.values(activeModules).forEach(m => {
    if (m.def.type === 'drummer') {
      const groove = _drumGrooves.DRUM_GROOVES[m.presetIdx];
      if (groove) {
        if (groove.kick[_step]) _xm_kickFired = true;
        if (groove.snare[_step]) _xm_snareFired = true;
      }
    } else if (m.def.type === 'bass') {
```
with:
```js
  // --- Cross-modulation: gather this-step intent for all band pucks ---
  let _xm_chordDeg = null, _xm_bassDeg = null, _xm_melodyDeg = null;
  let _xm_bassStepCount = 0;

  Object.values(activeModules).forEach(m => {
    if (m.def.type === 'bass') {
```

- [ ] **Step 4: Remove the chord-change fill detection (lines ~138–145)**

Delete:
```js
  // Chord-change detection for fill trigger (Chords → Drums: chord change = fill)
  if (_xm_chordDeg !== null && _xm_chordDeg !== _modState.prevChordDeg) {
    const depth = _modDepth('chords', 'drummer');
    if (depth > 0) _modState.fillStepsRemaining = Math.round(4 * depth);
    _modState.prevChordDeg = _xm_chordDeg;
  }
  if (_modState.fillStepsRemaining > 0) _modState.fillStepsRemaining--;
  const _xm_inFill = _modState.fillStepsRemaining > 0;
```

- [ ] **Step 5: Remove the drummer self-play block (lines ~181–203)**

Delete the whole block:
```js
  // Drummer pucks play their own groove on every step (self-contained drum machine).
  Object.keys(activeModules).forEach(idStr => {
    const m = activeModules[idStr];
    if (!m || m.def.type !== 'drummer' || !m.drums) return;
    const groove = _drumGrooves.DRUM_GROOVES[m.presetIdx];
    if (!groove) return;
    if (groove.kick[_step])  { try { m.drums.kick.triggerAttackRelease('C1', '8n', time); } catch (_) {} }

    // Snare: normal groove + fill injection (Chords → Drums: chord change = fill)
    const snareHit = groove.snare[_step] || (_xm_inFill && _step % 4 === 2);
    if (snareHit) { try { m.drums.snare.triggerAttackRelease('16n', time); } catch (_) {} }

    // Hat: normal groove
    //   + melody-driven hat (Melody → Drums: each melody note gates a hat)
    //   + bass-density hat (Bass → Drums: busy bass adds extra hat probability)
    const extraHatChance = _modDepth('bass', 'drummer') * (_xm_bassStepCount / 16);
    const hatFromBass = Math.random() < extraHatChance;
    const hatFromMelody = _modDepth('lead', 'drummer') > 0 && _xm_melodyDeg != null;

    if (groove.hat[_step] || hatFromMelody || hatFromBass) {
      try { m.drums.hat.triggerAttackRelease('32n', time); } catch (_) {}
    }
  });
```

- [ ] **Step 6: Remove Drums→Bass velocity in the bass block (lines ~225–232)**

Replace:
```js
      // Drums → Bass: velocity boost on kick steps (lower on non-kick steps)
      const dDepth = _modDepth('drummer', 'bass');
      const vel = dDepth > 0 ? (_xm_kickFired ? 1.0 : Math.max(0.3, 1.0 - dDepth * 0.6)) : 1;

      try { m.node.triggerAttackRelease(
        _tonalityUtil.scaleDegreeFreq(BASS_BASE_FREQ, _root, deg + octShift),
        '8n', time, vel,
      ); } catch (_) {}
```
with:
```js
      try { m.node.triggerAttackRelease(
        _tonalityUtil.scaleDegreeFreq(BASS_BASE_FREQ, _root, deg + octShift),
        '8n', time,
      ); } catch (_) {}
```

- [ ] **Step 7: Remove Drums→Chords retrigger in the chords block (lines ~238–243)**

Replace:
```js
      // Drums → Chords: retrigger current chord on snare steps (even if not a chord step)
      if (d == null && _modDepth('drummer', 'chords') > 0 && _xm_snareFired
          && _modState.prevChordDeg != null) {
        d = _modState.prevChordDeg;
      }
      if (d == null) return;
```
with:
```js
      if (d == null) return;
```

- [ ] **Step 8: Remove Drums→Melody kick-gating in the lead block (lines ~272–274)**

Delete:
```js
      // Drums → Melody: kick gates melody — skip this step if kick didn't fire
      if (_modDepth('drummer', 'lead') > 0 && !_xm_kickFired
          && Math.random() < _modDepth('drummer', 'lead')) return;

```

- [ ] **Step 9: Remove the `drummer` branch in `_addModule` (lines ~372–377)**

Delete:
```js
  } else if (def.type === 'drummer') {
    presetIdx = def.getGrooveIndex(smoother.get());
    drums = _makeDrums();           // kick/snare/hat -> drums.out; _onStep triggers them
    node = drums.out;               // routing connects this to the center master
    meter = new Tone.Meter({ smoothing: 0.8 });
    node.connect(meter);
```
(The preceding `sampler` branch's closing `}` and the following `} else if (def.type === 'bass') {` now join up. ID 4, being `type:'sampler'`, is handled by the existing `sampler` branch.)

- [ ] **Step 10: Remove the now-unused `drums` state field**

Delete the declaration (line ~329):
```js
  let drums = null;
```
Delete the `drums,` line inside the `activeModules[id] = { ... }` object (line ~418):
```js
    drums,
```
In `_removeModule`, delete the drum disposal line (line ~433):
```js
  if (m.drums) { ['kick', 'snare', 'hat', 'out'].forEach(k => { try { m.drums[k].dispose(); } catch (_) {} }); }
```

- [ ] **Step 11: Run the integration suite to confirm nothing throws**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/browserLoad.test.js
```
Expected: PASS — all browser scripts load and the per-frame handler runs clean. (`drumGrooves.js` is still present and still listed in browserLoad's SCRIPTS at this point, so loading succeeds; it is removed in Task 5.)

- [ ] **Step 12: Commit**

```bash
cd "E:/Antigravity/Projects/Reactable Wall" && git add src/services/audioEngine.js && git commit -m "refactor: remove dead synthesized-drum code from audioEngine"
```

---

### Task 5: Trim modulation matrix + routing graph; delete `drumGrooves`

**Files:**
- Modify: `src/services/modulationMatrix.js`
- Test: `src/tests/modulationMatrix.test.js` (rewrite drummer-based cases)
- Modify: `src/services/routingGraph.js`
- Delete: `src/data/drumGrooves.js`, `src/tests/drumGrooves.test.js`
- Modify: `src/tests/browserLoad.test.js` (drop `drumGrooves.js` from SCRIPTS)

**Interfaces:**
- Produces: `modulationMatrix.VALID_PAIRS` = the 6 `bass`/`chords`/`lead` pairs; `BAND_TYPES` = `{bass, chords, lead}`.

- [ ] **Step 1: Rewrite the modulation tests to drop drummer**

Replace the drummer-based tests in `src/tests/modulationMatrix.test.js`. Replace the test `'returns depth > 0 when drummer and bass are within threshold'` through the end of `'generates both directions for a pair'` (the four tests using `drummer`/`bass` fixtures, lines ~20–60) with:

```js
test('returns depth > 0 when two band pucks are within threshold', () => {
  // threshold = 0.32 * 1920 = 614.4px; pucks 100px apart < threshold
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 100, wy: 100 },
    { def: { type: 'chords', color: '#00f' }, wx: 200, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(result.has('bass:chords'), 'expected bass:chords key');
  const mod = result.get('bass:chords');
  assert.ok(mod.depth > 0 && mod.depth <= 1, `depth should be (0,1], got ${mod.depth}`);
});

test('returns depth = 1 at zero distance', () => {
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 100, wy: 100 },
    { def: { type: 'chords', color: '#00f' }, wx: 100, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.strictEqual(result.get('bass:chords').depth, 1);
});

test('returns nothing when pucks beyond threshold', () => {
  // 0.32 * 1920 = 614.4px; 800px > threshold
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 0, wy: 100 },
    { def: { type: 'chords', color: '#00f' }, wx: 800, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(!result.has('bass:chords'), 'should not have bass:chords beyond threshold');
});

test('generates both directions for a pair', () => {
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 100, wy: 100 },
    { def: { type: 'chords', color: '#00f' }, wx: 200, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(result.has('bass:chords'), 'bass:chords missing');
  assert.ok(result.has('chords:bass'), 'chords:bass missing');
});
```

Then replace the `getEdges` fixture (test `'getEdges returns correct structure'`, lines ~62–78) — change every `drummer`/`bass` to `bass`/`chords`:

```js
test('getEdges returns correct structure', () => {
  const modulations = new Map([
    ['bass:chords', {
      depth: 0.7,
      srcType: 'bass', dstType: 'chords',
      srcPos: { wx: 100, wy: 200 }, dstPos: { wx: 300, wy: 400 },
      srcColor: '#0f0', dstColor: '#00f',
    }],
  ]);
  const edges = modulationMatrix.getEdges(modulations);
  assert.strictEqual(edges.length, 1);
  assert.strictEqual(edges[0].kind, 'modulation');
  assert.strictEqual(edges[0].depth, 0.7);
  assert.deepStrictEqual(edges[0].fromPos, { x: 100, y: 200 });
  assert.deepStrictEqual(edges[0].toPos, { x: 300, y: 400 });
  assert.strictEqual(edges[0].srcColor, '#0f0');
});
```

Finally replace the `'all 12 valid pair keys are recognized'` test (lines ~80–88) with:

```js
test('all 6 valid pair keys are recognized (no drummer)', () => {
  const types = ['bass', 'chords', 'lead'];
  const allValid = modulationMatrix.VALID_PAIRS;
  let count = 0;
  types.forEach(src => types.forEach(dst => {
    if (src !== dst) { assert.ok(allValid.has(`${src}:${dst}`), `missing pair ${src}:${dst}`); count++; }
  }));
  assert.strictEqual(count, 6);
  assert.strictEqual(allValid.size, 6, 'no drummer pairs should remain');
});
```

- [ ] **Step 2: Run modulation tests to verify they fail**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/modulationMatrix.test.js
```
Expected: FAIL — `VALID_PAIRS.size` is still 12 and still contains drummer pairs.

- [ ] **Step 3: Remove drummer from the modulation matrix**

In `src/services/modulationMatrix.js`, replace:
```js
const VALID_PAIRS = new Set([
  'drummer:bass',   'drummer:chords', 'drummer:lead',
  'bass:drummer',   'bass:chords',    'bass:lead',
  'chords:drummer', 'chords:bass',    'chords:lead',
  'lead:drummer',   'lead:bass',      'lead:chords',
]);

const BAND_TYPES = new Set(['drummer', 'bass', 'chords', 'lead']);
```
with:
```js
const VALID_PAIRS = new Set([
  'bass:chords',  'bass:lead',
  'chords:bass',  'chords:lead',
  'lead:bass',    'lead:chords',
]);

const BAND_TYPES = new Set(['bass', 'chords', 'lead']);
```

- [ ] **Step 4: Run modulation tests to verify they pass**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/modulationMatrix.test.js
```
Expected: PASS.

- [ ] **Step 5: Remove the redundant drummer clause in routingGraph**

In `src/services/routingGraph.js`, replace:
```js
  const gens = modules.filter(m =>
    m.def.type === 'oscillator' || m.def.type === 'sampler' ||
    m.def.type === 'drummer'   || m.def.type === 'bass'    ||
    m.def.type === 'chords'    || m.def.type === 'lead');
```
with:
```js
  const gens = modules.filter(m =>
    m.def.type === 'oscillator' || m.def.type === 'sampler' ||
    m.def.type === 'bass'      || m.def.type === 'chords'  ||
    m.def.type === 'lead');
```

- [ ] **Step 6: Delete `drumGrooves` data + test, and drop it from browserLoad**

Delete the files:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && git rm src/data/drumGrooves.js src/tests/drumGrooves.test.js
```
In `src/tests/browserLoad.test.js`, remove this line from the `SCRIPTS` array:
```js
  'src/data/drumGrooves.js',
```

- [ ] **Step 7: Run the full suite — must be green**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && npm test 2>&1 | tail -8
```
Expected: `# fail 0`, all tests passing.

- [ ] **Step 8: Commit**

```bash
cd "E:/Antigravity/Projects/Reactable Wall" && git add -A src/services/modulationMatrix.js src/tests/modulationMatrix.test.js src/services/routingGraph.js src/tests/browserLoad.test.js && git commit -m "refactor: drop drummer from modulation matrix/routing; delete drumGrooves"
```

---

### Task 6: Manual QA in the browser

**Files:** none (verification only).

- [ ] **Step 1: Serve over HTTP**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && npm start
```
Open `http://localhost:8080/` in the browser (NOT the `file://` page).

- [ ] **Step 2: Confirm loops load**

In the console, expect `[audio] loops loaded: N / N` (no `Loop puck DISABLED` warning). After a click to start audio, placing a Drummer puck (ID 4) should play a drum loop; rotating it should cycle through all 10 drum loops (`Ring`…`Drums`).

- [ ] **Step 3: Confirm tempo lock + Tempo puck**

Place a Melody puck and a Drummer puck together — they should sound locked at 128. Add a Tempo puck (ID 8) and rotate it: both the drummer and melody should speed up / slow down together.

- [ ] **Step 4: Listen to the stretched loops**

Audition each converted loop, especially the large stretches (`Trade Off` 98→128, `Gemstone` 150→128, `Hard EDM` 155→128, `Pyramid` 156→128). If any sounds badly smeared, remove its entry from `LOOP_BANK` in `src/data/loopBank.js` and adjust the count assertions in `src/tests/loopBank.test.js`, then re-run `npm test` and commit.

---

## Self-Review

**Spec coverage:**
- Offline 128 conversion (rubberband, pitch-preserved) → Task 1. ✓
- Bank: all 128, 10 drums + 8 melody, `loops/_128/` paths → Task 2. ✓
- Drummer puck → drum-category sampler → Task 3. ✓
- Tempo puck stays as global control (no resolver; existing `_applyLoopRates` path) → no code change needed; verified in Task 6. ✓
- Remove synth-drum code (`_makeDrums`, `_onStep` block, cross-mod refs, `_addModule` branch, `drums` state, `_drumGrooves` import) → Task 4. ✓
- Modulation matrix drummer removal; routingGraph clause; delete `drumGrooves.js`; browserLoad SCRIPTS → Task 5. ✓
- Tests: loopBank, registry drum selection, modulation reduced pairs, delete drumGrooves test, browserLoad → Tasks 2,3,5. ✓
- QA / listen-and-drop → Task 6. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete old→new content or full files. ✓

**Type consistency:** `getLoopIndex`/`getName`/`getParamT` names match between Task 3 registry and its test and the existing `sampler` handling in `audioEngine` (`def.getLoopIndex`). `category` values `'drums'`/`'melody'` consistent across loopBank, registry, tests. `VALID_PAIRS`/`BAND_TYPES` reduced set consistent between matrix and its test. ✓

**Note on the Tempo puck:** the spec's "Tempo puck stays as the global control" requires no new audioEngine code — the existing `_updateModule` tempo branch (`Tone.Transport.bpm.rampTo` + `_applyLoopRates`) already re-rates all samplers, and the drummer is now a sampler. Task 6 verifies this behavior end-to-end.
