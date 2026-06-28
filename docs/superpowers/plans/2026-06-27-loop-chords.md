# Loop-based Chords Puck — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the synthesized Tone.js Chords puck (ID 6) with real chord WAV loops pre-baked to 128 BPM, locked to the global Transport via the existing Tempo puck.

**Architecture:** The 5 chord loops are already D# Minor, so they only need a pitch-preserved time-stretch to 128 (via the existing `scripts/convert-loops-128.mjs`, extended to scan `loops/Chords/`). ID 6 becomes a `sampler` cycling chord-category loops, flowing through the existing sampler playback + `_applyLoopRates` path. All synth-chords code and chord cross-modulation are removed. Same shape as the shipped drummer feature.

**Tech Stack:** Vanilla JS (CommonJS + browser globals), Tone.js, Node `node:test`, ffmpeg `rubberband` (Node 22 ESM script).

## Global Constraints

- Loop assets live under `loops/` and are **untracked** in git — do NOT `git add loops/`. Commit only code/scripts/tests.
- Chord loops are pre-baked to 128 and served from `loops/_128/Chords/`; bank `bpm` is 128 for all.
- Chord loops are already **D# Minor** — pitch is NOT shifted, only tempo.
- Test runner: `npm test` (`node --test`).
- After this work the full suite must be green (0 failures).
- `'lead'` band code (`melodyLines.js`, `type:'lead'` branches, lead modulation pairs) is pre-existing orphaned debt — do NOT touch it; only `chords` is removed here.

---

### Task 1: Convert chord loops + add to bank

**Files:**
- Modify: `scripts/convert-loops-128.mjs` (add `loops/Chords` to SRC_DIRS)
- Generates (untracked): `loops/_128/Chords/*.wav` (5)
- Modify: `src/data/loopBank.js` (add 5 chord entries)
- Test: `src/tests/loopBank.test.js`

**Interfaces:**
- Produces: `loopBank.LOOP_BANK` gains 5 `{ name, file, bpm: 128, category: 'chords' }` entries under `loops/_128/Chords/`. 23 total (10 drums, 8 melody, 5 chords).

- [ ] **Step 1: Add the Chords dir to the converter**

In `scripts/convert-loops-128.mjs`, replace:
```js
const SRC_DIRS = ['loops/Melody', 'loops/drummer'];
```
with:
```js
const SRC_DIRS = ['loops/Melody', 'loops/drummer', 'loops/Chords'];
```

- [ ] **Step 2: Run the converter**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node scripts/convert-loops-128.mjs 2>&1 | tail -3
```
Expected: ends with `[convert] done: 27 loops -> loops/_128/` (22 existing re-converted + 5 chords).

- [ ] **Step 3: Verify the 5 chord outputs exist**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && ls -1 "loops/_128/Chords" | wc -l
```
Expected: `5`.

- [ ] **Step 4: Update the failing test**

In `src/tests/loopBank.test.js`, replace the well-formedness category assertion line:
```js
    assert.ok(e.category === 'drums' || e.category === 'melody', `category: ${e.category}`);
```
with:
```js
    assert.ok(['drums', 'melody', 'chords'].includes(e.category), `category: ${e.category}`);
```
and replace the count test:
```js
test('LOOP_BANK: 10 drum loops and 8 melody loops', () => {
  const drums = loopBank.LOOP_BANK.filter(e => e.category === 'drums');
  const melody = loopBank.LOOP_BANK.filter(e => e.category === 'melody');
  assert.strictEqual(drums.length, 10, 'drum count');
  assert.strictEqual(melody.length, 8, 'melody count');
});
```
with:
```js
test('LOOP_BANK: 10 drum, 8 melody, 5 chord loops', () => {
  const by = (c) => loopBank.LOOP_BANK.filter(e => e.category === c).length;
  assert.strictEqual(by('drums'), 10, 'drum count');
  assert.strictEqual(by('melody'), 8, 'melody count');
  assert.strictEqual(by('chords'), 5, 'chord count');
});
```

- [ ] **Step 5: Run test to verify it fails**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/loopBank.test.js
```
Expected: FAIL — chord count is 0, not 5.

- [ ] **Step 6: Add the chord entries to the bank**

In `src/data/loopBank.js`, after the last melody entry (the `'Razor'` line) and before the closing `];`, add:
```js
  // --- Chord loops (category 'chords', all D# Minor) ---
  { name: 'Phrog',       file: 'loops/_128/Chords/looperman-l-2212484-0214543-phrog-progressive-house-chords- 128 BPM.wav', bpm: 128, category: 'chords' },
  { name: 'Short Synth', file: 'loops/_128/Chords/looperman-l-5903669-0385270-short-synth-loop- 95 BPM.wav',                bpm: 128, category: 'chords' },
  { name: 'Psy Chorus',  file: 'loops/_128/Chords/looperman-l-6413071-0415019-je-8086-psy-chorus- 138 BPM.wav',            bpm: 128, category: 'chords' },
  { name: 'Reese',       file: 'loops/_128/Chords/looperman-l-7722845-0426217-reese-with-big-r - 134 BPM.wav',             bpm: 128, category: 'chords' },
  { name: 'Epic Synth',  file: 'loops/_128/Chords/looperman-l-7722845-0426218-epic-synth - 134 BPM.wav',                   bpm: 128, category: 'chords' },
```
(Keep filenames EXACTLY as on disk, including the irregular spacing before each `BPM`.)

- [ ] **Step 7: Run test to verify it passes**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/loopBank.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
cd "E:/Antigravity/Projects/Reactable Wall" && git add scripts/convert-loops-128.mjs src/data/loopBank.js src/tests/loopBank.test.js && git commit -m "feat: add 5 chord loops (pre-baked 128, D# Min) to the loop bank"
```

---

### Task 2: Chords puck (ID 6) → chord-loop sampler

**Files:**
- Modify: `src/services/moduleRegistry.js` (ID 6 definition)
- Test: `src/tests/moduleRegistry.test.js`

**Interfaces:**
- Produces: `MODULE_REGISTRY[6]` = `{ id:6, name:'Chords', type:'sampler', color:'#ffaa44', paramLabel:'Loop', getParamT, getLoopIndex, getName }`; `getLoopIndex` returns a full-bank index whose entry is `category:'chords'`.

- [ ] **Step 1: Update the test**

In `src/tests/moduleRegistry.test.js`, in the `'registry has the modules with correct types'` test, change:
```js
  assert.strictEqual(MODULE_REGISTRY[6].type, 'chords');
```
to:
```js
  assert.strictEqual(MODULE_REGISTRY[6].type, 'sampler');
```
Then add a new test mirroring the Drummer one (place it after the Drummer test):
```js
test('Chords (id 6): is a sampler that only selects chord-category loops', () => {
  const ch = MODULE_REGISTRY[6];
  const lb = require('../data/loopBank.js');
  assert.strictEqual(ch.type, 'sampler');
  for (const angle of [3 * Math.PI / 2, 0, Math.PI / 8, Math.PI / 4]) {
    const idx = ch.getLoopIndex(angle);
    assert.strictEqual(lb.LOOP_BANK[idx].category, 'chords', `angle ${angle} -> non-chord`);
  }
  assert.strictEqual(lb.LOOP_BANK[ch.getLoopIndex(3 * Math.PI / 2)].name, 'Phrog');
  assert.strictEqual(lb.LOOP_BANK[ch.getLoopIndex(Math.PI / 4)].name, 'Epic Synth');
  assert.ok(typeof ch.getName(0) === 'string' && ch.getName(0).length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/moduleRegistry.test.js
```
Expected: FAIL — `MODULE_REGISTRY[6].type` is `'chords'`, not `'sampler'`; `getLoopIndex` not defined on ID 6.

- [ ] **Step 3: Convert ID 6 in the registry**

In `src/services/moduleRegistry.js`, replace the ID 6 block:
```js
  // ID 6: Chords — rotation selects EDM chord progression preset
  6: {
    id: 6, name: 'Chords', type: 'chords', color: '#ffaa44', paramLabel: 'Prog',
    getParamT(angle) { return _arcT(angle); },
    getProgIndex(angle) {
      const cp = (typeof require === 'function') ? require('../data/chordProgressions.js') : window.chordProgressions;
      const n = cp.CHORD_PROGRESSIONS.length;
      return Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)));
    },
    getName(angle) {
      const cp = (typeof require === 'function') ? require('../data/chordProgressions.js') : window.chordProgressions;
      const p = cp.CHORD_PROGRESSIONS[this.getProgIndex(angle)];
      return p ? p.name : '';
    },
  },
```
with:
```js
  // ID 6: Chords — rotation selects a chord loop (category 'chords')
  6: {
    id: 6, name: 'Chords', type: 'sampler', color: '#ffaa44', paramLabel: 'Loop',
    getParamT(angle) { return _arcT(angle); },
    getLoopIndex(angle) {
      const lb = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
      const indices = lb.LOOP_BANK.map((e, i) => i).filter(i => lb.LOOP_BANK[i].category === 'chords');
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
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "E:/Antigravity/Projects/Reactable Wall" && git add src/services/moduleRegistry.js src/tests/moduleRegistry.test.js && git commit -m "feat: convert Chords puck (id 6) to a chord-loop sampler"
```

---

### Task 3: Remove the synth-chords code from `audioEngine.js`

After Task 2 no module is `type === 'chords'`, so the synth-chords path is dead. Each step is an exact old→new replacement in `src/services/audioEngine.js`. If any block does not match, STOP and report NEEDS_CONTEXT.

- [ ] **Step 1: Remove the `_chordProgs` import**

Delete the line:
```js
const _chordProgs = (typeof require === 'function') ? require('../data/chordProgressions.js') : window.chordProgressions;
```

- [ ] **Step 2: Remove the `CHORD_BASE_FREQ` constant**

Delete the line:
```js
const CHORD_BASE_FREQ = 261.63;  // C4 anchor for the chord pad
```

- [ ] **Step 3: Trim the cross-mod gather declarations**

Replace:
```js
  let _xm_chordDeg = null, _xm_bassDeg = null, _xm_melodyDeg = null;
  let _xm_bassStepCount = 0;
```
with:
```js
  let _xm_bassDeg = null, _xm_melodyDeg = null;
```
(`_xm_chordDeg` is removed with chords; `_xm_bassStepCount` is already dead — its only consumer was the removed drummer hat.)

- [ ] **Step 4: Remove the chords branch + dead bassStepCount from the gather loop**

Replace:
```js
    if (m.def.type === 'bass') {
      const line = _bassLines.BASS_LINES[m.presetIdx];
      const d = line && line.steps[_step];
      if (d != null) _xm_bassDeg = d;
      if (line) _xm_bassStepCount = line.steps.filter(s => s != null).length;
    } else if (m.def.type === 'chords') {
      const prog = _chordProgs.CHORD_PROGRESSIONS[m.presetIdx];
      const d = prog && prog.steps[_step];
      if (d != null) _xm_chordDeg = d;
    } else if (m.def.type === 'lead') {
```
with:
```js
    if (m.def.type === 'bass') {
      const line = _bassLines.BASS_LINES[m.presetIdx];
      const d = line && line.steps[_step];
      if (d != null) _xm_bassDeg = d;
    } else if (m.def.type === 'lead') {
```

- [ ] **Step 5: Update the self-play comment**

Replace:
```js
  // Bass + Chords pucks: self-play their selected preset each step, voiced in the Tonality key.
```
with:
```js
  // Bass + Lead pucks: self-play their selected preset each step, voiced in the Tonality key.
```

- [ ] **Step 6: Remove Chords→Bass gravity from the bass block**

Replace:
```js
      // Chords → Bass: chord root gravity — bias bass note toward chord root
      if (_modDepth('chords', 'bass') > 0 && _xm_chordDeg != null
          && Math.random() < _modDepth('chords', 'bass')) {
        deg = _xm_chordDeg;
      }

      // Melody → Bass: ascending melody lifts bass an octave
```
with:
```js
      // Melody → Bass: ascending melody lifts bass an octave
```

- [ ] **Step 7: Remove the entire chords self-play block**

Replace:
```js
    } else if (m.def.type === 'chords') {
      const prog = _chordProgs.CHORD_PROGRESSIONS[m.presetIdx];
      let d = prog && prog.steps[_step];

      if (d == null) return;

      // Bass → Chords: bass rotation spreads the top chord note upward
      let topDeg = d + 4;
      const bCDepth = _modDepth('bass', 'chords');
      if (bCDepth > 0) {
        const bm = Object.values(activeModules).find(x => x.def.type === 'bass');
        if (bm) {
          const bassT = bm.smoother.get() / (2 * Math.PI); // [0,1]
          topDeg += Math.round(bassT * bCDepth * 7);        // spread up to one extra octave
        }
      }

      // Melody → Chords: inversion that puts melody note on top
      if (_modDepth('lead', 'chords') > 0.5 && _xm_melodyDeg != null
          && _xm_melodyDeg > topDeg) {
        topDeg = topDeg + 7; // raise top note one octave to sit above melody
      }

      const freqs = [d, d + 2, topDeg].map(
        x => _tonalityUtil.scaleDegreeFreq(CHORD_BASE_FREQ, _root, x)
      );
      try { m.node.triggerAttackRelease(freqs, '2n', time); } catch (_) {}

    } else if (m.def.type === 'lead') {
```
with:
```js
    } else if (m.def.type === 'lead') {
```

- [ ] **Step 8: Remove Chords→Melody snap from the lead block**

Replace:
```js
      // Chords → Melody: snap to nearest chord tone
      if (_modDepth('chords', 'lead') > 0 && _xm_chordDeg != null
          && Math.random() < _modDepth('chords', 'lead')) {
        const tones = [_xm_chordDeg, _xm_chordDeg + 2, _xm_chordDeg + 4];
        deg = tones.reduce((best, t) =>
          Math.abs(t - deg) < Math.abs(best - deg) ? t : best, tones[0]
        );
      }

      try { m.node.triggerAttackRelease(
```
with:
```js
      try { m.node.triggerAttackRelease(
```

- [ ] **Step 9: Remove the chords branch in `_addModule`**

Replace:
```js
  } else if (def.type === 'chords') {
    presetIdx = def.getProgIndex(smoother.get());
    node = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.3, decay: 0.2, sustain: 0.7, release: 0.8 },
      volume: -16,
    });
    meter = new Tone.Meter({ smoothing: 0.8 });
    node.connect(meter);
  } else if (def.type === 'lead') {
```
with:
```js
  } else if (def.type === 'lead') {
```

- [ ] **Step 10: Remove the chords branch in `_updateModule`**

Replace:
```js
  } else if (m.def.type === 'chords') {
    m.presetIdx = m.def.getProgIndex(angle);
  } else if (m.def.type === 'lead') {
```
with:
```js
  } else if (m.def.type === 'lead') {
```

- [ ] **Step 11: Remove the orphaned `prevChordDeg` state**

Replace:
```js
const _modState = {
  prevChordDeg: null,                  // tracks chord changes for fill triggering
  melodyHistory: [],                   // last 3 melody degrees for contour detection
};
```
with:
```js
const _modState = {
  melodyHistory: [],                   // last 3 melody degrees for contour detection
};
```

- [ ] **Step 12: Run the integration test**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/browserLoad.test.js
```
Expected: PASS. (`chordProgressions.js` is still present and still in browserLoad's SCRIPTS at this point — that is expected; it is removed in Task 4.)

- [ ] **Step 13: Self-review grep + commit**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && grep -nE "_chordProgs|CHORD_BASE_FREQ|_xm_chordDeg|_xm_bassStepCount|prevChordDeg|def.type === 'chords'|getProgIndex" src/services/audioEngine.js || echo "clean"
```
Expected: `clean` (no matches).
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && git add src/services/audioEngine.js && git commit -m "refactor: remove dead synthesized-chords code from audioEngine"
```

---

### Task 4: Trim modulation matrix + routing graph; delete `chordProgressions`

**Files:**
- Modify: `src/services/modulationMatrix.js`, `src/tests/modulationMatrix.test.js`
- Modify: `src/services/routingGraph.js`
- Delete: `src/data/chordProgressions.js`, `src/tests/chordProgressions.test.js`
- Modify: `index.html`, `src/tests/browserLoad.test.js`

**Interfaces:**
- Produces: `modulationMatrix.VALID_PAIRS` = `{bass:lead, lead:bass}`; `BAND_TYPES` = `{bass, lead}`.

- [ ] **Step 1: Rewrite the modulation tests for the 2-pair set**

In `src/tests/modulationMatrix.test.js`, the bass/chords fixtures and the 6-pair test must become bass/lead and a 2-pair test. Replace the test `'returns depth > 0 when two band pucks are within threshold'` through `'generates both directions for a pair'` (the four `bass`/`chords` fixture tests) with:
```js
test('returns depth > 0 when two band pucks are within threshold', () => {
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 100, wy: 100 },
    { def: { type: 'lead', color: '#00f' }, wx: 200, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(result.has('bass:lead'), 'expected bass:lead key');
  const mod = result.get('bass:lead');
  assert.ok(mod.depth > 0 && mod.depth <= 1, `depth should be (0,1], got ${mod.depth}`);
});

test('returns depth = 1 at zero distance', () => {
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 100, wy: 100 },
    { def: { type: 'lead', color: '#00f' }, wx: 100, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.strictEqual(result.get('bass:lead').depth, 1);
});

test('returns nothing when pucks beyond threshold', () => {
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 0, wy: 100 },
    { def: { type: 'lead', color: '#00f' }, wx: 800, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(!result.has('bass:lead'), 'should not have bass:lead beyond threshold');
});

test('generates both directions for a pair', () => {
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 100, wy: 100 },
    { def: { type: 'lead', color: '#00f' }, wx: 200, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(result.has('bass:lead'), 'bass:lead missing');
  assert.ok(result.has('lead:bass'), 'lead:bass missing');
});
```
Then replace the `getEdges` fixture test — change its `bass`/`chords` to `bass`/`lead`:
```js
test('getEdges returns correct structure', () => {
  const modulations = new Map([
    ['bass:lead', {
      depth: 0.7,
      srcType: 'bass', dstType: 'lead',
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
Then replace the pair-count test (`'all 6 valid pair keys are recognized (no drummer)'`) with:
```js
test('only the 2 bass/lead pairs remain (no drummer, no chords)', () => {
  const types = ['bass', 'lead'];
  const allValid = modulationMatrix.VALID_PAIRS;
  let count = 0;
  types.forEach(src => types.forEach(dst => {
    if (src !== dst) { assert.ok(allValid.has(`${src}:${dst}`), `missing pair ${src}:${dst}`); count++; }
  }));
  assert.strictEqual(count, 2);
  assert.strictEqual(allValid.size, 2, 'no chords/drummer pairs should remain');
});
```

- [ ] **Step 2: Run modulation tests to verify they fail**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/modulationMatrix.test.js
```
Expected: FAIL — `VALID_PAIRS.size` is still 6 and still contains chords pairs.

- [ ] **Step 3: Remove chords from the modulation matrix**

In `src/services/modulationMatrix.js`, replace:
```js
const VALID_PAIRS = new Set([
  'bass:chords',  'bass:lead',
  'chords:bass',  'chords:lead',
  'lead:bass',    'lead:chords',
]);

const BAND_TYPES = new Set(['bass', 'chords', 'lead']);
```
with:
```js
const VALID_PAIRS = new Set([
  'bass:lead',
  'lead:bass',
]);

const BAND_TYPES = new Set(['bass', 'lead']);
```
Also fix the header comment at line 2: change `the 12 band-puck-pair relationships` to `the band-puck-pair relationships`, and on the `result.has(key)` line drop the stale `// one entry per pair (only one drummer, etc.)` parenthetical if present (make it `// one entry per pair`).

- [ ] **Step 4: Run modulation tests to verify they pass**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/modulationMatrix.test.js
```
Expected: PASS.

- [ ] **Step 5: Remove the chords clause in routingGraph**

In `src/services/routingGraph.js`, replace:
```js
  const gens = modules.filter(m =>
    m.def.type === 'oscillator' || m.def.type === 'sampler' ||
    m.def.type === 'bass'      || m.def.type === 'chords'  ||
    m.def.type === 'lead');
```
with:
```js
  const gens = modules.filter(m =>
    m.def.type === 'oscillator' || m.def.type === 'sampler' ||
    m.def.type === 'bass'      || m.def.type === 'lead');
```

- [ ] **Step 6: Delete chordProgressions files and drop from index.html + browserLoad**

```bash
cd "E:/Antigravity/Projects/Reactable Wall" && git rm src/data/chordProgressions.js src/tests/chordProgressions.test.js
```
In `index.html`, remove the line:
```html
  <script src="src/data/chordProgressions.js"></script>
```
In `src/tests/browserLoad.test.js`, remove from the `SCRIPTS` array:
```js
  'src/data/chordProgressions.js',
```

- [ ] **Step 7: Run the full suite — must be green**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && npm test 2>&1 | tail -6
```
Expected: `# fail 0`.

- [ ] **Step 8: Self-review grep + commit**

Run:
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && grep -rnE "chordProgressions|'chords'" index.html src/ || echo "clean"
```
Expected: only the loop-path substring `Chords` in `loopBank.js` paths — NO `chordProgressions` and NO `type === 'chords'` / `'chords'` band references.
```bash
cd "E:/Antigravity/Projects/Reactable Wall" && git add -A src/services/modulationMatrix.js src/tests/modulationMatrix.test.js src/services/routingGraph.js index.html src/tests/browserLoad.test.js && git commit -m "refactor: drop chords from modulation matrix/routing; delete chordProgressions"
```

---

### Task 5: Manual QA in the browser

**Files:** none (verification only).

- [ ] **Step 1: Serve over HTTP**

```bash
cd "E:/Antigravity/Projects/Reactable Wall" && npm start
```
Open `http://localhost:8080/` (NOT the `file://` page).

- [ ] **Step 2: Confirm chord loops play + cycle**

After a click to start audio, place a **Chords** puck (ID 6) — it should play a chord loop; rotating it cycles all 5 (`Phrog`…`Epic Synth`). Console shows `[audio] loops loaded: N / N`.

- [ ] **Step 3: Confirm tempo lock**

Place Chords + Melody + Drummer pucks — all locked at 128. Add a Tempo puck (ID 8) and rotate — all three scrub together.

- [ ] **Step 4: Audition the stretched chord loops**

`Short Synth` (95→128, +35%) is the big stretch; also check `Psy Chorus` (138→128). If any sounds badly smeared/detuned, remove its entry from `LOOP_BANK` and adjust the count assertion in `loopBank.test.js`, then re-run `npm test` and commit.

---

## Self-Review

**Spec coverage:** convert chord loops to 128 → Task 1; bank 5 chord entries → Task 1; ID 6 → sampler → Task 2; remove synth-chords + cross-mod → Task 3; matrix/routing trim + delete chordProgressions + index.html/browserLoad → Task 4; QA → Task 5. ✓

**Placeholder scan:** none — every code step has complete old→new content. ✓

**Type consistency:** `getLoopIndex`/`getName`/`getParamT` match the existing sampler handling; `category:'chords'` consistent across bank, registry, tests; `VALID_PAIRS`/`BAND_TYPES` reduced to bass/lead consistently in matrix + test. ✓

**Live-var check (Task 3):** after removal, `_xm_bassDeg` (bass→lead), `_xm_melodyDeg` (melodyHistory), `_xm_melodyAscending` (melody→bass) remain referenced; `_xm_chordDeg` and `_xm_bassStepCount` fully removed; `_modState.melodyHistory` kept, `prevChordDeg` removed. ✓
