# Reactable Wall — Phase 9 Design Spec: Cross-Modulation Matrix

**Date:** 2026-06-27
**Builds on:** Phase 8 (Bass + Chords) — all four pucks (Drums, Bass, Chords, Melody) must be live
**Status:** Approved (design, 2026-06-27)

---

## 1. Goal

Right now placing all four pucks gives you a working band, but there's nowhere to go from there. This phase adds depth by making pucks interact with each other — not just play alongside each other.

Every puck pair has one defined musical relationship. Moving pucks near each other activates it. The closer they get, the stronger the effect. Moving them apart fades it out. Players discover the 12 relationships through physical exploration.

---

## 2. Core Mechanic

**Proximity activates, distance controls depth.**

- Each pair has a proximity threshold (e.g., 300px projected space — slightly larger than the patch graph threshold so modulation is discoverable before patching kicks in)
- Depth = `1 - (distance / threshold)` — linear, 0 at threshold, 1 at contact
- Depth is computed every tick and applied continuously — no gesture required
- Smooth fade: depth changes are low-pass filtered (~100ms) so connections don't snap on/off
- Multiple modulations stack — all four pucks close = all 12 relationships active simultaneously

Source puck rotation still controls its own parameter as normal. Modulation is additive on top.

---

## 3. The 12 Relationships

| # | Source → Target | Effect | Name |
|---|---|---|---|
| 1 | Drums → Bass | Kick steps boost bass note velocity/attack | **Kick locks bass** |
| 2 | Drums → Chords | Snare hits cut chord sustain and retrigger it | **Snare chops chords** |
| 3 | Drums → Melody | Melody only speaks on kick steps (kick gates melody) | **Drums speak for melody** |
| 4 | Bass → Drums | Bass line density maps to hi-hat step density | **Bass drives hats** |
| 5 | Bass → Chords | Bass rotation spreads or tightens chord voicing intervals | **Bass opens chords** |
| 6 | Bass → Melody | Bass root scale degree pulls melody note selection toward it | **Bass anchors melody** |
| 7 | Chords → Drums | Every chord change injects a short drum fill | **Chord marks the bar** |
| 8 | Chords → Bass | Chord root adds gravity to bass walking target | **Chords guide bass home** |
| 9 | Chords → Melody | Melody note selection biases toward current chord tones | **Chords color melody** |
| 10 | Melody → Drums | Melody rhythm drives hi-hat pattern (melody steps = hat steps) | **Melody dictates hats** |
| 11 | Melody → Bass | Ascending melody contour shifts bass up an octave; descending shifts down | **Melody lifts bass** |
| 12 | Melody → Chords | Chord inversion shifts to put the current melody note on top | **Melody voices the chord** |

Depth scales all effects linearly — at depth 0.5 you get half the modulation, at 1.0 you get full.

---

## 4. Implementation Notes

### Modulation detection loop

Each sequencer tick / animation frame:
1. Get all active puck pairs from the patch graph detector
2. For each pair compute distance in projected space
3. If `distance < MODULATION_THRESHOLD`, compute depth and store in a modulation state object
4. Apply depth to the relevant audio/sequencer parameter
5. Pass active modulations to the visual engine for cable rendering

### Per-relationship implementation

| # | Implementation |
|---|---|
| 1 | On kick step fire: multiply bass note velocity by `(1 + depth * 0.6)` |
| 2 | On snare step fire: call `chordEngine.retrigger()` with a short decay |
| 3 | In melody step gate: skip step if kick is not firing this step (scaled by depth — at 0.5, 50% of non-kick melody steps are silenced) |
| 4 | Count non-null bass steps; map `(count / 16) * depth` to hi-hat step probability |
| 5 | `voicingSpread = basePuckAngle * depth`; pass to chord voicer to expand intervals |
| 6 | Add `depth` weight toward bass root scale degree in melody note picker |
| 7 | On chord change event: inject fill pattern at `depth`-scaled velocity |
| 8 | `bassWalkGravity += chordRoot * depth`; included in walking target calculation |
| 9 | Weight chord tones by `depth` in melody note selection probability table |
| 10 | On each melody step: gate hi-hat with `depth`-scaled probability |
| 11 | Track melody contour (3-step rolling average); if ascending and `depth > 0.5`, shift bass +1 octave |
| 12 | Find chord inversion where melody note is topmost voice; blend toward it at `depth` |

### New file / extension points

- `src/services/modulationMatrix.js` — owns the 12 relationship definitions, computes depth per pair each tick, exposes `getActiveModulations()` for audio and visual engines
- `src/audio/` — each engine (drumEngine, bassEngine, etc.) accepts modulation inputs via a `setModulation(source, depth)` call
- `src/visual/` — extend cable renderer to draw modulation cables as a second pass

---

## 5. Visual Feedback

Modulation cables are a second layer on top of patch cables:

- **Style:** Thinner, slightly transparent, with directional particles flowing source → target
- **Particle density:** Scales with modulation depth — sparse at low depth, dense at high depth
- **Color:** Source puck's color (so you always see who is influencing whom)
- **Fire pulse:** On modulation trigger events (kick fire, chord change, etc.), a brief bright flash pulses along the cable
- **Fade-in:** Cables fade in as pucks approach threshold — visual confirmation proximity is working
- **Fully entangled state:** All 12 cables visible and pulsing simultaneously when all four pucks are close

Patch cables remain unchanged — modulation cables render on top of them.

---

## 6. What's Out of Scope

- Rotation controlling modulation amount (rotation still only controls own parameter)
- Directional auras / arc-based modulation (could be Phase 10)
- Saving/recalling spatial configurations
- More than one modulation per pair (one relationship per pair, no exceptions)
