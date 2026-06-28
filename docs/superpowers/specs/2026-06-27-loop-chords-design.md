# Loop-based Chords Puck — Design

**Date:** 2026-06-27
**Project:** Reactable Wall
**Status:** Approved (pending spec review)

## Problem

The Chords puck (marker ID 6) is a synthesized Tone.js `PolySynth` driven by
`CHORD_PROGRESSIONS`, and `'chords'` is woven through the cross-modulation system
(chords→bass gravity, bass→chords spread, melody→chords inversion, chords→lead snap,
plus a chords self-play block in `_onStep`). We want the Chords puck to play real
**WAV loops** from `loops/Chords/` instead — the same conversion already done for the
Drummer puck.

## Approach (locked)

Mirror the shipped drummer/melody pattern. The 5 chord loops are **already all D# Minor**,
so only a tempo change is needed: pre-bake them to **128 BPM** (pitch-preserved time-stretch,
no pitch-shift) so they sit in key with the melody loops. The Chords puck becomes a loop
`sampler` cycling the chord-category loops; every loop is locked to the global Transport via
the existing `playbackRate` path and the Tempo puck. The synthesized-chords code and all
chord cross-modulation are removed.

### Decisions

1. **Chord loops pre-baked to 128 BPM** (pitch preserved; keys stay D# Minor) via the existing
   `scripts/convert-loops-128.mjs`, extended to also scan `loops/Chords/`.
2. **Chords puck (ID 6) → loop sampler** cycling all 5 chord loops (`category: 'chords'`).
3. **Tempo puck stays** the global control (no new audio code; existing `_applyLoopRates`).
4. **Remove dead synth-chords code** and chord cross-modulation.

### Consequence (accepted)

Like the drummer, the Chords puck leaves the cross-modulation "band" system. After this,
only `bass` remains as a synth band (`lead` was already orphaned when Melody became a sampler,
`drummer` already removed). The band/modulation system is therefore effectively vestigial —
this change keeps scope to chords and removes only the `chords` entries; the now-vestigial
matrix and the orphaned `lead`/`melodyLines` code are logged as deferred cleanup, not handled
here.

### QA caveat

`Short Synth` is a large stretch (95→128, +35%) and may smear; `Psy Chorus` (138→128) and
the two 134 loops are modest. Audition and drop any loop that sounds bad.

## Source loops (`loops/Chords/`, all D# Minor)

| name | file | native bpm |
|---|---|---|
| Phrog | `looperman-l-2212484-0214543-phrog-progressive-house-chords- 128 BPM.wav` | 128 |
| Short Synth | `looperman-l-5903669-0385270-short-synth-loop- 95 BPM.wav` | 95 |
| Psy Chorus | `looperman-l-6413071-0415019-je-8086-psy-chorus- 138 BPM.wav` | 138 |
| Reese | `looperman-l-7722845-0426217-reese-with-big-r - 134 BPM.wav` | 134 |
| Epic Synth | `looperman-l-7722845-0426218-epic-synth - 134 BPM.wav` | 134 |

## Components / changes

### 1. `scripts/convert-loops-128.mjs`
Add `'loops/Chords'` to `SRC_DIRS`. Re-run to generate `loops/_128/Chords/*.wav` (pitch
preserved). Originals kept as masters; outputs untracked.

### 2. `src/data/loopBank.js`
Add 5 `category: 'chords'` entries, `bpm: 128`, paths under `loops/_128/Chords/`. Update
`loopBank.test.js` counts (10 drums, 8 melody, 5 chords = 23 total).

### 3. `src/services/moduleRegistry.js`
ID 6 Chords: `type: 'chords'` → `type: 'sampler'`. Replace `getProgIndex`/`getName` (and the
`chordProgressions` require) with chord-category loop selection mirroring the Drummer puck:

```js
getLoopIndex(angle) {
  const lb = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
  const indices = lb.LOOP_BANK.map((e, i) => i).filter(i => lb.LOOP_BANK[i].category === 'chords');
  const n = indices.length;
  return indices[Math.max(0, Math.min(n - 1, Math.floor(this.getParamT(angle) * n)))];
}
```
`getName` returns the selected chord entry's name. Keep `id: 6`, `name: 'Chords'`, color,
`paramLabel: 'Loop'`. Update `moduleRegistry.test.js` (ID 6 is now a sampler; add chord-only
selection test mirroring the drummer test).

### 4. `src/services/audioEngine.js`
Remove the dead synth-chords path:
- `_chordProgs` import and the `CHORD_BASE_FREQ` constant (only used by the chords self-play).
- In `_onStep`: the `chords` branch of the gather loop; the `_xm_chordDeg` declaration; the
  Chords→Bass gravity in the bass block; the entire chords self-play block; the Chords→Melody
  snap in the lead block.
- **Incidental dead-code cleanup** (orphaned by the earlier drummer removal, in the same gather
  loop): `_xm_bassStepCount` (declared + set, no remaining consumer).
- The `chords` branch in `_addModule` and in `_updateModule`.
- `_modState.prevChordDeg` (already orphaned dead state from the drummer removal) + its stale
  comment; update the line-155 comment ("Bass + Chords pucks…" → "Bass + Lead pucks…").
- Keep live vars: `_xm_bassDeg`, `_xm_melodyDeg`, `_xm_melodyAscending`, `_modState.melodyHistory`.

### 5. `src/services/modulationMatrix.js`
Remove `chords` from `BAND_TYPES` and the 4 `chords:*` / `*:chords` entries from `VALID_PAIRS`
(leaving `bass:lead`, `lead:bass`). Update `modulationMatrix.test.js` to the 2-pair set.

### 6. `src/services/routingGraph.js`
Remove the redundant `m.def.type === 'chords'` clause from the generator filter (chords is now
matched by `'sampler'`).

### 7. `src/data/chordProgressions.js` + `src/tests/chordProgressions.test.js`
Delete. Remove `src/data/chordProgressions.js` from `index.html` and from `browserLoad.test.js`
SCRIPTS.

## Error handling / edge cases
- **No buffer (file:// or load failure):** existing sampler guard warns and skips; chords
  inherits it.
- **Tempo puck:** sets one global `Transport.bpm`; all loops (chords included) follow together.
- **No tempo puck:** everything at 128 default; chord loops play at `playbackRate` 1.0.

## Testing
- `loopBank.test.js`: 10 drum + 8 melody + 5 chord entries (23 total) with correct categories;
  every entry `bpm === 128`, `file` under `loops/_128/`.
- `moduleRegistry` test: ID 6 is a `sampler`; `getLoopIndex` returns only chord-category indices
  across the rotation arc; endpoints saturate.
- `modulationMatrix.test.js`: 2-pair set (bass/lead), no chords pairs.
- `chordProgressions.test.js`: delete.
- `browserLoad.test.js`: remove `src/data/chordProgressions.js` from SCRIPTS; suite stays green.
- Manual QA: serve over http, verify Chords puck plays + cycles all 5 loops, locked at 128 with
  the melody/drummer; audition `Short Synth` (95→128) etc. and drop any that smear.

## Out of scope
- Removing the now-vestigial modulation matrix / orphaned `lead` + `melodyLines` code (deferred).
- Pitch-shifting (loops are already D# Minor).
- Any change to the synthesized bass band (the last remaining synth band).
