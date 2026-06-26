# Reactable Wall — Phase 5 Design Spec: Animated Cables

**Date:** 2026-06-26
**Builds on:** Phase 4 (central output + sequencer) — must be merged to `master` first
**Status:** Approved (design, 2026-06-26)

---

## 1. Goal

Make connections feel alive: glowing pulses flow along every cable in the direction of
signal flow, and the Sequencer's trigger link fires a discrete pulse on each beat-hit so you
watch the rhythm travel into the oscillator. This is the signature Reactable look.

Two behaviors:
- **Constant flow** on audio cables (green) and LFO control links (purple): evenly-spaced dots
  moving source → destination at a steady speed.
- **Beat-synced pulse** on the Sequencer's amber link: dim until a step hits, then one bright
  pulse zips from the sequencer to the oscillator over ~150 ms.

Motion is driven by `performance.now()` so it is smooth and frame-rate-independent.

---

## 2. Render decoupled from detection (60 fps)

Today `visualEngine.draw()` runs only on detection frames (~20 fps), which would make the
flow choppy. Split rendering from detection:

- **`visualEngine.setFrame(markers, edges)`** — caches the latest markers + edges. Called from
  `onMarkersDetected` each detection frame (~20 fps).
- **`visualEngine.render()`** — draws the cached state using `performance.now()` for animation.
  Called every `requestAnimationFrame` (~60 fps) from the tracking loop.
- **`visualEngine.draw(markers, edges)`** — kept as `setFrame(markers, edges); render()` for
  backward compatibility (existing callers + the browser-load test still exercise rendering).

`tracking.js`'s rAF loop calls `visualEngine.render()` on **every** frame (detection still runs
every 3rd frame and calls `setFrame`). `index.html`'s `onMarkersDetected` switches from
`draw(...)` to `setFrame(...)`. Cached state defaults to empty arrays, so `render()` before the
first detection just clears + draws the center hub.

The audio frame work (`reconcileModules`, `applyRoutingPlan`, `updateModulation`) stays on the
detection cadence — only rendering moves to per-rAF.

---

## 3. Flow math (pure, unit-tested)

New pure module `src/utils/cableAnim.js`:

- **`flowDotDistances(length, spacing, speed, nowMs) -> number[]`** — distances along a cable of
  `length` px at which to draw dots: `offset = (nowMs/1000 * speed) % spacing`, then
  `offset, offset+spacing, …` up to `length`. Returns `[]` for non-positive length.
- **`pulseProgress(lastHitMs, nowMs, durMs) -> number | null`** — `(nowMs - lastHitMs)/durMs`
  if in `[0,1)`, else `null` (no pulse to draw).

Constants: `SPACING = 55` px, `SPEED = 130` px/sec, `PULSE_MS = 150`.

`visualEngine._drawEdges` uses these:
- audio + LFO edges: draw a small glowing dot (cable color) at each `flowDotDistances` position
  along `fromPos → toPos`. (Replaces the current static midpoint dot.)
- sequencer edges (`ctrl === 'sequencer'`): no constant flow; look up the last hit time for the
  edge's `srcId`, compute `pulseProgress`, and if non-null draw one bright amber dot at that
  fraction along `fromPos → toPos`.

---

## 4. Beat-hit signal from the audio engine

- `audioEngine._onStep` already fires per 16th note. When a sequencer hits, record
  `_seqPulses[controllerId] = performance.now()`.
- Export `getSeqPulses() -> { [controllerId]: lastHitMs }` (window global). `visualEngine` reads it.
- `routingGraph.getEdges` adds **`srcId`** (the `controllerId`) to each control edge so the visual
  can match a sequencer edge to its pulse timestamp.

---

## 5. Files touched

| File | Change |
|------|--------|
| `src/utils/cableAnim.js` | **new** — `flowDotDistances`, `pulseProgress` (pure) |
| `src/components/visualEngine.js` | `setFrame`/`render` split; `draw` = setFrame+render; flow dots + sequencer pulse in `_drawEdges` |
| `src/services/audioEngine.js` | `_seqPulses` recorded in `_onStep`; `getSeqPulses()` export |
| `src/services/routingGraph.js` | add `srcId` to control edges |
| `src/services/tracking.js` | call `visualEngine.render()` every rAF |
| `index.html` | `onMarkersDetected` uses `setFrame(...)` instead of `draw(...)` |
| `src/tests/cableAnim.test.js` | **new** — flow-dot + pulse-progress unit tests |
| `src/tests/routingGraph.test.js` | assert control edges carry `srcId` |

---

## 6. Testing

- **cableAnim (pure):** dot distances are within `[0, length)` and spaced by `spacing`; advance
  over time; empty for zero-length. `pulseProgress` returns a fraction in-window and `null`
  outside `[0,1)`.
- **routingGraph:** control edges include `srcId` equal to the controller's id.
- **browserLoad:** `draw()` (setFrame+render) still runs many frames clean with the new edge
  rendering and `getSeqPulses` present.
- Smoothness, look, and beat-sync timing verified on-wall.

---

## 7. Out of scope

- Particle trails / glow tails, variable per-signal speed, color gradients along the cable.
- Animating the module rings themselves (pulsing to volume/level).
- Any audio change — this phase is purely visual + one read-only hook (`getSeqPulses`).
