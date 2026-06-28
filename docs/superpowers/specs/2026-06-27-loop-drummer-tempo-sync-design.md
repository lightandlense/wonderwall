# Loop-based Drummer with Melody-locked Tempo — Design

**Date:** 2026-06-27
**Project:** Reactable Wall
**Status:** Approved (pending spec review)

## Problem

The Drummer puck (marker ID 4) is a synthesized Tone.js drum machine: `_makeDrums()`
builds kick/snare/hat synths and `_onStep()` triggers them from `DRUM_GROOVES` patterns.
We want the drummer to play real drum **WAV loops** instead, and we want those drum loops
to stay in tempo with whatever melody loop is playing.

## Decisions (locked)

1. **Melody drives tempo.** Placing/selecting a melody-category loop sets the global
   `Transport.bpm` to that melody's native BPM. The melody plays clean (playbackRate ≈ 1.0);
   the drummer loop time-stretches (via `playbackRate`) to match.
2. **Drummer cycles all drum loops.** The drummer puck becomes a loop sampler; rotation
   selects among all 10 drum WAVs in `loops/drummer/` (`category: 'drums'`), same UX as the
   Melody puck.
3. **BPMs are known.** All drum filenames now carry their BPM; values are baked into the bank
   (no runtime detection).
4. **Remove dead synth-drum code** rather than leaving it dormant.

## Consequence (accepted)

Converting the drummer to a fixed audio loop removes it from the cross-modulation "band"
system (`drummer↔bass/chords/lead`: kick-gated melodies, chord-change fills, bass-density
hats, kick-velocity boosts). A fixed loop cannot be programmatically filled, gated, or
hatted, so those interactions are deleted. The remaining band modulations
(`bass↔chords↔lead`) are unaffected.

## Architecture

All loop pucks are `type: 'sampler'`, played by `Tone.Player` with
`playbackRate = playbackRateFor(loopBpm, Transport.bpm) = Transport.bpm / loopBpm`.
The drummer becoming a sampler means it inherits this tempo-locking for free. The only new
mechanism is a single resolver that decides the master tempo from current wall state.

### Tempo resolution

`_resolveMasterBpm()` computes the target `Transport.bpm` by priority:

1. **Most-recently-activated, currently-playing melody-category loop** → its `entry.bpm`.
   ("Melody" is keyed off `entry.category === 'melody'`, so a melody chosen via either the
   Melody puck or the Loop puck drives tempo.) Recency tracked via `m.tempoActivatedAt`
   (`performance.now()`), set when a module is added and whenever its loop swaps.
2. Else, if a **Tempo puck** (ID 8) is present → its current BPM.
3. Else → **128** (default).

Effect applied as `Tone.Transport.bpm.rampTo(master, 0.1)` followed by the existing
`_applyLoopRates(master)` (which re-rates every sampler, drummer included).

Called from:
- `_addModule` (after any module is added)
- `_removeModule` (after any module is removed)
- `_updateModule` sampler branch when the loop index swaps (melody changed → new BPM)
- `_updateModule` tempo-puck branch (replaces its current direct `Transport.bpm.rampTo`)

With a melody present, the Tempo puck is overridden — it only takes effect when no melody is
playing. This is the literal meaning of "melody drives tempo."

## Components / changes

### 1. `src/data/loopBank.js`
Add the 8 currently-unused drum WAVs (10 drum entries total), each
`{ name, file, bpm, category: 'drums' }`:

| name | file (under `loops/drummer/`) | bpm |
|---|---|---|
| Ring 128 | `Cymatics - Ring Drum Loop - 128 BPM.wav` | 128 |
| Trade Off 98 | `Cymatics - Trade Off Drum Loop - 98 BPM.wav` | 98 |
| Hard Club 122 | `looperman-l-2039702-0409953-hard-club-beat-drum - 122 BPM.wav` | 122 |
| Hard EDM 155 | `looperman-l-2328394-0297437-hard-edm-drums-part-2-sicklunarozza - 155 BPM.wav` | 155 |
| Charli 128 | `looperman-l-2648144-0386898-charli-xcx-x-shygirl-drums-128bpm.wav` | 128 |
| Basic EDM 123 | `looperman-l-3065265-0424642-basic-edm-drums - 123 BPM.wav` | 123 |
| Nation 128 | `looperman-l-6561456-0406445-nation-edm-drum-loop - 128 BPM.wav` | 128 |
| Melbourne 1 128 | `looperman-l-7344971-0409722-melbourne-bounce-drum-beats-1-without-noise - 128 BPM.wav` | 128 |
| Melbourne 2 128 | `looperman-l-7344971-0409841-melbourne-bounce-drum-beats-2 - 128 BPM.wav` | 128 |
| Drums 128 | `looperman-l-7533390-0412372-drums - 128 BPM.wav` | 128 |

`playbackRateFor` is unchanged.

### 2. `src/services/moduleRegistry.js`
ID 4 Drummer: change `type: 'drummer'` → `type: 'sampler'`. Replace `getGrooveIndex`/`getName`
(and the `drumGrooves` require) with drum-category loop selection mirroring the Melody puck:

```js
getLoopIndex(angle) {
  const lb = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
  const indices = lb.LOOP_BANK.map((e, i) => i).filter(i => lb.LOOP_BANK[i].category === 'drums');
  const n = indices.length;
  return indices[Math.max(0, Math.min(n - 1, Math.floor(this.getParamT(angle) * n)))];
}
```
`getName` returns the selected drum entry's name. Keep `id: 4`, `name: 'Drummer'`, color,
`paramLabel: 'Loop'`.

### 3. `src/services/audioEngine.js`
- **Add** `_resolveMasterBpm()` and wire the call sites above.
- Add `tempoActivatedAt` to module state on add and on loop swap.
- **Remove** (now-dead synth-drum path):
  - `_makeDrums()` and any drum-only constants.
  - `_onStep` drummer block (≈181–203) and the drummer cross-mod references:
    `_xm_kickFired`/`_xm_snareFired` gather + computation, `fillStepsRemaining`/`_xm_inFill`
    state, `_modDepth('drummer', …)` and `_modDepth(…, 'drummer')` usages in the bass/chords/
    lead blocks (velocity boost, snare retrigger, kick gating).
  - `drummer` branch in `_addModule` (≈372–377), the `drums` module-state field, and the
    `m.drums` disposal in `_removeModule`.
  - `_drumGrooves` import.
- The Melody/Loop sampler playback path is otherwise unchanged; melody rate resolves to ~1.0
  automatically because the transport is set to its BPM.

### 4. `src/services/modulationMatrix.js`
Remove `drummer` from `BAND_TYPES` and the 6 `drummer:*` / `*:drummer` entries from
`VALID_PAIRS` (leaving the 6 `bass`/`chords`/`lead` pairs).

### 5. `src/services/routingGraph.js`
Remove the redundant `m.def.type === 'drummer'` clause from the generator filter (line ≈26);
the drummer is now matched by the existing `'sampler'` clause.

### 6. `src/data/drumGrooves.js`
Delete (no longer referenced).

## Error handling / edge cases
- **No buffer (file:// or load failure):** existing sampler guard already warns and skips;
  drummer inherits it.
- **Multiple melodies at different BPMs:** most-recently-activated wins (`tempoActivatedAt`).
- **Melody removed:** resolver falls back to next melody → Tempo puck → 128.
- **Drummer only, no melody:** plays at master tempo (Tempo puck or 128); a 128-BPM loop at
  128 transport → rate 1.0.
- **Large stretch (e.g. 98 → 155):** `playbackRate` shifts pitch as well as speed; acceptable
  for this instrument and consistent with existing sampler behavior. Not addressed here.

## Testing
- `loopBank.test.js`: assert 10 drum entries with correct bpm/category; `playbackRateFor`
  with new drum BPMs (e.g. 155 @ 128 transport).
- `moduleRegistry` (or `loopBank`) test: ID 4 `getLoopIndex` returns only drum-category
  indices across the rotation arc; endpoints saturate.
- New `_resolveMasterBpm` tests (pure helper, extracted to be unit-testable): melody > tempo
  puck > default; multi-melody picks most recent; fallback after melody removal.
- `modulationMatrix.test.js`: update to the reduced pair set (no drummer pairs).
- `drumGrooves.test.js`: delete.
- `browserLoad.test.js`: remove `src/data/drumGrooves.js` from the load list.

## Out of scope
- Pitch-preserving time-stretch (GrainPlayer) for the drummer.
- Beat-grid/phase alignment of loop start points (loops are restarted on placement, not
  bar-quantized).
- Any change to the synthesized bass/chords/lead band or their remaining modulations.
