# Reactable Wall — Design Spec

**Date:** 2026-06-24
**Project path:** `E:\Antigravity\Projects\Reactable Wall`
**Forks from:** `E:\Antigravity\Projects\Gizmo Factory\src\` (tracking, calibration, projection)
**Audio reference:** `github.com/collidingScopes/arpeggiator` (MediaPipe/Tone.js/Three.js)
**Working name:** "Reactable Wall" (placeholder — rename freely)

---

## 1. Overview

Reactable Wall is a vertical, projection-mapped tangible music instrument. Physical
pucks carrying ArUco fiducial markers are placed on a wall, tracked by a single webcam,
and drive a Web Audio synth/sequencer. Three things about each puck matter:

- **Position** — where it sits on the wall
- **Proximity** — which other pucks it's near → audio **patching** (signal routing)
- **Rotation** — the puck's angle → its module's main **parameter** (pitch, cutoff, vol)

The system projects reactive visuals back onto the wall: glowing lines between patched
pucks, waveform rings, parameter readouts. The result is the Reactable experience on a
wall instead of a backlit table.

This is **not a from-scratch build.** It reuses the Gizmo Factory spine — ArUco
detection, the webcam→projector homography, projector-beamed auto-calibration, the
marker-print page, and the kiosk launcher. The only genuinely new code is the **audio
engine, the patch graph, and the rotation→parameter mapping.**

---

## 2. The core insight: rotation is free

ArUco markers expose **orientation (rotation angle)**, not just position. Gizmo Factory's
detector already computes it. Reactable's entire control language is exactly two signals
the detector already gives us:

| Reactable gesture | Physical action | Signal source |
|-------------------|-----------------|---------------|
| Connect modules   | Move pucks near each other | marker **position** + proximity test |
| Adjust a parameter| **Turn** a puck | marker **rotation angle** |
| Add/remove a module | Place / lift a puck | marker present / absent |

That's why "on metal so you can really turn it" is the right endgame: **turning is the
primary gesture**, and the math is already there.

---

## 3. Architecture

Same decoupled spine as Gizmo Factory and the original Reactable:

```
 webcam ──► ArUco detection ──► homography ──► world coords (x, y, angle, id)
 (js-aruco2)   (ported)        (ported cal)              │
                                                         ▼
                                              ┌──────────────────────┐
                                              │   Patch Graph (NEW)   │  proximity → edges
                                              └──────────┬───────────┘
                                                         ▼
                                ┌────────────────────────┴───────────────────────┐
                                ▼                                                  ▼
                     ┌────────────────────┐                          ┌────────────────────────┐
                     │  Audio Engine (NEW)│  Tone.js modules,        │  Visual Engine (NEW)   │
                     │  routing + params  │  rotation → param        │  lines, waveforms, glow │
                     └────────────────────┘                          └────────────┬───────────┘
                                                                                   ▼
                                                                       projector ► wall (warped
                                                                       by ported homography)
```

### Single-page app (`index.html`)

Match Gizmo Factory: plain HTML + vanilla JS, no framework, no build step. Screens are
divs; one canvas stack for camera debug + projected visuals. Kiosk launch via
`ops/deploy/launch.bat` (Chrome `--kiosk --app=`).

### Modules / files (`src/`)

| File | Origin | Responsibility |
|------|--------|----------------|
| `services/tracking.js` | **port** from Gizmo Factory | ArUco detection loop (~20fps), returns `{id, x, y, angle}[]` |
| `services/calibration.js` | **port as-is** | homography solver + projector-beamed auto-cal. Do not rewrite. |
| `services/audioEngine.js` | **new** | Tone.js module instances per active marker; applies routing + params |
| `services/patchGraph.js` | **new** | proximity test → connection edges between pucks; debounced |
| `services/moduleRegistry.js` | **new (mirrors `PROP_REGISTRY`)** | marker ID → module definition |
| `utils/angleSmoothing.js` | **new** | hold/interpolate rotation during brief occlusion |
| `utils/homography.js` | **port** | math helpers (shared by calibration) |
| `components/visualEngine.js` | **new** | draws connection lines, waveform rings, param HUD |
| `components/screens.js` | adapt from Gizmo Factory | title / calibrate / play screen router |
| `print.html` + `aruco-4x4-dict.js` | **port** | marker print page for puck faces |

### Data flow per frame

1. Grab webcam frame → `js-aruco2` → raw markers `{id, corners}`.
2. Apply homography → world coords `{id, x, y, angle}`.
3. Feed `angleSmoothing` (hold last good value if a marker dropped this frame).
4. `patchGraph` recomputes edges (which pucks are connected) — debounced so audio
   doesn't re-route on jitter.
5. `audioEngine` reconciles: add modules for new IDs, remove for gone IDs, set each
   module's param from its smoothed angle, apply routing from the patch graph.
6. `visualEngine` redraws lines/waveforms/HUD; projector shows it on the wall.

Throttle detection to every 3rd rAF frame (Gizmo Factory's proven cadence) so audio
scheduling isn't starved.

---

## 4. Module registry (the `PROP_REGISTRY` analog)

Each marker ID maps to an audio module. Starter set for the prototype:

| ID | Module | Rotation controls | Sound (Tone.js) |
|----|--------|-------------------|-----------------|
| 0 | Oscillator | pitch (note) | `Tone.Oscillator` / `Tone.Synth` |
| 1 | Drum / sequencer | tempo or pattern step | `Tone.MembraneSynth` + `Tone.Loop` |
| 2 | Low-pass filter | cutoff frequency | `Tone.Filter` (insert in chain) |
| 3 | LFO | rate | `Tone.LFO` → modulates nearest module's param |
| 4 | Sampler / loop | playback rate | `Tone.Player` |
| 5 | Output / master | master volume | `Tone.Destination` gain |

Reserve calibration IDs **20–23** (corner markers), matching Gizmo Factory's scheme, so
the ported auto-cal works unchanged. Confirm no clash before assigning gameplay IDs.

---

## 5. Patch graph (signal routing) — NEW

The piece that makes it a *Reactable* and not just "pucks that beep."

- Every frame, compute pairwise distances between active pucks (in world/wall units).
- Two pucks **connect** when within a distance threshold (tune empirically; start ~1.5×
  puck width). Connection is directional toward the **Output** puck (signal flows
  downhill toward master out), or nearest-neighbor chaining if no output present.
- **Debounce** edges: a connection must persist N frames (~150ms) before it routes, and
  must be absent N frames before it tears down — prevents audio popping on jitter.
- `audioEngine` applies the graph by `connect()`/`disconnect()` on Tone.js nodes.
- `visualEngine` draws a glowing line along each active edge, animated to suggest signal
  flow (the classic Reactable look).

Edge cases:
- **Cycles** (A→B→A): detect and break the weakest/last-formed edge to avoid feedback loops.
- **Orphan module** (connected to nothing): still sounds locally at low gain, or stays
  silent until patched — decide during prototype playtest.

---

## 6. Rotation → parameter mapping — NEW

- Each module declares a param range, e.g. filter cutoff `200–8000 Hz`.
- Map smoothed angle (0–360°, or a useful arc like ±150°) → param value, linear or
  exponential per param (pitch and frequency want exponential/log scaling).
- **Angle smoothing (`utils/angleSmoothing.js`)** is mandatory: when a hand covers a
  marker mid-turn, detection drops for several frames. Hold the last good angle, and on
  re-acquire, slew to the new value over ~50–100ms so audio doesn't jump.
- Optional: a small "deadzone" at the last-set value so a puck that's bumped slightly
  doesn't drift its parameter.

---

## 7. Visuals — NEW

Render in the app canvas, projected back onto the wall (geometry corrected by the ported
homography). Reactable visual vocabulary:

- **Connection lines** between patched pucks, animated flow direction.
- **Waveform / activity ring** around each sounding puck.
- **Param HUD** — a small arc or numeric readout near a puck showing its current value
  as it's turned.
- Keep it dark-background, high-contrast (matches Gizmo Factory aesthetic and survives
  front projection).

(Optional later: pull `WaveformVisualizer.js` patterns from the arpeggiator repo.)

---

## 8. Phased build plan

### Phase 0 — Port & boot (½–1 day)
- Scaffold the single-page app from Gizmo Factory.
- Port `calibration.js`, the ArUco loop, `print.html`. Confirm a webcam sees printed
  markers on a vertical surface and the homography aligns projected output to them.
- **Exit:** projected dot lands on a taped marker when you move it. No audio yet.

### Phase 1 — Paper prototype, single module (1 day)
- One marker (ID 0 = Oscillator). Place → tone plays. **Turn → pitch changes.**
- Implement `angleSmoothing`; verify no glitch when you cover the marker mid-turn.
- Tape/paper markers on any flat wall. **No metal yet.**
- **Exit:** turning a paper puck cleanly bends pitch.

### Phase 2 — Patch graph + multiple modules (1–2 days)
- Add IDs 1–5. Implement `patchGraph` with debounced proximity edges + Output puck.
- Visual connection lines. Playtest the "drag near to connect" feel.
- **Exit:** a person with no instructions can place pucks, connect them, and turn them
  to make evolving sound.

### Phase 3 — Metal/magnetic install (hardware, after Phase 2 validates)
- Matte magnetic surface (powder-coated steel / matte magnetic primer / matte vinyl
  over steel). Neodymium-base pucks with matte-printed ArUco faces.
- Short-throw projector mounted above; camera 15–30° off projector axis (anti-glare).
- Run the ported projector-beamed auto-calibration for plug-and-play setup.
- **Exit:** pucks hold position on the wall, turn smoothly by hand, system self-calibrates.

### Phase 4 (optional) — Magenta MRT2 generative layer
- Replace/augment Tone.js modules with steering into MRT2's latent space (puck angle →
  prompt-mix, position → intensity). Requires Apple Silicon + an OSC/control bridge from
  the browser to the Python/C++ inference loop.
- This is the differentiator: tangible/gestural control of generative AI music on a wall.

---

## 9. Hardware notes (Phase 3)

- **Surface must be matte.** Bare steel is specular → blows out both ArUco detection and
  projection (hotspot straight into the camera). Powder-coated/primed/vinyl matte.
- **Pucks:** neodymium magnet base, matte-printed ArUco face (the marker must face the
  camera/projector). Magnet holds; hand rotates freely — exactly the Reactable feel.
- **Camera:** 15–30° off the projector axis to dodge specular glare; must see all 4
  calibration corners. The ported homography tolerates up to ~30° off-axis.
- **Projector:** short-throw, mounted above the surface, to minimize the user's body
  shadow during front projection.
- **Lighting:** dim/controlled — bright ambient light lowers projection contrast and
  hurts marker detection (auto-cal already surfaces a "lights too bright?" hint).

---

## 10. Out of scope (for now)

- Recording/exporting audio.
- Networking, cloud save, multi-wall sync.
- A level/preset editor (Reactable Wall is open-play, not puzzle levels).
- Mobile/phone companion app.
- MRT2 integration until Phase 4 (Tone.js is the prototype engine).

---

## 11. Decisions (locked 2026-06-24)

See ADR `planning/decisions/0002-prototype-scope.md`.

1. **Audio engine:** **Tone.js** for the prototype (Phases 1–3). MRT2 deferred to Phase 4.
2. **Orphan modules:** **silent until patched** — connection is the act that makes sound.
   Flip to "sound on its own" only if Phase 2 playtest feels dead.
3. **Puck count:** **test with 3, design the registry/detection for 6–8** simultaneous.
4. **Surface / projector:** **reuse Gizmo Factory's existing footprint and rig** (the
   calibration doc references a ~4×6 ft surface). No new hardware for the prototype.
5. **Prototype goal:** a **fun-check** — prove that turning a puck to bend a parameter
   feels good and that patching is enjoyable. **No metal, no MRT2** until this earns it.
