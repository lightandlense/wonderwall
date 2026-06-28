# Loop-based Drummer with Global Tempo Puck — Design

**Date:** 2026-06-27
**Project:** Reactable Wall
**Status:** Approved (pending spec review)

## Problem

The Drummer puck (marker ID 4) is a synthesized Tone.js drum machine: `_makeDrums()`
builds kick/snare/hat synths and `_onStep()` triggers them from `DRUM_GROOVES` patterns.
We want the drummer to play real drum **WAV loops** instead, and we want the drummer to stay
in tempo with the melody.

## Approach (locked)

Keep each loop at its **native BPM** in the bank and rely on the existing runtime
tempo-locking: every loop sampler plays via `Tone.Player` with
`playbackRate = playbackRateFor(nativeBpm, Transport.bpm) = Transport.bpm / nativeBpm`, so all
loops conform to one global Transport tempo and therefore stay locked to each other. The
**Tempo puck (ID 8)** is the global tempo control. The default Transport tempo is **128**
(unchanged), so by default every loop plays at 128 (loops whose native BPM is 128 play
untouched; others are stretched to 128). No offline conversion and no tempo resolver are
needed.

### Decisions

1. **Native BPMs kept in the bank**; runtime `playbackRate` locks every loop to the Transport.
2. **Fixed 128 default** tempo (no Tempo puck → everything plays at 128).
3. **Drummer puck → loop sampler** cycling all 10 drum loops (`category: 'drums'`).
4. **Tempo puck stays** as the global control affecting drummer + melody together.
5. **Remove dead synth-drum code** (not leave it dormant).

### Caveat (accepted)

- Runtime `playbackRate` couples tempo and pitch: a loop not at the current Transport tempo is
  pitch-shifted. For drums this is a harmless timbre change. For melodies (all D# Minor), a
  non-128 melody played at 128 drifts out of D# Minor; layering two different-native-BPM
  melodies can put them in slightly different keys. Accepted for simplicity.
- Large ratios (e.g. 98→128, 155/156→128) shift pitch noticeably; audition and drop any loop
  that sounds bad (QA step).
- The drummer loop, being a fixed audio loop, leaves the cross-modulation "band" system
  (`drummer↔bass/chords/lead`). Those interactions are deleted; `bass↔chords↔lead` remain.

## Components / changes

### 1. `src/data/loopBank.js`
- Add the 8 unused drum WAVs → 10 drum entries (`category: 'drums'`), each with its **native**
  BPM. File paths stay under `loops/drummer/` and `loops/Melody/` (existing on-disk layout).
- Melody entries unchanged (8 D# Min entries, native BPMs).
- `playbackRateFor(loopBpm, curBpm)` unchanged.

Drum entries (name, file under `loops/drummer/`, native bpm):

| name | file | bpm |
|---|---|---|
| Ring | `Cymatics - Ring Drum Loop - 128 BPM.wav` | 128 |
| Trade Off | `Cymatics - Trade Off Drum Loop - 98 BPM.wav` | 98 |
| Hard Club | `looperman-l-2039702-0409953-hard-club-beat-drum - 122 BPM.wav` | 122 |
| Hard EDM | `looperman-l-2328394-0297437-hard-edm-drums-part-2-sicklunarozza - 155 BPM.wav` | 155 |
| Charli | `looperman-l-2648144-0386898-charli-xcx-x-shygirl-drums-128bpm.wav` | 128 |
| Basic EDM | `looperman-l-3065265-0424642-basic-edm-drums - 123 BPM.wav` | 123 |
| Nation | `looperman-l-6561456-0406445-nation-edm-drum-loop - 128 BPM.wav` | 128 |
| Melbourne 1 | `looperman-l-7344971-0409722-melbourne-bounce-drum-beats-1-without-noise - 128 BPM.wav` | 128 |
| Melbourne 2 | `looperman-l-7344971-0409841-melbourne-bounce-drum-beats-2 - 128 BPM.wav` | 128 |
| Drums | `looperman-l-7533390-0412372-drums - 128 BPM.wav` | 128 |

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
- **No tempo resolver, no new playback code.** The drummer flows through the existing `sampler`
  branch of `_addModule`; the existing Tempo-puck path (`_updateModule` tempo branch ramps
  `Transport.bpm` and calls `_applyLoopRates()`) re-rates all samplers, drummer included.
  Default `Transport.bpm = 128` (unchanged).
- **Remove** the now-dead synth-drum path:
  - `_makeDrums()` and any drum-only constants.
  - `_onStep` drummer block and the drummer cross-mod references: `_xm_kickFired`/
    `_xm_snareFired` gather + computation, `fillStepsRemaining`/`_xm_inFill` state, and the
    `_modDepth('drummer', …)` / `_modDepth(…, 'drummer')` usages in the bass/chords/lead blocks
    (velocity boost, snare retrigger, kick gating).
  - `drummer` branch in `_addModule`, the `drums` module-state field, and the `m.drums`
    disposal in `_removeModule`.
  - `_drumGrooves` import.

### 4. `src/services/modulationMatrix.js`
Remove `drummer` from `BAND_TYPES` and the 6 `drummer:*` / `*:drummer` entries from
`VALID_PAIRS` (leaving the 6 `bass`/`chords`/`lead` pairs).

### 5. `src/services/routingGraph.js`
Remove the redundant `m.def.type === 'drummer'` clause from the generator filter; the drummer
is now matched by the existing `'sampler'` clause.

### 6. `src/data/drumGrooves.js`
Delete (no longer referenced).

## Error handling / edge cases
- **No buffer (file:// or load failure):** existing sampler guard warns and skips; drummer
  inherits it.
- **Tempo puck present:** sets one global `Transport.bpm`; all loops follow together.
- **No tempo puck:** everything stays at 128 default.

## Testing
- `loopBank.test.js`: 10 drum + 8 melody entries with correct categories; drum entries carry
  their native BPMs; `file` paths under `loops/`; `playbackRateFor(128, 128) === 1`,
  `playbackRateFor(98, 128) === 128/98`.
- `moduleRegistry` test: ID 4 is a `sampler`; `getLoopIndex` returns only drum-category indices
  across the rotation arc; endpoints saturate; stale LFO/Sequencer/PitchShift assertions
  rewritten to the real current registry.
- `modulationMatrix.test.js`: update to the reduced pair set (no drummer pairs).
- `drumGrooves.test.js`: delete.
- `browserLoad.test.js`: remove `src/data/drumGrooves.js` from the load list.
- Manual QA: serve over http, verify drummer plays + cycles all 10 loops, drummer + melody stay
  locked, Tempo puck scrubs both together; audition stretched loops (98, 150, 155, 156) and
  drop any that sound bad.

## Out of scope
- Offline pre-baking loops to a common tempo (rejected — Tempo puck + runtime stretch suffices).
- Pitch-preserving time-stretch (GrainPlayer).
- Beat-grid/phase alignment of loop start points (loops restart on placement, not bar-quantized).
- Any change to the synthesized bass/chords/lead band or their remaining modulations.
