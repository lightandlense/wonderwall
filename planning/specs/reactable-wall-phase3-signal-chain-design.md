# Reactable Wall — Phase 3 Design Spec: Full Signal Chain

**Date:** 2026-06-25
**Project path:** `E:\Antigravity\Projects\Reactable Wall`
**Builds on:** Phase 2 (proximity patch graph, commit `ba29536`)
**Supersedes routing model in:** `planning/specs/reactable-wall-design.md` §5
**Status:** Approved (design + LFO behavior, 2026-06-25)

---

## 1. Goal

Turn the wall from "one oscillator patched to one output" into a true Reactable-style
**signal chain**: a generator's audio flows through an ordered series of effects into the
output, controllers modulate any module's parameter, and a global puck keeps everything
musical. Faithful to the real Reactable object model (per `https://reactable.com/mobile/manual/`),
filtered to what a projected, touch-free, tangible wall can actually express.

This phase adds **four module types** and **rebuilds the routing engine**. No hardware
changes; still the paper-puck fun-check rig.

---

## 2. Module registry

| ID | Module | Class | Rotation controls | Tone.js node |
|----|--------|-------|-------------------|--------------|
| 0 | Oscillator *(exists)* | generator | pitch | `Tone.Synth` |
| 1 | **Filter** | effect | cutoff 200–8000 Hz (exp) | `Tone.Filter('lowpass')` |
| 2 | **Delay** | effect | feedback 0–0.85 (linear) | `Tone.FeedbackDelay` (time = 1/8note) |
| 3 | Output *(exists)* | global sink | master volume | `Tone.Volume` |
| 4 | **LFO** | controller | rate 0.1–8 Hz (exp) | `Tone.LFO` |
| 5 | **Tonality** | global | root note (12-step quantized arc) | none (state only) |

Calibration corner IDs **10, 11, 13, 18** remain reserved — never assign as modules.

Each registry entry declares its `class` (`generator` | `effect` | `controller` | `global`),
a `paramT(angle)` mapping (the existing signed ±45° arc helper, shared with the visual HUD),
and class-specific metadata:
- effects: `makeNode()` factory + `applyParam(node, t)`
- controllers: `makeNode()` + `modTarget` map (what param it drives on each target class)
- generators: `getFreq(angle, tonality)` (now tonality-aware)
- global (Tonality): `getQuantizer(angle)` → `{root, scale}`

---

## 3. Routing engine: `patchGraph.js` → `routingGraph.js`

Phase 2's binary osc→output is generalized into a per-frame **RoutingPlan** builder.
`patchGraph.js` is replaced by `src/services/routingGraph.js`.

```js
RoutingPlan = {
  chains: [ { genId, nodeIds: [genId, ...effectIds, outputId], outputId } ],
  controlLinks: [ { lfoId, targetId } ],
  tonality: { active, root, scale } | null,
  edges: [ ...visual edge descriptors... ]
}
```

### 3.1 On-the-cable effect insertion

For each generator that has an output within `PATCH_RADIUS` (Phase 2's 35%-of-screen-width):

1. Define segment **S** = generator → output (world/pixel coords).
2. For each effect puck compute:
   - perpendicular distance `d` from the puck to **S**
   - projection `t ∈ [0,1]` of the puck onto **S** (clamped)
3. An effect is **on the cable** when `d < BAND` **and** `0 < t < 1`.
4. Order on-cable effects by `t` ascending → that is the chain order
   (`gen → effect@small-t → … → effect@large-t → output`).
5. Chain `nodeIds = [genId, ...orderedEffectIds, outputId]`.

A generator with **no output in range** produces a chain with no `outputId` → it stays
**silent** (locked decision #2 from the base spec: connection is what makes sound).

### 3.2 Hysteresis & debounce (anti-flicker)

Pucks jitter; raw band tests would make effects pop in and out of chains.

- **Spatial hysteresis:** `BAND_ADD < BAND_KEEP`. An effect must come within `BAND_ADD`
  to *join* a cable, but only leaves once it exceeds `BAND_KEEP`.
- **Temporal debounce:** a computed chain change must persist `CHAIN_HOLD_FRAMES`
  (~120 ms at the detection cadence) before it is committed and the audio is rewired.

### 3.3 Control links (LFO)

For each LFO puck, link it to its **nearest audio module** (generator or effect — never an
output, never another controller) within `CONTROL_RADIUS`. At most one target per LFO.
Same temporal debounce as chains.

### 3.4 Tonality (global)

If a Tonality puck is present, the plan carries `tonality = { active:true, root, scale }`,
where `root` comes from its rotation (12 quantized steps) and `scale` is fixed to
**minor pentatonic** for v1. No audio routing — it only changes how generators map
angle → frequency. Multiple Tonality pucks: last-seen wins (log a warning).

---

## 4. Audio engine generalization

`src/services/audioEngine.js` changes:

### 4.1 Node creation (`_addModule`)
Branch by `def.class`:
- **generator** — unchanged (Tone.Synth, triggerAttack).
- **effect** — `def.makeNode()` (Filter / FeedbackDelay), created **disconnected**; routing
  inserts it. Param set from rotation via `def.applyParam`.
- **controller** — `Tone.LFO`, configured + `.start()`. Not connected until a link forms.
- **global** (Tonality) — no node; updates shared tonality state only.

### 4.2 `applyRoutingPlan(plan)` — replaces `rerouteOscillator()`
- Keep `lastAppliedPlan`. **Diff** new vs last; only touch what changed (no global teardown → no pops).
- **Chain changed** (node list differs): disconnect every node in the old + new chain, then
  reconnect in series `gen → eff → … → output`. Chain with no `outputId` → leave generator
  disconnected (silent).
- **Control link added:** `lfo.connect(target.<modParam>)`.
  **Removed:** `lfo.disconnect()` and restore the target param to its rotation-derived value.
- modParam map — the LFO modulates the **same parameter the target's rotation controls**, so
  option B stays coherent (rotation = center, LFO = rate): `filter → frequency` (cutoff),
  `delay → feedback`. Exception: `oscillator → detune` (vibrato around the rotation-set pitch,
  center 0 cents) since modulating absolute frequency would fight tonality quantization.

### 4.3 LFO behavior — **option B (locked)**
When an LFO links to a target, the target's **own rotation sets the center value** of the
modulated parameter and the **LFO's rotation sets the modulation rate**. Implementation:
the LFO's `min`/`max` are set as a fixed musical span centered on the target's current
rotation value; `frequency` = LFO rate from its own rotation. When the target is turned
while linked, its center (and thus the LFO min/max window) updates. Both pucks stay
meaningful. (Option A — LFO overrides the param entirely — was rejected.)

### 4.4 Tonality-aware pitch
`Tone.Synth` generators compute frequency through the shared tonality state: if active,
the exponential angle→freq value is quantized to the nearest note of `{root, scale}`
before `rampTo`. If no Tonality puck is present, behavior is exactly Phase 2 (continuous
glide).

---

## 5. Visual engine

`src/components/visualEngine.js` changes:

- **Audio chains:** draw every segment of every chain (`gen→eff→eff→out`), reusing the
  Phase 2 solid-glow + midpoint-dot style — now multi-hop instead of single edges.
- **Control links:** visually distinct — **purple, dotted, animated pulse** travelling
  LFO→target — so a controller reads as *control*, not audio.
- **Tonality:** a small HUD pill (`♪ C minor pentatonic`) + faint global tint; no cable.
- **Effect rings:** reuse the `paramT` arc HUD + percentage label for cutoff/feedback.
- **Debug readout:** extend Phase 2's on-screen line to print the computed chains and
  control links (e.g. `0→1→2→3 | LFO4→1 | TON5:Cmin`) for on-wall verification.

The reference mockup of the intended look lives at `docs/phase3-mockup.html`.

---

## 6. Testing

This vanilla project has no test harness. The risky logic is the geometry + graph builder,
which is **pure and deterministic** — that is what gets unit tests; audio/visual wiring is
verified by on-wall playtest (the project's established method) aided by the debug readout.

Add `src/tests/` covering `routingGraph`:
- point-to-segment perpendicular distance & clamped projection `t`
- on-cable selection (band test) and chain ordering by `t`
- spatial hysteresis (`BAND_ADD` vs `BAND_KEEP`) and temporal debounce
- nearest-target selection for control links (excludes outputs/controllers)
- tonality quantization (angle → nearest scale note)

Target: the graph builder's branches covered; no coverage gate on glue code.

---

## 7. Files touched

| File | Change |
|------|--------|
| `src/services/moduleRegistry.js` | +Filter, Delay, LFO, Tonality defs; per-class metadata (`class`, `makeNode`, `applyParam`, `modTarget`, `getQuantizer`) |
| `src/services/routingGraph.js` | **replaces** `patchGraph.js`; full RoutingPlan builder + geometry + hysteresis/debounce |
| `src/services/audioEngine.js` | class-branched node creation; `applyRoutingPlan`; LFO link/unlink (option B); tonality-aware `getFreq` |
| `src/components/visualEngine.js` | multi-segment chains, control-link style, tonality HUD, extended debug readout |
| `index.html` | wire RoutingPlan into `onMarkersDetected`; update start-banner copy |
| `print.html` | add marker IDs 1, 2, 4, 5 with labels |
| `src/tests/` | geometry + graph-builder unit tests |
| `docs/phase3-mockup.html` | reference mockup (already added) |

---

## 8. Tuning constants (first-pass, refine on wall)

| Constant | Start value | Meaning |
|----------|-------------|---------|
| `PATCH_RADIUS` | `0.35 * innerWidth` | gen↔output connect distance (Phase 2) |
| `BAND_ADD` | `60 px` | perpendicular distance to *join* a cable |
| `BAND_KEEP` | `95 px` | perpendicular distance to *stay* on a cable |
| `CONTROL_RADIUS` | `0.30 * innerWidth` | LFO↔target link distance |
| `CHAIN_HOLD_FRAMES` | `3` (~120 ms) | persistence before committing a routing change |

---

## 9. Out of scope (this phase)

- Microphone, Sampler/Loop Player, Accelerometer, Sequencer (deferred — Sampler/Sequencer
  are good Phase 4 candidates).
- Touchscreen "second parameter" and finger-drawn connection muting (no touch on a
  projected wall).
- Scale/key selection beyond minor pentatonic; multiple simultaneous scales.
- Metal/magnetic hardware and MRT2 generative layer (base spec Phases 3–4, unchanged).
