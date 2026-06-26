# Reactable Wall — Phase 6 Design Spec: Signal-Shaped Cables & Reactive Rings

**Date:** 2026-06-26
**Builds on:** Phase 5 (animated cables) — must be merged to `master` first
**Status:** Approved (design, 2026-06-26)

---

## 1. Goal

Take the cables from generic flowing dots to **per-type signal visuals**, the signature look of
the original Reactable: every connected cable renders *its source's actual signal*, scrolling
source → destination, with amplitude reacting to live audio level. A cable's appearance is a
function of **its source puck type**, so an audio chain that runs oscillator → filter → delay
shows the signal evolving as it passes through each effect. In parallel, each module ring
**breathes** with its real output level.

Three behaviors:
- **Waveform cables** — connected cables draw an animated wave (not dots) whose shape depends on
  the source puck type, scrolling toward the destination, amplitude scaled by live level.
- **Sequencer pulse** — unchanged from Phase 5: the amber trigger link stays dim until a step
  hits, then one bright pulse zips to the oscillator (now with a short comet tail + bloom).
- **Pulsing rings** — each module's ring gains an extra outer glow whose radius/alpha scales with
  that module's live output level.

All motion is driven by `performance.now()` and read fresh inside `render()` (~60 fps), so it is
smooth and frame-rate-independent. **No change to the actual audio signal path** — the meters are
passive taps.

---

## 2. Audio engine — passive live-data taps

`src/services/audioEngine.js` gains two read-only data sources, exposed on `window` exactly like
the existing `getSeqStep` / `getSeqPulses` (read fresh each frame, never cached in the edge data):

- **Per-module meters.** When an **oscillator** or **effect** node is created, attach a smoothed
  `Tone.Meter` (`{ smoothing: 0.8 }`) via `node.connect(meter)` (a passive fan-out tap — the node
  keeps its existing routing to the master). Store it as `m.meter`. Dispose it when the module is
  removed, alongside the node. Controllers (LFO, Sequencer) and globals (Volume, Tonality) have no
  audio node, so they get no meter.
- **`window.getModuleLevel(id) -> number`** — reads the module's meter (`meter.getValue()`, dB),
  maps to `[0,1]` via `meterToUnit` (see §3), and returns it. Returns `0` if the module has no
  meter or no recent signal.
- **`window.getLfoRate(srcId) -> number`** — the LFO module's current rate in Hz (derived from its
  mapped param), for waveform scroll speed. Returns a sensible default (e.g. `1`) if not found.

No new audio nodes are inserted into the signal chain; meters are leaf taps only.

---

## 3. Signal math (pure, unit-tested)

New pure helpers added to `src/utils/cableAnim.js` (no DOM, time-driven). Existing
`flowDotDistances` / `pulseProgress` are retained (the sequencer pulse still uses
`pulseProgress`).

- **`meterToUnit(db, floor = -48) -> number`** — `clamp((db - floor) / (0 - floor), 0, 1)`.
  `-Infinity` / silence → `0`; `0 dB` → `1`. Monotonic in `db`.
- **`flowSpeed({ kind, ctrl, level, lfoRate }) -> number`** — scroll speed in px/sec.
  - audio (kind `audio`): `BASE_SPEED * (0.4 + 0.6 * level)` — louder flows faster.
  - LFO (ctrl `lfo`): scaled from `lfoRate`, clamped to `[LFO_MIN, LFO_MAX]` px/sec.
  - sequencer (ctrl `sequencer`): returns `0` (beat-synced pulse, no continuous scroll).
- **`waveSamples(len, { shape, wavelength, amplitude, phase, step = 6 }) -> number[]`** — sampled
  perpendicular offsets along a cable of `len` px, one value every `step` px (inclusive of both
  ends). Offset at distance `d` is `amplitude * shapeFn(phase + d / wavelength)`. Returns `[]` for
  non-positive `len`. `shape ∈ { 'saw', 'softsaw', 'sine' }`:
  - `saw` — rising ramp in `[-1, 1]`, sharp reset each cycle (sawtooth oscillator).
  - `softsaw` — a band-limited / rounded saw (a few summed harmonics), modeling the low-pass
    Filter softening the signal.
  - `sine` — smooth sine (LFO).
- **`echoEnvelope(d, len, { count, decay }) -> number`** — amplitude multiplier in `[0,1]` for the
  Delay cable: full at the source end, dropping in `count` discrete steps by `decay` toward the
  destination, modeling echo taps. Pure function of position.
- **`cometTail(headDist, segCount, segSpacing, len) -> {d, alpha}[]`** — fading tail segments
  behind a head dot (used by the sequencer pulse), clipped to `[0, len)`.

Constants live at the top of `visualEngine.js` (alongside the Phase 5 `SPACING` / `SPEED` /
`PULSE_MS`): `BASE_SPEED`, `LFO_MIN`, `LFO_MAX`, `WAVELENGTH`, `MAX_AMP`, `SAMPLE_STEP`,
`TAIL_SEGS`, `RING_PULSE_MAX` (extra px), `RING_PULSE_ALPHA` range.

---

## 4. Rendering — `visualEngine.js`

### 4.1 Cables (`_drawEdges`)

Build `activeById` (active-module lookup) **before** drawing edges so each edge can resolve its
source and destination colors. For each edge:

- **Color gradient.** Stroke uses `visCtx.createLinearGradient(fromPos → toPos)` from the source
  module color to the destination color (the green master-hub color `#88ffcc` when the destination
  is the central output). Applied to the waveform path.
- **Bloom.** Set `globalCompositeOperation = 'lighter'` and a soft `shadowBlur` so overlapping /
  bright waves glow additively. Restore afterward.
- **Disconnected edges** keep the Phase 5 look: faint dashed straight line, no wave.

For each **connected** edge, choose the wave by **source puck type** (`def.type` / `def.subtype`
of the edge's source) and draw it as a stroked path built from `waveSamples` offset perpendicular
to the cable, scrolling at `flowSpeed`:

| Source type | Shape | Amplitude | Notes |
|---|---|---|---|
| Oscillator | `saw` | `MAX_AMP * level` | raw sawtooth |
| Filter (effect) | `softsaw` | `MAX_AMP * level` | rounded — low-pass look |
| Delay (effect) | `saw` × `echoEnvelope` | `MAX_AMP * level` | echo taps decaying toward dest |
| LFO (control) | `sine` | small fixed amp | slow ripple at `getLfoRate` |
| Sequencer (control) | — | — | beat pulse dot (Phase 5) + `cometTail` |

`level` comes from `getModuleLevel(srcId)`; `phase` advances with `performance.now()` and
`flowSpeed`. A zero-length cable draws nothing.

### 4.2 Rings

In the per-module ring block, after the existing static glow ring + param arc, read
`level = getModuleLevel(mod.id)` and draw **one extra outer ring**:
- radius `ringR + RING_PULSE_MAX * level`, `globalAlpha` interpolated across `RING_PULSE_ALPHA`,
  stroke + `shadowColor` in `def.color`.
- Modules with no meter (`level` 0) draw no pulse, so globals/controllers simply stay static.

The param arc, labels, sequencer step-dot ring, and Tonality HUD are unchanged.

---

## 5. Wiring

No changes to detection cadence or the `setFrame` / `render` split from Phase 5. `render()`
already runs every rAF and already reads live globals (`getSeqStep`, `getSeqPulses`); the new
`getModuleLevel` / `getLfoRate` are read the same way. Edge data passed to `setFrame` is unchanged
— all live values are pulled inside `render()`.

---

## 6. Testing

- **cableAnim (pure):** `meterToUnit` clamps/monotonic incl. `-Infinity`; `flowSpeed` ranges per
  kind incl. sequencer `0`; `waveSamples` sample count, both endpoints, `[]` for zero length,
  phase wrap, shape ranges within `[-amp, amp]`; `echoEnvelope` monotonic decay in `[0,1]`;
  `cometTail` clipping.
- **audioEngine:** `getModuleLevel` returns `0` for unknown / meterless ids and a value in `[0,1]`
  for a metered node; meter is disposed on module removal (no leak).
- **browserLoad:** `draw()` (setFrame+render) runs many frames clean with the new getters present
  and meters attached to oscillator/effect nodes.
- Waveform shapes, glow/bloom, beat-sync, ring breathing, and 60 fps verified on-wall.

---

## 7. Out of scope

- Any change to the actual audio output — this phase is purely visual + passive meter taps.
- Sequencer pulse timing (unchanged from Phase 5).
- Per-type ring *identity* flourishes (oscilloscope-in-ring, filter-curve, echo-rings) — rings
  only pulse to level this phase.
- Real spectral analysis / FFT-driven waveforms — wave shapes are stylized per type, not derived
  from the live audio buffer.
