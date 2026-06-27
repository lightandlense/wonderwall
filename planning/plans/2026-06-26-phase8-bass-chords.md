# Phase 8 — Bass + Chords Pucks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Oscillator (id 0) with a self-playing **Bass** puck and the Sequencer (id 6) with a self-playing **Chords/Pad** puck — both rotate-to-pick-a-preset generators that play in the Tonality key on the Transport clock.

**Architecture:** Two new preset-driven generators mirror the Drummer: pure data files hold the parts, `_addModule` builds a synth voice (MonoSynth bass / PolySynth pad), `_onStep` plays the selected preset each step using `scaleDegreeFreq` in the current key. Both route as generators (effects apply). The old Oscillator/Sequencer audio code is left dormant.

**Tech Stack:** Vanilla JS (no build step), Tone.js (`MonoSynth`, `PolySynth`, `Meter`, `Transport`), `node --test`.

## Global Constraints

- No build step — plain browser `<script>`; each data module sets `window.X` AND `module.exports`.
- Registry data lookups use **inline `require` inside methods** (not top-level const) to avoid shared-scope `const` collisions (the bug `browserLoad` caught in Phase 7).
- Notes come from `scaleDegreeFreq(baseFreq, root, degree)`; `root = (_tonality && _tonality.active) ? _tonality.root : DEFAULT_ROOT` where `DEFAULT_ROOT = 0`.
- `BASS_BASE_FREQ = 65.41` (C2), `CHORD_BASE_FREQ = 261.63` (C4).
- All preset generators (Drummer/Bass/Chords) store their selected index in a single field **`presetIdx`** (refactor the Drummer's `grooveIdx`).
- Tests run with `npm test` (= `node --test`) from `E:/Antigravity/Projects/Reactable Wall`.

---

## File Structure

- `src/data/bassLines.js` — **create**: `BASS_LINES` (preset basslines as scale-degree steps).
- `src/data/chordProgressions.js` — **create**: `CHORD_PROGRESSIONS` (root-degree steps).
- `src/services/moduleRegistry.js` — **modify**: id 0 → Bass, id 6 → Chords.
- `src/services/routingGraph.js:24` — **modify**: `bass`/`chords` count as generators.
- `src/services/audioEngine.js` — **modify**: constants, `grooveIdx`→`presetIdx`, Bass/Chords voices + `_onStep` + `_updateModule`.
- `src/components/visualEngine.js` — **modify**: ring name for `bass`/`chords`.
- `index.html`, `print.html` — **modify**: load data scripts; relabel markers 0 & 6.
- `src/tests/{bassLines,chordProgressions,moduleRegistry,routingGraph,browserLoad}.test.js` — **modify/create**.

---

## Task 1: Bass line data

**Files:**
- Create: `src/data/bassLines.js`, `src/tests/bassLines.test.js`
- Modify: `index.html`, `src/tests/browserLoad.test.js` (SCRIPTS)

**Interfaces:**
- Produces: `bassLines.BASS_LINES` — array of `{ name:string, steps:(number|null)[16] }`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/bassLines.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const bassLines = require('../data/bassLines.js');

test('BASS_LINES: each line is 16 steps of degree-or-null', () => {
  assert.ok(Array.isArray(bassLines.BASS_LINES) && bassLines.BASS_LINES.length >= 1);
  for (const l of bassLines.BASS_LINES) {
    assert.ok(typeof l.name === 'string' && l.name.length > 0);
    assert.strictEqual(l.steps.length, 16);
    assert.ok(l.steps.every(s => s === null || (Number.isInteger(s) && s >= 0)));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../data/bassLines.js'`.

- [ ] **Step 3: Create the data module**

Create `src/data/bassLines.js`:

```js
// src/data/bassLines.js
// Preset basslines for the Bass puck. Pure data. Each step is a scale DEGREE
// (0=root, 5=octave; scaleDegreeFreq handles octave wrap) or null (rest).
const N = null;
const BASS_LINES = [
  { name: 'Root Pulse',   steps: [0,N,N,N, 0,N,N,N, 0,N,N,N, 0,N,N,N] },
  { name: 'Driving 8ths', steps: [0,N,0,N, 0,N,0,N, 0,N,0,N, 0,N,0,N] },
  { name: 'Octave Bounce',steps: [0,N,5,N, 0,N,5,N, 0,N,5,N, 0,N,5,N] },
  { name: 'Walking',      steps: [0,N,1,N, 2,N,3,N, 4,N,3,N, 2,N,1,N] },
  { name: 'Funk',         steps: [0,N,N,0, N,N,2,N, 0,N,N,2, N,0,N,N] },
  { name: 'Offbeat',      steps: [N,N,0,N, N,N,0,N, N,N,0,N, N,N,0,N] },
  { name: 'Sub Hold',     steps: [0,N,N,N, N,N,N,N, 0,N,N,N, N,N,N,N] },
  { name: 'Riff',         steps: [0,N,2,3, N,2,N,0, 2,N,3,N, 2,N,0,N] },
];

const bassLines = { BASS_LINES };
if (typeof window !== 'undefined') window.bassLines = bassLines;
if (typeof module !== 'undefined') module.exports = bassLines;
```

- [ ] **Step 4: Wire it into load order**

In `index.html`, after `<script src="src/data/drumGrooves.js"></script>` add:

```html
  <script src="src/data/bassLines.js"></script>
```

In `src/tests/browserLoad.test.js`, in the `SCRIPTS` array after `'src/data/drumGrooves.js',` add:

```js
  'src/data/bassLines.js',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/bassLines.js src/tests/bassLines.test.js index.html src/tests/browserLoad.test.js
git commit -m "feat: bass line preset data"
```

---

## Task 2: Chord progression data

**Files:**
- Create: `src/data/chordProgressions.js`, `src/tests/chordProgressions.test.js`
- Modify: `index.html`, `src/tests/browserLoad.test.js` (SCRIPTS)

**Interfaces:**
- Produces: `chordProgressions.CHORD_PROGRESSIONS` — array of `{ name:string, steps:(number|null)[16] }`
  (each non-null step is the chord's root scale-degree; null = hold previous chord).

- [ ] **Step 1: Write the failing test**

Create `src/tests/chordProgressions.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const chordProgressions = require('../data/chordProgressions.js');

test('CHORD_PROGRESSIONS: each is 16 steps of degree-or-null with at least one chord', () => {
  assert.ok(Array.isArray(chordProgressions.CHORD_PROGRESSIONS) && chordProgressions.CHORD_PROGRESSIONS.length >= 1);
  for (const p of chordProgressions.CHORD_PROGRESSIONS) {
    assert.ok(typeof p.name === 'string' && p.name.length > 0);
    assert.strictEqual(p.steps.length, 16);
    assert.ok(p.steps.every(s => s === null || (Number.isInteger(s) && s >= 0)));
    assert.ok(p.steps.some(s => s !== null), `${p.name} should have at least one chord`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../data/chordProgressions.js'`.

- [ ] **Step 3: Create the data module**

Create `src/data/chordProgressions.js`:

```js
// src/data/chordProgressions.js
// Preset chord progressions for the Chords/Pad puck. Pure data. Each non-null step is the
// chord's ROOT scale-degree; the voice stacks [d, d+2, d+4]. null = hold the previous chord.
const N = null;
const CHORD_PROGRESSIONS = [
  { name: 'Pop',       steps: [0,N,N,N, 4,N,N,N, 2,N,N,N, 3,N,N,N] },
  { name: 'Sustained', steps: [0,N,N,N, N,N,N,N, 3,N,N,N, N,N,N,N] },
  { name: 'Minor Walk',steps: [0,N,N,N, 1,N,N,N, 2,N,N,N, 1,N,N,N] },
  { name: 'Two-Chord', steps: [0,N,N,N, N,N,N,N, 2,N,N,N, N,N,N,N] },
  { name: 'Climb',     steps: [0,N,N,N, 2,N,N,N, 4,N,N,N, 3,N,N,N] },
  { name: 'Drone',     steps: [0,N,N,N, N,N,N,N, N,N,N,N, N,N,N,N] },
];

const chordProgressions = { CHORD_PROGRESSIONS };
if (typeof window !== 'undefined') window.chordProgressions = chordProgressions;
if (typeof module !== 'undefined') module.exports = chordProgressions;
```

- [ ] **Step 4: Wire it into load order**

In `index.html`, after `<script src="src/data/bassLines.js"></script>` add:

```html
  <script src="src/data/chordProgressions.js"></script>
```

In `src/tests/browserLoad.test.js` `SCRIPTS`, after `'src/data/bassLines.js',` add:

```js
  'src/data/chordProgressions.js',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/chordProgressions.js src/tests/chordProgressions.test.js index.html src/tests/browserLoad.test.js
git commit -m "feat: chord progression preset data"
```

---

## Task 3: Registry — Bass (id 0) + Chords (id 6)

**Files:**
- Modify: `src/services/moduleRegistry.js`
- Test: `src/tests/moduleRegistry.test.js`

**Interfaces:**
- Consumes: `bassLines.BASS_LINES`, `chordProgressions.CHORD_PROGRESSIONS`; existing `_arcT`.
- Produces: `MODULE_REGISTRY[0]` (`type:'bass'`, `getLineIndex`, `getName`); `MODULE_REGISTRY[6]`
  (`type:'chords'`, `getProgIndex`, `getName`).

- [ ] **Step 1: Write the failing test**

Append to `src/tests/moduleRegistry.test.js`:

```js
test('Bass (id 0): rotation selects a bassline; type bass', () => {
  const bass = MODULE_REGISTRY[0];
  assert.strictEqual(bass.type, 'bass');
  const n = require('../data/bassLines.js').BASS_LINES.length;
  assert.strictEqual(bass.getLineIndex(3 * Math.PI / 2), 0);   // arc min -> first
  assert.strictEqual(bass.getLineIndex(Math.PI / 4), n - 1);   // arc max -> last
  assert.strictEqual(typeof bass.getName(3 * Math.PI / 2), 'string');
});

test('Chords (id 6): rotation selects a progression; type chords', () => {
  const ch = MODULE_REGISTRY[6];
  assert.strictEqual(ch.type, 'chords');
  const n = require('../data/chordProgressions.js').CHORD_PROGRESSIONS.length;
  assert.strictEqual(ch.getProgIndex(3 * Math.PI / 2), 0);
  assert.strictEqual(ch.getProgIndex(Math.PI / 4), n - 1);
  assert.strictEqual(typeof ch.getName(3 * Math.PI / 2), 'string');
});
```

(There may be existing id-0 oscillator / id-6 sequencer tests in this file that assert the old
types/methods — delete or update those, since id 0 and id 6 are being replaced.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `bass.type` is `'oscillator'` (or method undefined).

- [ ] **Step 3: Implement — replace the id 0 and id 6 entries**

In `src/services/moduleRegistry.js`, replace the **id 0** entry with:

```js
  // ID 0: Bass — self-playing bassline generator; rotation picks the line, key from Tonality.
  // (Replaced the Oscillator; oscillator audio code left dormant.)
  0: {
    id: 0, name: 'Bass', type: 'bass', color: '#4d7cff', paramLabel: 'Line',
    getParamT(angle) { return _arcT(angle); },
    getLineIndex(angle) {
      const bl = (typeof require === 'function') ? require('../data/bassLines.js') : window.bassLines;
      const n = bl.BASS_LINES.length;
      return Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)));
    },
    getName(angle) {
      const bl = (typeof require === 'function') ? require('../data/bassLines.js') : window.bassLines;
      return bl.BASS_LINES[this.getLineIndex(angle)].name;
    },
  },
```

Replace the **id 6** entry with:

```js
  // ID 6: Chords — self-playing chord-pad generator; rotation picks the progression, key from Tonality.
  // (Replaced the Sequencer; sequencer audio code left dormant.)
  6: {
    id: 6, name: 'Chords', type: 'chords', color: '#c9a7ff', paramLabel: 'Chords',
    getParamT(angle) { return _arcT(angle); },
    getProgIndex(angle) {
      const cp = (typeof require === 'function') ? require('../data/chordProgressions.js') : window.chordProgressions;
      const n = cp.CHORD_PROGRESSIONS.length;
      return Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)));
    },
    getName(angle) {
      const cp = (typeof require === 'function') ? require('../data/chordProgressions.js') : window.chordProgressions;
      return cp.CHORD_PROGRESSIONS[this.getProgIndex(angle)].name;
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (Bass/Chords registry tests; browserLoad still loads).

- [ ] **Step 5: Commit**

```bash
git add src/services/moduleRegistry.js src/tests/moduleRegistry.test.js
git commit -m "feat: Bass (id0) + Chords (id6) module definitions"
```

---

## Task 4: Routing — Bass + Chords are generators

**Files:**
- Modify: `src/services/routingGraph.js:24`
- Test: `src/tests/routingGraph.test.js`

**Interfaces:**
- Produces: chains starting from `bass` / `chords` modules (reach `master`, effects insert).

- [ ] **Step 1: Write the failing test**

Append to `src/tests/routingGraph.test.js`:

```js
const bass = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'bass' } });
const chords = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'chords' } });

test('buildRawPlan: bass and chords are generators (chain to master)', () => {
  const pb = routingGraph.buildRawPlan([bass(0, 480, 480)], VP, new Set());
  assert.deepStrictEqual(pb.chains[0].nodeIds, [0, 'master']);
  const pc = routingGraph.buildRawPlan([chords(6, 480, 480)], VP, new Set());
  assert.deepStrictEqual(pc.chains[0].nodeIds, [6, 'master']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `pb.chains[0]` is undefined (bass not a generator).

- [ ] **Step 3: Implement**

In `src/services/routingGraph.js` line 24, widen the generator filter:

```js
  const gens = modules.filter(m => m.def.type === 'oscillator' || m.def.type === 'sampler' || m.def.type === 'drummer' || m.def.type === 'bass' || m.def.type === 'chords');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/routingGraph.js src/tests/routingGraph.test.js
git commit -m "feat: route bass + chords as generators"
```

---

## Task 5: Audio — Bass + Chords voices, presetIdx, playback

**Files:**
- Modify: `src/services/audioEngine.js`
- Test: `src/tests/browserLoad.test.js`

**Interfaces:**
- Consumes: `bassLines.BASS_LINES`, `chordProgressions.CHORD_PROGRESSIONS`, `_tonalityUtil.scaleDegreeFreq`.
- Produces: Bass/Chords pucks play their presets each step; both expose `getModuleLevel`.

- [ ] **Step 1: Extend the Tone stub + write the failing test**

In `src/tests/browserLoad.test.js` `makeSandbox()`, add two synth classes next to the drum classes:

```js
  class MonoSynth extends Node { constructor() { super(); synths.push(this); } triggerAttackRelease() {} }
  class PolySynth extends Node { constructor() { super(); synths.push(this); } triggerAttackRelease() {} }
```

and add them to the `sandbox.Tone = { ... }` registration list (alongside `MembraneSynth` etc.):
`Synth, ..., MembraneSynth, NoiseSynth, MetalSynth, MonoSynth, PolySynth,`.

Then add a test at the end of the file:

```js
test('Bass + Chords pucks play through master; rotate clean; tonality optional', async () => {
  const ctx = makeSandbox();
  loadAll(ctx);
  const fakeCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 1280, height: 720 } : k === 'createLinearGradient' ? (() => ({ addColorStop() {} })) : () => {}) });
  ctx.__fakeCtx = fakeCtx;
  vm.runInContext('visualEngine.init({getContext:()=>window.__fakeCtx},{getContext:()=>window.__fakeCtx})', ctx);
  vm.runInContext(`window.onMarkersDetected = function (d) {
    reconcileModules(d); const a = getActiveModules();
    const p = routingGraph.update(a, { w: 1280, h: 720 }); applyRoutingPlan(p);
    updateModulation();
    const edges = routingGraph.getEdges(p, a, { w: 1280, h: 720 });
    visualEngine.draw(d, edges);
  };`, ctx);
  await vm.runInContext('initAudio()', ctx);

  const bass = { id: 0, wx: 200, wy: 200, angle: 0, screenCorners: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] };
  const chords = { id: 6, wx: 300, wy: 300, angle: 0, screenCorners: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] };
  const ton = { id: 5, wx: 900, wy: 200, angle: 0, screenCorners: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] };

  for (let i = 0; i < 6; i++) ctx.onMarkersDetected([bass, chords, ton]); // with tonality
  assert.ok(ctx.__synthReachesDest(), 'bass/chords should reach master');
  assert.strictEqual(vm.runInContext('typeof getModuleLevel(0)', ctx), 'number');
  assert.strictEqual(vm.runInContext('typeof getModuleLevel(6)', ctx), 'number');
  assert.doesNotThrow(() => {
    const bRot = { id: 0, wx: 200, wy: 200, angle: Math.PI / 4, screenCorners: bass.screenCorners };
    const cRot = { id: 6, wx: 300, wy: 300, angle: Math.PI / 4, screenCorners: chords.screenCorners };
    for (let i = 0; i < 4; i++) ctx.onMarkersDetected([bRot, cRot]);       // rotate, no tonality
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — bass/chords don't reach master (no `'bass'`/`'chords'` branch in `_addModule`).

- [ ] **Step 3: Implement in `src/services/audioEngine.js`**

(a) Top-of-file data refs (next to `_drumGrooves`):

```js
const _bassLines = (typeof require === 'function') ? require('../data/bassLines.js') : window.bassLines;
const _chordProgs = (typeof require === 'function') ? require('../data/chordProgressions.js') : window.chordProgressions;
const BASS_BASE_FREQ = 65.41;    // C2
const CHORD_BASE_FREQ = 261.63;  // C4
const DEFAULT_ROOT = 0;          // C, when no Tonality puck is present
```

(b) Refactor the Drummer's `grooveIdx` → `presetIdx`. In `_addModule`: change `let grooveIdx = 0;`
to `let presetIdx = 0;`, the drummer branch `grooveIdx = def.getGrooveIndex(...)` to
`presetIdx = def.getGrooveIndex(...)`, and the `activeModules[id]` literal field `grooveIdx,` to
`presetIdx,`. In `_updateModule` drummer branch change `m.grooveIdx = m.def.getGrooveIndex(angle);`
to `m.presetIdx = m.def.getGrooveIndex(angle);`. In `_onStep` change
`_drumGrooves.DRUM_GROOVES[m.grooveIdx]` to `_drumGrooves.DRUM_GROOVES[m.presetIdx]`.

(c) In `_addModule`, add `bass` and `chords` branches (after the `drummer` branch):

```js
  } else if (def.type === 'bass') {
    presetIdx = def.getLineIndex(smoother.get());
    node = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { type: 'lowpass', Q: 2 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.2 },
      filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2, baseFrequency: 80, octaves: 2.6 },
      volume: -10,
    });
    meter = new Tone.Meter({ smoothing: 0.8 });
    node.connect(meter);
  } else if (def.type === 'chords') {
    presetIdx = def.getProgIndex(smoother.get());
    node = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.3, decay: 0.2, sustain: 0.7, release: 0.8 },
      volume: -16,
    });
    meter = new Tone.Meter({ smoothing: 0.8 });
    node.connect(meter);
  } else if (def.type === 'controller') {
```

(The existing `else if (def.type === 'controller')` line stays — the new branches go before it.)

(d) In `_onStep`, after the Drummer block, add bass + chords playback:

```js
  // Bass + Chords pucks: self-play their selected preset each step, voiced in the Tonality key.
  const _root = (_tonality && _tonality.active) ? _tonality.root : DEFAULT_ROOT;
  Object.keys(activeModules).forEach(idStr => {
    const m = activeModules[idStr];
    if (!m || !m.node) return;
    if (m.def.type === 'bass') {
      const line = _bassLines.BASS_LINES[m.presetIdx];
      const deg = line && line.steps[_step];
      if (deg == null) return;
      try { m.node.triggerAttackRelease(_tonalityUtil.scaleDegreeFreq(BASS_BASE_FREQ, _root, deg), '8n', time); } catch (_) {}
    } else if (m.def.type === 'chords') {
      const prog = _chordProgs.CHORD_PROGRESSIONS[m.presetIdx];
      const d = prog && prog.steps[_step];
      if (d == null) return;
      const freqs = [d, d + 2, d + 4].map(x => _tonalityUtil.scaleDegreeFreq(CHORD_BASE_FREQ, _root, x));
      try { m.node.triggerAttackRelease(freqs, '2n', time); } catch (_) {}
    }
  });
```

(e) In `_updateModule`, add `bass`/`chords` selection branches (next to the `drummer` branch):

```js
  } else if (m.def.type === 'bass') {
    m.presetIdx = m.def.getLineIndex(angle);
  } else if (m.def.type === 'chords') {
    m.presetIdx = m.def.getProgIndex(angle);
```

(Removal needs no change: `_removeModule`'s generic `else if (m.node)` branch already stops/disposes,
and MonoSynth/PolySynth support `dispose()`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (Bass/Chords reach master + rotate clean; all existing tests still green, including the
Drummer test after the `presetIdx` rename).

- [ ] **Step 5: Commit**

```bash
git add src/services/audioEngine.js src/tests/browserLoad.test.js
git commit -m "feat: Bass (MonoSynth) + Chords (PolySynth) self-playing voices in key"
```

---

## Task 6: Visual names + marker relabels

**Files:**
- Modify: `src/components/visualEngine.js`, `print.html`
- Test: covered by `browserLoad` many-frames (no throw)

**Interfaces:**
- Consumes: `def.getName(angle)` for `bass`/`chords` (Task 3).

- [ ] **Step 1: Show the line/progression name under the ring**

In `src/components/visualEngine.js`, the "name under the ring" line currently reads:

```js
      const belowLabel = ((def.type === 'sampler' || def.type === 'drummer') && def.getName)
        ? `${def.paramLabel}: ${def.getName(angle)}`
        : `${def.paramLabel}: ${paramPct}%`;
```

Replace it with:

```js
      const belowLabel = ((def.type === 'sampler' || def.type === 'drummer' || def.type === 'bass' || def.type === 'chords') && def.getName)
        ? `${def.paramLabel}: ${def.getName(angle)}`
        : `${def.paramLabel}: ${paramPct}%`;
```

- [ ] **Step 2: Relabel markers 0 and 6 in `print.html`**

In `print.html`, in `PUCK_LABELS`, replace the id 0 and id 6 lines:

```js
      0: 'Bass — turn to pick a bassline; plays in the Tonality key',
```
```js
      6: 'Chords — turn to pick a progression; pad in the Tonality key',
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS — many-frames render with bass/chords names without throwing.

- [ ] **Step 4: Commit**

```bash
git add src/components/visualEngine.js print.html
git commit -m "feat: ring names for bass/chords + relabel markers 0 & 6"
```

- [ ] **Step 5: On-wall verification**

Serve over `http://localhost:8080` (`npm start`), hard-reload. Confirm:
- Drop **marker 0 (Bass)** → a bassline plays in time; rotate to change lines (name shows under ring).
- Drop **marker 6 (Chords)** → a pad plays a progression; rotate to change it.
- Drop **marker 5 (Tonality)** and rotate → bass + chords transpose to the new key together.
- Drop **marker 7 (Drummer)** → drums + bass + chords groove together; **Tempo (8)** speeds them as one.
- A **Filter/Delay** near the bass or chords shapes that voice.

---

## Self-Review

**Spec coverage:**
- §2 registry id 0 Bass / id 6 Chords → Task 3. ✓
- §3.1 bassLines / §3.2 chordProgressions data → Tasks 1, 2. ✓
- §4 constants, `presetIdx` refactor, MonoSynth/PolySynth voices, `_onStep` bass/chords with tonality root, `_updateModule` → Task 5. ✓
- §5 routing generators → Task 4; ring names + print relabels → Task 6. ✓
- §6 tests: pure data + registry (Tasks 1-3), browserLoad reach/rotate/tonality-optional (Task 5). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `BASS_LINES`/`CHORD_PROGRESSIONS` shapes consistent across Tasks 1/2/3/5;
`getLineIndex`/`getProgIndex`/`getName` defined in Task 3, consumed in Tasks 5/6; `presetIdx` used
uniformly in Task 5 (and the Drummer rename keeps `_onStep`/`_updateModule` consistent);
`scaleDegreeFreq(baseFreq, root, degree)` matches the tonality util. Generator filter (Task 4) lists
all five generator types. ✓

**Note:** the Drummer test and any existing id-0/id-6 tests must reflect the new types — Task 3 Step 1
flags updating/removing stale oscillator/sequencer registry tests; the Drummer browserLoad test keeps
passing because `presetIdx` is renamed everywhere it's read.
