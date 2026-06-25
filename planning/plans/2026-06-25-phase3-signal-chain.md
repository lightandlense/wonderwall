# Reactable Wall — Phase 3 Signal Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the wall into a true Reactable signal chain — a generator's audio flows through an ordered series of effects into the output, an LFO modulates any module's parameter, and a global Tonality puck keeps pitch in key.

**Architecture:** A pure, per-frame `routingGraph` builds a `RoutingPlan` (audio chains via on-the-cable effect insertion, control links, tonality state) from the active-module snapshot. The side-effecting `audioEngine.applyRoutingPlan()` diffs that plan against the last applied one and only rewires Tone.js nodes that changed. `visualEngine` renders the plan. Pure logic (geometry, tonality, plan builder) is dual-exported so it runs both as a browser global and under Node's test runner.

**Tech Stack:** Vanilla JS (browser-global scripts, no bundler), Tone.js (CDN), js-aruco2 (CDN), Node v22 built-in test runner (`node --test`), no runtime dependencies.

## Global Constraints

- **No build step, no framework.** All `src/` files are plain `<script>` tags creating browser globals, loaded in dependency order in `index.html`. (verbatim: base spec §3 "plain HTML + vanilla JS, no framework, no build step")
- **Calibration corner IDs `10, 11, 13, 18` are reserved** — never assign as modules.
- **Module discriminator is `def.type`**: `'oscillator' | 'effect' | 'output' | 'controller' | 'global'`, with `def.subtype` for `'filter' | 'delay' | 'lfo' | 'tonality'`.
- **Locked decisions:** orphan generator (no output in range) is **silent**; **LFO behavior B** — target's rotation sets the modulated param's center, LFO's rotation sets the rate.
- **Tonality v1 scale is minor pentatonic only.**
- **Dual-export footer** on every new pure module:
  ```js
  if (typeof window !== 'undefined') window.NAME = NAME;
  if (typeof module !== 'undefined') module.exports = NAME;
  ```
- **Cross-module access pattern** (browser global OR Node require):
  ```js
  const dep = (typeof require === 'function') ? require('../utils/dep.js') : window.dep;
  ```
- Commit after every task. Conventional-commit messages.

---

### Task 1: Test harness + geometry util

**Files:**
- Create: `package.json`
- Create: `src/utils/geometry.js`
- Test: `src/tests/geometry.test.js`

**Interfaces:**
- Produces: `geometry.pointToSegment(px, py, ax, ay, bx, by) -> { dist: number, t: number }` where `t` is the projection parameter clamped to `[0,1]` and `dist` is the distance from the point to the (clamped) segment.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "reactable-wall",
  "version": "0.3.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "test": "node --test src/tests/"
  }
}
```

- [ ] **Step 2: Write the failing test** — `src/tests/geometry.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const geometry = require('../utils/geometry.js');

test('point on the segment midpoint: t=0.5, dist=0', () => {
  const r = geometry.pointToSegment(5, 0, 0, 0, 10, 0);
  assert.ok(Math.abs(r.t - 0.5) < 1e-9);
  assert.ok(Math.abs(r.dist - 0) < 1e-9);
});

test('point perpendicular to midpoint: t=0.5, dist=perp', () => {
  const r = geometry.pointToSegment(5, 4, 0, 0, 10, 0);
  assert.ok(Math.abs(r.t - 0.5) < 1e-9);
  assert.ok(Math.abs(r.dist - 4) < 1e-9);
});

test('point beyond endpoint B clamps to t=1', () => {
  const r = geometry.pointToSegment(20, 0, 0, 0, 10, 0);
  assert.strictEqual(r.t, 1);
  assert.ok(Math.abs(r.dist - 10) < 1e-9);
});

test('point before endpoint A clamps to t=0', () => {
  const r = geometry.pointToSegment(-5, 0, 0, 0, 10, 0);
  assert.strictEqual(r.t, 0);
  assert.ok(Math.abs(r.dist - 5) < 1e-9);
});

test('zero-length segment returns distance to the point', () => {
  const r = geometry.pointToSegment(3, 4, 0, 0, 0, 0);
  assert.strictEqual(r.t, 0);
  assert.ok(Math.abs(r.dist - 5) < 1e-9);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../utils/geometry.js'`

- [ ] **Step 4: Write the implementation** — `src/utils/geometry.js`

```js
// src/utils/geometry.js
// Pure 2D geometry helpers. No DOM, no Tone — safe to unit-test in Node.

const geometry = {
  // Distance from point P to segment A->B, plus the clamped projection
  // parameter t in [0,1] (0 = at A, 1 = at B).
  pointToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) {
      const ddx = px - ax;
      const ddy = py - ay;
      return { dist: Math.sqrt(ddx * ddx + ddy * ddy), t: 0 };
    }

    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));

    const projX = ax + t * dx;
    const projY = ay + t * dy;
    const ex = px - projX;
    const ey = py - projY;

    return { dist: Math.sqrt(ex * ex + ey * ey), t };
  },
};

if (typeof window !== 'undefined') window.geometry = geometry;
if (typeof module !== 'undefined') module.exports = geometry;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 5 geometry tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json src/utils/geometry.js src/tests/geometry.test.js
git commit -m "feat: add point-to-segment geometry util + node test harness"
```

---

### Task 2: Tonality util

**Files:**
- Create: `src/utils/tonality.js`
- Test: `src/tests/tonality.test.js`

**Interfaces:**
- Produces:
  - `tonality.rootFromT(t) -> integer 0..11` (pitch class from a [0,1] param value)
  - `tonality.quantizeFreqToScale(freq, root) -> number` (snaps a frequency to the nearest minor-pentatonic note of the given root pitch class)
  - `tonality.SCALE_MINOR_PENTATONIC` = `[0, 3, 5, 7, 10]`

- [ ] **Step 1: Write the failing test** — `src/tests/tonality.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const tonality = require('../utils/tonality.js');

test('rootFromT maps [0,1] to 12 pitch classes', () => {
  assert.strictEqual(tonality.rootFromT(0), 0);
  assert.strictEqual(tonality.rootFromT(0.999), 11);
  assert.strictEqual(tonality.rootFromT(0.5), 6);
  // clamps out-of-range input
  assert.strictEqual(tonality.rootFromT(-1), 0);
  assert.strictEqual(tonality.rootFromT(2), 11);
});

test('A4 (440) with root A(9) is already in scale -> unchanged', () => {
  const f = tonality.quantizeFreqToScale(440, 9);
  assert.ok(Math.abs(f - 440) < 0.5);
});

test('a frequency between scale notes snaps to the nearest scale note', () => {
  // C(0) minor pentatonic = C, Eb, F, G, Bb. A 'D' (MIDI 62, ~293.66 Hz)
  // is not in the scale; nearest members are C (60) and Eb (63).
  const dFreq = 293.66;
  const snapped = tonality.quantizeFreqToScale(dFreq, 0);
  const cFreq = 261.63;  // C4
  const ebFreq = 311.13; // Eb4
  const nearOne = Math.min(Math.abs(snapped - cFreq), Math.abs(snapped - ebFreq));
  assert.ok(nearOne < 1.0, `expected snap to C4 or Eb4, got ${snapped}`);
});

test('quantized note is a member of the scale (pitch class check)', () => {
  const snapped = tonality.quantizeFreqToScale(500, 2); // root D(2)
  const midi = Math.round(69 + 12 * Math.log2(snapped / 440));
  const pc = ((midi - 2) % 12 + 12) % 12;
  assert.ok(tonality.SCALE_MINOR_PENTATONIC.includes(pc));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../utils/tonality.js'`

- [ ] **Step 3: Write the implementation** — `src/utils/tonality.js`

```js
// src/utils/tonality.js
// Pure musical-quantization helpers. No DOM, no Tone.

const SCALE_MINOR_PENTATONIC = [0, 3, 5, 7, 10];

function _midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function _freqToMidi(f) { return 69 + 12 * Math.log2(f / 440); }

const tonality = {
  SCALE_MINOR_PENTATONIC,

  // [0,1] param -> pitch class 0..11
  rootFromT(t) {
    const c = Math.max(0, Math.min(0.999999, t));
    return Math.max(0, Math.min(11, Math.floor(c * 12)));
  },

  // Snap freq to the nearest minor-pentatonic note of `root` pitch class.
  quantizeFreqToScale(freq, root) {
    const m = _freqToMidi(freq);
    const base = Math.round(m);
    // Search outward from the rounded MIDI note for the nearest in-scale note.
    for (let delta = 0; delta <= 6; delta++) {
      for (const cand of (delta === 0 ? [base] : [base - delta, base + delta])) {
        const pc = ((cand - root) % 12 + 12) % 12;
        if (SCALE_MINOR_PENTATONIC.includes(pc)) {
          return _midiToFreq(cand);
        }
      }
    }
    return _midiToFreq(base); // unreachable for a 5-note scale, defensive
  },
};

if (typeof window !== 'undefined') window.tonality = tonality;
if (typeof module !== 'undefined') module.exports = tonality;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — geometry + tonality suites green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/tonality.js src/tests/tonality.test.js
git commit -m "feat: add tonality util (minor-pentatonic quantization)"
```

---

### Task 3: Expand the module registry

**Files:**
- Modify: `src/services/moduleRegistry.js` (full rewrite — small file)
- Test: `src/tests/moduleRegistry.test.js`

**Interfaces:**
- Produces a `MODULE_REGISTRY` object keyed by marker ID. Every entry has:
  `{ id, name, type, subtype?, color, paramLabel, getParamT(angle) }`.
  - Oscillator (0): `type:'oscillator'`, `getFreq(angle) -> Hz` (continuous; tonality applied later by audioEngine).
  - Filter (1): `type:'effect', subtype:'filter'`, `makeNode() -> Tone node`, `applyParam(node, t)`, `modParam:'frequency'`, `centerValue(t) -> Hz`.
  - Delay (2): `type:'effect', subtype:'delay'`, `makeNode`, `applyParam`, `modParam:'feedback'`, `centerValue(t) -> 0..0.85`.
  - Output (3): `type:'output'`, `getVolDb(angle) -> dB`.
  - LFO (4): `type:'controller', subtype:'lfo'`, `getRateHz(angle) -> Hz`.
  - Tonality (5): `type:'global', subtype:'tonality'`, `getRoot(angle) -> 0..11`.
- All `makeNode`/`applyParam` reference the global `Tone`; they are only ever called in the browser, never under Node tests. Tests cover only the pure mapping functions.

- [ ] **Step 1: Write the failing test** — `src/tests/moduleRegistry.test.js`

The registry references global `Tone` inside `makeNode`, so the test stubs it before requiring the file, then asserts on the pure mapping functions only.

```js
const { test } = require('node:test');
const assert = require('node:assert');

// Stub the Tone global the registry closes over (makeNode is never called here).
global.Tone = { Filter: function () {}, FeedbackDelay: function () {} };
global.window = undefined;
const tonality = require('../utils/tonality.js');
global.tonality = tonality; // registry uses global tonality in browser; mirror for Node
const MODULE_REGISTRY = require('../services/moduleRegistry.js');

test('registry has the six Phase 3 modules with correct types', () => {
  assert.strictEqual(MODULE_REGISTRY[0].type, 'oscillator');
  assert.strictEqual(MODULE_REGISTRY[1].type, 'effect');
  assert.strictEqual(MODULE_REGISTRY[1].subtype, 'filter');
  assert.strictEqual(MODULE_REGISTRY[2].subtype, 'delay');
  assert.strictEqual(MODULE_REGISTRY[3].type, 'output');
  assert.strictEqual(MODULE_REGISTRY[4].subtype, 'lfo');
  assert.strictEqual(MODULE_REGISTRY[5].subtype, 'tonality');
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

test('filter cutoff center rises with rotation; delay feedback within bounds', () => {
  const filt = MODULE_REGISTRY[1];
  assert.ok(filt.centerValue(0.1) < filt.centerValue(0.9));
  const dly = MODULE_REGISTRY[2];
  assert.ok(dly.centerValue(0) >= 0 && dly.centerValue(1) <= 0.85);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — registry has no `[1]`, `[2]`, `[4]`, `[5]` / missing `subtype`.

- [ ] **Step 3: Write the implementation** — `src/services/moduleRegistry.js` (full file)

```js
// src/services/moduleRegistry.js
// Marker ID -> audio module definition.
// Calibration IDs 10, 11, 13, 18 are reserved — never add them here.

const _ARC = Math.PI / 4; // +-45 deg stable tracking range of the topmost-edge convention

// Fold [0,2pi) smoother angle back to signed, map +-ARC -> [0,1] (saturating).
function _arcT(angle) {
  const signed = angle > Math.PI ? angle - 2 * Math.PI : angle;
  return Math.max(0, Math.min(1, signed / (2 * _ARC) + 0.5));
}

// Exponential map helper for [0,1] -> [lo,hi].
function _expMap(t, lo, hi) { return lo * Math.pow(hi / lo, t); }

const MODULE_REGISTRY = {
  // ID 0: Oscillator — rotation controls pitch (continuous; tonality applied by audioEngine)
  0: {
    id: 0, name: 'Oscillator', type: 'oscillator', color: '#44aaff', paramLabel: 'Pitch',
    getParamT(angle) { return _arcT(angle); },
    getFreq(angle) { return 130.81 * Math.pow(8, _arcT(angle)); }, // C3..C6, 3 octaves
  },

  // ID 1: Filter — rotation controls low-pass cutoff
  1: {
    id: 1, name: 'Filter', type: 'effect', subtype: 'filter', color: '#ff8a3d',
    paramLabel: 'Cutoff', modParam: 'frequency',
    getParamT(angle) { return _arcT(angle); },
    centerValue(t) { return _expMap(t, 200, 8000); }, // Hz
    makeNode() { return new Tone.Filter(_expMap(0.5, 200, 8000), 'lowpass'); },
    applyParam(node, t) { node.frequency.rampTo(this.centerValue(t), 0.05); },
  },

  // ID 2: Delay — rotation controls feedback amount (delay time fixed at 1/8 note)
  2: {
    id: 2, name: 'Delay', type: 'effect', subtype: 'delay', color: '#ff5db4',
    paramLabel: 'Feedback', modParam: 'feedback',
    getParamT(angle) { return _arcT(angle); },
    centerValue(t) { return Math.max(0, Math.min(0.85, t * 0.85)); },
    makeNode() { return new Tone.FeedbackDelay('8n', 0.4); },
    applyParam(node, t) { node.feedback.rampTo(this.centerValue(t), 0.05); },
  },

  // ID 3: Output / master — rotation controls overall volume
  3: {
    id: 3, name: 'Output', type: 'output', color: '#ffcc44', paramLabel: 'Volume',
    getParamT(angle) { return _arcT(angle); },
    getVolDb(angle) { return -40 + _arcT(angle) * 40; }, // -40 dB .. 0 dB
  },

  // ID 4: LFO — controller; rotation controls modulation rate
  4: {
    id: 4, name: 'LFO', type: 'controller', subtype: 'lfo', color: '#c98bff', paramLabel: 'Rate',
    getParamT(angle) { return _arcT(angle); },
    getRateHz(angle) { return _expMap(_arcT(angle), 0.1, 8); }, // 0.1 .. 8 Hz
  },

  // ID 5: Tonality — global; rotation selects root pitch class
  5: {
    id: 5, name: 'Tonality', type: 'global', subtype: 'tonality', color: '#5de0d0', paramLabel: 'Root',
    getParamT(angle) { return _arcT(angle); },
    getRoot(angle) {
      const tn = (typeof require === 'function') ? require('../utils/tonality.js') : window.tonality;
      return tn.rootFromT(_arcT(angle));
    },
  },
};

if (typeof window !== 'undefined') window.MODULE_REGISTRY = MODULE_REGISTRY;
if (typeof module !== 'undefined') module.exports = MODULE_REGISTRY;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all three suites green.

- [ ] **Step 5: Commit**

```bash
git add src/services/moduleRegistry.js src/tests/moduleRegistry.test.js
git commit -m "feat: expand module registry with Filter, Delay, LFO, Tonality"
```

---

### Task 4: Routing graph — pure plan builder

**Files:**
- Create: `src/services/routingGraph.js` (replaces `patchGraph.js` in a later task)
- Test: `src/tests/routingGraph.test.js`

**Interfaces:**
- Module shape (from `getActiveModules()`): `{ id, def, angle, wx, wy }`.
- Produces:
  - `routingGraph.CONSTANTS` = `{ PATCH_FRAC: 0.35, BAND_ADD: 60, BAND_KEEP: 95, CONTROL_FRAC: 0.30, CHAIN_HOLD_FRAMES: 3 }`
  - `routingGraph.buildRawPlan(modules, screenWidth, prevMembership) -> RoutingPlan` (pure; `prevMembership` is a `Set` of `"genId:effId"` strings used for spatial hysteresis)
  - `RoutingPlan = { chains: [{genId, nodeIds, outputId}], controlLinks: [{lfoId, targetId}], tonality: {active, root, scale}|null, membership: Set }`
  - `routingGraph.update(modules, screenWidth) -> RoutingPlan` (stateful: applies hysteresis + temporal debounce, returns the committed plan)
  - `routingGraph.getEdges(plan, modules) -> [{fromPos, toPos, kind, connected, alpha}]` where `kind` is `'audio' | 'control'`
  - `routingGraph.reset()` (clears internal committed state — for tests)

- [ ] **Step 1: Write the failing test** — `src/tests/routingGraph.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const routingGraph = require('../services/routingGraph.js');

// Minimal module stubs; def only needs `type`/`subtype`.
const osc = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'oscillator' } });
const out = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'output' } });
const eff = (id, x, y, st) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'effect', subtype: st } });
const lfo = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'controller', subtype: 'lfo' } });
const ton = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'global', subtype: 'tonality' } });

const SW = 1000; // screenWidth -> PATCH_RADIUS=350, CONTROL_RADIUS=300

test('osc near output with no effects -> direct chain', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 100, 100), out(3, 300, 100)], SW, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 3]);
  assert.strictEqual(plan.chains[0].outputId, 3);
});

test('osc with NO output in range -> silent chain (no outputId)', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 0, 0), out(3, 900, 0)], SW, new Set());
  assert.strictEqual(plan.chains[0].outputId, null);
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0]);
});

test('effect on the cable is inserted; off the cable is not', () => {
  // cable from (0,0)->(400,0). Filter at (200,10) is on it; delay at (200,300) is far.
  const mods = [osc(0, 0, 0), out(3, 400, 0), eff(1, 200, 10, 'filter'), eff(2, 200, 300, 'delay')];
  const plan = routingGraph.buildRawPlan(mods, SW, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 1, 3]);
});

test('two on-cable effects ordered by projection t', () => {
  // filter at t~0.75 (x=300), delay at t~0.25 (x=100): chain order delay then filter
  const mods = [osc(0, 0, 0), out(3, 400, 0), eff(1, 300, 5, 'filter'), eff(2, 100, 5, 'delay')];
  const plan = routingGraph.buildRawPlan(mods, SW, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 2, 1, 3]);
});

test('spatial hysteresis: effect between BAND_ADD and BAND_KEEP stays only if previously a member', () => {
  // perpendicular distance 80 is > BAND_ADD(60) and < BAND_KEEP(95)
  const mods = [osc(0, 0, 0), out(3, 400, 0), eff(1, 200, 80, 'filter')];
  const fresh = routingGraph.buildRawPlan(mods, SW, new Set());
  assert.deepStrictEqual(fresh.chains[0].nodeIds, [0, 3]); // not joined (needs <60)
  const sticky = routingGraph.buildRawPlan(mods, SW, new Set(['0:1']));
  assert.deepStrictEqual(sticky.chains[0].nodeIds, [0, 1, 3]); // stays (was member, <95)
});

test('LFO links to nearest audio module, never to output', () => {
  const mods = [osc(0, 0, 0), out(3, 400, 0), eff(1, 200, 0, 'filter'), lfo(4, 210, 30)];
  const plan = routingGraph.buildRawPlan(mods, SW, new Set(['0:1']));
  assert.deepStrictEqual(plan.controlLinks, [{ lfoId: 4, targetId: 1 }]);
});

test('tonality present -> plan carries active tonality state', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 0, 0), ton(5, 50, 50)], SW, new Set());
  assert.strictEqual(plan.tonality.active, true);
  assert.strictEqual(plan.tonality.scale, 'minorPentatonic');
});

test('temporal debounce: a new chain commits only after CHAIN_HOLD_FRAMES updates', () => {
  routingGraph.reset();
  const mods = [osc(0, 0, 0), out(3, 300, 0)];
  let plan;
  for (let i = 0; i < routingGraph.CONSTANTS.CHAIN_HOLD_FRAMES - 1; i++) {
    plan = routingGraph.update(mods, SW);
    assert.deepStrictEqual(plan.chains[0].nodeIds, [0], `frame ${i} not yet committed`);
  }
  plan = routingGraph.update(mods, SW); // reaches the threshold
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 3]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../services/routingGraph.js'`

- [ ] **Step 3: Write the implementation** — `src/services/routingGraph.js`

```js
// src/services/routingGraph.js
// Pure, per-frame routing planner. Replaces patchGraph.js.
// Produces a RoutingPlan that audioEngine.applyRoutingPlan() executes.

const geometry = (typeof require === 'function') ? require('../utils/geometry.js') : window.geometry;

const CONSTANTS = {
  PATCH_FRAC: 0.35,     // osc<->output connect distance as fraction of screen width
  BAND_ADD: 60,         // perpendicular px to JOIN a cable
  BAND_KEEP: 95,        // perpendicular px to STAY on a cable (hysteresis)
  CONTROL_FRAC: 0.30,   // lfo<->target distance as fraction of screen width
  CHAIN_HOLD_FRAMES: 3, // frames a chain change must persist before committing
};

function _dist(a, b) {
  const dx = a.wx - b.wx, dy = a.wy - b.wy;
  return Math.sqrt(dx * dx + dy * dy);
}

// Pure: build the desired plan from a module snapshot.
// prevMembership: Set of "genId:effId" strings (for spatial hysteresis).
function buildRawPlan(modules, screenWidth, prevMembership) {
  const patchR = screenWidth * CONSTANTS.PATCH_FRAC;
  const controlR = screenWidth * CONSTANTS.CONTROL_FRAC;
  const prev = prevMembership || new Set();

  const gens = modules.filter(m => m.def.type === 'oscillator');
  const effects = modules.filter(m => m.def.type === 'effect');
  const outputs = modules.filter(m => m.def.type === 'output');
  const lfos = modules.filter(m => m.def.type === 'controller');
  const tonalityMod = modules.find(m => m.def.type === 'global' && m.def.subtype === 'tonality');

  const membership = new Set();
  const chains = gens.map(gen => {
    // nearest output within patch radius
    let out = null, outDist = Infinity;
    outputs.forEach(o => { const d = _dist(gen, o); if (d < patchR && d < outDist) { out = o; outDist = d; } });

    if (!out) return { genId: gen.id, nodeIds: [gen.id], outputId: null };

    // effects on the cable gen->out
    const onCable = [];
    effects.forEach(e => {
      const { dist, t } = geometry.pointToSegment(e.wx, e.wy, gen.wx, gen.wy, out.wx, out.wy);
      if (t <= 0 || t >= 1) return;
      const wasMember = prev.has(`${gen.id}:${e.id}`);
      const band = wasMember ? CONSTANTS.BAND_KEEP : CONSTANTS.BAND_ADD;
      if (dist < band) { onCable.push({ id: e.id, t }); membership.add(`${gen.id}:${e.id}`); }
    });
    onCable.sort((a, b) => a.t - b.t);

    return { genId: gen.id, nodeIds: [gen.id, ...onCable.map(e => e.id), out.id], outputId: out.id };
  });

  // control links: each LFO -> nearest audio module (osc or effect) in range
  const controlLinks = [];
  lfos.forEach(l => {
    let target = null, td = Infinity;
    modules.forEach(m => {
      if (m.def.type !== 'oscillator' && m.def.type !== 'effect') return;
      const d = _dist(l, m);
      if (d < controlR && d < td) { target = m; td = d; }
    });
    if (target) controlLinks.push({ lfoId: l.id, targetId: target.id });
  });

  const tonality = tonalityMod
    ? { active: true, root: tonalityMod.def.getRoot(tonalityMod.angle), scale: 'minorPentatonic' }
    : null;

  return { chains, controlLinks, tonality, membership };
}

// ---- stateful debounce layer ----
let _committed = { chains: [], controlLinks: [], tonality: null, membership: new Set() };
let _holds = {}; // key -> frames the pending value has persisted

function _chainKey(c) { return `${c.genId}=${c.nodeIds.join('>')}`; }

function update(modules, screenWidth) {
  const raw = buildRawPlan(modules, screenWidth, _committed.membership);

  // Debounce per generator chain: a changed chain must persist CHAIN_HOLD_FRAMES.
  const committedByGen = {};
  _committed.chains.forEach(c => { committedByGen[c.genId] = c; });
  const newChains = raw.chains.map(rawChain => {
    const prevChain = committedByGen[rawChain.genId];
    if (prevChain && _chainKey(prevChain) === _chainKey(rawChain)) {
      _holds[`chain:${rawChain.genId}`] = 0;
      return prevChain;
    }
    const k = `chain:${rawChain.genId}`;
    _holds[k] = (_holds[k] || 0) + 1;
    if (_holds[k] >= CONSTANTS.CHAIN_HOLD_FRAMES || !prevChain && rawChain.nodeIds.length === 1) {
      _holds[k] = 0;
      return rawChain;
    }
    return prevChain || { genId: rawChain.genId, nodeIds: [rawChain.genId], outputId: null };
  });

  // Control links + tonality commit immediately (low pop risk).
  _committed = {
    chains: newChains,
    controlLinks: raw.controlLinks,
    tonality: raw.tonality,
    membership: raw.membership,
  };
  return _committed;
}

function reset() {
  _committed = { chains: [], controlLinks: [], tonality: null, membership: new Set() };
  _holds = {};
}

// Visual edges from the committed plan.
function getEdges(plan, modules) {
  const byId = {};
  modules.forEach(m => { byId[m.id] = m; });
  const edges = [];

  plan.chains.forEach(c => {
    if (!c.outputId) return;
    for (let i = 0; i < c.nodeIds.length - 1; i++) {
      const a = byId[c.nodeIds[i]], b = byId[c.nodeIds[i + 1]];
      if (!a || !b) continue;
      edges.push({ fromPos: { x: a.wx, y: a.wy }, toPos: { x: b.wx, y: b.wy }, kind: 'audio', connected: true, alpha: 1 });
    }
  });

  plan.controlLinks.forEach(l => {
    const a = byId[l.lfoId], b = byId[l.targetId];
    if (!a || !b) return;
    edges.push({ fromPos: { x: a.wx, y: a.wy }, toPos: { x: b.wx, y: b.wy }, kind: 'control', connected: true, alpha: 1 });
  });

  return edges;
}

const routingGraph = { CONSTANTS, buildRawPlan, update, reset, getEdges };

if (typeof window !== 'undefined') window.routingGraph = routingGraph;
if (typeof module !== 'undefined') module.exports = routingGraph;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all routingGraph tests green (note the debounce test calls `reset()` first).

- [ ] **Step 5: Commit**

```bash
git add src/services/routingGraph.js src/tests/routingGraph.test.js
git commit -m "feat: routingGraph pure plan builder (on-the-cable chains, control links, hysteresis, debounce)"
```

---

### Task 5: Generalize the audio engine

**Files:**
- Modify: `src/services/audioEngine.js`
- (No unit test — Tone.js needs a browser AudioContext. Verified on-wall in Task 8.)

**Interfaces:**
- Consumes: `MODULE_REGISTRY` (Task 3), `tonality` util (Task 2), `createAngleSmoother()` (existing).
- Produces (new/changed globals): `window.applyRoutingPlan(plan)`, and `getActiveModules()` unchanged. Removes `window.rerouteOscillator` (superseded).

- [ ] **Step 1: Generalize `_addModule` node creation**

Replace the `if (def.type === 'oscillator') … else if (def.type === 'output')` block in `_addModule` with branches for all classes:

```js
  let node = null;

  if (def.type === 'oscillator') {
    const synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.1, decay: 0, sustain: 1, release: 0.3 },
    });
    synth.triggerAttack(_oscFreq(def, smoother.get()));
    node = synth; // routing connects it; starts disconnected from destination
  } else if (def.type === 'output') {
    node = new Tone.Volume(def.getVolDb(smoother.get())).toDestination();
  } else if (def.type === 'effect') {
    node = def.makeNode();          // created disconnected; routing inserts it
    def.applyParam(node, def.getParamT(smoother.get()));
  } else if (def.type === 'controller' && def.subtype === 'lfo') {
    node = new Tone.LFO(def.getRateHz(smoother.get()), 0, 1).start();
  } else if (def.type === 'global') {
    node = null;                    // tonality has no audio node
  }
```

- [ ] **Step 2: Add the tonality-aware oscillator frequency helper + global tonality state**

Add near the top of the file (after `activeModules`):

```js
// Global tonality state, set by applyRoutingPlan from the routing plan.
let _tonality = null; // { active, root, scale } | null
const _tonalityUtil = (typeof require === 'function') ? require('../utils/tonality.js') : window.tonality;

// Oscillator frequency with optional scale quantization.
function _oscFreq(def, angle) {
  const f = def.getFreq(angle);
  if (_tonality && _tonality.active) return _tonalityUtil.quantizeFreqToScale(f, _tonality.root);
  return f;
}

// Set of module ids currently driven by an LFO (skip direct param ramp for them).
let _lfoTargets = new Set();
```

- [ ] **Step 3: Update `_updateModule` to use `_oscFreq`, drive effects, and respect LFO targets**

Replace the body after `const angle = m.smoother.get();` with:

```js
  if (m.def.type === 'oscillator' && m.node) {
    m.node.frequency.rampTo(_oscFreq(m.def, angle), 0.05);
  } else if (m.def.type === 'output' && m.node) {
    m.node.volume.rampTo(m.def.getVolDb(angle), 0.05);
  } else if (m.def.type === 'effect' && m.node && !_lfoTargets.has(m.def.id)) {
    // While an LFO drives this effect, its rotation feeds the LFO window instead (handled in applyRoutingPlan).
    m.def.applyParam(m.node, m.def.getParamT(angle));
  } else if (m.def.type === 'controller' && m.node) {
    m.node.frequency.rampTo(m.def.getRateHz(angle), 0.05);
  }
```

- [ ] **Step 4: Replace `rerouteOscillator` with `applyRoutingPlan`**

Delete the entire `rerouteOscillator` function and its `window.rerouteOscillator` export. Add:

```js
let _lastChainKeys = {}; // genId -> last applied "a>b>c" string
let _activeLinks = {};   // lfoId -> targetId currently connected

// Map an effect/osc module to the Tone Param the LFO should modulate (option B).
function _modTargetParam(mod) {
  const p = mod.def.modParam;                 // 'frequency' | 'feedback'
  if (mod.def.type === 'oscillator') return mod.node.detune; // vibrato
  return mod.node[p];
}

// Set the LFO's min/max window centered on the target's current rotation value.
function _setLfoWindow(lfoMod, targetMod) {
  const t = targetMod.def.getParamT(targetMod.smoother.get());
  if (targetMod.def.type === 'oscillator') {
    lfoMod.node.min = -30; lfoMod.node.max = 30;        // +-30 cents vibrato
  } else if (targetMod.def.subtype === 'filter') {
    const c = targetMod.def.centerValue(t);
    lfoMod.node.min = c * 0.5; lfoMod.node.max = c * 2;  // +- octave around cutoff
  } else if (targetMod.def.subtype === 'delay') {
    const c = targetMod.def.centerValue(t);
    lfoMod.node.min = Math.max(0, c - 0.2); lfoMod.node.max = Math.min(0.85, c + 0.2);
  }
}

// Execute a RoutingPlan: rewire only chains/links that changed; refresh LFO windows.
function applyRoutingPlan(plan) {
  if (!audioInitialized) return;
  _tonality = plan.tonality;

  // ---- audio chains ----
  const seenGen = new Set();
  plan.chains.forEach(chain => {
    seenGen.add(chain.genId);
    const key = chain.nodeIds.join('>');
    if (_lastChainKeys[chain.genId] === key) return; // unchanged
    _lastChainKeys[chain.genId] = key;

    // Disconnect every node in the chain, then reconnect in series.
    chain.nodeIds.forEach(id => { const m = activeModules[id]; if (m && m.node) { try { m.node.disconnect(); } catch (_) {} } });

    if (!chain.outputId) {
      // silent: leave generator disconnected
      return;
    }
    for (let i = 0; i < chain.nodeIds.length - 1; i++) {
      const a = activeModules[chain.nodeIds[i]];
      const b = activeModules[chain.nodeIds[i + 1]];
      if (a && a.node && b && b.node) a.node.connect(b.node);
    }
    // output node already routes to Destination (created with .toDestination())
  });
  // generators that vanished from the plan: drop their cached key
  Object.keys(_lastChainKeys).forEach(g => { if (!seenGen.has(Number(g))) delete _lastChainKeys[g]; });

  // ---- control links ----
  const desired = {}; plan.controlLinks.forEach(l => { desired[l.lfoId] = l.targetId; });

  // tear down links that changed/disappeared
  Object.keys(_activeLinks).forEach(lfoIdStr => {
    const lfoId = Number(lfoIdStr);
    if (desired[lfoId] !== _activeLinks[lfoId]) {
      const lfoMod = activeModules[lfoId];
      if (lfoMod && lfoMod.node) { try { lfoMod.node.disconnect(); } catch (_) {} }
      delete _activeLinks[lfoId];
    }
  });
  // establish new links
  plan.controlLinks.forEach(l => {
    const lfoMod = activeModules[l.lfoId];
    const tgtMod = activeModules[l.targetId];
    if (!lfoMod || !lfoMod.node || !tgtMod || !tgtMod.node) return;
    if (_activeLinks[l.lfoId] !== l.targetId) {
      _setLfoWindow(lfoMod, tgtMod);
      try { lfoMod.node.connect(_modTargetParam(tgtMod)); } catch (_) {}
      _activeLinks[l.lfoId] = l.targetId;
    } else {
      _setLfoWindow(lfoMod, tgtMod); // keep window centered as the target is turned (option B, live)
    }
  });

  // refresh the set of LFO-driven targets so _updateModule stops fighting the LFO
  _lfoTargets = new Set(Object.values(_activeLinks));
}
```

- [ ] **Step 5: Update the exports at the bottom of the file**

```js
window.initAudio          = initAudio;
window.reconcileModules   = reconcileModules;
window.getModuleParam     = getModuleParam;
window.getActiveModules   = getActiveModules;
window.applyRoutingPlan   = applyRoutingPlan;
```

- [ ] **Step 6: Sanity-check the test suite still passes (no audioEngine tests, but nothing else broke)**

Run: `npm test`
Expected: PASS — geometry, tonality, moduleRegistry, routingGraph suites unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/services/audioEngine.js
git commit -m "feat: generalize audioEngine to apply RoutingPlan (effects chain, LFO option B, tonality)"
```

---

### Task 6: Visual engine — chains, control links, tonality HUD

**Files:**
- Modify: `src/components/visualEngine.js`
- (No unit test — canvas rendering verified on-wall.)

**Interfaces:**
- Consumes: `getActiveModules()`, and the edge list from `routingGraph.getEdges(plan, modules)` where each edge has `{ fromPos, toPos, kind: 'audio'|'control', connected, alpha }`.
- Produces: `visualEngine.draw(detectedWorldMarkers, edges)` (edges param replaces the old patchEdges; `_drawPatchEdges` becomes `_drawEdges` and branches on `kind`).

- [ ] **Step 1: Branch edge rendering by kind**

Replace `_drawPatchEdges(edges)` with `_drawEdges(edges)` that styles `kind:'control'` distinctly (purple, dotted, midpoint pulse) and `kind:'audio'` as the existing green glowing cable:

```js
  function _drawEdges(edges) {
    edges.forEach(edge => {
      const { fromPos, toPos, kind, connected, alpha } = edge;
      visCtx.save();
      if (kind === 'control') {
        visCtx.globalAlpha = alpha * 0.9;
        visCtx.strokeStyle = '#c98bff';
        visCtx.lineWidth = 2;
        visCtx.shadowColor = '#c98bff';
        visCtx.shadowBlur = 12;
        visCtx.setLineDash([3, 9]);
      } else {
        visCtx.globalAlpha = alpha * (connected ? 0.9 : 0.35);
        visCtx.strokeStyle = connected ? '#88ffcc' : '#aaaaff';
        visCtx.lineWidth = connected ? 2 : 1;
        visCtx.shadowColor = connected ? '#44ffaa' : '#8888ff';
        visCtx.shadowBlur = connected ? 16 : 6;
        if (!connected) visCtx.setLineDash([8, 8]);
      }
      visCtx.beginPath();
      visCtx.moveTo(fromPos.x, fromPos.y);
      visCtx.lineTo(toPos.x, toPos.y);
      visCtx.stroke();
      if (connected) {
        const mx = (fromPos.x + toPos.x) / 2, my = (fromPos.y + toPos.y) / 2;
        visCtx.fillStyle = kind === 'control' ? '#e0b3ff' : '#88ffcc';
        visCtx.shadowBlur = 20;
        visCtx.beginPath();
        visCtx.arc(mx, my, 4, 0, 2 * Math.PI);
        visCtx.fill();
      }
      visCtx.restore();
    });
  }
```

- [ ] **Step 2: Rename the `draw()` param and call site**

In `draw(detectedWorldMarkers, patchEdges)` rename `patchEdges` to `edges`, and the call `if (patchEdges && patchEdges.length > 0) { _drawPatchEdges(patchEdges); }` becomes `if (edges && edges.length > 0) { _drawEdges(edges); }`.

- [ ] **Step 3: Add the tonality HUD pill**

After the module-ring loop (before the debug overlay), draw a tonality pill if a tonality module is active:

```js
    // Tonality HUD pill (top-right) when a Tonality puck is present
    const tonMod = getActiveModules().find(m => m.def.subtype === 'tonality');
    if (tonMod) {
      const tn = (typeof require === 'function') ? null : window.tonality;
      const root = tonMod.def.getRoot(tonMod.angle);
      const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
      visCtx.save();
      visCtx.fillStyle = 'rgba(12,26,24,0.85)';
      visCtx.strokeStyle = '#1f4a44';
      visCtx.beginPath();
      const px = W - 360, py = 24;
      visCtx.roundRect ? visCtx.roundRect(px, py, 336, 34, 17) : visCtx.rect(px, py, 336, 34);
      visCtx.fill(); visCtx.stroke();
      visCtx.fillStyle = '#6ee7d6';
      visCtx.font = '14px monospace';
      visCtx.textAlign = 'left';
      visCtx.fillText(`♪ ${NAMES[root]} minor pentatonic`, px + 18, py + 22);
      visCtx.restore();
    }
```

- [ ] **Step 4: Extend the debug readout to print chains + links**

In the debug section, replace the Phase 2 patch-distance line's text construction with a routing summary built from the active modules (kept simple — full chain detail is logged to console by audioEngine). Update the existing `patchText` to also show control links if present. (Minimal change: append `getActiveModules()` controller count.) Leave the existing distance readout intact; add one line above it:

```js
    // Routing summary line (added at H-100)
    const ctrlCount = getActiveModules().filter(m => m.def.type === 'controller').length;
    const effCount  = getActiveModules().filter(m => m.def.type === 'effect').length;
    debugCtx.save();
    debugCtx.font = '12px monospace';
    debugCtx.textAlign = 'left';
    debugCtx.fillStyle = 'rgba(0,0,0,0.65)';
    debugCtx.fillRect(8, H - 100, Math.min(W - 16, 700), 20);
    debugCtx.fillStyle = '#9ad';
    debugCtx.fillText(`Modules: ${effCount} effect(s), ${ctrlCount} controller(s) — see console for live chain`, 14, H - 86);
    debugCtx.restore();
```

- [ ] **Step 5: Update the return object**

The IIFE returns `{ init, draw }` — unchanged (draw signature stays `draw(markers, edges)`).

- [ ] **Step 6: Commit**

```bash
git add src/components/visualEngine.js
git commit -m "feat: visualEngine renders multi-segment chains, control links, tonality HUD"
```

---

### Task 7: Wire it together — index.html + print.html

**Files:**
- Modify: `index.html` (script tags + `onMarkersDetected`)
- Modify: `print.html` (marker IDs/labels)
- Delete: `src/services/patchGraph.js` (superseded by routingGraph.js)

**Interfaces:**
- Consumes: `routingGraph.update`, `routingGraph.getEdges`, `applyRoutingPlan`, `getActiveModules`, `visualEngine.draw`.

- [ ] **Step 1: Add script tags for the new modules; remove patchGraph**

In `index.html`, replace the patchGraph line and add geometry/tonality/routingGraph in dependency order. The block becomes:

```html
  <script src="src/utils/angleSmoothing.js"></script>
  <script src="src/utils/geometry.js"></script>
  <script src="src/utils/tonality.js"></script>
  <script src="src/services/moduleRegistry.js"></script>
  <script src="src/services/audioEngine.js"></script>
  <script src="src/components/visualEngine.js"></script>
  <script src="src/services/routingGraph.js"></script>
  <!-- Starts webcam automatically on load -->
  <script src="src/services/tracking.js"></script>
```

(Remove the old `<script src="src/services/patchGraph.js"></script>` line.)

- [ ] **Step 2: Rewrite `onMarkersDetected` to use the routing plan**

```js
    window.onMarkersDetected = function(detected) {
      reconcileModules(detected);
      const active = getActiveModules();
      const plan = routingGraph.update(active, window.innerWidth);
      applyRoutingPlan(plan);
      const edges = routingGraph.getEdges(plan, active);
      visualEngine.draw(detected, edges);
    };
```

- [ ] **Step 3: Update the start-banner copy**

```html
    <p>Place ID 0 (Oscillator) + ID 3 (Output) to make sound.<br>
       Drop ID 1 (Filter) or ID 2 (Delay) on the cable between them to shape it.<br>
       ID 4 (LFO) modulates the nearest puck. ID 5 (Tonality) keeps you in key.</p>
```

- [ ] **Step 4: Update `print.html` puck markers**

Set the puck list and labels to the Phase 3 modules:

```js
    const PUCK_IDS = [0, 1, 2, 3, 4, 5];
    const PUCK_LABELS = {
      0: 'Oscillator — turn for pitch (C3–C6)',
      1: 'Filter — turn for cutoff; place on a cable',
      2: 'Delay — turn for feedback; place on a cable',
      3: 'Output / Master — turn for volume',
      4: 'LFO — turn for rate; place near a puck to modulate it',
      5: 'Tonality — turn to pick the key',
    };
```

Also update the print intro line that lists puck IDs from `(0, 3)` to `(0–5)`.

- [ ] **Step 5: Delete the superseded patchGraph file**

```bash
git rm src/services/patchGraph.js
```

- [ ] **Step 6: Verify the full test suite + a Node smoke-load of every browser module**

Run: `npm test`
Expected: PASS — all suites green.

Run: `node -e "global.window=undefined; require('./src/utils/geometry.js'); require('./src/utils/tonality.js'); require('./src/services/routingGraph.js'); console.log('modules load clean');"`
Expected: prints `modules load clean` (catches a stray browser-only reference in a pure module).

- [ ] **Step 7: Commit**

```bash
git add index.html print.html
git commit -m "feat: wire Phase 3 routing plan into index.html; update print markers; remove patchGraph"
```

---

### Task 8: On-wall verification

**Files:** none (manual validation — the project's established method).

This task has no unit tests because it validates Tone.js audio + projected canvas + live ArUco tracking, which require the physical rig. Use the printed markers and the on-screen debug readout + browser console (audioEngine logs each connect/disconnect).

- [ ] **Step 1: Open the app**

Open `index.html` in Chrome, click TAP TO START, confirm webcam starts and the console shows `[audio] AudioContext started`.

- [ ] **Step 2: Verify baseline (Phase 2 parity)**

Place ID 0 + ID 3 in view. Expected: a tone plays, a green cable connects them, rotating ID 0 bends pitch, rotating ID 3 changes volume. Console: `[audio] patched osc 0 -> output 3` style logs.

- [ ] **Step 3: Verify effect insertion (on-the-cable)**

Place ID 1 (Filter) on the line between ID 0 and ID 3. Expected: the cable now routes `0→1→3`, the timbre changes as you rotate ID 1 (cutoff), and the green cable visibly passes through the filter puck. Slide ID 1 off the line → it drops out and the sound reverts.

- [ ] **Step 4: Verify chaining + order**

Add ID 2 (Delay) on the cable too. Expected: chain becomes `0→1→2→3` or `0→2→1→3` depending on each puck's position along the line; the chain order matches left-to-right placement. Console logs the new chain.

- [ ] **Step 5: Verify LFO (option B)**

Place ID 4 (LFO) near the Filter. Expected: a purple dotted control link forms; the filter cutoff now wobbles. Rotating ID 4 changes wobble speed; rotating ID 1 moves the center cutoff the wobble rides on. Move the LFO away → wobble stops, link disappears.

- [ ] **Step 6: Verify Tonality**

Place ID 5 (Tonality). Expected: the teal `♪ <root> minor pentatonic` pill appears; rotating ID 0 now snaps to scale steps (audible discrete pitches) instead of a continuous glide; rotating ID 5 changes the root in the pill.

- [ ] **Step 7: Verify stability**

Cover/uncover pucks and nudge them near band edges. Expected: no rapid connect/disconnect flicker (hysteresis + debounce), no audio pops on chain changes.

- [ ] **Step 8: Update project memory + convo log**

Record Phase 3 shipped in `../../AgentTeam/shared/memory/convo_log_beta.md` and the project memory file, then notify Russell via Telegram that Phase 3 is live (per his "ping when done" standing request this session).

---

## Self-Review

**Spec coverage:**
- §2 module registry → Task 3 ✓ (all 6 modules, reserved IDs guarded)
- §3.1 on-the-cable insertion → Task 4 (`buildRawPlan`, geometry) ✓
- §3.2 hysteresis + debounce → Task 4 (`BAND_ADD/KEEP`, `CHAIN_HOLD_FRAMES`, tests) ✓
- §3.3 control links → Task 4 ✓
- §3.4 tonality → Task 2 (util) + Task 4 (plan) + Task 5 (apply) ✓
- §4 audioEngine generalization → Task 5 ✓ (option B in `_setLfoWindow`/`_modTargetParam`)
- §4.4 tonality-aware pitch → Task 5 `_oscFreq` ✓ (applied in audioEngine, not registry — coherent with util split; noted)
- §5 visuals → Task 6 ✓
- §6 testing → Tasks 1–4 unit tests + Task 8 manual ✓
- §7 files touched → Tasks 3–7 cover every listed file ✓
- §8 tuning constants → `routingGraph.CONSTANTS` (Task 4) ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. Glue tasks (5–7) show full functions/diffs.

**Type consistency:** `RoutingPlan` shape (`chains[].nodeIds`, `controlLinks[].{lfoId,targetId}`, `tonality.{active,root,scale}`) is identical across routingGraph (Task 4), audioEngine.applyRoutingPlan (Task 5), and getEdges/visualEngine (Tasks 4/6). `def.modParam`/`centerValue`/`getParamT` defined in Task 3 and consumed in Task 5. Edge `kind` (`'audio'|'control'`) defined in Task 4 `getEdges`, consumed in Task 6 `_drawEdges`. ✓

**Deviation noted:** spec §4.4 implied `getFreq` consults tonality internally; plan applies quantization in `audioEngine._oscFreq` instead, keeping the registry pure and the quantizer in the tested util. Same behavior, cleaner boundary.
