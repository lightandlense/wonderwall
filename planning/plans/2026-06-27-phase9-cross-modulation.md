# Phase 9: Cross-Modulation Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 proximity-based cross-modulation relationships between the four band pucks (Drums, Bass, Chords, Lead/Melody) so that moving pucks near each other creates musical and visual interactions.

**Architecture:** A new pure `modulationMatrix.js` service computes pair depths each detection frame. `audioEngine.js` consumes depths in `_onStep` to bend notes, velocities, and patterns. `visualEngine.js` draws a second layer of thin particle cables on top of patch cables.

**Tech Stack:** Vanilla JS, Node.js built-in test runner (`node --test`), Tone.js (already loaded), `node:assert`.

## Global Constraints

- No new npm dependencies — plain JS throughout
- Dual-export pattern: `if (typeof window !== 'undefined') window.X = X; if (typeof module !== 'undefined') module.exports = X;`
- Tests use `require('node:test')` and `require('node:assert')` — no Jest
- Run tests with: `cd "E:/Antigravity/Projects/Reactable Wall" && node --test`
- Melody puck type in the codebase is `'lead'` (not `'melody'`)
- Do not modify `routingGraph.js` or `cableAnim.js`

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Create | `src/services/modulationMatrix.js` | Compute pair depths, produce visual edges |
| Create | `src/tests/modulationMatrix.test.js` | Unit tests for depth computation |
| Modify | `src/services/audioEngine.js` | Consume modulation depths in `_onStep` |
| Modify | `src/components/visualEngine.js` | Draw modulation cables |
| Modify | `index.html` | Wire modulationMatrix into detection frame loop |

---

## Task 1: modulationMatrix.js + tests

**Files:**
- Create: `E:/Antigravity/Projects/Reactable Wall/src/services/modulationMatrix.js`
- Create: `E:/Antigravity/Projects/Reactable Wall/src/tests/modulationMatrix.test.js`

**Interfaces:**
- Produces:
  - `modulationMatrix.compute(modules, viewport)` → `Map<"srcType:dstType", {depth, srcType, dstType, srcPos, dstPos, srcColor, dstColor}>`
  - `modulationMatrix.getEdges(modulationsMap)` → `Array<{fromPos, toPos, kind, depth, srcType, dstType, srcColor, dstColor}>`
  - `window.modulationMatrix` (browser global)

- [ ] **Step 1: Write the failing tests**

Create `src/tests/modulationMatrix.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const modulationMatrix = require('../services/modulationMatrix.js');

test('returns empty map when no modules', () => {
  const result = modulationMatrix.compute([], { w: 1920, h: 1080 });
  assert.ok(result instanceof Map);
  assert.strictEqual(result.size, 0);
});

test('ignores non-band puck types (controller, effect, global)', () => {
  const modules = [
    { def: { type: 'controller', color: '#aaa' }, wx: 100, wy: 100 },
    { def: { type: 'effect', color: '#bbb' }, wx: 110, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.strictEqual(result.size, 0);
});

test('returns depth > 0 when drummer and bass are within threshold', () => {
  // threshold = 0.32 * 1920 = 614.4px; pucks 100px apart < threshold
  const modules = [
    { def: { type: 'drummer', color: '#f00' }, wx: 100, wy: 100 },
    { def: { type: 'bass', color: '#00f' }, wx: 200, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(result.has('drummer:bass'), 'expected drummer:bass key');
  const mod = result.get('drummer:bass');
  assert.ok(mod.depth > 0 && mod.depth <= 1, `depth should be (0,1], got ${mod.depth}`);
});

test('returns depth = 1 at zero distance', () => {
  const modules = [
    { def: { type: 'drummer', color: '#f00' }, wx: 100, wy: 100 },
    { def: { type: 'bass', color: '#00f' }, wx: 100, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.strictEqual(result.get('drummer:bass').depth, 1);
});

test('returns nothing when pucks beyond threshold', () => {
  // 0.32 * 1920 = 614.4px; 800px > threshold
  const modules = [
    { def: { type: 'drummer', color: '#f00' }, wx: 0, wy: 100 },
    { def: { type: 'bass', color: '#00f' }, wx: 800, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(!result.has('drummer:bass'), 'should not have drummer:bass beyond threshold');
});

test('generates both directions for a pair', () => {
  // drummer:bass AND bass:drummer should both appear if within range
  const modules = [
    { def: { type: 'drummer', color: '#f00' }, wx: 100, wy: 100 },
    { def: { type: 'bass', color: '#00f' }, wx: 200, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(result.has('drummer:bass'), 'drummer:bass missing');
  assert.ok(result.has('bass:drummer'), 'bass:drummer missing');
});

test('getEdges returns correct structure', () => {
  const modulations = new Map([
    ['drummer:bass', {
      depth: 0.7,
      srcType: 'drummer', dstType: 'bass',
      srcPos: { wx: 100, wy: 200 }, dstPos: { wx: 300, wy: 400 },
      srcColor: '#f00', dstColor: '#00f',
    }],
  ]);
  const edges = modulationMatrix.getEdges(modulations);
  assert.strictEqual(edges.length, 1);
  assert.strictEqual(edges[0].kind, 'modulation');
  assert.strictEqual(edges[0].depth, 0.7);
  assert.deepStrictEqual(edges[0].fromPos, { x: 100, y: 200 });
  assert.deepStrictEqual(edges[0].toPos, { x: 300, y: 400 });
  assert.strictEqual(edges[0].srcColor, '#f00');
});

test('all 12 valid pair keys are recognized', () => {
  const types = ['drummer', 'bass', 'chords', 'lead'];
  const allValid = modulationMatrix.VALID_PAIRS;
  let count = 0;
  types.forEach(src => types.forEach(dst => {
    if (src !== dst) { assert.ok(allValid.has(`${src}:${dst}`), `missing pair ${src}:${dst}`); count++; }
  }));
  assert.strictEqual(count, 12);
});
```

- [ ] **Step 2: Run tests — expect failure**

```
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/modulationMatrix.test.js
```

Expected: `Cannot find module '../services/modulationMatrix.js'`

- [ ] **Step 3: Create modulationMatrix.js**

Create `src/services/modulationMatrix.js`:

```js
// src/services/modulationMatrix.js
// Computes cross-modulation depths for the 12 band-puck-pair relationships.
// Pure — no Tone.js, no DOM. Call compute() each detection frame.

const MODULATION_THRESHOLD_FRAC = 0.32; // fraction of viewport width

const VALID_PAIRS = new Set([
  'drummer:bass',   'drummer:chords', 'drummer:lead',
  'bass:drummer',   'bass:chords',    'bass:lead',
  'chords:drummer', 'chords:bass',    'chords:lead',
  'lead:drummer',   'lead:bass',      'lead:chords',
]);

const BAND_TYPES = new Set(['drummer', 'bass', 'chords', 'lead']);

function _dist(a, b) {
  const dx = a.wx - b.wx, dy = a.wy - b.wy;
  return Math.sqrt(dx * dx + dy * dy);
}

// Returns Map<"srcType:dstType", {depth, srcType, dstType, srcPos, dstPos, srcColor, dstColor}>.
// depth [0,1]: 0 = at threshold edge, 1 = contact. Only entries within threshold are included.
function compute(modules, viewport) {
  const result = new Map();
  const threshold = viewport.w * MODULATION_THRESHOLD_FRAC;
  const relevant = modules.filter(m => m.def && BAND_TYPES.has(m.def.type));

  for (let i = 0; i < relevant.length; i++) {
    for (let j = 0; j < relevant.length; j++) {
      if (i === j) continue;
      const src = relevant[i], dst = relevant[j];
      const key = `${src.def.type}:${dst.def.type}`;
      if (!VALID_PAIRS.has(key)) continue;
      if (result.has(key)) continue; // one entry per pair (only one drummer, etc.)

      const dist = _dist(src, dst);
      if (dist >= threshold) continue;

      result.set(key, {
        depth: 1 - dist / threshold,
        srcType: src.def.type,
        dstType: dst.def.type,
        srcPos: { wx: src.wx, wy: src.wy },
        dstPos: { wx: dst.wx, wy: dst.wy },
        srcColor: src.def.color || '#ffffff',
        dstColor: dst.def.color || '#ffffff',
      });
    }
  }
  return result;
}

// Returns edge objects for the visual engine's modulation cable renderer.
function getEdges(modulations) {
  const edges = [];
  modulations.forEach((mod) => {
    edges.push({
      fromPos: { x: mod.srcPos.wx, y: mod.srcPos.wy },
      toPos:   { x: mod.dstPos.wx, y: mod.dstPos.wy },
      kind:    'modulation',
      depth:   mod.depth,
      srcType: mod.srcType,
      dstType: mod.dstType,
      srcColor: mod.srcColor,
      dstColor: mod.dstColor,
    });
  });
  return edges;
}

const modulationMatrix = { compute, getEdges, VALID_PAIRS, MODULATION_THRESHOLD_FRAC };
if (typeof window !== 'undefined') window.modulationMatrix = modulationMatrix;
if (typeof module !== 'undefined') module.exports = modulationMatrix;
```

- [ ] **Step 4: Run tests — expect all pass**

```
cd "E:/Antigravity/Projects/Reactable Wall" && node --test src/tests/modulationMatrix.test.js
```

Expected: 8 passing, 0 failing.

- [ ] **Step 5: Commit**

```
cd "E:/Antigravity/Projects/Reactable Wall" && git add src/services/modulationMatrix.js src/tests/modulationMatrix.test.js && git commit -m "feat: add modulationMatrix service — computes 12 pair depths per frame"
```

---

## Task 2: audioEngine.js — modulation state + step effects

**Files:**
- Modify: `E:/Antigravity/Projects/Reactable Wall/src/services/audioEngine.js`

**Interfaces:**
- Consumes: `modulationMatrix.compute()` result via `setModulations(map)`
- Produces: `window.setModulations` (called from index.html each detection frame)

- [ ] **Step 1: Add modulation state and helpers**

After the line `let _lastModTime = null;` (around line 422), add:

```js
// Cross-modulation state (Phase 9)
let _modulations = new Map();          // set each detection frame by setModulations()
const _modState = {
  prevChordDeg: null,                  // tracks chord changes for fill triggering
  fillStepsRemaining: 0,               // countdown: how many steps the fill lasts
  melodyHistory: [],                   // last 3 melody degrees for contour detection
};

function setModulations(map) { _modulations = map || new Map(); }
function _modDepth(src, dst) {
  const m = _modulations.get(`${src}:${dst}`);
  return m ? m.depth : 0;
}
```

Also add the `window` export at the bottom of the file (before the final line `window.getLoopPeaks = getLoopPeaks;`):

```js
window.setModulations = setModulations;
```

- [ ] **Step 2: Add gathering pass at the top of _onStep**

`_onStep` currently starts with `_step = (_step + 1) % _rhythm.STEPS;` followed immediately by the sequencer/LFO `forEach`. Add a cross-modulation gathering block AFTER the step increment and BEFORE the sequencer loop:

```js
// --- Cross-modulation: gather this-step intent for all band pucks ---
let _xm_kickFired = false, _xm_snareFired = false;
let _xm_chordDeg = null, _xm_bassDeg = null, _xm_melodyDeg = null;

Object.values(activeModules).forEach(m => {
  if (m.def.type === 'drummer') {
    const groove = _drumGrooves.DRUM_GROOVES[m.presetIdx];
    if (groove) {
      if (groove.kick[_step]) _xm_kickFired = true;
      if (groove.snare[_step]) _xm_snareFired = true;
    }
  } else if (m.def.type === 'bass') {
    const line = _bassLines.BASS_LINES[m.presetIdx];
    const d = line && line.steps[_step];
    if (d != null) _xm_bassDeg = d;
  } else if (m.def.type === 'chords') {
    const prog = _chordProgs.CHORD_PROGRESSIONS[m.presetIdx];
    const d = prog && prog.steps[_step];
    if (d != null) _xm_chordDeg = d;
  } else if (m.def.type === 'lead') {
    const mel = _melodyLines.MELODY_LINES[m.presetIdx];
    const d = mel && mel.steps[_step];
    if (d != null) _xm_melodyDeg = d;
  }
});

// Chord-change detection for fill trigger (Chords → Drums)
if (_xm_chordDeg !== null && _xm_chordDeg !== _modState.prevChordDeg) {
  const depth = _modDepth('chords', 'drummer');
  if (depth > 0) _modState.fillStepsRemaining = Math.round(4 * depth);
  _modState.prevChordDeg = _xm_chordDeg;
}
if (_modState.fillStepsRemaining > 0) _modState.fillStepsRemaining--;
const _xm_inFill = _modState.fillStepsRemaining > 0;

// Melody contour tracking (Melody → Bass)
if (_xm_melodyDeg != null) {
  _modState.melodyHistory.push(_xm_melodyDeg);
  if (_modState.melodyHistory.length > 3) _modState.melodyHistory.shift();
}
const _xm_melodyAscending = _modState.melodyHistory.length >= 2
  && _modState.melodyHistory[_modState.melodyHistory.length - 1] > _modState.melodyHistory[0];
```

- [ ] **Step 3: Modify the drummer loop**

Find the drummer loop (the `Object.keys` block that fires `groove.kick`, `groove.snare`, `groove.hat`). Replace the entire block:

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
  const bassLine = (() => {
    const bm = Object.values(activeModules).find(x => x.def.type === 'bass');
    return bm ? _bassLines.BASS_LINES[bm.presetIdx] : null;
  })();
  const bassStepCount = bassLine ? bassLine.steps.filter(s => s != null).length : 0;
  const extraHatChance = _modDepth('bass', 'drummer') * (bassStepCount / 16);
  const hatFromBass = Math.random() < extraHatChance;
  const hatFromMelody = _modDepth('lead', 'drummer') > 0 && _xm_melodyDeg != null;

  if (groove.hat[_step] || hatFromMelody || hatFromBass) {
    try { m.drums.hat.triggerAttackRelease('32n', time); } catch (_) {}
  }
});
```

- [ ] **Step 4: Modify the bass/chords/lead loop**

Find the combined `Object.keys(activeModules).forEach` loop that handles `bass`, `chords`, and `lead` types. Replace just the three `if/else if` branches (keep the outer `forEach` structure intact):

```js
    if (m.def.type === 'bass') {
      const line = _bassLines.BASS_LINES[m.presetIdx];
      let deg = line && line.steps[_step];
      if (deg == null) return;

      // Chords → Bass: chord root gravity — bias bass note toward chord root
      if (_modDepth('chords', 'bass') > 0 && _xm_chordDeg != null
          && Math.random() < _modDepth('chords', 'bass')) {
        deg = _xm_chordDeg;
      }

      // Melody → Bass: ascending melody lifts bass an octave
      const octShift = (_modDepth('lead', 'bass') > 0.5 && _xm_melodyAscending
        && _modState.melodyHistory.length >= 2) ? 7 : 0;

      // Drums → Bass: velocity boost on kick steps (lower on non-kick steps)
      const dDepth = _modDepth('drummer', 'bass');
      const vel = dDepth > 0 ? (_xm_kickFired ? 1.0 : Math.max(0.3, 1.0 - dDepth * 0.6)) : 1;

      try { m.node.triggerAttackRelease(
        _tonalityUtil.scaleDegreeFreq(BASS_BASE_FREQ, _root, deg + octShift),
        '8n', time, vel,
      ); } catch (_) {}

    } else if (m.def.type === 'chords') {
      const prog = _chordProgs.CHORD_PROGRESSIONS[m.presetIdx];
      let d = prog && prog.steps[_step];

      // Drums → Chords: retrigger current chord on snare steps (even if not a chord step)
      if (d == null && _modDepth('drummer', 'chords') > 0 && _xm_snareFired
          && _modState.prevChordDeg != null) {
        d = _modState.prevChordDeg;
      }
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
      const mel = _melodyLines.MELODY_LINES[m.presetIdx];
      let deg = mel && mel.steps[_step];
      if (deg == null) return;

      // Drums → Melody: kick gates melody — skip this step if kick didn't fire
      if (_modDepth('drummer', 'lead') > 0 && !_xm_kickFired
          && Math.random() < _modDepth('drummer', 'lead')) return;

      // Bass → Melody: bass root pulls melody toward unison (one octave above bass)
      if (_modDepth('bass', 'lead') > 0 && _xm_bassDeg != null
          && Math.random() < _modDepth('bass', 'lead')) {
        deg = _xm_bassDeg + 7; // same scale degree, one octave up
      }

      // Chords → Melody: snap to nearest chord tone
      if (_modDepth('chords', 'lead') > 0 && _xm_chordDeg != null
          && Math.random() < _modDepth('chords', 'lead')) {
        const tones = [_xm_chordDeg, _xm_chordDeg + 2, _xm_chordDeg + 4];
        deg = tones.reduce((best, t) =>
          Math.abs(t - deg) < Math.abs(best - deg) ? t : best, tones[0]
        );
      }

      try { m.node.triggerAttackRelease(
        _tonalityUtil.scaleDegreeFreq(LEAD_BASE_FREQ, _root, deg), '8n', time
      ); } catch (_) {}
    }
```

- [ ] **Step 5: Run the full test suite to verify no regressions**

```
cd "E:/Antigravity/Projects/Reactable Wall" && node --test
```

Expected: all existing tests pass (drummer, bassLines, chordProgressions, melodyLines, rhythmPatterns, cableAnim, routingGraph, moduleRegistry, tonality, loopBank tests).

- [ ] **Step 6: Commit**

```
cd "E:/Antigravity/Projects/Reactable Wall" && git add src/services/audioEngine.js && git commit -m "feat: apply 12 cross-modulation effects in _onStep (Phase 9)"
```

---

## Task 3: visualEngine.js — modulation cable rendering

**Files:**
- Modify: `E:/Antigravity/Projects/Reactable Wall/src/components/visualEngine.js`

**Interfaces:**
- Consumes: edge objects from `modulationMatrix.getEdges()` via `setModulationEdges(edges)`
- Produces: `visualEngine.setModulationEdges` (called from index.html)

- [ ] **Step 1: Add modulation edge state and setter**

After the line `let _lastMarkers = [], _lastEdges = [];` (line 16), add:

```js
let _modEdges = []; // modulation cables, updated each detection frame
```

After the `setFrame` function (around line 27), add:

```js
function setModulationEdges(edges) {
  _modEdges = edges || [];
}
```

- [ ] **Step 2: Add _drawModulationCables function**

After the closing brace of `_drawEdges` and before the `return` statement at the bottom, add:

```js
// Draws thin particle cables for cross-modulation connections (Phase 9).
// Called after _drawEdges so modulation cables render on top of patch cables.
function _drawModulationCables(edges) {
  if (!visCtx || !edges || edges.length === 0) return;
  const now = (typeof performance !== 'undefined') ? performance.now() : 0;

  edges.forEach(edge => {
    const { fromPos, toPos, depth, srcColor } = edge;
    if (!(depth > 0)) return;
    const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const ux = dx / len, uy = dy / len;

    // Dim dashed base line — fades in as pucks approach
    visCtx.save();
    visCtx.globalAlpha = depth * 0.35;
    visCtx.strokeStyle = srcColor;
    visCtx.lineWidth = 1;
    visCtx.setLineDash([4, 7]);
    visCtx.shadowColor = srcColor;
    visCtx.shadowBlur = 5;
    visCtx.beginPath();
    visCtx.moveTo(fromPos.x, fromPos.y);
    visCtx.lineTo(toPos.x, toPos.y);
    visCtx.stroke();
    visCtx.setLineDash([]);
    visCtx.restore();

    // Flowing directional particles — denser at higher depth
    const speed = 80;
    const spacing = Math.max(10, 35 - depth * 20); // 35px sparse → 15px dense
    const dots = _anim.flowDotDistances(len, spacing, speed, now);
    dots.forEach(d => {
      const x = fromPos.x + ux * d;
      const y = fromPos.y + uy * d;
      visCtx.save();
      visCtx.globalCompositeOperation = 'lighter';
      visCtx.globalAlpha = depth * 0.75;
      visCtx.fillStyle = srcColor;
      visCtx.shadowColor = srcColor;
      visCtx.shadowBlur = 12;
      visCtx.beginPath();
      visCtx.arc(x, y, 2, 0, 2 * Math.PI);
      visCtx.fill();
      visCtx.restore();
    });
  });
}
```

- [ ] **Step 3: Call _drawModulationCables from render()**

In the `render()` function, after the `if (edges && edges.length > 0) { _drawEdges(edges, activeById); }` block and BEFORE the `detectedWorldMarkers.forEach(marker => { ... })` ring-drawing loop, add:

```js
    // Modulation cables (Phase 9) — drawn above patch cables, below rings
    if (_modEdges.length > 0) {
      _drawModulationCables(_modEdges);
    }
```

- [ ] **Step 4: Export setModulationEdges**

Find the return statement at the bottom of the `visualEngine` IIFE (currently `return { init, draw, setFrame, render };`). Change it to:

```js
  return { init, draw, setFrame, render, setModulationEdges };
```

- [ ] **Step 5: Run the full test suite**

```
cd "E:/Antigravity/Projects/Reactable Wall" && node --test
```

Expected: all tests pass (visualEngine has no unit tests — confirmed by browserLoad.test.js being the only visual test, and it only checks script loading).

- [ ] **Step 6: Commit**

```
cd "E:/Antigravity/Projects/Reactable Wall" && git add src/components/visualEngine.js && git commit -m "feat: draw modulation cables in visualEngine (Phase 9)"
```

---

## Task 4: index.html — wire modulationMatrix into the detection loop

**Files:**
- Modify: `E:/Antigravity/Projects/Reactable Wall/index.html`

**Interfaces:**
- Consumes: `window.modulationMatrix`, `window.setModulations`, `visualEngine.setModulationEdges`

- [ ] **Step 1: Add the modulationMatrix script tag**

In `index.html`, find the line:

```html
  <script src="src/services/routingGraph.js"></script>
```

Add the new script tag immediately BEFORE it:

```html
  <script src="src/services/modulationMatrix.js"></script>
```

- [ ] **Step 2: Wire modulationMatrix into onMarkersDetected**

Find the `window.onMarkersDetected` function in `index.html`. It currently looks like:

```js
    window.onMarkersDetected = function(detected) {
      try {
        reconcileModules(detected);
        const active = getActiveModules();
        const vp = { w: window.innerWidth, h: window.innerHeight };
        const plan = routingGraph.update(active, vp);
        applyRoutingPlan(plan);
        updateModulation();
        const edges = routingGraph.getEdges(plan, active, vp);
        visualEngine.setFrame(detected, edges);
      } catch (err) {
        console.error('[onMarkersDetected] frame error (loop continues):', err);
      }
    };
```

Replace it with:

```js
    window.onMarkersDetected = function(detected) {
      try {
        reconcileModules(detected);
        const active = getActiveModules();
        const vp = { w: window.innerWidth, h: window.innerHeight };
        const plan = routingGraph.update(active, vp);
        applyRoutingPlan(plan);
        updateModulation();
        const modulations = modulationMatrix.compute(active, vp);
        setModulations(modulations);
        const edges = routingGraph.getEdges(plan, active, vp);
        visualEngine.setFrame(detected, edges);
        visualEngine.setModulationEdges(modulationMatrix.getEdges(modulations));
      } catch (err) {
        console.error('[onMarkersDetected] frame error (loop continues):', err);
      }
    };
```

- [ ] **Step 3: Run the full test suite**

```
cd "E:/Antigravity/Projects/Reactable Wall" && node --test
```

Expected: all tests pass.

- [ ] **Step 4: Smoke test in the browser**

Open `http://localhost:8080` (run `npm start` first if not running). Click START. Place 2+ band pucks (Drums id=7, Bass id=0, Chords id=6, Lead id=5) within ~30% of screen width of each other.

Check:
- Thin dashed cables appear between nearby band pucks
- Particles flow from source puck toward target puck
- Cables fade in as pucks approach and fade out as they move apart
- No console errors (F12 → Console)
- Audio plays without dropouts

- [ ] **Step 5: Commit**

```
cd "E:/Antigravity/Projects/Reactable Wall" && git add index.html && git commit -m "feat: wire cross-modulation matrix into detection loop (Phase 9 complete)"
```
