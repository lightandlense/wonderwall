# Reactable Wall — Phase 4: Central Output + Sequencer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-on central output (oscillators sound the moment they're placed) and a Sequencer puck that gates the nearest oscillator on a clock using searchable preset rhythms (and walks a scale into melody when Tonality is present).

**Architecture:** Two cohesive changes. Part A: `routingGraph` chains now flow to a fixed wall-center master node instead of an Output puck; ID 3 becomes an optional master-volume control. Part B: a new Sequencer controller links to the nearest oscillator; a global `Tone.Transport` + `Tone.Loop('16n')` reads a preset 16-step pattern and triggers the oscillator per hit. Pure logic (routing, rhythm bank, scale walk) is unit-tested in Node; audio/visual glue is verified on-wall plus a shared-scope browser-load test.

**Tech Stack:** Vanilla JS browser-global scripts (no bundler), Tone.js (CDN), js-aruco2 (CDN), Node v22 `node --test`, no runtime deps.

## Global Constraints

- **No build step, no framework.** All `src/` files are plain `<script>` tags creating browser globals, loaded in dependency order in `index.html`.
- **Calibration corner IDs `10, 11, 13, 18` are reserved** — never assign as modules.
- **Module discriminator is `def.type`**: `'oscillator' | 'effect' | 'controller' | 'global'`, with `def.subtype` for `'filter' | 'delay' | 'lfo' | 'tonality' | 'sequencer' | 'volume'`. (Type `'output'` is removed this phase.)
- **Dual-export footer** on every new/edited pure module:
  ```js
  if (typeof window !== 'undefined') window.NAME = NAME;
  if (typeof module !== 'undefined') module.exports = NAME;
  ```
- **Cross-module access in pure files** (browser global OR Node require):
  ```js
  const dep = (typeof require === 'function') ? require('./dep.js') : window.dep;
  ```
  Never name a top-level `const` the same as another browser-global file's `const` (Phase 3 bug: `geometry` collided across `<script>`s in shared scope).
- **Tuning constants (verbatim):** `BPM = 110`, `DEFAULT_DB = -6`, `STEPS = 16`, `CONNECT_FRAC = 0.35`, `KEEP_FACTOR = 1.25`, `CONTROL_FRAC = 0.30`, `CHAIN_HOLD_FRAMES = 3`.
- **Locked behavior:** oscillator **always** reaches center (no distance gate → always audible). Sequencer rotation **selects a preset pattern** (not Euclidean). Each ON step `triggerAttackRelease(freq, '16n')`; melodic walk only when a Tonality puck is present.
- `npm test` must stay green; commit after every task.

---

## PART A — Central output

### Task 1: routingGraph targets the center + generalized controller links

**Files:**
- Modify: `src/services/routingGraph.js` (rewrite `buildRawPlan`, `update`, `getEdges`)
- Test: `src/tests/routingGraph.test.js` (rewrite for center target)

**Interfaces:**
- Module shape (from `getActiveModules()`): `{ id, def, angle, wx, wy }`.
- Produces:
  - `routingGraph.update(modules, viewport) -> RoutingPlan` where `viewport = { w, h }`.
  - `routingGraph.buildRawPlan(modules, viewport, prevMembership) -> RoutingPlan`.
  - `RoutingPlan = { chains: [{genId, nodeIds}], controlLinks: [{controllerId, targetId}], tonality, membership }`. Every chain ends in the sentinel string `'master'`; there is no `outputId` and no silent chain.
  - `routingGraph.getEdges(plan, modules, viewport) -> [{fromPos, toPos, kind:'audio'|'control', ctrl?, connected, alpha}]` (the `'master'` node's position is the center).
  - `routingGraph.reset()`, `routingGraph.CONSTANTS`.

- [ ] **Step 1: Rewrite the test** — `src/tests/routingGraph.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const routingGraph = require('../services/routingGraph.js');

const osc = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'oscillator' } });
const eff = (id, x, y, st) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'effect', subtype: st } });
const lfo = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'controller', subtype: 'lfo' } });
const seq = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'controller', subtype: 'sequencer' } });
const ton = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'global', subtype: 'tonality', getRoot: () => 0 } });

const VP = { w: 1000, h: 1000 }; // center (500,500); CONNECT_RADIUS=350

test('a lone oscillator always reaches the center master (always audible)', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 480, 480)], VP, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 'master']);
});

test('a far oscillator still reaches center (no distance gate)', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 10, 10)], VP, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 'master']);
});

test('an effect near the osc->center path inserts by proximity', () => {
  // osc at (200,500), center (500,500); filter at (350,500) is between and closer to center
  const plan = routingGraph.buildRawPlan([osc(0, 200, 500), eff(1, 350, 500, 'filter')], VP, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 1, 'master']);
});

test('an effect farther from center than the osc is NOT inserted', () => {
  // osc at (450,500) is near center; filter at (200,500) is farther from center than osc
  const plan = routingGraph.buildRawPlan([osc(0, 450, 500), eff(1, 200, 500, 'filter')], VP, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 'master']);
});

test('LFO links to nearest oscillator or effect', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 200, 500), eff(1, 350, 500, 'filter'), lfo(4, 360, 520)], VP, new Set());
  assert.deepStrictEqual(plan.controlLinks, [{ controllerId: 4, targetId: 1 }]);
});

test('Sequencer links to nearest OSCILLATOR only (never an effect)', () => {
  // effect is closest, but a sequencer must skip it and pick the oscillator
  const plan = routingGraph.buildRawPlan([osc(0, 200, 500), eff(1, 350, 500, 'filter'), seq(6, 360, 520)], VP, new Set());
  assert.deepStrictEqual(plan.controlLinks, [{ controllerId: 6, targetId: 0 }]);
});

test('tonality present -> plan carries active tonality state', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 500, 500), ton(5, 50, 50)], VP, new Set());
  assert.strictEqual(plan.tonality.active, true);
});

test('temporal debounce: chain commits after CHAIN_HOLD_FRAMES', () => {
  routingGraph.reset();
  const mods = [osc(0, 200, 500), eff(1, 350, 500, 'filter')];
  let plan;
  for (let i = 0; i < routingGraph.CONSTANTS.CHAIN_HOLD_FRAMES - 1; i++) {
    plan = routingGraph.update(mods, VP);
    assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 'master'], `frame ${i}: filter not committed yet`);
  }
  plan = routingGraph.update(mods, VP);
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 1, 'master']);
});

test('getEdges maps the master node to the center position', () => {
  const mods = [osc(0, 200, 500)];
  const plan = routingGraph.buildRawPlan(mods, VP, new Set());
  const edges = routingGraph.getEdges(plan, mods, VP);
  const audio = edges.find(e => e.kind === 'audio');
  assert.deepStrictEqual(audio.toPos, { x: 500, y: 500 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — old `buildRawPlan` uses `screenWidth`/output pucks; new center semantics absent.

- [ ] **Step 3: Rewrite `src/services/routingGraph.js`**

```js
// src/services/routingGraph.js
// Pure, per-frame routing planner. Chains flow to a fixed central master node.

const CONSTANTS = {
  CONNECT_FRAC: 0.35,   // audio-hop distance as fraction of screen width
  KEEP_FACTOR: 1.25,    // existing hop stays connected out to KEEP_FACTOR x radius
  CONTROL_FRAC: 0.30,   // controller<->target distance as fraction of screen width
  CHAIN_HOLD_FRAMES: 3, // frames a chain change must persist before committing
};

function _dist(a, b) {
  const dx = a.wx - b.wx, dy = a.wy - b.wy;
  return Math.sqrt(dx * dx + dy * dy);
}

// Nearest-neighbor walk from each oscillator to the fixed center C (the master).
function buildRawPlan(modules, viewport, prevMembership) {
  const R = viewport.w * CONSTANTS.CONNECT_FRAC;
  const KEEP = R * CONSTANTS.KEEP_FACTOR;
  const controlR = viewport.w * CONSTANTS.CONTROL_FRAC;
  const prev = prevMembership || new Set();
  const C = { wx: viewport.w / 2, wy: viewport.h / 2 };

  const gens = modules.filter(m => m.def.type === 'oscillator');
  const effects = modules.filter(m => m.def.type === 'effect');
  const controllers = modules.filter(m => m.def.type === 'controller');
  const tonalityMod = modules.find(m => m.def.type === 'global' && m.def.subtype === 'tonality');

  const membership = new Set();
  const claimed = new Set();

  const chains = gens.map(gen => {
    const nodes = [gen.id];
    const localMembers = [];
    let current = gen;
    while (true) {
      let best = null, bestDist = Infinity;
      const curToC = _dist(current, C);
      effects.forEach(e => {
        if (claimed.has(e.id) || nodes.includes(e.id)) return;
        if (_dist(e, C) >= curToC) return;               // must progress toward center
        const reach = prev.has(`${gen.id}:${e.id}`) ? KEEP : R;
        const d = _dist(current, e);
        if (d < reach && d < bestDist) { best = e; bestDist = d; }
      });
      if (!best) break;
      nodes.push(best.id);
      localMembers.push(`${gen.id}:${best.id}`);
      current = best;
    }
    nodes.push('master');                                 // osc ALWAYS reaches center
    localMembers.forEach(m => membership.add(m));
    nodes.slice(1, -1).forEach(id => claimed.add(id));
    return { genId: gen.id, nodeIds: nodes };
  });

  // controller links: lfo -> nearest osc|effect; sequencer -> nearest oscillator
  const controlLinks = [];
  controllers.forEach(c => {
    const wantsEffect = c.def.subtype === 'lfo';
    let target = null, td = Infinity;
    modules.forEach(m => {
      const ok = m.def.type === 'oscillator' || (wantsEffect && m.def.type === 'effect');
      if (!ok) return;
      const d = _dist(c, m);
      if (d < controlR && d < td) { target = m; td = d; }
    });
    if (target) controlLinks.push({ controllerId: c.id, targetId: target.id });
  });

  const tonality = tonalityMod
    ? { active: true, root: tonalityMod.def.getRoot(tonalityMod.angle), scale: 'minorPentatonic' }
    : null;

  return { chains, controlLinks, tonality, membership };
}

// ---- stateful debounce ----
let _committed = { chains: [], controlLinks: [], tonality: null, membership: new Set() };
let _holds = {};
function _chainKey(c) { return `${c.genId}=${c.nodeIds.join('>')}`; }

function update(modules, viewport) {
  const raw = buildRawPlan(modules, viewport, _committed.membership);
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
    if (_holds[k] >= CONSTANTS.CHAIN_HOLD_FRAMES) { _holds[k] = 0; return rawChain; }
    return prevChain || { genId: rawChain.genId, nodeIds: [rawChain.genId, 'master'] };
  });
  _committed = { chains: newChains, controlLinks: raw.controlLinks, tonality: raw.tonality, membership: raw.membership };
  return _committed;
}

function reset() {
  _committed = { chains: [], controlLinks: [], tonality: null, membership: new Set() };
  _holds = {};
}

function getEdges(plan, modules, viewport) {
  const byId = {};
  modules.forEach(m => { byId[m.id] = m; });
  const C = { x: viewport.w / 2, y: viewport.h / 2 };
  const posOf = (id) => (id === 'master' ? C : (byId[id] ? { x: byId[id].wx, y: byId[id].wy } : null));
  const edges = [];

  plan.chains.forEach(c => {
    for (let i = 0; i < c.nodeIds.length - 1; i++) {
      const a = posOf(c.nodeIds[i]), b = posOf(c.nodeIds[i + 1]);
      if (a && b) edges.push({ fromPos: a, toPos: b, kind: 'audio', connected: true, alpha: 1 });
    }
  });
  plan.controlLinks.forEach(l => {
    const a = byId[l.controllerId], b = byId[l.targetId];
    if (!a || !b) return;
    edges.push({
      fromPos: { x: a.wx, y: a.wy }, toPos: { x: b.wx, y: b.wy },
      kind: 'control', ctrl: a.def.subtype, connected: true, alpha: 1,
    });
  });
  return edges;
}

const routingGraph = { CONSTANTS, buildRawPlan, update, reset, getEdges };
if (typeof window !== 'undefined') window.routingGraph = routingGraph;
if (typeof module !== 'undefined') module.exports = routingGraph;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — routingGraph suite green (browserLoad will fail until Task 3 updates the handler signature; that's expected and fixed in Task 3).

- [ ] **Step 5: Commit**

```bash
git add src/services/routingGraph.js src/tests/routingGraph.test.js
git commit -m "feat: route chains to fixed center master; generalize controller links (lfo/sequencer)"
```

---

### Task 2: Module registry — ID 3 → Volume, add ID 6 Sequencer

**Files:**
- Modify: `src/services/moduleRegistry.js`
- Test: `src/tests/moduleRegistry.test.js`

**Interfaces:**
- Consumes: `tonality` util (for ID 5, unchanged).
- Produces: `MODULE_REGISTRY[3] = { id:3, name:'Volume', type:'global', subtype:'volume', getVolDb(angle), getParamT }`;
  `MODULE_REGISTRY[6] = { id:6, name:'Sequencer', type:'controller', subtype:'sequencer', getParamT, getPatternIndex(angle) }`.
  `getPatternIndex` maps rotation to `0..(rhythmPatterns.PATTERNS.length-1)`.

- [ ] **Step 1: Edit the registry test** — replace the ID-3 type assertion and add ID-6 assertions in `src/tests/moduleRegistry.test.js`:

```js
test('ID 3 is now a global Volume control; ID 6 is the Sequencer controller', () => {
  assert.strictEqual(MODULE_REGISTRY[3].type, 'global');
  assert.strictEqual(MODULE_REGISTRY[3].subtype, 'volume');
  assert.strictEqual(MODULE_REGISTRY[6].type, 'controller');
  assert.strictEqual(MODULE_REGISTRY[6].subtype, 'sequencer');
});

test('Sequencer getPatternIndex spans the bank across rotation', () => {
  const seq = MODULE_REGISTRY[6];
  assert.strictEqual(seq.getPatternIndex(0), seq.getPatternIndex(0)); // deterministic
  const lo = seq.getPatternIndex(-Math.PI / 4);  // paramT ~ 0
  const hi = seq.getPatternIndex(Math.PI / 4);   // paramT ~ 1
  assert.ok(hi >= lo);
  assert.ok(lo >= 0);
});
```

Also update the existing "six Phase 3 modules" test: change the ID-3 expectation from `type==='output'` to `type==='global'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — ID 3 still `output`, ID 6 undefined.

- [ ] **Step 3: Edit `src/services/moduleRegistry.js`** — replace the ID 3 block and add ID 6:

```js
  // ID 3: Volume — global master-volume control (no longer in the signal path)
  3: {
    id: 3, name: 'Volume', type: 'global', subtype: 'volume', color: '#ffcc44', paramLabel: 'Volume',
    getParamT(angle) { return _arcT(angle); },
    getVolDb(angle) { return -40 + _arcT(angle) * 40; }, // -40 dB .. 0 dB
  },
```

```js
  // ID 6: Sequencer — controller; rotation selects a preset rhythm pattern
  6: {
    id: 6, name: 'Sequencer', type: 'controller', subtype: 'sequencer', color: '#ffb74d', paramLabel: 'Pattern',
    getParamT(angle) { return _arcT(angle); },
    getPatternIndex(angle) {
      const rp = (typeof require === 'function') ? require('../utils/rhythmPatterns.js') : window.rhythmPatterns;
      const n = rp.PATTERNS.length;
      return Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)));
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for moduleRegistry (requires `rhythmPatterns.js` from Task 4 only when `getPatternIndex` is *called*; the registry test calls it, so do Task 4 first OR run only non-pattern registry tests). To keep order simple, **reorder: do Task 4 before Step 4 here.** (See note below.)

> **Ordering note:** `getPatternIndex` requires `rhythmPatterns.js`. Implement **Task 4 (rhythm bank)** before running this task's pattern test. The registry *type* assertions pass independently; only the `getPatternIndex` test needs the bank.

- [ ] **Step 5: Commit**

```bash
git add src/services/moduleRegistry.js src/tests/moduleRegistry.test.js
git commit -m "feat: ID 3 -> Volume (global); add ID 6 Sequencer to registry"
```

---

### Task 3: Audio engine — master node, connect chains to master, Volume control

**Files:**
- Modify: `src/services/audioEngine.js`
- Modify: `src/tests/browserLoad.test.js` (handler signature → viewport; reachability still holds)

**Interfaces:**
- Consumes: `routingGraph` (Task 1), `MODULE_REGISTRY` (Task 2).
- Produces: a module-scoped `master` Tone.Volume; `applyRoutingPlan` connects each chain's last real node to `master`; the Volume puck sets `master.volume`. `master` is created in `initAudio()`.

- [ ] **Step 1: Create the master node in `initAudio`**

```js
let master = null;
async function initAudio() {
  if (audioInitialized) return;
  await Tone.start();
  master = new Tone.Volume(-6).toDestination(); // DEFAULT_DB
  audioInitialized = true;
  console.log('[audio] AudioContext started');
}
```

- [ ] **Step 2: Remove the old `output` node creation in `_addModule`** and handle the Volume puck as a global (no node). Replace the `else if (def.type === 'output')` branch — there is no longer an output type. The `global` branch already sets `node = null`. So delete the output branch entirely; Volume (ID 3) falls into `def.type === 'global'` → `node = null`.

- [ ] **Step 3: Connect chains to `master` in `applyRoutingPlan`** — replace the chain wiring loop so `'master'` resolves to the `master` node and is never disconnected:

```js
  plan.chains.forEach(chain => {
    seenGen.add(chain.genId);
    const key = chain.nodeIds.join('>');
    if (_lastChainKeys[chain.genId] === key) return;
    _lastChainKeys[chain.genId] = key;

    const nodeOf = (id) => (id === 'master' ? master : (activeModules[id] && activeModules[id].node));

    // disconnect source nodes (everything except master)
    chain.nodeIds.forEach(id => {
      if (id === 'master') return;
      const n = nodeOf(id);
      if (n) { try { n.disconnect(); } catch (_) {} }
    });
    // reconnect in series; master is the terminal (already -> Destination)
    for (let i = 0; i < chain.nodeIds.length - 1; i++) {
      const a = nodeOf(chain.nodeIds[i]);
      const b = nodeOf(chain.nodeIds[i + 1]);
      if (a && b) { try { a.connect(b); } catch (_) {} }
    }
    console.log(`[audio] chain ${chain.nodeIds.join('->')}`);
  });
```

- [ ] **Step 4: Set master volume from the Volume puck in `_updateModule`** — add a branch:

```js
  } else if (m.def.type === 'global' && m.def.subtype === 'volume' && master) {
    master.volume.rampTo(m.def.getVolDb(angle), 0.05);
  }
```

- [ ] **Step 5: Update `browserLoad.test.js`** — the frame handlers now call `routingGraph.update(active, { w: 1280, h: 720 })` (object viewport, not `1280`). Update all three handler definitions accordingly. The reachability test's `__synthReachesDest()` still holds because every chain ends at `master` which is `.toDestination()`; add `master` to the reachable set by treating the Tone `Volume` stub's `toDestination()` as connecting to `DEST` (already modeled).

```js
// in each vm.runInContext handler string, replace:
//   const plan = routingGraph.update(active, 1280);
// with:
//   const plan = routingGraph.update(active, { w: 1280, h: 720 });
```

- [ ] **Step 6: Run tests + Node smoke-load**

Run: `npm test`
Expected: PASS — all suites green (osc now reaches `master` → Destination).

Run: `node -e "global.window=undefined; require('./src/services/routingGraph.js'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 7: Commit**

```bash
git add src/services/audioEngine.js src/tests/browserLoad.test.js
git commit -m "feat: always-on central master output; chains terminate at master; Volume puck sets level"
```

---

## PART B — Sequencer

### Task 4: Rhythm pattern bank util

**Files:**
- Create: `src/utils/rhythmPatterns.js`
- Test: `src/tests/rhythmPatterns.test.js`

**Interfaces:**
- Produces: `rhythmPatterns.PATTERNS` — an array of `{ name, steps }` where `steps` is `boolean[16]`, ordered sparse→busy; and `rhythmPatterns.STEPS = 16`.

- [ ] **Step 1: Write the failing test** — `src/tests/rhythmPatterns.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const rp = require('../utils/rhythmPatterns.js');

test('every pattern is exactly 16 booleans with a name', () => {
  assert.ok(rp.PATTERNS.length >= 6);
  for (const p of rp.PATTERNS) {
    assert.strictEqual(typeof p.name, 'string');
    assert.strictEqual(p.steps.length, 16);
    assert.ok(p.steps.every(s => typeof s === 'boolean'));
  }
});

test('four-on-the-floor hits steps 0,4,8,12 only', () => {
  const f = rp.PATTERNS.find(p => p.name.toLowerCase().includes('four'));
  assert.ok(f, 'four-on-the-floor pattern exists');
  f.steps.forEach((s, i) => assert.strictEqual(s, i % 4 === 0));
});

test('patterns are ordered sparse -> busy by hit count', () => {
  const counts = rp.PATTERNS.map(p => p.steps.filter(Boolean).length);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1], `pattern ${i} not >= previous`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../utils/rhythmPatterns.js'`.

- [ ] **Step 3: Write `src/utils/rhythmPatterns.js`**

```js
// src/utils/rhythmPatterns.js
// Preset 16-step rhythm bank, ordered sparse -> busy. Pure data.
const STEPS = 16;
const _ = false, X = true;

const PATTERNS = [
  { name: 'Downbeat',         steps: [X,_,_,_, _,_,_,_, X,_,_,_, _,_,_,_] }, // 2
  { name: 'Backbeat',         steps: [_,_,_,_, X,_,_,_, _,_,_,_, X,_,_,_] }, // 2
  { name: 'Four on the floor',steps: [X,_,_,_, X,_,_,_, X,_,_,_, X,_,_,_] }, // 4
  { name: 'Son clave',        steps: [X,_,_,X, _,_,X,_, _,_,X,_, X,_,_,_] }, // 5
  { name: 'Offbeat eighths',  steps: [_,_,X,_, _,_,X,_, _,_,X,_, _,_,X,_] }, // wait: see note
  { name: 'Eighths',          steps: [X,_,X,_, X,_,X,_, X,_,X,_, X,_,X,_] }, // 8
  { name: 'Gallop',           steps: [X,_,X,X, X,_,X,X, X,_,X,X, X,_,X,X] }, // 12
  { name: 'Sixteenths',       steps: [X,X,X,X, X,X,X,X, X,X,X,X, X,X,X,X] }, // 16
];

if (typeof window !== 'undefined') window.rhythmPatterns = { PATTERNS, STEPS };
if (typeof module !== 'undefined') module.exports = { PATTERNS, STEPS };
```

> Note: the "Offbeat eighths" row above has 4 hits, which breaks the strict sparse→busy ordering test (it sits between two heavier patterns). **Fix when implementing:** place patterns in non-decreasing hit-count order — `Downbeat(2), Backbeat(2), Four(4), Offbeat(4), Son clave(5), Eighths(8), Gallop(12), Sixteenths(16)` — i.e. move "Offbeat eighths" directly after "Four on the floor" and before "Son clave". Verify `steps.filter(Boolean).length` is non-decreasing across the array before running the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — rhythmPatterns + (now) the moduleRegistry `getPatternIndex` test go green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/rhythmPatterns.js src/tests/rhythmPatterns.test.js
git commit -m "feat: preset 16-step rhythm bank (sparse to busy)"
```

---

### Task 5: Scale-degree walk in the tonality util

**Files:**
- Modify: `src/utils/tonality.js`
- Test: `src/tests/tonality.test.js` (add cases)

**Interfaces:**
- Produces: `tonality.scaleDegreeFreq(baseFreq, root, degreeIndex) -> Hz` — the `degreeIndex`-th ascending degree (wrapping octaves) of the minor-pentatonic scale rooted at `root`, anchored to `baseFreq`'s octave.

- [ ] **Step 1: Add failing tests** — append to `src/tests/tonality.test.js`:

```js
test('scaleDegreeFreq: degree 0 is in-scale and near the base octave', () => {
  const f = tonality.scaleDegreeFreq(261.63, 0, 0); // C root, base ~C4
  const midi = Math.round(69 + 12 * Math.log2(f / 440));
  assert.strictEqual(((midi - 0) % 12 + 12) % 12 === 0, true); // pitch class C is in C-pentatonic (degree 0)
});

test('scaleDegreeFreq: ascending degrees are monotonically higher', () => {
  let prev = 0;
  for (let d = 0; d < 10; d++) {
    const f = tonality.scaleDegreeFreq(261.63, 0, d);
    assert.ok(f > prev, `degree ${d} should be higher`);
    prev = f;
  }
});

test('scaleDegreeFreq: degree 5 is one octave above degree 0', () => {
  const f0 = tonality.scaleDegreeFreq(261.63, 0, 0);
  const f5 = tonality.scaleDegreeFreq(261.63, 0, 5);
  assert.ok(Math.abs(f5 / f0 - 2) < 0.02, 'pentatonic has 5 notes/octave');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `tonality.scaleDegreeFreq is not a function`.

- [ ] **Step 3: Implement in `src/utils/tonality.js`** — add inside the `tonality` object (and use existing `SCALE_MINOR_PENTATONIC`, `_midiToFreq`, `_freqToMidi`):

```js
  // Ascending degree of the scale rooted at `root`, anchored near baseFreq's octave.
  scaleDegreeFreq(baseFreq, root, degreeIndex) {
    const intervals = SCALE_MINOR_PENTATONIC;     // [0,3,5,7,10]
    const n = intervals.length;
    const baseMidi = Math.round(_freqToMidi(baseFreq));
    const rootMidi = 12 * Math.floor(baseMidi / 12) + root; // root in base octave
    const octave = Math.floor(degreeIndex / n);
    const semis = octave * 12 + intervals[((degreeIndex % n) + n) % n];
    return _midiToFreq(rootMidi + semis);
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/tonality.js src/tests/tonality.test.js
git commit -m "feat: scaleDegreeFreq for sequencer melodic walk"
```

---

### Task 6: Audio engine — clock, sequencer gating, melodic walk, controller dispatch

**Files:**
- Modify: `src/services/audioEngine.js`
- Modify: `src/tests/browserLoad.test.js` (add a Sequencer + Oscillator scenario)

**Interfaces:**
- Consumes: `rhythmPatterns` (Task 4), `tonality.scaleDegreeFreq` (Task 5), `MODULE_REGISTRY[6]`.
- Produces: `Tone.Transport` + `Tone.Loop` clock started in `initAudio()`; `window.getSeqStep()` returns the current global step (for visuals); sequencer-driven oscillators are gated.

- [ ] **Step 1: Start the transport + step loop in `initAudio`** (after `master` is created):

```js
  Tone.Transport.bpm.value = 110; // BPM
  _step = 0;
  _stepLoop = new Tone.Loop((time) => { _onStep(time); }, '16n').start(0);
  Tone.Transport.start();
```

Add module-scoped state near the top:

```js
const _rhythm = (typeof require === 'function') ? require('../utils/rhythmPatterns.js') : window.rhythmPatterns;
let _step = 0;
let _stepLoop = null;
let _seqIndex = {};       // sequencerId -> melodic walk counter
let _sequencedOscs = new Set(); // oscillator ids currently gated by a sequencer
```

- [ ] **Step 2: Implement `_onStep` (the per-16th-note tick)**

```js
// Fired once per 16th note by the Transport loop.
function _onStep(time) {
  _step = (_step + 1) % _rhythm.STEPS;
  // Each active sequencer link fires its target oscillator on hit steps.
  Object.keys(_activeLinks).forEach(cidStr => {
    const cid = Number(cidStr);
    const ctrl = activeModules[cid];
    if (!ctrl || ctrl.def.subtype !== 'sequencer') return;
    const osc = activeModules[_activeLinks[cid]];
    if (!osc || osc.def.type !== 'oscillator' || !osc.node) return;
    const pat = _rhythm.PATTERNS[ctrl.def.getPatternIndex(ctrl.smoother.get())];
    if (!pat || !pat.steps[_step]) return;
    let freq;
    if (_tonality && _tonality.active) {
      const idx = (_seqIndex[cid] || 0);
      freq = _tonalityUtil.scaleDegreeFreq(osc.def.getFreq(osc.smoother.get()), _tonality.root, idx);
      _seqIndex[cid] = idx + 1;
    } else {
      freq = _oscFreq(osc.def, osc.smoother.get());
    }
    try { osc.node.triggerAttackRelease(freq, '16n', time); } catch (_) {}
  });
}
```

- [ ] **Step 3: Dispatch controller links by subtype in `applyRoutingPlan`** — the control-link section currently tracks `_activeLinks[controllerId] = targetId` and computes `_lfoTargets`. Extend it to also compute `_sequencedOscs`, and gate oscillators on transition:

```js
  // (control-link tracking, renamed to controllerId)
  const desired = {}; plan.controlLinks.forEach(l => { desired[l.controllerId] = l.targetId; });
  Object.keys(_activeLinks).forEach(cidStr => {
    const cid = Number(cidStr);
    if (desired[cid] !== _activeLinks[cid]) { delete _activeLinks[cid]; delete _lfoPhase[cid]; delete _seqIndex[cid]; }
  });
  plan.controlLinks.forEach(l => {
    const ctrl = activeModules[l.controllerId];
    const tgt = activeModules[l.targetId];
    if (!ctrl || !tgt || !tgt.node) return;
    if (_activeLinks[l.controllerId] !== l.targetId) {
      _activeLinks[l.controllerId] = l.targetId;
      if (ctrl.def.subtype === 'lfo') _lfoPhase[l.controllerId] = 0;
      if (ctrl.def.subtype === 'sequencer') _seqIndex[l.controllerId] = 0;
      console.log(`[audio] ${ctrl.def.subtype} ${l.controllerId} -> module ${l.targetId}`);
    }
  });
  // recompute which oscillators are gated by a sequencer, and which modules an LFO drives
  const nowSeq = new Set();
  const nowLfo = new Set();
  Object.keys(_activeLinks).forEach(cidStr => {
    const cid = Number(cidStr);
    const ctrl = activeModules[cid];
    if (!ctrl) return;
    if (ctrl.def.subtype === 'sequencer') nowSeq.add(_activeLinks[cid]);
    if (ctrl.def.subtype === 'lfo') nowLfo.add(_activeLinks[cid]);
  });
  // gate transitions: newly sequenced -> stop drone; no-longer sequenced -> resume drone
  nowSeq.forEach(oscId => {
    if (!_sequencedOscs.has(oscId)) { const m = activeModules[oscId]; if (m && m.node) { try { m.node.triggerRelease(); } catch (_) {} } }
  });
  _sequencedOscs.forEach(oscId => {
    if (!nowSeq.has(oscId)) { const m = activeModules[oscId]; if (m && m.node) { try { m.node.triggerAttack(_oscFreq(m.def, m.smoother.get())); } catch (_) {} } }
  });
  _sequencedOscs = nowSeq;
  _lfoTargets = nowLfo;
```

(Replace the previous LFO-only tracking block with the above. The LFO modulation in `updateModulation()` still reads `_activeLinks` filtered to `lfo` subtype — update its loop to `if (activeModules[cid].def.subtype !== 'lfo') return;`.)

- [ ] **Step 4: Filter `updateModulation` to LFO links only**

In `updateModulation()`, inside the `Object.keys(_activeLinks).forEach`, add at the top of the callback:

```js
    const ctrl = activeModules[lfoId];
    if (!ctrl || ctrl.def.subtype !== 'lfo') return;
```

- [ ] **Step 5: Export `getSeqStep` and the active sequencer info for visuals**

```js
function getSeqStep() { return _step; }
window.getSeqStep = getSeqStep;
```

- [ ] **Step 6: Add a Sequencer scenario to `browserLoad.test.js`** — extend the "does not throw" test. Add a `Tone.Loop` + `Tone.Transport` stub to `makeSandbox` so `initAudio` doesn't throw:

```js
  // in makeSandbox Tone stub:
  class Loop { constructor(cb){ this.cb = cb; } start(){ return this; } }
  sandbox.Tone.Loop = Loop;
  sandbox.Tone.Transport = { bpm: { value: 120 }, start(){}, stop(){} };
```

Then in the scenario loop add a sequencer marker and run frames + manual ticks:

```js
  const seqM = { id: 6, wx: 210, wy: 130, angle: 0, screenCorners: [] };
  for (let i = 0; i < 8; i++) ctx.onMarkersDetected([osc, out, seqM]);
  // manually fire a few steps (Loop callback isn't auto-run in the stub)
  // no assertion beyond doesNotThrow — guards the sequencer wiring path
```

(Where `out` is the existing markers; with central output there is no output puck, but extra markers are harmless. Keep `osc` + `seqM`.)

- [ ] **Step 7: Run tests + smoke-load**

Run: `npm test`
Expected: PASS — all suites green.

Run: `node --check src/services/audioEngine.js`
Expected: no output (syntax OK).

- [ ] **Step 8: Commit**

```bash
git add src/services/audioEngine.js src/tests/browserLoad.test.js
git commit -m "feat: sequencer clock + oscillator gating + melodic walk; dispatch controllers by subtype"
```

---

### Task 7: Visual engine — center hub, sequencer ring + playhead, amber link, volume puck

**Files:**
- Modify: `src/components/visualEngine.js`
- (No unit test — canvas; verified on-wall.)

**Interfaces:**
- Consumes: `getActiveModules()`, `getSeqStep()`, edges from `routingGraph.getEdges(plan, modules, viewport)` (control edges now carry `ctrl: 'lfo'|'sequencer'`).

- [ ] **Step 1: Draw the always-on center output hub** — at the top of `draw()` after clearing, when audio is running:

```js
    // Central always-on output hub
    const cx = W / 2, cy = H / 2;
    visCtx.save();
    visCtx.shadowColor = '#88ffcc'; visCtx.shadowBlur = 30;
    visCtx.fillStyle = 'rgba(136,255,204,0.9)';
    visCtx.beginPath(); visCtx.arc(cx, cy, 10, 0, 2 * Math.PI); visCtx.fill();
    visCtx.strokeStyle = 'rgba(136,255,204,0.35)'; visCtx.lineWidth = 2;
    visCtx.beginPath(); visCtx.arc(cx, cy, 18, 0, 2 * Math.PI); visCtx.stroke();
    visCtx.restore();
```

- [ ] **Step 2: Color control edges by `ctrl`** — in `_drawEdges`, the `kind === 'control'` branch:

```js
      if (kind === 'control') {
        const amber = edge.ctrl === 'sequencer';
        visCtx.globalAlpha = alpha * 0.9;
        visCtx.strokeStyle = amber ? '#ffb74d' : '#c98bff';
        visCtx.shadowColor = amber ? '#ffb74d' : '#c98bff';
        visCtx.lineWidth = 2; visCtx.shadowBlur = 12;
        visCtx.setLineDash([3, 9]);
      } else { /* existing audio branch */ }
```

- [ ] **Step 3: Draw the sequencer step-ring + playhead** — inside the per-marker loop, after the param arc, when `def.subtype === 'sequencer'`:

```js
      if (def.subtype === 'sequencer') {
        const rp = window.rhythmPatterns;
        const pat = rp.PATTERNS[def.getPatternIndex(angle)];
        const step = (typeof getSeqStep === 'function') ? getSeqStep() : -1;
        const rr = ringR + 22;
        for (let s = 0; s < 16; s++) {
          const a = -Math.PI / 2 + (s / 16) * 2 * Math.PI;
          const dx = wx + Math.cos(a) * rr, dy = wy + Math.sin(a) * rr;
          const on = pat && pat.steps[s];
          visCtx.beginPath();
          visCtx.fillStyle = s === step ? '#ffffff' : (on ? def.color : 'rgba(255,255,255,0.18)');
          visCtx.arc(dx, dy, s === step ? 4 : (on ? 3.5 : 2), 0, 2 * Math.PI);
          visCtx.fill();
        }
        // pattern name below the % label
        visCtx.fillStyle = 'rgba(255,255,255,0.6)'; visCtx.font = '10px monospace'; visCtx.textAlign = 'center';
        visCtx.fillText(pat ? pat.name : '', wx, wy + ringR + 32);
      }
```

- [ ] **Step 4: Commit**

```bash
git add src/components/visualEngine.js
git commit -m "feat: center hub, sequencer step-ring/playhead, amber trigger link"
```

---

### Task 8: Wire index.html + print.html

**Files:**
- Modify: `index.html`
- Modify: `print.html`

- [ ] **Step 1: Add the rhythmPatterns script tag** (before moduleRegistry, after tonality) in `index.html`:

```html
  <script src="src/utils/tonality.js"></script>
  <script src="src/utils/rhythmPatterns.js"></script>
  <script src="src/services/moduleRegistry.js"></script>
```

- [ ] **Step 2: Pass the viewport to `routingGraph.update`** in `onMarkersDetected`:

```js
        const plan = routingGraph.update(active, { w: window.innerWidth, h: window.innerHeight });
        applyRoutingPlan(plan);
        updateModulation();
        const edges = routingGraph.getEdges(plan, active, { w: window.innerWidth, h: window.innerHeight });
        visualEngine.draw(detected, edges);
```

- [ ] **Step 3: Update the start-banner copy**

```html
    <p>Place ID 0 (Oscillator) anywhere — it flows to the glowing center and sounds.<br>
       Add ID 1 (Filter) / ID 2 (Delay) near the path to the center to shape it.<br>
       ID 6 (Sequencer) near an oscillator adds rhythm; ID 5 (Tonality) makes it melodic.<br>
       ID 4 (LFO) modulates the nearest puck; ID 3 (Volume) sets master level.</p>
```

- [ ] **Step 4: Update `print.html`** — puck IDs and labels:

```js
    const PUCK_IDS = [0, 1, 2, 3, 4, 5, 6];
    const PUCK_LABELS = {
      0: 'Oscillator — turn for pitch',
      1: 'Filter — turn for cutoff; place near the center path',
      2: 'Delay — turn for feedback; place near the center path',
      3: 'Volume — turn to set master level',
      4: 'LFO — turn for rate; place near a puck to modulate it',
      5: 'Tonality — turn to pick the key',
      6: 'Sequencer — turn to pick a rhythm; place near an oscillator',
    };
```

Also add `6: 0x9e2e` is already in `CODES` (index 6); confirm `CODES[6]` exists (it does — the bank has 50). Update the intro line "Puck markers (0–5)" → "(0–6)".

- [ ] **Step 5: Run tests + Node smoke-load**

Run: `npm test`
Expected: PASS — all suites green.

Run: `node -e "global.window=undefined; require('./src/utils/rhythmPatterns.js'); require('./src/utils/tonality.js'); require('./src/services/routingGraph.js'); console.log('load ok')"`
Expected: prints `load ok`.

- [ ] **Step 6: Commit**

```bash
git add index.html print.html
git commit -m "feat: wire Sequencer + central output into index.html; add ID 6 to print page"
```

---

### Task 9: On-wall verification

**Files:** none (manual — Tone audio + projected canvas + live tracking).

- [ ] **Step 1:** Open `index.html`, TAP TO START. Confirm the glowing **center hub** appears and console shows `[audio] AudioContext started`.
- [ ] **Step 2:** Place **ID 0** alone → it should **make sound immediately** (cable runs to center), no output puck needed. Rotate it → pitch changes.
- [ ] **Step 3:** Place **ID 3 (Volume)** and rotate → master level changes; remove it → level holds.
- [ ] **Step 4:** Place **ID 1 (Filter)** between the oscillator and the center → it splices in (`0->1->master` in console), audible as you turn it.
- [ ] **Step 5:** Place **ID 6 (Sequencer)** near the oscillator → drone becomes a **rhythm**; the step-ring shows the pattern and the playhead sweeps. Rotate ID 6 → the pattern changes (sparse→busy). Amber link to the oscillator.
- [ ] **Step 6:** Add **ID 5 (Tonality)** → the sequenced notes become a **melody** (ascending scale walk); rotate ID 0 to transpose.
- [ ] **Step 7:** Remove ID 6 → oscillator returns to a continuous drone. Confirm no audio glitch/freeze across all combos (incl. ID 4 LFO + ID 6 Sequencer together).
- [ ] **Step 8:** Update `convo_log_beta.md` + project memory; notify Russell via Telegram that Phase 4 is live.

---

## Self-Review

**Spec coverage:**
- §2 registry (ID3→Volume, ID6 Sequencer) → Task 2 ✓
- §3 central output, routing-to-center, master volume → Tasks 1, 3 ✓
- §4.1 generalized controller links (sequencer→oscillator) → Task 1 ✓
- §4.2 preset bank + `patternSource` seam → Task 4 (`getPatternIndex` indirection is the seam) ✓
- §4.3 clock (Transport + Loop, 110 BPM) → Task 6 ✓
- §4.4 oscillator gating → Task 6 (`_sequencedOscs` transitions) ✓
- §4.5 melodic walk → Task 5 (`scaleDegreeFreq`) + Task 6 (`_onStep`) ✓
- §4.6 visuals (ring/playhead, amber link) → Task 7 ✓
- §3.4 center hub visual → Task 7 ✓
- §6 testing → Tasks 1,2,4,5 unit + Task 6 browserLoad + Task 9 manual ✓
- §5 files touched → Tasks 1–8 cover every listed file ✓

**Placeholder scan:** No TBD/TODO. The rhythm-bank ordering caveat in Task 4 is called out explicitly with the exact fix (reorder so hit-count is non-decreasing) — resolve it inline, not a deferral.

**Type consistency:** `RoutingPlan` (`chains[].nodeIds` ending in `'master'`; `controlLinks[].{controllerId,targetId}`) is identical across Task 1 (routingGraph), Task 3/6 (audioEngine), Task 7 (getEdges/visualEngine). `getPatternIndex` (Task 2) consumes `rhythmPatterns.PATTERNS` (Task 4). `scaleDegreeFreq` (Task 5) consumed in Task 6 `_onStep`. Edge `ctrl` field (Task 1) consumed in Task 7. `getSeqStep` (Task 6) consumed in Task 7. ✓

**Ordering dependency:** Task 4 (rhythm bank) must precede the `getPatternIndex` test in Task 2 — flagged in Task 2's note. Suggested execution order: 1 → 4 → 2 → 3 → 5 → 6 → 7 → 8 → 9.
