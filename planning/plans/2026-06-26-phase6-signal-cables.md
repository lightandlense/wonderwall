# Phase 6 — Signal-Shaped Cables & Reactive Rings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic flowing-dot cables with per-type animated waveforms whose shape comes from each cable's source puck, and make module rings breathe with their live output level.

**Architecture:** Three layers. (1) `audioEngine.js` gains passive `Tone.Meter` taps on oscillator/effect nodes plus two read-only globals (`getModuleLevel`, `getLfoRate`). (2) `cableAnim.js` gains pure, unit-tested signal helpers. (3) `visualEngine.js` draws waveform cables (source→dest color gradient + additive bloom) and a level-scaled outer glow on each ring. All live values are read fresh inside `render()` (~60 fps), exactly like the existing `getSeqPulses`.

**Tech Stack:** Vanilla JS (no build step), Tone.js (audio), HTML Canvas 2D (visuals), `node --test` (tests).

## Global Constraints

- No build step — plain browser `<script>` files; each util sets both `window.X = X` and `module.exports = X`.
- No change to the actual audio signal path — meters are passive leaf taps (`node.connect(meter)`), never inserted in-chain.
- Pure helpers in `cableAnim.js` must stay DOM-free and time-driven (`performance.now()` passed in, never read internally).
- All live data (`getModuleLevel`, `getLfoRate`, `getSeqPulses`) is read inside `render()` per frame; never cached into edge objects.
- Tests run with `npm test` (= `node --test`), CommonJS `require`, from the project root `E:/Antigravity/Projects/Reactable Wall`.
- Meter dB→unit floor is **−48 dB**; `BASE_SPEED` audio = **130 px/s**.

---

## File Structure

- `src/utils/cableAnim.js` — **modify**: add `meterToUnit`, `flowSpeed`, `waveSamples`, `_shape`, `echoEnvelope`, `cometTail`. Keep existing `flowDotDistances`, `pulseProgress`.
- `src/tests/cableAnim.test.js` — **modify**: add tests for the 5 new public helpers.
- `src/services/routingGraph.js` — **modify**: enrich audio + control edges with `srcId` / `dstId` so the renderer can resolve source type and source/dest colors.
- `src/tests/routingGraph.test.js` — **modify**: assert the new edge fields.
- `src/services/audioEngine.js` — **modify**: attach/dispose per-module meters; add `getModuleLevel(id)` and `getLfoRate(srcId)`; expose both on `window`.
- `src/tests/browserLoad.test.js` — **modify**: add a `Meter` class to the Tone stub; assert the two new globals exist and return numbers.
- `src/components/visualEngine.js` — **modify**: build `activeById` before edges; rewrite `_drawEdges` for waveform cables; add level-scaled ring pulse; add new render constants.

---

## Task 1: Pure helper `meterToUnit`

**Files:**
- Modify: `src/utils/cableAnim.js`
- Test: `src/tests/cableAnim.test.js`

**Interfaces:**
- Produces: `meterToUnit(db: number, floor = -48) -> number` in `[0,1]`.

- [ ] **Step 1: Write the failing test**

Append to `src/tests/cableAnim.test.js`:

```js
test('meterToUnit: maps dB to [0,1], clamps, handles -Infinity', () => {
  assert.strictEqual(cableAnim.meterToUnit(0), 1);            // 0 dB -> full
  assert.strictEqual(cableAnim.meterToUnit(-48), 0);          // floor -> 0
  assert.strictEqual(cableAnim.meterToUnit(-24), 0.5);        // midway
  assert.strictEqual(cableAnim.meterToUnit(6), 1);            // clipping clamps to 1
  assert.strictEqual(cableAnim.meterToUnit(-60), 0);          // below floor -> 0
  assert.strictEqual(cableAnim.meterToUnit(-Infinity), 0);    // silence -> 0
  assert.strictEqual(cableAnim.meterToUnit(NaN), 0);          // NaN -> 0
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `cableAnim.meterToUnit is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/utils/cableAnim.js`, add inside the `cableAnim` object (after `pulseProgress`):

```js
  // Map a meter reading in dB to [0,1]. floor dB -> 0, 0 dB -> 1, clipping clamps.
  meterToUnit(db, floor = -48) {
    if (!(db > floor)) return 0;            // handles <=floor, -Infinity, NaN
    const u = (db - floor) / (0 - floor);
    return u > 1 ? 1 : u;
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all cableAnim tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/cableAnim.js src/tests/cableAnim.test.js
git commit -m "feat: cableAnim.meterToUnit (dB -> [0,1])"
```

---

## Task 2: Pure helper `flowSpeed`

**Files:**
- Modify: `src/utils/cableAnim.js`
- Test: `src/tests/cableAnim.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `flowSpeed({kind, ctrl, level, lfoRate}) -> number` (px/sec). Audio scales with `level`; LFO scales with `lfoRate` (clamped 20..120); sequencer returns 0.

- [ ] **Step 1: Write the failing test**

Append to `src/tests/cableAnim.test.js`:

```js
test('flowSpeed: audio scales with level, lfo with rate, sequencer is 0', () => {
  assert.strictEqual(cableAnim.flowSpeed({ kind: 'audio', level: 0 }), 52);   // 130*0.4
  assert.strictEqual(cableAnim.flowSpeed({ kind: 'audio', level: 1 }), 130);  // 130*1.0
  assert.strictEqual(cableAnim.flowSpeed({ kind: 'audio', level: 0.5 }), 91); // 130*0.7
  assert.strictEqual(cableAnim.flowSpeed({ kind: 'control', ctrl: 'sequencer' }), 0);
  assert.strictEqual(cableAnim.flowSpeed({ kind: 'control', ctrl: 'lfo', lfoRate: 8 }), 112); // 8*14
  assert.strictEqual(cableAnim.flowSpeed({ kind: 'control', ctrl: 'lfo', lfoRate: 0.1 }), 20); // clamped up
  assert.strictEqual(cableAnim.flowSpeed({ kind: 'control', ctrl: 'lfo', lfoRate: 100 }), 120); // clamped down
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `cableAnim.flowSpeed is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add inside the `cableAnim` object:

```js
  // Scroll speed (px/sec) for a cable's signal animation.
  flowSpeed({ kind, ctrl, level = 0, lfoRate = 1 } = {}) {
    if (ctrl === 'sequencer') return 0;              // beat-synced pulse, no scroll
    if (ctrl === 'lfo') {
      const s = lfoRate * 14;                        // ~0.1..8 Hz -> ~1.4..112 px/s
      return s < 20 ? 20 : (s > 120 ? 120 : s);
    }
    const lv = level < 0 ? 0 : (level > 1 ? 1 : level);
    return 130 * (0.4 + 0.6 * lv);                   // audio: 52..130 px/s
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cableAnim.js src/tests/cableAnim.test.js
git commit -m "feat: cableAnim.flowSpeed (per-kind cable scroll speed)"
```

---

## Task 3: Pure helpers `waveSamples` + `_shape`

**Files:**
- Modify: `src/utils/cableAnim.js`
- Test: `src/tests/cableAnim.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `waveSamples(len, {shape, wavelength, amplitude, phase = 0, step = 6}) -> number[]` (perpendicular offsets at d = 0, step, 2·step, …, and a final value at d = len). `_shape(shape, t) -> number` in ~[-1,1] for `shape ∈ {'sine','saw','softsaw'}`.

- [ ] **Step 1: Write the failing test**

Append to `src/tests/cableAnim.test.js`:

```js
test('waveSamples: sample count includes both endpoints', () => {
  const a = cableAnim.waveSamples(60, { shape: 'sine', wavelength: 40, amplitude: 10, step: 6 });
  assert.strictEqual(a.length, 11);            // d = 0,6,...,60 -> 11 samples
  const b = cableAnim.waveSamples(10, { shape: 'sine', wavelength: 40, amplitude: 10, step: 6 });
  assert.strictEqual(b.length, 3);             // d = 0,6, then appended 10
});

test('waveSamples: empty for non-positive length or zero wavelength', () => {
  assert.deepStrictEqual(cableAnim.waveSamples(0, { shape: 'sine', wavelength: 40, amplitude: 10 }), []);
  assert.deepStrictEqual(cableAnim.waveSamples(60, { shape: 'sine', wavelength: 0, amplitude: 10 }), []);
});

test('waveSamples: sine/saw stay within [-amp, amp]; first sample uses phase', () => {
  const amp = 12;
  const s = cableAnim.waveSamples(120, { shape: 'sine', wavelength: 40, amplitude: amp, phase: 0, step: 6 });
  assert.ok(s.every(v => v >= -amp - 1e-9 && v <= amp + 1e-9));
  // saw at phase 0, d 0 -> 2*0-1 = -1 -> -amp
  const saw = cableAnim.waveSamples(120, { shape: 'saw', wavelength: 40, amplitude: amp, phase: 0, step: 6 });
  assert.ok(Math.abs(saw[0] + amp) < 1e-9);
});

test('_shape: softsaw is finite and roughly bounded', () => {
  for (let t = 0; t < 3; t += 0.13) {
    const v = cableAnim._shape('softsaw', t);
    assert.ok(Number.isFinite(v) && Math.abs(v) < 2);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `cableAnim.waveSamples is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add inside the `cableAnim` object:

```js
  // Perpendicular offsets along a cable: offset(d) = amplitude * shape(phase + d/wavelength).
  // Samples at d = 0, step, 2*step, ... plus a final sample at exactly `len`.
  waveSamples(len, { shape, wavelength, amplitude, phase = 0, step = 6 } = {}) {
    if (!(len > 0) || !(wavelength > 0) || !(amplitude >= 0)) return [];
    const out = [];
    let last = 0;
    for (let d = 0; d <= len; d += step) {
      out.push(amplitude * this._shape(shape, phase + d / wavelength));
      last = d;
    }
    if (last !== len) out.push(amplitude * this._shape(shape, phase + len / wavelength));
    return out;
  },
  // Unit waveform in ~[-1,1]. t is in cycles.
  _shape(shape, t) {
    const frac = t - Math.floor(t);          // [0,1)
    if (shape === 'saw') return 2 * frac - 1;
    if (shape === 'softsaw') {
      const w = 2 * Math.PI * t;
      return (Math.sin(w) + Math.sin(2 * w) / 2 + Math.sin(3 * w) / 3) / 1.5;
    }
    return Math.sin(2 * Math.PI * t);        // 'sine' / default
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cableAnim.js src/tests/cableAnim.test.js
git commit -m "feat: cableAnim.waveSamples + _shape (saw/softsaw/sine)"
```

---

## Task 4: Pure helpers `echoEnvelope` + `cometTail`

**Files:**
- Modify: `src/utils/cableAnim.js`
- Test: `src/tests/cableAnim.test.js`

**Interfaces:**
- Produces:
  - `echoEnvelope(d, len, {count = 3, decay = 0.5}) -> number` in `(0,1]`, non-increasing in `d` (delay echo taps).
  - `cometTail(headDist, segCount, segSpacing, len) -> {d:number, alpha:number}[]` — fading segments behind a head dot, clipped to `[0, len)`.

- [ ] **Step 1: Write the failing test**

Append to `src/tests/cableAnim.test.js`:

```js
test('echoEnvelope: full at source, steps down toward dest, in (0,1]', () => {
  assert.strictEqual(cableAnim.echoEnvelope(0, 100, { count: 3, decay: 0.5 }), 1);
  assert.strictEqual(cableAnim.echoEnvelope(99, 100, { count: 3, decay: 0.5 }), 0.25); // band 2 -> 0.5^2
  const a = cableAnim.echoEnvelope(10, 100, {});
  const b = cableAnim.echoEnvelope(90, 100, {});
  assert.ok(b <= a && a <= 1 && b > 0);
  assert.strictEqual(cableAnim.echoEnvelope(10, 0, {}), 0); // zero length -> 0
});

test('cometTail: segments trail behind head, clipped to [0,len)', () => {
  const t = cableAnim.cometTail(50, 3, 8, 100);
  assert.deepStrictEqual(t.map(s => s.d), [42, 34, 26]);
  assert.ok(t.every(s => s.alpha > 0 && s.alpha < 1));
  assert.ok(t[0].alpha > t[2].alpha);               // fades with distance
  assert.deepStrictEqual(cableAnim.cometTail(5, 3, 8, 100), []); // all behind 0 -> empty
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `cableAnim.echoEnvelope is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add inside the `cableAnim` object:

```js
  // Delay echo amplitude multiplier: 1 at the source end, decaying in `count` steps to dest.
  echoEnvelope(d, len, { count = 3, decay = 0.5 } = {}) {
    if (!(len > 0)) return 0;
    const frac = d <= 0 ? 0 : (d >= len ? 1 - 1e-9 : d / len);
    const band = Math.min(count - 1, Math.floor(frac * count));
    return Math.pow(decay, band);
  },
  // Fading tail segments behind a head dot at `headDist` (motion is source->dest).
  cometTail(headDist, segCount, segSpacing, len) {
    const out = [];
    for (let i = 1; i <= segCount; i++) {
      const d = headDist - i * segSpacing;
      if (d < 0 || d >= len) continue;
      out.push({ d, alpha: 1 - i / (segCount + 1) });
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
git commit -m "feat: cableAnim.echoEnvelope + cometTail"
```

---

## Task 5: Enrich edges with `srcId` / `dstId`

**Files:**
- Modify: `src/services/routingGraph.js:114-127`
- Test: `src/tests/routingGraph.test.js`

**Interfaces:**
- Produces: audio edges gain `srcId` (source module id) and `dstId` (`'master'` or a module id). Control edges gain `dstId` (target module id) alongside the existing `srcId`.
- Consumes (by Task 7): `edge.srcId`, `edge.dstId` to resolve source puck type and source/dest colors.

- [ ] **Step 1: Write the failing test**

First inspect the existing edge test to match its setup. Append to `src/tests/routingGraph.test.js`:

```js
test('getEdges: audio edges carry srcId and dstId', () => {
  const modules = [
    { id: 0, wx: 100, wy: 100, def: { id: 0, type: 'oscillator', subtype: undefined, color: '#44aaff' } },
    { id: 3, wx: 300, wy: 100, def: { id: 3, type: 'global', subtype: 'volume', color: '#ffcc44' } },
  ];
  const plan = { chains: [{ genId: 0, nodeIds: [0, 'master'] }], controlLinks: [], tonality: null, membership: {} };
  const edges = routingGraph.getEdges(plan, modules, { w: 1280, h: 720 });
  const audio = edges.find(e => e.kind === 'audio');
  assert.ok(audio, 'expected an audio edge');
  assert.strictEqual(audio.srcId, 0);
  assert.strictEqual(audio.dstId, 'master');
});

test('getEdges: control edges carry srcId and dstId', () => {
  const modules = [
    { id: 4, wx: 210, wy: 130, def: { id: 4, type: 'controller', subtype: 'lfo', color: '#c98bff' } },
    { id: 1, wx: 200, wy: 100, def: { id: 1, type: 'effect', subtype: 'filter', color: '#ff8a3d' } },
  ];
  const plan = { chains: [], controlLinks: [{ controllerId: 4, targetId: 1 }], tonality: null, membership: {} };
  const edges = routingGraph.getEdges(plan, modules, { w: 1280, h: 720 });
  const ctrl = edges.find(e => e.kind === 'control');
  assert.ok(ctrl, 'expected a control edge');
  assert.strictEqual(ctrl.srcId, 4);
  assert.strictEqual(ctrl.dstId, 1);
});
```

(If `routingGraph.test.js` does not already `require` the module, add `const routingGraph = require('../services/routingGraph.js');` and `const { test } = require('node:test'); const assert = require('node:assert');` at the top — check first, do not duplicate.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `audio.srcId` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/services/routingGraph.js`, replace the chain + control loops (lines 114-127) with:

```js
  plan.chains.forEach(c => {
    for (let i = 0; i < c.nodeIds.length - 1; i++) {
      const srcId = c.nodeIds[i], dstId = c.nodeIds[i + 1];
      const a = posOf(srcId), b = posOf(dstId);
      if (a && b) edges.push({ fromPos: a, toPos: b, kind: 'audio', connected: true, alpha: 1, srcId, dstId });
    }
  });
  plan.controlLinks.forEach(l => {
    const a = byId[l.controllerId], b = byId[l.targetId];
    if (!a || !b) return;
    edges.push({
      fromPos: { x: a.wx, y: a.wy }, toPos: { x: b.wx, y: b.wy },
      kind: 'control', ctrl: a.def.subtype, srcId: l.controllerId, dstId: l.targetId, connected: true, alpha: 1,
    });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/routingGraph.js src/tests/routingGraph.test.js
git commit -m "feat: tag routing edges with srcId/dstId for waveform rendering"
```

---

## Task 6: Per-module meters + `getModuleLevel` / `getLfoRate`

**Files:**
- Modify: `src/services/audioEngine.js` (module creation ~88-116, removal ~121-130, exports ~338-339, plus a `cableAnim` reference near the top)
- Test: `src/tests/browserLoad.test.js` (Tone stub + assertions)

**Interfaces:**
- Consumes: `cableAnim.meterToUnit` (from Task 1).
- Produces (by Task 7/8): `window.getModuleLevel(id) -> number` in `[0,1]` (0 if no meter); `window.getLfoRate(srcId) -> number` (Hz, default 1).

- [ ] **Step 1: Add a `Meter` stub and write the failing test**

In `src/tests/browserLoad.test.js`, inside `makeSandbox()`, add a `Meter` class next to the others and register it on the Tone stub:

```js
  class Meter extends Node { constructor() { super(); } getValue() { return -100; } }
```

Update the Tone registration line to include `Meter`:

```js
  sandbox.Tone = { Synth, Volume, Filter, FeedbackDelay, LFO, Loop, Meter, start: async () => {},
    Transport: { bpm: { value: 120 }, start() {}, stop() {} } };
```

Then add a new test at the end of the file:

```js
test('getModuleLevel / getLfoRate are exposed and return numbers', async () => {
  const ctx = makeSandbox();
  loadAll(ctx);
  const fakeCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 1280, height: 720 } : () => {}) });
  ctx.__fakeCtx = fakeCtx;
  vm.runInContext('visualEngine.init({getContext:()=>window.__fakeCtx},{getContext:()=>window.__fakeCtx})', ctx);
  vm.runInContext(`window.onMarkersDetected = function (d) {
    reconcileModules(d); const a = getActiveModules();
    const p = routingGraph.update(a, { w: 1280, h: 720 }); applyRoutingPlan(p);
  };`, ctx);
  await vm.runInContext('initAudio()', ctx);

  const osc = { id: 0, wx: 100, wy: 100, angle: 0 };
  const lfo = { id: 4, wx: 200, wy: 120, angle: 0 };
  for (let i = 0; i < 3; i++) ctx.onMarkersDetected([osc, lfo]);

  const lvl = vm.runInContext('getModuleLevel(0)', ctx);
  assert.strictEqual(typeof lvl, 'number');
  assert.ok(lvl >= 0 && lvl <= 1, 'level in [0,1]');
  assert.strictEqual(vm.runInContext('getModuleLevel(999)', ctx), 0, 'unknown id -> 0');
  const rate = vm.runInContext('getLfoRate(4)', ctx);
  assert.strictEqual(typeof rate, 'number');
  assert.ok(rate >= 0.1 && rate <= 8, 'lfo rate within design range');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `getModuleLevel is not defined`.

- [ ] **Step 3: Implement meters + getters**

In `src/services/audioEngine.js`:

(a) Near the top (after the existing `let` declarations / requires), add a `cableAnim` reference using the project's dual pattern:

```js
const _cableAnim = (typeof require === 'function') ? require('../utils/cableAnim.js') : window.cableAnim;
```

(b) In `_addModule`, change `let node = null;` to also declare a meter, and attach it for oscillator + effect:

```js
  let node = null;
  let meter = null;

  if (def.type === 'oscillator') {
    const synth = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.1, decay: 0, sustain: 1, release: 0.3 },
      volume: -8,
    });
    synth.triggerAttack(_oscFreq(def, smoother.get()));
    node = synth;
    meter = new Tone.Meter({ smoothing: 0.8 });
    synth.connect(meter);                 // passive tap; existing routing to master is unchanged
  } else if (def.type === 'effect') {
    node = def.makeNode();
    def.applyParam(node, def.getParamT(smoother.get()));
    meter = new Tone.Meter({ smoothing: 0.8 });
    node.connect(meter);
  } else if (def.type === 'controller') {
    node = null;
  } else if (def.type === 'global') {
    node = null;
  }
```

(c) Add `meter` to the stored module object:

```js
  activeModules[id] = {
    def,
    node,
    meter,
    smoother,
    missCount: 0,
    lastPos: { wx: marker.wx, wy: marker.wy },
  };
```

(d) In `_removeModule`, dispose the meter (place right after the `const m = activeModules[id]; if (!m) return;` guard):

```js
  if (m.meter) { try { m.meter.dispose(); } catch (_) {} }
```

(e) Add the two getters (near `getSeqStep` / `getSeqPulses`, ~line 78):

```js
function getModuleLevel(id) {
  const m = activeModules[id];
  if (!m || !m.meter) return 0;
  let db;
  try { db = m.meter.getValue(); } catch (_) { return 0; }
  if (Array.isArray(db)) db = db[0];      // stereo meter -> use first channel
  return _cableAnim.meterToUnit(db);
}
function getLfoRate(srcId) {
  const m = activeModules[srcId];
  if (m && m.def && typeof m.def.getRateHz === 'function') {
    return m.def.getRateHz(m.smoother.get());
  }
  return 1;
}
```

(f) Expose on `window` (near the existing `window.getSeqPulses = getSeqPulses;`):

```js
window.getModuleLevel = getModuleLevel;
window.getLfoRate     = getLfoRate;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (new test + all existing browserLoad tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/services/audioEngine.js src/tests/browserLoad.test.js
git commit -m "feat: per-module meters + getModuleLevel/getLfoRate"
```

---

## Task 7: Waveform cables in `visualEngine._drawEdges`

**Files:**
- Modify: `src/components/visualEngine.js` (constants ~line 9; move `activeById` build above `_drawEdges`; rewrite `_drawEdges` ~277-332)
- Test: `src/tests/browserLoad.test.js` (existing many-frames test must stay green)

**Interfaces:**
- Consumes: `edge.srcId`, `edge.dstId`, `edge.kind`, `edge.ctrl`, `edge.connected` (Task 5); `getModuleLevel`, `getLfoRate`, `getSeqPulses` (Task 6 + existing); `cableAnim.flowSpeed`, `waveSamples`, `echoEnvelope`, `cometTail`, `pulseProgress` (Tasks 1-4).
- Produces: waveform-rendered cables; consumed visually only.

- [ ] **Step 1: Add render constants**

In `src/components/visualEngine.js`, replace the Phase 5 tuning line (`const SPACING = 55, SPEED = 130, PULSE_MS = 150;`) with:

```js
  const PULSE_MS = 150;                                  // sequencer beat-pulse window
  const WAVELENGTH = 42, MAX_AMP = 14, SAMPLE_STEP = 6;  // audio/effect waveform
  const LFO_WAVELENGTH = 80, LFO_AMP = 6;                // slow control ripple
  const TAIL_SEGS = 4, TAIL_SPACING = 7;                 // sequencer pulse comet tail
  const RING_PULSE_MAX = 10;                             // extra px the ring glow grows
  const RING_ALPHA_MIN = 0.15, RING_ALPHA_MAX = 0.7;     // pulse glow alpha range
  const HUB_COLOR = '#88ffcc';                           // master output color
```

(Remove the old `flowDotDistances`-based dot loop in `_drawEdges` — replaced below. `flowDotDistances` stays in `cableAnim.js`, just unused now.)

- [ ] **Step 2: Build `activeById` before drawing edges**

In `render()`, the block that builds `activeById` (currently ~lines 53-55, *after* `_drawEdges`) must run *before* the edge draw. Move it so the order is:

```js
    // Index active modules by id for quick lookup (needed by edge coloring + rings)
    const activeById = {};
    getActiveModules().forEach(m => { activeById[m.id] = m; });

    // Draw edges beneath module rings so rings appear on top
    if (edges && edges.length > 0) {
      _drawEdges(edges, activeById);
    }
```

(Delete the now-duplicate `activeById` build that previously sat below the edge draw.)

- [ ] **Step 3: Rewrite `_drawEdges` for waveform cables**

Replace the entire `_drawEdges` function with:

```js
  // edges: [{fromPos, toPos, kind, ctrl, connected, alpha, srcId, dstId}]
  // Each connected cable renders its source signal as an animated wave; disconnected = faint dash.
  function _drawEdges(edges, activeById) {
    const now = (typeof performance !== 'undefined') ? performance.now() : 0;
    const colorOf = (id) => (id === 'master' ? HUB_COLOR : (activeById[id] && activeById[id].def.color) || HUB_COLOR);

    edges.forEach(edge => {
      const { fromPos, toPos, kind, connected, alpha, ctrl, srcId, dstId } = edge;
      const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
      const len = Math.hypot(dx, dy);

      visCtx.save();

      // Disconnected: faint dashed straight line, no signal (Phase 5 look).
      if (!connected || len === 0) {
        visCtx.globalAlpha = alpha * 0.35;
        visCtx.strokeStyle = '#aaaaff';
        visCtx.lineWidth = 1;
        visCtx.setLineDash([8, 8]);
        visCtx.beginPath(); visCtx.moveTo(fromPos.x, fromPos.y); visCtx.lineTo(toPos.x, toPos.y); visCtx.stroke();
        visCtx.restore();
        return;
      }

      const ux = dx / len, uy = dy / len;       // along-cable unit vector
      const px = -uy, py = ux;                   // perpendicular unit vector

      // Source -> dest color gradient, applied to whatever we stroke on this cable.
      const grad = visCtx.createLinearGradient(fromPos.x, fromPos.y, toPos.x, toPos.y);
      grad.addColorStop(0, colorOf(srcId));
      grad.addColorStop(1, colorOf(dstId));

      // Sequencer trigger link: dim base line + one beat-synced comet pulse (no continuous wave).
      if (kind === 'control' && ctrl === 'sequencer') {
        visCtx.globalAlpha = alpha * 0.5;
        visCtx.strokeStyle = grad; visCtx.lineWidth = 2;
        visCtx.shadowColor = '#ffb74d'; visCtx.shadowBlur = 8; visCtx.setLineDash([3, 9]);
        visCtx.beginPath(); visCtx.moveTo(fromPos.x, fromPos.y); visCtx.lineTo(toPos.x, toPos.y); visCtx.stroke();

        const pulses = (typeof getSeqPulses === 'function') ? getSeqPulses() : {};
        const prog = _anim.pulseProgress(pulses[srcId], now, PULSE_MS);
        if (prog != null) {
          const head = len * prog;
          visCtx.globalCompositeOperation = 'lighter';
          visCtx.setLineDash([]);
          const drawDot = (d, a, r) => {
            const x = fromPos.x + ux * d, y = fromPos.y + uy * d;
            visCtx.globalAlpha = a; visCtx.fillStyle = '#ffd9a0';
            visCtx.shadowColor = '#ffb74d'; visCtx.shadowBlur = 22;
            visCtx.beginPath(); visCtx.arc(x, y, r, 0, 2 * Math.PI); visCtx.fill();
          };
          _anim.cometTail(head, TAIL_SEGS, TAIL_SPACING, len).forEach(s => drawDot(s.d, s.alpha * 0.8, 3));
          drawDot(head, 1, 5);
        }
        visCtx.restore();
        return;
      }

      // Everything else renders an animated wave scrolling source -> dest.
      const isControl = kind === 'control';                     // LFO link
      const srcMod = activeById[srcId];
      const srcType = srcMod && srcMod.def ? (srcMod.def.subtype || srcMod.def.type) : 'oscillator';
      const level = (typeof getModuleLevel === 'function') ? getModuleLevel(srcId) : 0.5;

      let shape, wavelength, amp, speed;
      if (isControl) {                                          // LFO: slow fixed-amp sine
        shape = 'sine'; wavelength = LFO_WAVELENGTH; amp = LFO_AMP;
        const rate = (typeof getLfoRate === 'function') ? getLfoRate(srcId) : 1;
        speed = _anim.flowSpeed({ kind, ctrl, lfoRate: rate });
      } else {                                                  // audio chain
        shape = (srcType === 'filter') ? 'softsaw' : 'saw';
        wavelength = WAVELENGTH; amp = MAX_AMP * level;
        speed = _anim.flowSpeed({ kind: 'audio', level });
      }

      const phase = -(speed * (now / 1000)) / wavelength;        // scroll source -> dest
      const offs = _anim.waveSamples(len, { shape, wavelength, amplitude: amp, phase, step: SAMPLE_STEP });

      // Reconstruct the d positions waveSamples used (0,step,...,len).
      const ds = [];
      for (let d = 0; d <= len; d += SAMPLE_STEP) ds.push(d);
      if (ds.length === 0 || ds[ds.length - 1] !== len) ds.push(len);

      const isDelay = !isControl && srcType === 'delay';
      visCtx.globalCompositeOperation = 'lighter';              // additive bloom
      visCtx.globalAlpha = alpha * (isControl ? 0.8 : 0.95);
      visCtx.strokeStyle = grad;
      visCtx.lineWidth = isControl ? 1.5 : 2;
      visCtx.lineCap = 'round'; visCtx.lineJoin = 'round';
      visCtx.shadowColor = colorOf(srcId); visCtx.shadowBlur = 14;
      visCtx.beginPath();
      for (let k = 0; k < offs.length; k++) {
        const d = ds[k];
        const env = isDelay ? _anim.echoEnvelope(d, len, { count: 3, decay: 0.55 }) : 1;
        const o = offs[k] * env;
        const x = fromPos.x + ux * d + px * o;
        const y = fromPos.y + uy * d + py * o;
        if (k === 0) visCtx.moveTo(x, y); else visCtx.lineTo(x, y);
      }
      visCtx.stroke();
      visCtx.restore();
    });
  }
```

(Note: `_anim` is the existing module-top alias at line 8: `const _anim = (typeof require === 'function') ? require('../utils/cableAnim.js') : window.cableAnim;` — keep it as-is.)

- [ ] **Step 4: Run the full suite (rendering must not throw)**

Run: `npm test`
Expected: PASS — the `browserLoad` many-frames test exercises osc+filter+out+lfo and the sequencer link through the new `_drawEdges` without throwing.

- [ ] **Step 5: Commit**

```bash
git add src/components/visualEngine.js
git commit -m "feat: waveform cables (per-source-type signal, gradient + bloom)"
```

---

## Task 8: Level-reactive ring pulse

**Files:**
- Modify: `src/components/visualEngine.js` (per-module ring block, after the static outer glow ring ~lines 67-77)
- Test: `src/tests/browserLoad.test.js` (existing many-frames test stays green)

**Interfaces:**
- Consumes: `getModuleLevel(mod.id)` (Task 6); `RING_PULSE_MAX`, `RING_ALPHA_MIN`, `RING_ALPHA_MAX` (Task 7).
- Produces: visual only.

- [ ] **Step 1: Add the pulse ring**

In the `detectedWorldMarkers.forEach` loop, immediately after the existing "Outer glow ring" `visCtx.save()…restore()` block (the one drawing `arc(wx, wy, ringR, …)`), insert:

```js
      // Level-reactive pulse: an extra outer glow ring that grows/brightens with output level.
      const lvl = (typeof getModuleLevel === 'function') ? getModuleLevel(mod.id) : 0;
      if (lvl > 0.01) {
        visCtx.save();
        visCtx.globalCompositeOperation = 'lighter';
        visCtx.globalAlpha = RING_ALPHA_MIN + (RING_ALPHA_MAX - RING_ALPHA_MIN) * lvl;
        visCtx.strokeStyle = def.color;
        visCtx.shadowColor = def.color;
        visCtx.shadowBlur = 16;
        visCtx.lineWidth = 2;
        visCtx.beginPath();
        visCtx.arc(wx, wy, ringR + RING_PULSE_MAX * lvl, 0, 2 * Math.PI);
        visCtx.stroke();
        visCtx.restore();
      }
```

(Modules without a meter — controllers/globals — get `lvl === 0` and draw no pulse, so they stay static, exactly as designed.)

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS — rings render across many frames without throwing.

- [ ] **Step 3: Commit**

```bash
git add src/components/visualEngine.js
git commit -m "feat: level-reactive ring pulse"
```

- [ ] **Step 4: On-wall verification**

Open `index.html` with the webcam + projector. Confirm:
- Audio cables show a sawtooth wave; Filter output looks rounder; Delay cable echoes decay toward center; LFO link ripples slowly; sequencer pulse still fires on the beat with a short tail.
- Cables fade from the source puck's color to the destination color; overlapping glow reads as additive (brighter), not muddy.
- Rings visibly breathe with loudness; idle pucks sit still.
- Motion holds ~60 fps with osc + filter + delay + LFO + sequencer all present.

---

## Self-Review

**Spec coverage:**
- §2 meters + `getModuleLevel`/`getLfoRate` → Task 6. ✓
- §3 `meterToUnit`/`flowSpeed`/`waveSamples`/`echoEnvelope`/`cometTail` → Tasks 1-4. ✓
- §4.1 waveform cables (oscillator saw / filter softsaw / delay echo / LFO sine / sequencer pulse), gradient, bloom, disconnected dash → Task 7 (relies on edge `srcId`/`dstId` from Task 5). ✓
- §4.2 ring pulse from `getModuleLevel`, no-meter modules static → Task 8. ✓
- §6 tests: pure-helper units (Tasks 1-4), `getModuleLevel` unknown→0 + range + meter dispose-on-removal (Task 6 test exercises add; dispose path runs when markers drop — covered by browserLoad many-frames removing markers), browserLoad clean frames (Tasks 6-8). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `getModuleLevel`/`getLfoRate` signatures match across Tasks 6/7/8; `waveSamples` option keys (`shape`, `wavelength`, `amplitude`, `phase`, `step`) consistent between Task 3 impl and Task 7 caller; `cometTail` returns `{d, alpha}` used as such in Task 7; `echoEnvelope(d, len, {count, decay})` matches Task 4. Edge fields `srcId`/`dstId` produced in Task 5 consumed in Task 7. ✓

**Note on dispose coverage:** The spec's "meter disposed on removal" is verified implicitly by the browserLoad many-frames test (markers appear then drop, invoking `_removeModule`). If stricter coverage is wanted later, add a direct assertion that `activeModules` no longer holds the id after removal — not required for this phase.
