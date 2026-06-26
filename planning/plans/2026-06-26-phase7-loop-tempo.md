# Phase 7 — Loop Puck + Tempo Puck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Loop puck (id 7) that plays tempo-locked audio loops selected by rotation, and a Tempo puck (id 8) that drives global BPM so loops + sequencer move together.

**Architecture:** A new `sampler` generator type plays `Tone.Player` loops synced to the Transport; a new `global/tempo` puck ramps `Tone.Transport.bpm` and recomputes every loop's `playbackRate`. Loop selection, BPM mapping, playback-rate math, and waveform peak analysis are pure + unit-tested; routing treats samplers as generators so effects and Phase 6 waveform cables apply for free.

**Tech Stack:** Vanilla JS (no build step), Tone.js (`Player`, `Meter`, `Transport`, `ToneAudioBuffer`), Canvas 2D, `node --test`.

## Global Constraints

- No build step — plain browser `<script>` files; each util/data module sets `window.X` AND `module.exports`.
- Pure helpers stay DOM-free; live values (`getModuleLevel`, `getLoopPeaks`) are read inside `render()` each frame.
- Loops lock to the Transport: launch on a bar (`'@1m'`), `playbackRate = curBpm / loopBpm`.
- Tempo range **70–160 BPM**; default BPM stays **110** when no Tempo puck is present.
- Tests run with `npm test` (= `node --test`) from `E:/Antigravity/Projects/Reactable Wall`.
- Loop assets already downloaded to `assets/loops/` and committed (see Task 0).

---

## File Structure

- `src/data/loopBank.js` — **create**: `{ LOOP_BANK, playbackRateFor }` (pure data + rate math).
- `src/utils/cableAnim.js` — **modify**: add `peakEnvelope`.
- `src/services/moduleRegistry.js` — **modify**: add id 7 (Loop) + id 8 (Tempo); require loopBank.
- `src/services/routingGraph.js:24` — **modify**: samplers count as generators.
- `src/services/audioEngine.js` — **modify**: preload buffers + peaks, sampler lifecycle, tempo branch, `getLoopPeaks`, exports.
- `src/components/visualEngine.js` — **modify**: sampler waveform cable, loop name, tempo HUD.
- `index.html` — **modify**: load `src/data/loopBank.js` before `moduleRegistry.js`.
- `src/tests/{loopBank,cableAnim,moduleRegistry,routingGraph,browserLoad}.test.js` — **modify/create** tests.

---

## Task 0: Loop assets (ALREADY DONE — verify only)

The loop pack was fetched and committed during design (`scripts/fetch-loops.sh`, commit `1db061e`).

- [ ] **Verify** the files exist:

Run: `ls assets/loops/`
Expected: `Afrobeats_100bpm_01.wav  BoomBap_90bpm_01.wav  FutureBass_150bpm_01.wav  House_124bpm_01.wav  LICENSE.md  LoFi_HipHop_85bpm_01.wav  Trap_140bpm_01.wav`

If missing, run `bash scripts/fetch-loops.sh`.

---

## Task 1: Loop bank data + `playbackRateFor`

**Files:**
- Create: `src/data/loopBank.js`
- Create: `src/tests/loopBank.test.js`
- Modify: `index.html` (add `<script>` before moduleRegistry)

**Interfaces:**
- Produces: `loopBank.LOOP_BANK` (array of `{name, file, bpm, category}`) and
  `loopBank.playbackRateFor(loopBpm, curBpm) -> number` (`curBpm/loopBpm`, `1` if `loopBpm<=0`).

- [ ] **Step 1: Write the failing test**

Create `src/tests/loopBank.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const loopBank = require('../data/loopBank.js');

test('LOOP_BANK: every entry well-formed', () => {
  assert.ok(Array.isArray(loopBank.LOOP_BANK) && loopBank.LOOP_BANK.length >= 1);
  for (const e of loopBank.LOOP_BANK) {
    assert.ok(typeof e.name === 'string' && e.name.length > 0);
    assert.ok(e.file.startsWith('assets/loops/'));
    assert.ok(typeof e.bpm === 'number' && e.bpm > 0);
  }
});

test('playbackRateFor: ratio of current to loop bpm, guarded', () => {
  assert.strictEqual(loopBank.playbackRateFor(100, 110), 1.1);
  assert.strictEqual(loopBank.playbackRateFor(150, 150), 1);
  assert.strictEqual(loopBank.playbackRateFor(0, 110), 1);   // guard
  assert.strictEqual(loopBank.playbackRateFor(-5, 110), 1);  // guard
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../data/loopBank.js'`.

- [ ] **Step 3: Create the data module**

Create `src/data/loopBank.js`:

```js
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
```

- [ ] **Step 4: Wire it into `index.html`**

In `E:\Antigravity\Projects\Reactable Wall\index.html`, find the line
`<script src="src/utils/rhythmPatterns.js"></script>` and add immediately after it:

```html
  <script src="src/data/loopBank.js"></script>
```

(Must load before `src/services/moduleRegistry.js`, which references the bank.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/loopBank.js src/tests/loopBank.test.js index.html
git commit -m "feat: loop bank data + playbackRateFor"
```

---

## Task 2: `peakEnvelope` pure helper

**Files:**
- Modify: `src/utils/cableAnim.js`
- Test: `src/tests/cableAnim.test.js`

**Interfaces:**
- Produces: `peakEnvelope(samples, n) -> number[]` — `n` peak magnitudes in `[0,1]`, each the max
  `abs` over its bucket of `samples`. `[]` for empty input or `n <= 0`.

- [ ] **Step 1: Write the failing test**

Append to `src/tests/cableAnim.test.js`:

```js
test('peakEnvelope: n buckets, each the max abs, in [0,1]', () => {
  const s = [0, 0.2, -0.9, 0.1, 0.5, -0.3];
  const env = cableAnim.peakEnvelope(s, 3);   // buckets [0,0.2] [-0.9,0.1] [0.5,-0.3]
  assert.deepStrictEqual(env, [0.2, 0.9, 0.5]);
  assert.ok(env.every(v => v >= 0 && v <= 1));
});

test('peakEnvelope: empty / non-positive n -> []', () => {
  assert.deepStrictEqual(cableAnim.peakEnvelope([], 4), []);
  assert.deepStrictEqual(cableAnim.peakEnvelope([0.5, 0.5], 0), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `cableAnim.peakEnvelope is not a function`.

- [ ] **Step 3: Implement (inside the `cableAnim` object, after `cometTail`)**

```js
  // Downsample a sample array into n peak magnitudes (max abs per bucket), in [0,1].
  peakEnvelope(samples, n) {
    const len = samples ? samples.length : 0;
    if (len === 0 || !(n > 0)) return [];
    const out = [];
    for (let i = 0; i < n; i++) {
      const start = Math.floor((i * len) / n);
      const end = Math.max(start + 1, Math.floor(((i + 1) * len) / n));
      let peak = 0;
      for (let j = start; j < end && j < len; j++) {
        const a = Math.abs(samples[j]);
        if (a > peak) peak = a;
      }
      out.push(peak > 1 ? 1 : peak);
    }
    return out;
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cableAnim.js src/tests/cableAnim.test.js
git commit -m "feat: cableAnim.peakEnvelope (sample -> peak bars)"
```

---

## Task 3: Module registry — Loop (id 7) + Tempo (id 8)

**Files:**
- Modify: `src/services/moduleRegistry.js`
- Test: `src/tests/moduleRegistry.test.js`
- Modify: `src/tests/browserLoad.test.js` (SCRIPTS load order)

**Interfaces:**
- Consumes: `loopBank.LOOP_BANK` (Task 1); existing `_arcT(angle)`.
- Produces: `MODULE_REGISTRY[7]` with `type:'sampler'`, `getLoopIndex(angle)`, `getName(angle)`;
  `MODULE_REGISTRY[8]` with `type:'global'`, `subtype:'tempo'`, `getBpm(angle)`.

- [ ] **Step 1: Write the failing test**

Append to `src/tests/moduleRegistry.test.js` (it already requires the registry — match its style):

```js
test('Loop (id 7): rotation selects a bank index', () => {
  const loop = MODULE_REGISTRY[7];
  assert.strictEqual(loop.type, 'sampler');
  assert.strictEqual(loop.getLoopIndex(0), 0);                       // arc min -> first
  const n = require('../data/loopBank.js').LOOP_BANK.length;
  assert.strictEqual(loop.getLoopIndex(2 * Math.PI - 0.0001), n - 1); // arc max -> last
  assert.strictEqual(typeof loop.getName(0), 'string');
});

test('Tempo (id 8): rotation maps to 70..160 BPM', () => {
  const tempo = MODULE_REGISTRY[8];
  assert.strictEqual(tempo.type, 'global');
  assert.strictEqual(tempo.subtype, 'tempo');
  assert.strictEqual(tempo.getBpm(0), 70);
  assert.strictEqual(tempo.getBpm(2 * Math.PI - 0.0001), 160);
});
```

(If `moduleRegistry.test.js` accesses the registry under a different name than `MODULE_REGISTRY`, match the existing tests in that file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot read properties of undefined (reading 'type')` (no id 7).

- [ ] **Step 3: Implement**

(a) Near the top of `src/services/moduleRegistry.js`, alongside the other requires, add:

```js
const _loopBank = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
```

(b) Add two entries to the `MODULE_REGISTRY` object (after id 6). `_arcT` is the existing arc-mapping helper used by every other def:

```js
  // ID 7: Loop — sampler generator; rotation selects a loop from the bank
  7: {
    id: 7, name: 'Loop', type: 'sampler', color: '#7CFFB2', paramLabel: 'Loop',
    getParamT(angle) { return _arcT(angle); },
    getLoopIndex(angle) {
      const n = _loopBank.LOOP_BANK.length;
      return Math.min(n - 1, Math.floor(_arcT(angle) * n));
    },
    getName(angle) { return _loopBank.LOOP_BANK[this.getLoopIndex(angle)].name; },
  },

  // ID 8: Tempo — global; rotation sets the Transport BPM (70..160)
  8: {
    id: 8, name: 'Tempo', type: 'global', subtype: 'tempo', color: '#ff7777', paramLabel: 'BPM',
    getParamT(angle) { return _arcT(angle); },
    getBpm(angle) { return Math.round(70 + _arcT(angle) * (160 - 70)); },
  },
```

(c) In `src/tests/browserLoad.test.js`, add `'src/data/loopBank.js'` to the `SCRIPTS` array **before** `'src/services/moduleRegistry.js'`:

```js
  'src/utils/cableAnim.js',
  'src/data/loopBank.js',
  'src/services/moduleRegistry.js',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (registry tests + browserLoad still loads).

- [ ] **Step 5: Commit**

```bash
git add src/services/moduleRegistry.js src/tests/moduleRegistry.test.js src/tests/browserLoad.test.js
git commit -m "feat: Loop (id7) + Tempo (id8) module definitions"
```

---

## Task 4: Routing — samplers are generators

**Files:**
- Modify: `src/services/routingGraph.js:24`
- Test: `src/tests/routingGraph.test.js`

**Interfaces:**
- Produces: chains starting from `sampler` modules (so a Loop puck reaches `master` and effects insert).

- [ ] **Step 1: Write the failing test**

Append to `src/tests/routingGraph.test.js`:

```js
test('buildRawPlan: a sampler is treated as a generator (gets a chain to master)', () => {
  const modules = [
    { id: 7, wx: 200, wy: 200, angle: 0, def: { id: 7, type: 'sampler', color: '#7CFFB2' } },
  ];
  const plan = routingGraph.update(modules, { w: 1280, h: 720 });
  assert.strictEqual(plan.chains.length, 1, 'sampler should produce one chain');
  assert.strictEqual(plan.chains[0].nodeIds[0], 7);
  assert.strictEqual(plan.chains[0].nodeIds[plan.chains[0].nodeIds.length - 1], 'master');
});
```

(If `routingGraph.update` needs several frames to commit a chain via debounce, call it in a short loop first — check how the existing routingGraph tests drive it and match them. If they call `update` once and read `plan.chains`, the single call above is correct.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `plan.chains.length` is `0` (sampler not a generator).

- [ ] **Step 3: Implement**

In `src/services/routingGraph.js`, line 24, widen the generator filter:

```js
  const gens = modules.filter(m => m.def.type === 'oscillator' || m.def.type === 'sampler');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/routingGraph.js src/tests/routingGraph.test.js
git commit -m "feat: route samplers as generators"
```

---

## Task 5: Audio engine — loop playback, tempo, peaks

**Files:**
- Modify: `src/services/audioEngine.js`
- Test: `src/tests/browserLoad.test.js` (Tone stub + assertions)

**Interfaces:**
- Consumes: `loopBank.LOOP_BANK`, `loopBank.playbackRateFor` (Task 1); `cableAnim.peakEnvelope`
  (Task 2); `cableAnim.meterToUnit` + meter pattern (Phase 6).
- Produces: `window.getLoopPeaks(srcId) -> number[]` (peaks for a sampler's current loop, else `[]`);
  Loop pucks play/stop/swap; Tempo puck drives `Transport.bpm` + loop rates.

- [ ] **Step 1: Extend the Tone stub + write the failing test**

In `src/tests/browserLoad.test.js` `makeSandbox()`, add a `Player` and `ToneAudioBuffer` to the stub
and extend `Transport`. Replace the Tone registration block with:

```js
  class Loop { constructor(cb) { this.cb = cb; } start() { return this; } }
  class Meter extends Node { constructor() { super(); } getValue() { return -100; } }
  class Player extends Node {
    constructor() { super(); this.playbackRate = 1; this.buffer = null; synths.push(this); }
    sync() { return this; } start() { return this; } stop() { return this; }
  }
  const ToneAudioBuffer = { fromUrl: async () => ({ toArray: () => new Float32Array([0, 0.5, -0.5, 1, -1, 0.25]), duration: 2 }) };
  sandbox.Tone = { Synth, Volume, Filter, FeedbackDelay, LFO, Loop, Meter, Player, ToneAudioBuffer,
    start: async () => {},
    Transport: { bpm: { value: 110, rampTo() {} }, start() {}, stop() {}, scheduleOnce(cb) { cb(); } } };
```

Then add a test at the end:

```js
test('Loop + Tempo pucks: play through master, expose peaks, set tempo', async () => {
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

  const loop = { id: 7, wx: 200, wy: 200, angle: 0 };
  const tempo = { id: 8, wx: 600, wy: 600, angle: 3 };
  for (let i = 0; i < 6; i++) ctx.onMarkersDetected([loop, tempo]);

  assert.ok(ctx.__synthReachesDest(), 'loop player should reach the master/destination');
  const peaks = vm.runInContext('getLoopPeaks(7)', ctx);
  assert.ok(Array.isArray(peaks) && peaks.length > 0, 'loop exposes a peak envelope');
  assert.strictEqual(vm.runInContext('typeof getModuleLevel(7)', ctx), 'number');
  assert.doesNotThrow(() => { for (let i = 0; i < 4; i++) ctx.onMarkersDetected([loop]); }); // tempo removed
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `getLoopPeaks is not defined` (and/or sampler not handled).

- [ ] **Step 3: Implement in `src/services/audioEngine.js`**

(a) Top-of-file references (near the other requires):

```js
const _loopBank = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
const LOOP_BUFFERS = {};   // file -> Tone.ToneAudioBuffer
const LOOP_PEAKS = {};     // file -> number[]
```

(`_cableAnim` already exists from Phase 6.)

(b) Preload helper + call it from `initAudio` (after `await Tone.start()`):

```js
async function preloadLoops() {
  for (const entry of _loopBank.LOOP_BANK) {
    try {
      const buf = await Tone.ToneAudioBuffer.fromUrl(entry.file);
      LOOP_BUFFERS[entry.file] = buf;
      const data = (typeof buf.toArray === 'function') ? buf.toArray(0) : null;
      LOOP_PEAKS[entry.file] = data ? _cableAnim.peakEnvelope(data, 200) : [];
    } catch (e) {
      console.warn('[audio] loop load failed:', entry.file);
      LOOP_PEAKS[entry.file] = [];
    }
  }
}
```

In `initAudio`, add `await preloadLoops();` right after `await Tone.start();`.

(c) In `_addModule`, add a `sampler` branch (after the `effect` branch) and track `loopIdx`:

```js
  let loopIdx = -1;
  // ... existing oscillator / effect branches ...
  } else if (def.type === 'sampler') {
    loopIdx = def.getLoopIndex(smoother.get());
    const entry = _loopBank.LOOP_BANK[loopIdx];
    const buf = LOOP_BUFFERS[entry.file];
    if (buf) {
      const player = new Tone.Player({ url: buf, loop: true });
      player.playbackRate = _loopBank.playbackRateFor(entry.bpm, Tone.Transport.bpm.value);
      player.sync().start('@1m');           // launch on the next bar, locked to Transport
      node = player;
      meter = new Tone.Meter({ smoothing: 0.8 });
      player.connect(meter);
    }
  } else if (def.type === 'controller') {
```

Add `loopIdx` to the stored module object:

```js
  activeModules[id] = { def, node, meter, loopIdx, smoother, missCount: 0, lastPos: { wx: marker.wx, wy: marker.wy } };
```

(d) In `_updateModule`, add `sampler` and `tempo` branches (extend the existing `if/else if` chain):

```js
  } else if (m.def.type === 'sampler' && m.node) {
    const idx = m.def.getLoopIndex(angle);
    if (idx !== m.loopIdx) { m.loopIdx = idx; _swapLoop(id, idx); }
    const entry = _loopBank.LOOP_BANK[m.loopIdx];
    if (entry) m.node.playbackRate = _loopBank.playbackRateFor(entry.bpm, Tone.Transport.bpm.value);
  } else if (m.def.type === 'global' && m.def.subtype === 'tempo') {
    const bpm = m.def.getBpm(angle);
    Tone.Transport.bpm.rampTo(bpm, 0.1);
    _applyLoopRates(bpm);
  }
```

(e) Add the two helpers (near `getModuleLevel`):

```js
// Swap a loop puck's buffer on the next bar (keeps node identity so routing stays wired).
function _swapLoop(id, idx) {
  const m = activeModules[id];
  if (!m || !m.node) return;
  const entry = _loopBank.LOOP_BANK[idx];
  const buf = entry && LOOP_BUFFERS[entry.file];
  if (!buf) return;
  Tone.Transport.scheduleOnce(() => {
    try {
      m.node.buffer = buf;
      m.node.playbackRate = _loopBank.playbackRateFor(entry.bpm, Tone.Transport.bpm.value);
    } catch (_) {}
  }, '@1m');
}
// Re-rate every active loop when the tempo changes.
function _applyLoopRates(bpm) {
  Object.keys(activeModules).forEach(k => {
    const m = activeModules[k];
    if (m && m.def.type === 'sampler' && m.node) {
      const entry = _loopBank.LOOP_BANK[m.loopIdx];
      if (entry) m.node.playbackRate = _loopBank.playbackRateFor(entry.bpm, bpm);
    }
  });
}
// Peak envelope for a sampler's current loop (read by the visual layer). [] if none.
function getLoopPeaks(srcId) {
  const m = activeModules[srcId];
  if (!m || m.def.type !== 'sampler') return [];
  const entry = _loopBank.LOOP_BANK[m.loopIdx];
  return (entry && LOOP_PEAKS[entry.file]) || [];
}
```

(f) `_removeModule` already disposes `m.meter` (Phase 6); add player stop before dispose. The
existing non-oscillator branch is `else if (m.node) { try { m.node.dispose(); } catch (_) {} }` —
change it to stop first:

```js
  } else if (m.node) {
    try { if (typeof m.node.stop === 'function') m.node.stop(); } catch (_) {}
    try { m.node.dispose(); } catch (_) {}
  }
```

(g) Expose the getter (near the other `window.*` exports):

```js
window.getLoopPeaks = getLoopPeaks;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (new loop/tempo test + all existing browserLoad tests green).

- [ ] **Step 5: Commit**

```bash
git add src/services/audioEngine.js src/tests/browserLoad.test.js
git commit -m "feat: loop playback + tempo control + getLoopPeaks"
```

---

## Task 6: Visual — sampler waveform cable, loop name, tempo HUD

**Files:**
- Modify: `src/components/visualEngine.js`
- Test: `src/tests/browserLoad.test.js` (many-frames test already exercises loop+tempo from Task 5)

**Interfaces:**
- Consumes: `getLoopPeaks(srcId)` (Task 5); `loopBank.LOOP_BANK` + `def.getName` (Tasks 1/3);
  `def.getBpm` (Task 3); existing gradient/bloom path + `activeById` (Phase 6).
- Produces: visual only.

- [ ] **Step 1: Sampler waveform branch in `_drawEdges`**

In `_drawEdges`, the wave branch computes `srcType`. For samplers, draw the loop's peak envelope as
a mirrored filled waveform instead of a synth shape. Right after the existing line
`const srcType = srcMod && srcMod.def ? (srcMod.def.subtype || srcMod.def.type) : 'oscillator';`,
add a dedicated sampler path that returns before the generic-wave code:

```js
      if (srcType === 'sampler') {
        const peaks = (typeof getLoopPeaks === 'function') ? getLoopPeaks(srcId) : [];
        if (peaks.length > 1) {
          const level = (typeof getModuleLevel === 'function') ? getModuleLevel(srcId) : 0.5;
          const amp = MAX_AMP * (0.4 + 0.6 * level);
          const speed = _anim.flowSpeed({ kind: 'audio', level });
          const scroll = Math.floor((speed * (now / 1000)) / SAMPLE_STEP); // peaks shift along cable
          const N = Math.max(2, Math.floor(len / SAMPLE_STEP));
          visCtx.globalCompositeOperation = 'lighter';
          visCtx.globalAlpha = alpha * 0.9;
          visCtx.strokeStyle = grad; visCtx.lineWidth = 2; visCtx.lineJoin = 'round';
          visCtx.shadowColor = colorOf(srcId); visCtx.shadowBlur = 12;
          visCtx.beginPath();
          for (let k = 0; k <= N; k++) {            // top edge (+peak)
            const d = (k / N) * len;
            const pk = peaks[(k + scroll) % peaks.length] * amp;
            const x = fromPos.x + ux * d + px * pk, y = fromPos.y + uy * d + py * pk;
            if (k === 0) visCtx.moveTo(x, y); else visCtx.lineTo(x, y);
          }
          for (let k = N; k >= 0; k--) {            // bottom edge (-peak), back to start
            const d = (k / N) * len;
            const pk = peaks[(k + scroll) % peaks.length] * amp;
            const x = fromPos.x + ux * d - px * pk, y = fromPos.y + uy * d - py * pk;
            visCtx.lineTo(x, y);
          }
          visCtx.closePath(); visCtx.stroke();
          visCtx.restore();
          return;
        }
        // no peaks yet -> fall through to the generic wave below
      }
```

- [ ] **Step 2: Loop name + Tempo HUD in the ring loop**

(2a) Loop name under the ring. In the per-module ring block, the "Param percentage below the ring"
draws `${def.paramLabel}: ${paramPct}%`. Make samplers show the loop name instead — replace that
`fillText` call's text argument with a computed label:

```js
      const belowLabel = (def.type === 'sampler' && def.getName)
        ? `${def.paramLabel}: ${def.getName(angle)}`
        : `${def.paramLabel}: ${paramPct}%`;
      visCtx.fillText(belowLabel, wx, wy + ringR + 18);
```

(2b) Tempo HUD. After the Tonality HUD block (the `if (tonMod) { ... }` near the end of `render()`),
add a parallel BPM pill:

```js
    const tempoMod = getActiveModules().find(m => m.def.subtype === 'tempo');
    if (tempoMod) {
      const bpm = tempoMod.def.getBpm(tempoMod.angle);
      visCtx.save();
      visCtx.fillStyle = 'rgba(26,12,12,0.85)';
      visCtx.strokeStyle = '#4a1f1f';
      const px2 = W - 360, py2 = 64;
      visCtx.beginPath();
      if (visCtx.roundRect) visCtx.roundRect(px2, py2, 180, 34, 17); else visCtx.rect(px2, py2, 180, 34);
      visCtx.fill(); visCtx.stroke();
      visCtx.fillStyle = '#ff9a9a'; visCtx.font = '14px monospace'; visCtx.textAlign = 'left';
      visCtx.fillText(`TEMPO  ${bpm} BPM`, px2 + 16, py2 + 22);
      visCtx.restore();
    }
```

(`mod.angle` for active modules is the smoothed angle exposed by `getActiveModules()`, same as the
Tonality HUD uses `tonMod.angle`.)

- [ ] **Step 3: Run the full suite (rendering must not throw)**

Run: `npm test`
Expected: PASS — the loop+tempo many-frames test (Task 5) renders the sampler cable, loop name, and
tempo HUD without throwing.

- [ ] **Step 4: Commit**

```bash
git add src/components/visualEngine.js
git commit -m "feat: sampler waveform cable + loop name + tempo HUD"
```

- [ ] **Step 5: On-wall verification**

Open `index.html` with webcam + projector. Confirm:
- Dropping the Loop puck (id 7) starts a loop on the next bar, locked to the Sequencer's clock.
- Rotating the Loop puck switches loops (on the bar); the loop name updates under its ring.
- The Loop cable shows a scrolling sample waveform; the ring pulses with the beat.
- Filter/Delay/Volume affect the loop; the Loop reaches the center output.
- Dropping the Tempo puck (id 8) and rotating it sweeps BPM (70–160); loops **and** sequencer
  speed up/slow down together; the TEMPO HUD shows the BPM.

---

## Self-Review

**Spec coverage:**
- §2 assets + manifest → Task 0 (done) + Task 1 (`loopBank.js`). ✓
- §3 registry id 7/8 → Task 3. ✓
- §4.1 preload + peaks → Task 5 (b). §4.2 loop lifecycle (add/swap-on-bar/remove, playbackRate) → Task 5 (c,e,f). §4.3 tempo branch + `_applyLoopRates` → Task 5 (d,e). §4.4 meter coverage → Phase 6 + Task 5 meter attach. ✓
- §5 sampler-as-generator → Task 4. ✓
- §6.1 `peakEnvelope` → Task 2. §6.2 sampler cable → Task 6 (1). §6.3 loop name + BPM HUD → Task 6 (2). ✓
- §7 tests: pure (Tasks 1,2,3), browserLoad loop+tempo (Task 5). ✓

**Placeholder scan:** No TBD/TODO; all code steps show full code. ✓

**Type consistency:** `loopBank.LOOP_BANK` / `loopBank.playbackRateFor(loopBpm, curBpm)` consistent across Tasks 1/3/5; `getLoopIndex(angle)`/`getName(angle)`/`getBpm(angle)` defined in Task 3, consumed in Tasks 5/6; `peakEnvelope(samples, n)` defined Task 2, consumed Task 5; `getLoopPeaks(srcId)` defined Task 5, consumed Task 6; `loopIdx` field set in Task 5 (c) used in (d,e) and `getLoopPeaks`. Edge `srcId`/`srcType` from Phase 6 reused. ✓

**Load-order note:** `loopBank.js` is added to `index.html` (Task 1) and `browserLoad` SCRIPTS (Task 3) before `moduleRegistry.js`, which is the first consumer — so the registry resolves `_loopBank` in both browser and test.
