# Loop-based Drummer with Pre-baked 128 BPM + Global Tempo Puck — Design

**Date:** 2026-06-27
**Project:** Reactable Wall
**Status:** Approved (pending spec review)

## Problem

The Drummer puck (marker ID 4) is a synthesized Tone.js drum machine: `_makeDrums()`
builds kick/snare/hat synths and `_onStep()` triggers them from `DRUM_GROOVES` patterns.
We want the drummer to play real drum **WAV loops** instead, and we want every loop
(drummer + melody) to stay locked in tempo and in key with no per-loop drift.

## Approach (locked)

Pre-bake **all** loops to a single common tempo of **128 BPM** offline (pitch-preserved, so
key is unchanged). Melody loops are already all in **D# Minor**; drums are keyless — so key is
already unified and only BPM needs converting. At runtime every loop is natively 128, so they
are inherently locked and in key. The **Tempo puck (ID 8)** remains the single global tempo
control: it sets `Transport.bpm`, and all loop pucks (drummer + melody) follow it together via
the existing `playbackRate` path. At the default 128, every loop plays at `playbackRate = 1.0`.

This deletes the previously considered "melody-drives-tempo" runtime resolver entirely.

### Decisions

1. **All loops pre-baked to 128 BPM** (offline, ffmpeg `rubberband`, pitch preserved).
2. **Drummer puck → loop sampler** cycling all 10 drum loops (`category: 'drums'`).
3. **Tempo puck stays** as the global tempo control affecting drummer + melody together.
4. **Remove dead synth-drum code** (not leave it dormant).

### Caveat (accepted)

- When the Tempo puck moves **away from 128**, all loops stretch together (still in sync and
  in key *with each other*), but the synthesized bass/chords/lead band is pitched to the
  tonality and does not pitch-shift with tempo — so loops can drift in key *vs the synth band*
  at extreme tempos. Irrelevant when playing loops alone.
- Converting the few extreme-BPM loops to 128 is a large stretch (98→128 ≈ +31%,
  155/156→128 ≈ −18%, 150→128, 143→128); rubberband is high quality but transients can smear.
  Convert, listen, and drop any loop that sounds bad (QA step).
- The drummer loop, being a fixed audio loop, leaves the cross-modulation "band" system
  (`drummer↔bass/chords/lead`). Those interactions are deleted; `bass↔chords↔lead` remain.

## Offline conversion

A reproducible script (`scripts/convert-loops-128.mjs`, run via `node`) reads each source loop
and writes a 128-BPM, pitch-preserved copy. Per file: `tempo = 128 / nativeBpm`, e.g.

```
ffmpeg -y -i "<src>" -af "rubberband=tempo=128/134" "<dst>"
```

- **Sources (masters, kept):** `loops/Melody/*.wav`, `loops/drummer/*.wav`.
- **Output (runtime assets):** `loops/_128/Melody/*.wav`, `loops/_128/drummer/*.wav`
  (same filenames; originals preserved so conversion is re-runnable).
- The loop bank points at the `loops/_128/...` paths.
- Native BPMs come from the filenames (all drum + melody files carry their BPM).

| native bpm | loops |
|---|---|
| 128 | Ring, Charli, Nation, Melbourne-1, Melbourne-2, Drums(7533390), Golden128, Razor128 |
| 98 | Trade Off |
| 122 | Hard Club |
| 123 | Basic EDM |
| 155 | Hard EDM (part 2) |
| 134 | Aquamarine |
| 140 | Neon Dream, Quest |
| 143 | Crypto |
| 150 | Gemstone |
| 156 | Pyramid |

## Components / changes

### 1. `scripts/convert-loops-128.mjs` (new)
Batch-convert all bank loops to 128 into `loops/_128/...` using ffmpeg `rubberband`. Parses
native BPM from each filename; idempotent (`-y` overwrite). Logs each conversion + the tempo
factor. Fails loudly if ffmpeg is missing.

### 2. `src/data/loopBank.js`
- Add the 8 unused drum WAVs → 10 drum entries (`category: 'drums'`).
- Every entry's `file` points to `loops/_128/...`; every entry's `bpm` is **128**.
- `playbackRateFor(loopBpm, curBpm)` unchanged (returns `curBpm/128`).

### 3. `src/services/moduleRegistry.js`
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

### 4. `src/services/audioEngine.js`
- **No tempo resolver.** Keep the existing Tempo-puck path: `_updateModule` tempo branch ramps
  `Transport.bpm` and the existing `_applyLoopRates()` re-rates all samplers (drummer now
  included automatically). Default `Transport.bpm = 128` (unchanged).
- The drummer flows through the existing `sampler` branch of `_addModule` — no new playback
  code. At 128 its `playbackRate` is 1.0.
- **Remove** the now-dead synth-drum path:
  - `_makeDrums()` and any drum-only constants.
  - `_onStep` drummer block (≈181–203) and the drummer cross-mod references:
    `_xm_kickFired`/`_xm_snareFired` gather + computation, `fillStepsRemaining`/`_xm_inFill`
    state, and the `_modDepth('drummer', …)` / `_modDepth(…, 'drummer')` usages in the
    bass/chords/lead blocks (velocity boost, snare retrigger, kick gating).
  - `drummer` branch in `_addModule` (≈372–377), the `drums` module-state field, and the
    `m.drums` disposal in `_removeModule`.
  - `_drumGrooves` import.

### 5. `src/services/modulationMatrix.js`
Remove `drummer` from `BAND_TYPES` and the 6 `drummer:*` / `*:drummer` entries from
`VALID_PAIRS` (leaving the 6 `bass`/`chords`/`lead` pairs).

### 6. `src/services/routingGraph.js`
Remove the redundant `m.def.type === 'drummer'` clause from the generator filter (≈line 26);
the drummer is now matched by the existing `'sampler'` clause.

### 7. `src/data/drumGrooves.js`
Delete (no longer referenced).

## Error handling / edge cases
- **No buffer (file:// or load failure):** existing sampler guard warns and skips; drummer
  inherits it.
- **Tempo puck present:** sets one global `Transport.bpm`; all loops follow together.
- **No tempo puck:** everything stays at 128 default.
- **Missing converted file:** `preloadLoops` already logs a missing-buffer warning per entry;
  the conversion script must produce all 18 outputs before serving.

## Testing
- `loopBank.test.js`: every entry has `bpm === 128`; 10 drum + 8 melody entries with correct
  categories; `file` paths under `loops/_128/`; `playbackRateFor(128, 128) === 1` and
  `playbackRateFor(128, 140)` scales correctly.
- `moduleRegistry` (or `loopBank`) test: ID 4 `getLoopIndex` returns only drum-category
  indices across the rotation arc; endpoints saturate.
- `modulationMatrix.test.js`: update to the reduced pair set (no drummer pairs).
- `drumGrooves.test.js`: delete.
- `browserLoad.test.js`: remove `src/data/drumGrooves.js` from the load list.
- Manual QA: run the conversion script, listen to all 18 converted loops (especially 98, 150,
  155, 156), drop any that smear badly; verify drummer + melody stay locked and the Tempo puck
  scrubs both together.

## Out of scope
- Per-loop runtime tempo matching (replaced by pre-baking).
- Beat-grid/phase alignment of loop start points (loops restart on placement, not bar-quantized).
- Any change to the synthesized bass/chords/lead band or their remaining modulations.
