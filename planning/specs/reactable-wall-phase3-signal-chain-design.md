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

### 3.1 Nearest-neighbor effect insertion

> **Amended 2026-06-25:** the original "on-the-cable" rule (effects had to sit on the
> straight line between generator and output) was replaced after playtest with the
> **nearest-neighbor proximity model**, which matches how the real Reactable connects:
> objects link to their nearest neighbor and signal flows toward the output. Effects
> insert by being *near* the path, not on a precise line.

For each generator, the target is its **nearest output** overall. The chain is built by a
greedy walk from the generator toward that output:

1. `current = generator`.
2. Among effects not yet claimed, find the **nearest one to `current`** that is within
   `CONNECT_RADIUS` **and strictly closer to the output than `current`** (so signal always
   progresses "downhill" toward the speaker — this also prevents cycles).
3. If found, hop to it (append to chain) and repeat from step 2.
4. When no qualifying effect remains, connect `current → output` **iff** the output is
   within reach. Otherwise the generator can't reach an output → it stays **silent**
   (locked decision #2: connection is what makes sound).
5. Chain `nodeIds = [genId, ...orderedEffectIds, outputId]` (order = the hop sequence).

An effect already claimed by an earlier generator's chain is not reused by another.

### 3.2 Hysteresis & debounce (anti-flicker)

Pucks jitter; raw radius tests would make hops pop in and out of chains.

- **Spatial hysteresis:** an existing hop stays connected out to `CONNECT_RADIUS *
  KEEP_FACTOR` (1.25×), but a new hop must come within `CONNECT_RADIUS` to form.
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

This vanilla project uses Node's built-in runner (`npm test` → `node --test`). The risky
logic is the graph builder, which is **pure and deterministic** — that gets unit tests;
audio/visual wiring is verified by on-wall playtest plus a shared-scope browser-load test.

`src/tests/` covers:
- `routingGraph`: nearest-neighbor chain build, off-line insertion, progress-toward-output
  rule, two-effect chaining order, spatial hysteresis (`KEEP_FACTOR`), temporal debounce,
  nearest-target control links (excludes outputs/controllers)
- `tonality`: quantization (angle → nearest scale note) and `rootFromT`
- `moduleRegistry`: module types, reserved-ID guard, param mappings
- `browserLoad`: loads all `<script>`s into one shared VM context (mirrors the browser) to
  catch cross-file `const` collisions; tracks the audio graph to assert an oscillator
  actually reaches Destination

Target: the graph builder's branches covered; no coverage gate on glue code.

---

## 7. Files touched

| File | Change |
|------|--------|
| `src/services/moduleRegistry.js` | +Filter, Delay, LFO, Tonality defs; per-class metadata (`class`, `makeNode`, `applyParam`, `modTarget`, `getQuantizer`) |
| `src/services/routingGraph.js` | **replaces** `patchGraph.js`; nearest-neighbor RoutingPlan builder + hysteresis/debounce |
| `src/services/audioEngine.js` | class-branched node creation; `applyRoutingPlan`; LFO link/unlink (option B); tonality-aware `getFreq` |
| `src/components/visualEngine.js` | multi-segment chains, control-link style, tonality HUD, extended debug readout |
| `index.html` | wire RoutingPlan into `onMarkersDetected`; update start-banner copy |
| `print.html` | add marker IDs 1, 2, 4, 5 with labels |
| `src/tests/` | graph-builder, tonality, registry, and shared-scope browser-load tests |
| `docs/phase3-mockup.html` | reference mockup (already added) |

---

## 8. Tuning constants (first-pass, refine on wall)

| Constant | Start value | Meaning |
|----------|-------------|---------|
| `CONNECT_FRAC` | `0.35 * innerWidth` | audio-hop distance (osc/effect → next node) |
| `KEEP_FACTOR` | `1.25` | an existing hop stays connected out to `CONNECT_RADIUS × KEEP_FACTOR` |
| `CONTROL_FRAC` | `0.30 * innerWidth` | LFO↔target link distance |
| `CHAIN_HOLD_FRAMES` | `3` (~120 ms) | persistence before committing a routing change |

---

## 9. Out of scope (this phase)

- Microphone, Sampler/Loop Player, Accelerometer, Sequencer (deferred — Sampler/Sequencer
  are good Phase 4 candidates).
- Touchscreen "second parameter" and finger-drawn connection muting (no touch on a
  projected wall).
- Scale/key selection beyond minor pentatonic; multiple simultaneous scales.
- Metal/magnetic hardware and MRT2 generative layer (base spec Phases 3–4, unchanged).
