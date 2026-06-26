# Sequencer Phase — Research Notes

**Date:** 2026-06-25
**Question:** How do people build music with tangible/modular tools (Reactable, modular synths, step sequencers, loopers), and what conventions should the Reactable Wall Sequencer puck follow?
**Method:** deep-research workflow (6 search angles, 26 sources, primary sources = Ableton Push 2 manual, Reactable Live + ROTOR manuals). Adversarial verification was rate-limited this run, so most claims abstained rather than failed — they're reported as conventions, not contradicted facts.

---

## Conventions to follow (ranked by reliability)

1. **Tap-to-place / toggle is THE interaction** *(highest confidence — survived verification)*
   You build a pattern by tapping the step positions where you want notes; tapping an active step removes it. This is **placement, not real-time recording**. → For our puck: a ring of 16 toggle slots you turn on/off, not a "record what I play" mode.

2. **The sequencer drives generators; it makes no sound itself.**
   It steps through stored per-step values on a clock and sends note events to a connected generator (oscillator/sampler). → Our Sequencer puck connects to the Oscillator (via the existing patch graph) and triggers its pitch on each step. The Oscillator stops being a drone and becomes a rhythmic voice.

3. **Equal-time grid, 16 steps is the standard.**
   Steps are equal subdivisions (16th notes by default). Resolution/tempo adjustable. Per-step **velocity** and **gate length** are conventional extras on top of on/off.

4. **Reactable/ROTOR tangible paradigm — most directly analogous to us:**
   - 16-step **loop** sequencer; connect it to an Oscillator/Sampler → it plays a melody.
   - Steps = slots **arranged around the circular object**, toggled on/off.
   - Per-step **volume = a gesture extending outward** from each point.
   - **Rotating the object** switches between stored preset sequences (≈6–8 presets); pitch sequences are **relative**, so rotating the *target* synth transposes the whole sequence.
   - → Maps cleanly to a marker-tracked puck: ring of step slots, rotation = preset or transpose.

5. **Track build-up order (how a track grows from nothing):**
   Short 4–8 bar core loop → **drums first** (kick → snare/clap → hats) → **bassline** anchors groove → **melody/texture** (plucks, pads, arps) → **effects** last. → Suggests a future **drum/percussion** generator is the natural companion to the Sequencer.

6. **Live-performance flow (lower confidence, single-source):**
   Loop/clip launchers use **launch quantization** (a triggered clip snaps to the next bar/beat instead of starting the instant you press), and **follow-actions** auto-chain patterns. → For a wall: placing/removing a puck could be the "trigger," and it should **quantize to the next bar** rather than jump in mid-beat.

---

## Open design questions (for the brainstorm)

- **Rotation mapping:** preset-switch vs. transpose vs. tempo? (ROTOR uses rotation = preset/transpose.)
- **Per-step velocity** via an outward radial gesture works with capacitive touch on ROTOR — does it translate to a marker-tracked puck, or do we drop velocity for v1?
- **Trigger/quantize:** does placing the Sequencer puck start it on the next bar (quantized) so it stays in time?
- **Step count & layout:** 16 steps is standard, but how do we show/edit 16 slots around a physically-tracked puck on a projected wall (we can't "tap" a puck — editing has to be projected UI or a companion gesture)?
- **How do you EDIT the pattern** with no touchscreen? This is the core challenge — options: an on-wall projected step grid you edit with a "cursor" puck, preset sequences only (rotation picks one), or a generative/euclidean pattern set by rotation (rotation = density of hits). The last is the most webcam-friendly.

---

## Reference videos / demos (curation was incomplete — see caveat)

The verifier dropped all video URLs, but these surfaced during search and are worth watching:
- **Official ROTOR videos:** https://reactable.com/rotor-videos/ (Reactable's own performance/demo videos — best for the sequencer-as-module interaction)
- **CDM "Tangible music: the Reactable in videos":** https://cdm.link/tangible-music-the-reactable-and-interactive-instrument-design-in-videos/
- Reactable manuals (interaction reference): https://reactable.com/live/manual/sequencer.html and https://reactable.com/rotor/manual/chapter5.html
- Unverified YouTube hits to check: youtube.com/watch?v=Ni_x_74VKU0, youtube.com/watch?v=x8WuWagPTwk, youtube.com/watch?v=0h-RhyopUmc

**Gap:** a dedicated video-curation pass (YouTube Reactable sequencer demos, ROTOR live sets) was not completed — worth a focused follow-up if watching the interaction directly matters.

---

## Biggest implication for our design

The hardest part isn't playback (Tone.js handles clock/steps trivially) — it's **how you EDIT a 16-step pattern with no touchscreen**, only a rotatable tracked puck. The most webcam-native answer is likely **rotation = pattern character** (e.g. Euclidean density, or preset selection) rather than tapping individual steps. That's the key decision for the brainstorm.
