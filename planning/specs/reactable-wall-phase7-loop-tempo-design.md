# Reactable Wall — Phase 7 Design Spec: Loop Puck + Tempo Puck

**Date:** 2026-06-26
**Builds on:** Phase 6 (signal-shaped cables) — must be merged/committed on `master` first
**Status:** Approved (design, 2026-06-26)

---

## 1. Goal

Add two new pucks that turn the instrument from "synth patch" into "loop jam":

- **Loop puck (id 7)** — plays a pre-recorded audio loop, tempo-locked to the Transport. Rotation
  selects which loop from a curated bank. It behaves as a **generator** (like the Oscillator):
  always reaches the central master, and Filter/Delay/Volume + the Phase 6 waveform cables apply
  to it. Its cable shows the loop's **real sample waveform**.
- **Tempo puck (id 8)** — a global controller. Rotation sets `Tone.Transport.bpm`, so the Sequencer
  and all loops speed up / slow down together.

MVP scope: a **single** Loop puck (one loop at a time, no layering) and one Tempo puck. Categorized
/ layerable loop pucks are a future phase.

---

## 2. Assets & manifest

**Source (verified, commercial-safe):** `GareBear99/Free-Future-Bass-Producer-Kit` on GitHub.
24-bit `.wav` loops with the **BPM in each filename**, served from `raw.githubusercontent.com`
(branch `main`) with no auth. README license: *"Free to use in personal and commercial projects.
No credit required."* Not literally CC0, but explicitly royalty-free + commercial OK. There is no
`LICENSE` file in the repo, so we copy the README license text into
`assets/loops/LICENSE.md` as our record.

- **`scripts/fetch-loops.sh`** — a one-shot `curl` script that downloads a curated set into
  `assets/loops/` and writes `assets/loops/LICENSE.md`. Base URL:
  `https://raw.githubusercontent.com/GareBear99/Free-Future-Bass-Producer-Kit/main/FutureBassKit/loops/`.
  Curated set (tempo spread so the Tempo puck is meaningful):
  - `LoFi_HipHop_85bpm_01.wav` (85), `BoomBap_90bpm_01.wav` (90), `Afrobeats_100bpm_01.wav` (100),
    `House_124bpm_01.wav` (124), `Trap_140bpm_01.wav` (140), `FutureBass_150bpm_01.wav` (150).
  - The script verifies each file is non-empty after download and exits non-zero on any failure.
- **`src/data/loopBank.js`** — pure data, the single source of truth for the bank:
  ```js
  const LOOP_BANK = [
    { name: 'LoFi 85',     file: 'assets/loops/LoFi_HipHop_85bpm_01.wav',  bpm: 85,  category: 'drums' },
    { name: 'BoomBap 90',  file: 'assets/loops/BoomBap_90bpm_01.wav',      bpm: 90,  category: 'drums' },
    { name: 'Afro 100',    file: 'assets/loops/Afrobeats_100bpm_01.wav',   bpm: 100, category: 'drums' },
    { name: 'House 124',   file: 'assets/loops/House_124bpm_01.wav',       bpm: 124, category: 'drums' },
    { name: 'Trap 140',    file: 'assets/loops/Trap_140bpm_01.wav',        bpm: 140, category: 'drums' },
    { name: 'FutBass 150', file: 'assets/loops/FutureBass_150bpm_01.wav',  bpm: 150, category: 'synth' },
  ];
  ```
  Dual-export footer (`window.LOOP_BANK` + `module.exports`) like the other data modules.

**Note on tempo vs pitch:** loops play through `Tone.Player` with `playbackRate = curBpm/loopBpm`,
which shifts pitch with tempo. Acceptable for a tangible toy; pitch-preserving time-stretch
(GrainPlayer) is out of scope. The curated tempo spread (85–150) keeps every loop within a usable
rate range around the 70–160 BPM Tempo puck.

---

## 3. Module registry — `src/services/moduleRegistry.js`

Two new entries (both follow the existing `_arcT` rotation→param convention):

- **id 7 "Loop":** `type:'sampler'`, distinct `color` (proposed `#7CFFB2`, spring green — unused by
  other modules), `paramLabel:'Loop'`.
  - `getLoopIndex(angle)` → `Math.min(LOOP_BANK.length-1, Math.floor(_arcT(angle) * LOOP_BANK.length))`.
  - `getParamT(angle)` → `_arcT(angle)` (drives the ring arc + Phase 6 amplitude display).
- **id 8 "Tempo":** `type:'global'`, `subtype:'tempo'`, `color` (proposed `#ff7777`),
  `paramLabel:'BPM'`.
  - `getBpm(angle)` → `Math.round(70 + _arcT(angle) * (160 - 70))` (70–160 BPM).
  - `getParamT(angle)` → `_arcT(angle)`.

---

## 4. Audio engine — `src/services/audioEngine.js`

### 4.1 Buffer preload
- A module-level `const LOOP_BUFFERS = {}` (file → `Tone.ToneAudioBuffer`). A
  `preloadLoops()` async helper (called once from `initAudio`, awaited) loads every
  `LOOP_BANK[i].file` into `LOOP_BUFFERS` and precomputes its **peak envelope** (see §6
  `peakEnvelope`) into `LOOP_PEAKS[file]`. Failures are logged, not fatal (a missing buffer just
  means that loop is silent + flat-lined).

### 4.2 Loop puck lifecycle (`_addModule` / `_updateModule` / `_removeModule`)
- **Add** (`def.type === 'sampler'`): pick `idx = def.getLoopIndex(angle)`; create
  `node = new Tone.Player({ url: LOOP_BUFFERS[file], loop: true })`,
  `node.playbackRate = curBpm / LOOP_BANK[idx].bpm`, then `node.sync().start('@1m')` so it launches
  on the next bar locked to the Transport. Attach a `Tone.Meter({smoothing:0.8})` (Phase 6 pattern)
  and store `{ node, meter, loopIdx: idx, ... }`. Routing connects it to master (it is a generator,
  §5).
- **Update** (`def.type === 'sampler'`): recompute `idx`. If `idx !== m.loopIdx`, **swap on the next
  bar**: `Tone.Transport.scheduleOnce(() => { stop+dispose old node, create+sync+start new Player
  with the new buffer }, '@1m')` and set `m.loopIdx = idx`. Always refresh
  `m.node.playbackRate` from the current BPM (so it tracks tempo even without a swap).
- **Remove**: `m.meter.dispose()` (Phase 6) + `m.node.stop(); m.node.dispose()`.

### 4.3 Tempo puck (`_updateModule`, new `global/tempo` branch)
Mirror the existing Volume branch (`_updateModule:177`):
```js
} else if (m.def.type === 'global' && m.def.subtype === 'tempo') {
  const bpm = m.def.getBpm(angle);
  Tone.Transport.bpm.rampTo(bpm, 0.1);
  _applyLoopRates(bpm);   // recompute every active sampler's playbackRate
}
```
`_applyLoopRates(bpm)` iterates `activeModules`, and for each `type:'sampler'` with a live `node`
sets `node.playbackRate = bpm / LOOP_BANK[m.loopIdx].bpm`. The Sequencer's `Tone.Loop('16n')`
already follows `Transport.bpm` automatically. With no Tempo puck present, BPM stays at the
initAudio default (110).

### 4.4 Meter coverage
`getModuleLevel(id)` (Phase 6) already returns the metered level for any module with `m.meter`;
samplers now have one, so their rings pulse and their cables ride the level with no extra work.

---

## 5. Routing — `src/services/routingGraph.js`

Samplers are generators. In `buildRawPlan` (line 24) widen the generator filter:
```js
const gens = modules.filter(m => m.def.type === 'oscillator' || m.def.type === 'sampler');
```
Everything downstream (nearest-neighbor effect insertion, chain to `master`, edge `srcId/dstId`)
then works unchanged. Controllers are unaffected: Sequencer still targets oscillators only, LFO
still targets osc/effect (a loop is not a valid controller target this phase).

---

## 6. Visual — `src/components/visualEngine.js` + `src/utils/cableAnim.js`

### 6.1 Pure peak envelope (`cableAnim.peakEnvelope`)
`peakEnvelope(samples, n) -> number[]` — downsample a `Float32Array`-like channel into `n` peak
magnitudes in `[0,1]`: split into `n` equal buckets, each value = max `abs` in the bucket. Returns
`[]` for empty input or `n <= 0`. Pure, unit-tested.

### 6.2 Loop cable rendering
In `_drawEdges`, when the edge's **source type is `sampler`**, instead of a synth wave shape, render
the loop's precomputed peak envelope (`getLoopPeaks(srcId)` — a new read-only `window` getter
returning `LOOP_PEAKS[file]` for the active loop, or `[]`). The envelope is drawn as a perpendicular
waveform along the cable, **scrolled** by `flowSpeed` (audio kind, ridden by live level) and mirrored
(±) so it reads as an audio waveform. Reuse the existing gradient + additive bloom path. When peaks
are unavailable, fall back to the generic `saw` wave so the cable is never blank.

### 6.3 Ring
The Loop ring shows the selected loop **name** under the ring (reusing the param-label slot via
`def.paramLabel`/a name string) and the Phase 6 level pulse. The Tempo puck shows a **BPM HUD**
modeled on the Tonality HUD (`visualEngine` ~line 134): a small pill reading e.g. `TEMPO  124 BPM`.

---

## 7. Testing

- **Pure (`cableAnim` / registry / data):**
  - `peakEnvelope`: bucket count, range `[0,1]`, `[]` for empty/`n<=0`, picks the bucket max.
  - `moduleRegistry`: `getLoopIndex` maps arc extremes to `0` and `LOOP_BANK.length-1`; `getBpm`
    maps arc extremes to `70` and `160`.
  - `playbackRateFor(loopBpm, curBpm)` (a tiny pure helper in audioEngine or cableAnim): `curBpm/loopBpm`,
    guards `loopBpm>0`.
  - `loopBank`: every entry has `name/file/bpm`, `bpm>0`, file path under `assets/loops/`.
- **browserLoad:** extend the Tone stub with `Player` (sync/start/stop/dispose/`playbackRate`) and
  `ToneAudioBuffer`/`ToneAudioBuffers` + `Transport.scheduleOnce`/`bpm.rampTo`. Assert: a Loop puck
  (id 7) added over many frames reaches master (`__synthReachesDest`), `getModuleLevel(7)` is a
  number in `[0,1]`; a Tempo puck (id 8) added sets a BPM without throwing; both remove cleanly.
- **On-wall:** loop launches on the bar and stays locked to the Sequencer; rotating the Loop puck
  swaps loops on the next bar; the Tempo puck sweeps BPM and loops + sequencer follow together;
  effects + waveform cable apply to the loop.

---

## 8. Out of scope

- Categorized / layerable loop pucks (multiple simultaneous loops) — future phase.
- Crossfade between loops (this phase hard-swaps on the bar boundary).
- Pitch-preserving time-stretch (GrainPlayer); playbackRate pitch-shift is accepted.
- Exact playhead-aligned waveform (cable scroll is an approximation, not sample-accurate).
- LFO/Sequencer targeting a loop puck.
- Bundling the audio files into git history beyond what `fetch-loops.sh` pulls (loops live in
  `assets/loops/`, downloaded on setup; `.gitignore` decision made at implementation time).
