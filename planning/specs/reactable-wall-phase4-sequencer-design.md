# Reactable Wall — Phase 4 Design Spec: Central Output + Sequencer

**Date:** 2026-06-25
**Builds on:** Phase 3 (full signal chain, nearest-neighbor routing, JS-driven LFO) on `master`
**Research:** `planning/research/2026-06-25-sequencer-research.md`
**Status:** Approved (design, 2026-06-25)

---

## 1. Goal

Add **rhythm/time** to the instrument, and make it sound the instant you place a puck.
Two cohesive changes, informed by watching the real Reactable:

- **Part A — Central always-on output.** A permanent output hub at the center of the wall
  (the Reactable's central glowing point). Oscillators flow to it automatically, so there is
  no "silent until you patch an output" friction. The ID 3 puck becomes optional master volume.
- **Part B — Sequencer puck (ID 6).** A controller that gates the nearest oscillator on a
  clock, turning a drone into rhythm. Rotation **searches a bank of preset 16-step rhythms**
  (the "cube you scroll through"). With a Tonality puck present, hits walk the scale into a melody.

No hardware changes; still the paper-puck rig.

---

## 2. Module registry changes

| ID | Module | Class | Rotation controls | Change |
|----|--------|-------|-------------------|--------|
| 0 | Oscillator | generator | pitch | gated when a Sequencer drives it (see §4) |
| 1 | Filter | effect | cutoff | unchanged |
| 2 | Delay | effect | feedback | unchanged |
| 3 | **Volume** | global | master level | **was Output**; now optional master-volume control, not in signal path |
| 4 | LFO | controller | rate | unchanged |
| 5 | Tonality | global | root | unchanged; now also drives the Sequencer's melodic walk |
| 6 | **Sequencer** | controller | preset pattern | **new** |

Calibration corner IDs 10/11/13/18 stay reserved.

- **ID 3 (Volume):** `type:'global', subtype:'volume'`, keeps `getVolDb(angle)`. When present,
  its rotation sets the master volume; when absent, the last level holds.
- **ID 6 (Sequencer):** `type:'controller', subtype:'sequencer'`, color amber `#ffb74d`,
  `paramLabel:'Pattern'`, `getParamT(angle)`, `getPatternIndex(angle) -> 0..BANK-1`.

---

## 3. Part A — Central output & routing-to-center

### 3.1 Master output node
At `initAudio()`, create a permanent master sink: `master = new Tone.Volume(DEFAULT_DB).toDestination()`
(`DEFAULT_DB = -6`). It is always connected to the speaker. Every chain's last node connects
to `master`. This replaces the per-puck Output node.

### 3.2 Routing targets a fixed center point
`routingGraph` no longer searches for an output puck. `update(modules, viewport)` now takes
`viewport = { w, h }`; the chain target is the **fixed wall center** `C = { cx: w/2, cy: h/2 }`,
and the hop radii continue to derive from `w` (`CONNECT_RADIUS = w × CONNECT_FRAC`). `index.html`
passes `{ w: window.innerWidth, h: window.innerHeight }`.

For each oscillator, the nearest-neighbor walk runs toward `C`:
- Hop to the nearest unused effect within `CONNECT_RADIUS` **and** closer to `C` than the current
  node (same rule as Phase 3, with `C` as the goal).
- The oscillator **always connects to center** at the end of the walk (no distance gate on the
  final hop) — so every oscillator is audible the moment it appears. Effects remain
  proximity-gated.

Chain `nodeIds = [genId, ...orderedEffectIds, 'master']` where `'master'` is a sentinel for the
central node. `audioEngine.applyRoutingPlan` connects the last real node to the `master` Volume.

### 3.3 Master volume control (ID 3)
When a Volume puck is active, `_updateModule` ramps `master.volume` to `def.getVolDb(angle)`
each frame (bounded `rampTo`, the safe pattern). When absent, `master.volume` holds. Default
`-6 dB` so there is always sensible level even with no Volume puck.

### 3.4 Visuals
A soft glowing **output hub** is drawn at `C` whenever audio is running, with chain cables
terminating there. The Volume puck shows its level as the usual arc.

---

## 4. Part B — Sequencer

### 4.1 Connection
A Sequencer is a controller. `routingGraph` control links are generalized: each controller
links to its nearest valid target —
- **LFO** → nearest oscillator *or* effect (unchanged),
- **Sequencer** → nearest **oscillator** only.

Link shape becomes `{ controllerId, targetId }` (renamed from `lfoId`); `audioEngine` dispatches
on `activeModules[controllerId].def.subtype`.

### 4.2 Preset rhythm bank
A new pure module `src/utils/rhythmPatterns.js` exports `PATTERNS`: an ordered array of ~8
named 16-step patterns as `boolean[16]`, sparse→busy. Starter bank:
`[silence-ish/downbeat, four-on-floor, backbeat, eighths, son clave, offbeat, sixteenths, dense/roll]`.
`Sequencer.getPatternIndex(angle)` maps rotation `paramT` → a bank index. A `patternSource`
seam (a function `index -> boolean[16]`) lets Euclidean/other generators slot in later without
touching the engine.

### 4.3 Clock
A single global clock drives all sequencers:
- `Tone.Transport.bpm.value = BPM` (`BPM = 110`), `Tone.Transport.start()` in `initAudio()`.
- A `Tone.Loop('16n')` advances a global `_step` counter `0..15` (wrapping). Each tick, for every
  active sequencer link, look up `pattern[_step]`; if true, fire the target oscillator.

### 4.4 Gating the oscillator
- A normal oscillator drones (continuous `triggerAttack`). When it becomes a **sequencer target**,
  it stops droning (`triggerRelease`) and is instead pulsed: on each ON step the clock calls
  `triggerAttackRelease(freq, '16n')`. When the Sequencer is removed, the oscillator resumes its drone.
- `freq` = the oscillator's current pitch (rotation, tonality-quantized as today).

### 4.5 Melodic walk (Tonality present)
When a Tonality puck is active and the oscillator is sequenced, each ON hit advances a
per-sequencer `stepIndex`; the played pitch is the `stepIndex`-th degree (ascending, wrapping an
octave) of the current `{root, scale}`, transposed by the oscillator's rotation. A pure helper in
`tonality.js` — `scaleDegreeFreq(baseFreq, root, degreeIndex)` — does the mapping. Without
Tonality, every hit uses the same current pitch (pure rhythm).

### 4.6 Visuals
- The Sequencer puck draws a **ring of 16 step dots** around it — lit = hit, dim = rest — with the
  **playhead** (current `_step`) highlighted as it sweeps, plus the pattern name/number below.
- The trigger link to the oscillator is **amber, animated** (distinct from the LFO's purple control link).

---

## 5. Architecture & files touched

| File | Change |
|------|--------|
| `src/services/moduleRegistry.js` | ID 3 → Volume (global); add ID 6 Sequencer; pattern-index mapping |
| `src/services/routingGraph.js` | chains target fixed center `C`; osc always reaches center; generalized controller links (`controllerId`) incl. sequencer→oscillator |
| `src/services/audioEngine.js` | master Volume node; `applyRoutingPlan` connects chains to master; master-volume control; Transport+Loop clock; sequencer gating + melodic walk; dispatch controller links by subtype |
| `src/utils/rhythmPatterns.js` | **new** — preset 16-step rhythm bank (pure) |
| `src/utils/tonality.js` | add `scaleDegreeFreq()` for the melodic walk |
| `src/components/visualEngine.js` | center output hub; sequencer step-ring + playhead; amber trigger link; Volume puck |
| `index.html` | pass center to `routingGraph.update`; script tag for rhythmPatterns.js; banner copy |
| `print.html` | add marker ID 6 (Sequencer); relabel ID 3 → Volume |
| `src/tests/` | rhythm bank, scale-degree walk, routing-to-center, browser-load sequencer scenario |

---

## 6. Testing

Pure/deterministic (unit-tested with `node --test`):
- **rhythmPatterns:** bank exists, every entry is exactly 16 booleans, known patterns correct
  (e.g. four-on-floor hits at steps 0/4/8/12), `getPatternIndex` spans the bank across rotation.
- **scaleDegreeFreq:** ascending degrees stay in the scale; wraps an octave; transposes with base.
- **routingGraph:** chains target the center point; an oscillator always reaches center (no output
  puck needed); effects still insert by proximity toward center; sequencer control link selects the
  nearest oscillator (never an effect/output).
- **browserLoad:** all scripts load in one shared scope; a Sequencer + Oscillator scenario runs many
  frames clean and the oscillator reaches the master/destination.

Clock/trigger audio timing and visuals are verified on-wall (the project's method) plus the
on-screen debug readout.

---

## 7. Tuning constants (first-pass, refine on wall)

| Constant | Start value | Meaning |
|----------|-------------|---------|
| `BPM` | `110` | global transport tempo |
| `DEFAULT_DB` | `-6` | master volume when no Volume puck present |
| `STEPS` | `16` | sequencer steps per loop |
| `CONNECT_FRAC` | `0.35 × innerWidth` | effect-hop distance (Phase 3, unchanged) |
| `CONTROL_FRAC` | `0.30 × innerWidth` | controller→target link distance (Phase 3, unchanged) |

---

## 8. Out of scope (this phase)

- Dedicated drum/percussion voice (natural next companion to the Sequencer).
- Tempo puck / Song-Settings global (BPM is a fixed constant for now).
- Per-step velocity and gate-length editing.
- Euclidean / generative pattern source (the `patternSource` seam is built for it; not shipped).
- Multiple independent patterns per sequencer; pattern offset/rotation.
- Metal/magnetic hardware and MRT2 (base-spec later phases).
