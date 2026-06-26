# Reactable Wall — Phase 5: Animated Cables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Glowing pulses flow along every cable toward the signal destination, and the Sequencer's link fires a beat-synced pulse on each step-hit, driven by `performance.now()` and rendered at 60 fps.

**Architecture:** A pure `cableAnim` util computes dot positions/pulse progress from wall-clock time. `visualEngine` splits into `setFrame()` (cache markers+edges on detection frames) and `render()` (draw cached state every rAF); `tracking.js` calls `render()` per frame. `audioEngine` records each sequencer hit time; `routingGraph` tags control edges with their controller id so the visual matches a pulse to its edge.

**Tech Stack:** Vanilla JS browser-global scripts (no bundler), Tone.js (CDN), Node v22 `node --test`.

## Global Constraints

- **No build step, no framework.** Plain `<script>` tags creating browser globals, loaded in dependency order in `E:\Antigravity\Projects\Reactable Wall\index.html`.
- **Dual-export footer** on new pure modules:
  ```js
  if (typeof window !== 'undefined') window.NAME = NAME;
  if (typeof module !== 'undefined') module.exports = NAME;
  ```
- **No top-level `const` name collisions across `<script>`s** (browser shares one scope).
- **Animation constants (verbatim):** `SPACING = 55` px, `SPEED = 130` px/sec, `PULSE_MS = 150`.
- **This phase is visual + one read-only audio hook (`getSeqPulses`).** No change to audio routing/synthesis.
- **Branch:** continue on `phase4-sequencer` (Phase 5 stacks on unmerged Phase 4). `npm test` stays green; commit per task.
- All file paths below are absolute.

---

### Task 1: cableAnim util (pure)

**Files:**
- Create: `E:\Antigravity\Projects\Reactable Wall\src\utils\cableAnim.js`
- Test: `E:\Antigravity\Projects\Reactable Wall\src\tests\cableAnim.test.js`

**Interfaces:**
- Produces:
  - `cableAnim.flowDotDistances(length, spacing, speed, nowMs) -> number[]` — distances along a cable to draw flowing dots; `offset = (nowMs/1000*speed) % spacing`, then `offset, offset+spacing, …` while `< length`. `[]` if length/spacing not positive.
  - `cableAnim.pulseProgress(lastHitMs, nowMs, durMs) -> number | null` — `(nowMs-lastHitMs)/durMs` when in `[0,1)`, else `null`.

- [ ] **Step 1: Write the failing test** — `E:\Antigravity\Projects\Reactable Wall\src\tests\cableAnim.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const cableAnim = require('../utils/cableAnim.js');

test('flowDotDistances: dots spaced by `spacing`, all within [0,length)', () => {
  const d = cableAnim.flowDotDistances(100, 55, 55, 500); // offset=(0.5*55)%55=27.5
  assert.deepStrictEqual(d, [27.5, 82.5]);
  assert.ok(d.every(x => x >= 0 && x < 100));
});

test('flowDotDistances: advances with time', () => {
  const a = cableAnim.flowDotDistances(200, 55, 130, 0);
  const b = cableAnim.flowDotDistances(200, 55, 130, 100);
  assert.notStrictEqual(a[0], b[0]); // first dot moved
});

test('flowDotDistances: zero/negative length -> empty', () => {
  assert.deepStrictEqual(cableAnim.flowDotDistances(0, 55, 130, 0), []);
  assert.deepStrictEqual(cableAnim.flowDotDistances(-5, 55, 130, 0), []);
});

test('pulseProgress: in-window fraction, null outside', () => {
  assert.strictEqual(cableAnim.pulseProgress(1000, 1075, 150), 0.5);
  assert.strictEqual(cableAnim.pulseProgress(1000, 1000, 150), 0);
  assert.strictEqual(cableAnim.pulseProgress(1000, 1150, 150), null); // p=1 -> null
  assert.strictEqual(cableAnim.pulseProgress(1000, 900, 150), null);  // negative
  assert.strictEqual(cableAnim.pulseProgress(null, 1000, 150), null); // no hit yet
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "E:\Antigravity\Projects\Reactable Wall" && npm test`
Expected: FAIL — `Cannot find module '../utils/cableAnim.js'`.

- [ ] **Step 3: Implement** — `E:\Antigravity\Projects\Reactable Wall\src\utils\cableAnim.js`

```js
// src/utils/cableAnim.js
// Pure helpers for cable flow animation. No DOM. Time-driven (performance.now()).
const cableAnim = {
  // Distances along a cable of `length` px where flowing dots should be drawn.
  flowDotDistances(length, spacing, speed, nowMs) {
    if (!(length > 0) || !(spacing > 0)) return [];
    const offset = ((nowMs / 1000) * speed) % spacing;
    const out = [];
    for (let d = offset; d < length; d += spacing) out.push(d);
    return out;
  },
  // Progress [0,1) of a one-shot pulse since lastHitMs, or null if outside the window.
  pulseProgress(lastHitMs, nowMs, durMs) {
    if (lastHitMs == null || !(durMs > 0)) return null;
    const p = (nowMs - lastHitMs) / durMs;
    return (p >= 0 && p < 1) ? p : null;
  },
};

if (typeof window !== 'undefined') window.cableAnim = cableAnim;
if (typeof module !== 'undefined') module.exports = cableAnim;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "E:\Antigravity\Projects\Reactable Wall" && npm test`
Expected: PASS — cableAnim suite green.

- [ ] **Step 5: Commit**

```bash
cd "E:/Antigravity/Projects/Reactable Wall"
git add src/utils/cableAnim.js src/tests/cableAnim.test.js
git commit -m "feat: cableAnim util (flow-dot distances + pulse progress)"
```

---

### Task 2: routingGraph — tag control edges with srcId

**Files:**
- Modify: `E:\Antigravity\Projects\Reactable Wall\src\services\routingGraph.js`
- Test: `E:\Antigravity\Projects\Reactable Wall\src\tests\routingGraph.test.js`

**Interfaces:**
- Produces: control edges from `getEdges` now include `srcId` = the controller's id (so the visual can match a sequencer pulse to its edge). Audio edges unchanged.

- [ ] **Step 1: Add a failing test** — append to `E:\Antigravity\Projects\Reactable Wall\src\tests\routingGraph.test.js`

```js
test('getEdges tags control edges with srcId (the controller id)', () => {
  const mods = [osc(0, 200, 500), seq(6, 210, 520)];
  const plan = routingGraph.buildRawPlan(mods, VP, new Set());
  const edges = routingGraph.getEdges(plan, mods, VP);
  const ctrl = edges.find(e => e.kind === 'control');
  assert.ok(ctrl, 'a control edge exists');
  assert.strictEqual(ctrl.srcId, 6);
  assert.strictEqual(ctrl.ctrl, 'sequencer');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "E:\Antigravity\Projects\Reactable Wall" && npm test`
Expected: FAIL — `ctrl.srcId` is `undefined`.

- [ ] **Step 3: Add `srcId` in `getEdges`** — in `E:\Antigravity\Projects\Reactable Wall\src\services\routingGraph.js`, the control-edge push:

```js
    edges.push({
      fromPos: { x: a.wx, y: a.wy }, toPos: { x: b.wx, y: b.wy },
      kind: 'control', ctrl: a.def.subtype, srcId: l.controllerId, connected: true, alpha: 1,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "E:\Antigravity\Projects\Reactable Wall" && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "E:/Antigravity/Projects/Reactable Wall"
git add src/services/routingGraph.js src/tests/routingGraph.test.js
git commit -m "feat: tag control edges with srcId for cable animation"
```

---

### Task 3: audioEngine — record sequencer hit times

**Files:**
- Modify: `E:\Antigravity\Projects\Reactable Wall\src\services\audioEngine.js`
- Modify: `E:\Antigravity\Projects\Reactable Wall\src\tests\browserLoad.test.js` (load cableAnim; assert getSeqPulses present)

**Interfaces:**
- Produces: `window.getSeqPulses() -> { [controllerId]: lastHitMs }`. `_onStep` records `performance.now()` for a sequencer on each hit step.

- [ ] **Step 1: Add the pulse map + record it in `_onStep`** — in `E:\Antigravity\Projects\Reactable Wall\src\services\audioEngine.js`, add near the sequencer state:

```js
let _seqPulses = {};       // sequencerId -> performance.now() of last hit (for cable animation)
```

In `_onStep`, immediately after the line that confirms a hit (`if (!pat || !pat.steps[_step]) return;`), record the pulse:

```js
    _seqPulses[cid] = (typeof performance !== 'undefined') ? performance.now() : 0;
```

- [ ] **Step 2: Add the getter + export**

```js
function getSeqPulses() { return _seqPulses; }
```
and with the other `window.*` exports:
```js
window.getSeqPulses       = getSeqPulses;
```

- [ ] **Step 3: Update `browserLoad.test.js`** — add `cableAnim.js` to the shared-scope `SCRIPTS` list (before `visualEngine.js`) and assert `getSeqPulses` is exposed.

In `E:\Antigravity\Projects\Reactable Wall\src\tests\browserLoad.test.js`, the `SCRIPTS` array:
```js
const SCRIPTS = [
  'src/utils/angleSmoothing.js',
  'src/utils/tonality.js',
  'src/utils/rhythmPatterns.js',
  'src/utils/cableAnim.js',
  'src/services/moduleRegistry.js',
  'src/services/audioEngine.js',
  'src/components/visualEngine.js',
  'src/services/routingGraph.js',
];
```
And in the "all browser scripts load" test's globals check, add `'getSeqPulses'`:
```js
  for (const name of ['reconcileModules', 'getActiveModules', 'applyRoutingPlan', 'routingGraph', 'visualEngine', 'MODULE_REGISTRY', 'getSeqPulses']) {
```

- [ ] **Step 4: Run tests + syntax check**

Run: `cd "E:\Antigravity\Projects\Reactable Wall" && node --check src/services/audioEngine.js && npm test`
Expected: PASS — all suites green; `getSeqPulses` exposed.

- [ ] **Step 5: Commit**

```bash
cd "E:/Antigravity/Projects/Reactable Wall"
git add src/services/audioEngine.js src/tests/browserLoad.test.js
git commit -m "feat: record sequencer hit times (getSeqPulses) for beat-synced cable pulse"
```

---

### Task 4: visualEngine — setFrame/render split + flow dots + sequencer pulse

**Files:**
- Modify: `E:\Antigravity\Projects\Reactable Wall\src\components\visualEngine.js`
- (No unit test — canvas; verified on-wall + browserLoad exercises `draw`.)

**Interfaces:**
- Consumes: `cableAnim` (Task 1), `getSeqPulses()` (Task 3), control edges with `srcId`/`ctrl` (Task 2).
- Produces: `visualEngine.setFrame(markers, edges)` (cache), `visualEngine.render()` (draw cached state), `visualEngine.draw(markers, edges)` = setFrame+render (back-compat). Return object: `{ init, draw, setFrame, render }`.

- [ ] **Step 1: Add cableAnim handle + animation constants** — near the top of the IIFE in `E:\Antigravity\Projects\Reactable Wall\src\components\visualEngine.js`:

```js
  const _anim = (typeof require === 'function') ? require('../utils/cableAnim.js') : window.cableAnim;
  const SPACING = 55, SPEED = 130, PULSE_MS = 150;
  let _lastMarkers = [], _lastEdges = [];
```

- [ ] **Step 2: Split `draw` into `setFrame` + `render`** — rename the existing `function draw(detectedWorldMarkers, edges) {` to `function render() {`, and at the very top of that function read the cached state:

```js
  function render() {
    if (!visCtx || !debugCtx) return;
    const detectedWorldMarkers = _lastMarkers;
    const edges = _lastEdges;
    // ... existing body unchanged ...
  }

  function setFrame(markers, edges) {
    _lastMarkers = markers || [];
    _lastEdges = edges || [];
  }

  function draw(markers, edges) { setFrame(markers, edges); render(); }
```

(The existing body already used `detectedWorldMarkers` and `edges` locals, so aliasing them at the top means no other edits inside the body.)

- [ ] **Step 3: Replace the static midpoint dot with flow dots / sequencer pulse** — in `_drawEdges`, replace the `// Midpoint glow dot on active connections` block with flow animation:

```js
      // Flowing animation along the cable, source -> destination, time-driven.
      const now = (typeof performance !== 'undefined') ? performance.now() : 0;
      const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        const ux = dx / len, uy = dy / len;
        if (kind === 'control' && ctrl === 'sequencer') {
          // beat-synced pulse: one bright dot per step-hit
          const pulses = (typeof getSeqPulses === 'function') ? getSeqPulses() : {};
          const prog = _anim.pulseProgress(pulses[edge.srcId], now, PULSE_MS);
          if (prog != null) {
            const px = fromPos.x + ux * len * prog, py = fromPos.y + uy * len * prog;
            visCtx.fillStyle = '#ffd9a0'; visCtx.shadowColor = '#ffb74d'; visCtx.shadowBlur = 22;
            visCtx.beginPath(); visCtx.arc(px, py, 5, 0, 2 * Math.PI); visCtx.fill();
          }
        } else {
          // constant flow (audio green / LFO purple)
          const dotColor = kind === 'control' ? '#e0b3ff' : '#88ffcc';
          _anim.flowDotDistances(len, SPACING, SPEED, now).forEach(d => {
            const px = fromPos.x + ux * d, py = fromPos.y + uy * d;
            visCtx.fillStyle = dotColor; visCtx.shadowColor = dotColor; visCtx.shadowBlur = 14;
            visCtx.beginPath(); visCtx.arc(px, py, 3, 0, 2 * Math.PI); visCtx.fill();
          });
        }
      }
```

Ensure `edge` (not just destructured fields) is in scope — the forEach is `edges.forEach(edge => { const { fromPos, toPos, kind, connected, alpha, ctrl } = edge; ... })`, so `edge.srcId` is available.

- [ ] **Step 4: Update the return object**

```js
  return { init, draw, setFrame, render };
```

- [ ] **Step 5: Syntax check + tests**

Run: `cd "E:\Antigravity\Projects\Reactable Wall" && node --check src/components/visualEngine.js && npm test`
Expected: PASS — browserLoad still green (it calls `draw` = setFrame+render).

- [ ] **Step 6: Commit**

```bash
cd "E:/Antigravity/Projects/Reactable Wall"
git add src/components/visualEngine.js
git commit -m "feat: visualEngine setFrame/render split; flowing cable dots + beat-synced sequencer pulse"
```

---

### Task 5: Per-rAF render + index.html setFrame + script tag

**Files:**
- Modify: `E:\Antigravity\Projects\Reactable Wall\src\services\tracking.js`
- Modify: `E:\Antigravity\Projects\Reactable Wall\index.html`

**Interfaces:**
- Consumes: `visualEngine.render()` (Task 4), `visualEngine.setFrame` (Task 4).

- [ ] **Step 1: Call `render()` every rAF in `tracking.js`** — in `E:\Antigravity\Projects\Reactable Wall\src\services\tracking.js`, in `arLoop`, just before the final `requestAnimationFrame(arLoop);`:

```js
    if (window.visualEngine && window.visualEngine.render) window.visualEngine.render();
    requestAnimationFrame(arLoop);
```

- [ ] **Step 2: `onMarkersDetected` caches via `setFrame`** — in `E:\Antigravity\Projects\Reactable Wall\index.html`, change the last line of the handler from `visualEngine.draw(detected, edges);` to:

```js
        visualEngine.setFrame(detected, edges);
```

(The per-rAF `render()` from Task 1 of tracking.js then draws it smoothly; detection still updates the cache ~20 fps.)

- [ ] **Step 3: Add the cableAnim script tag** — in `E:\Antigravity\Projects\Reactable Wall\index.html`, before `visualEngine.js`:

```html
  <script src="src/utils/rhythmPatterns.js"></script>
  <script src="src/utils/cableAnim.js"></script>
  <script src="src/services/moduleRegistry.js"></script>
  <script src="src/services/audioEngine.js"></script>
  <script src="src/components/visualEngine.js"></script>
```

- [ ] **Step 4: Tests + smoke-load**

Run: `cd "E:\Antigravity\Projects\Reactable Wall" && npm test`
Expected: PASS — all suites green.

Run: `cd "E:\Antigravity\Projects\Reactable Wall" && node -e "global.window=undefined; require('./src/utils/cableAnim.js'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 5: Commit**

```bash
cd "E:/Antigravity/Projects/Reactable Wall"
git add src/services/tracking.js index.html
git commit -m "feat: render cables every rAF (60fps); cache frame via setFrame; load cableAnim"
```

---

### Task 6: On-wall verification

**Files:** none (manual — canvas animation + live tracking).

- [ ] **Step 1:** Open `E:\Antigravity\Projects\Reactable Wall\index.html`, hard-refresh, TAP TO START.
- [ ] **Step 2:** Place ID 0 (Oscillator) → green dots flow **from the oscillator toward the center hub** along the cable, smoothly (~60 fps), no stutter.
- [ ] **Step 3:** Add ID 1 (Filter) on the path → dots flow `osc → filter → center` across both segments.
- [ ] **Step 4:** Add ID 4 (LFO) near a puck → purple dots flow LFO → target.
- [ ] **Step 5:** Add ID 6 (Sequencer) near the oscillator → its amber link stays dim, then **fires a bright pulse on each beat-hit** that travels to the oscillator, in time with the rhythm. Rotate ID 6 (denser pattern) → more frequent pulses.
- [ ] **Step 6:** Confirm no audio change/glitch (animation is visual only) and no frame-rate drop with several pucks present.
- [ ] **Step 7:** Update `E:\Antigravity\AgentTeam\shared\memory\convo_log_beta.md`; notify Russell via Telegram that Phase 5 is live.

---

## Self-Review

**Spec coverage:**
- §1 constant flow + beat-synced pulse → Tasks 1, 4 ✓
- §2 render decoupling (setFrame/render, per-rAF) → Tasks 4, 5 ✓
- §3 flow math (cableAnim, constants) → Task 1 ✓
- §4 beat-hit signal (`_seqPulses`/`getSeqPulses`, `srcId`) → Tasks 2, 3 ✓
- §5 files touched → Tasks 1–5 cover every listed file ✓
- §6 testing → Tasks 1 (cableAnim), 2 (srcId), 3 (browserLoad) unit + Task 6 manual ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code.

**Type consistency:** `flowDotDistances`/`pulseProgress` signatures (Task 1) match their use in Task 4. `srcId` on control edges (Task 2) consumed in Task 4. `getSeqPulses()` (Task 3) consumed in Task 4. `setFrame`/`render`/`draw` (Task 4) consumed in Task 5 and browserLoad. ✓

**Execution order:** 1 → 2 → 3 → 4 → 5 → 6 (Task 4 depends on 1/2/3; Task 5 depends on 4).
