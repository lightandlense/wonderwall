# Reactable Wall — Phase 8 Design Spec: Bass + Chords Pucks (Band-in-a-Box)

**Date:** 2026-06-26
**Builds on:** Drummer puck (id 7) — must be committed on `master` first
**Status:** Approved (design, 2026-06-26)

---

## 1. Goal

Turn the instrument into a **band-in-a-box** of self-playing preset generators. Following the
Drummer's winning model — *rotate to pick a finished part, it plays in time and in key* — replace the
two hardest-to-play pucks with curated, self-playing voices:

- **id 0: Oscillator → Bass** — rotation picks a bassline; notes come from the key.
- **id 6: Sequencer → Chords/Pad** — rotation picks a chord progression; voiced in the key.

Both read the **Tonality** puck for their key (so rotating Tonality transposes the whole band) and
ride the **Tempo**/Transport clock. With the existing Drummer, this gives **drums + bass + chords**
as a playable core, all preset-driven.

The Oscillator and Sequencer **audio code is left dormant** (no puck declares those types anymore),
so nothing breaks; pruning it is out of scope for this phase.

---

## 2. Module registry — `src/services/moduleRegistry.js`

Replace the id 0 and id 6 entries (keep the `_arcT` rotation convention):

- **id 0 "Bass":** `type:'bass'`, `color:'#4d7cff'`, `paramLabel:'Line'`.
  - `getLineIndex(angle)` → index into `bassLines.BASS_LINES` via `_arcT` (clamped).
  - `getName(angle)` → the selected line's `name`.
- **id 6 "Chords":** `type:'chords'`, `color:'#c9a7ff'`, `paramLabel:'Chords'`.
  - `getProgIndex(angle)` → index into `chordProgressions.CHORD_PROGRESSIONS` via `_arcT` (clamped).
  - `getName(angle)` → the selected progression's `name`.

Both use the inline-`require` pattern (require the data module *inside* the methods, like the Drummer's
`getGrooveIndex`) so no top-level `const` collides in the shared browser scope.

---

## 3. Data modules (pure, dual-export footer)

Degrees are indices into the current scale (minor pentatonic `[0,3,5,7,10]`); `scaleDegreeFreq`
handles octave wrap, so degree `5` = the root one octave up.

### 3.1 `src/data/bassLines.js`
`BASS_LINES`: ~8 lines, each `{ name, steps }` where `steps` is a 16-element array of a **scale
degree** (`0`..`~7`) or `null` (rest). Examples:
- *Root Pulse* — root on each beat: `[0,null,null,null, 0,null,null,null, 0,null,null,null, 0,null,null,null]`
- *Driving 8ths* — root every 8th · *Octave Bounce* — root↔degree 5 · *Walking* — `0,1,2,3…`
- *Funk* — syncopated roots + fifths (degree 2) · *Offbeat* — roots on the "and"s · *Sub Hold* —
  long roots (root at step 0 and 8 only) · *Riff* — a short pentatonic hook.

### 3.2 `src/data/chordProgressions.js`
`CHORD_PROGRESSIONS`: ~6 progressions, each `{ name, steps }` where `steps` is a 16-element array of a
**root scale-degree** (the chord's root) or `null` (= hold the previous chord). A chord is built by
stacking degrees `[d, d+2, d+4]`. Example (one chord per beat):
`[0,null,null,null, 3,null,null,null, 4,null,null,null, 3,null,null,null]`. Names like *Pop (i–VI–VII–VI)*,
*Sustained*, *Minor Walk*, *Two-Chord*, *Climb*, *Drone*.

---

## 4. Audio — `src/services/audioEngine.js`

**Constants:** `BASS_BASE_FREQ ≈ 65.41` (C2), `CHORD_BASE_FREQ ≈ 261.63` (C4), `DEFAULT_ROOT = 0` (C).
Root each step = `(_tonality && _tonality.active) ? _tonality.root : DEFAULT_ROOT`.

**Voice creation (`_addModule`):**
- **bass:** `node = new Tone.MonoSynth({ oscillator:{type:'sawtooth'}, filter:{type:'lowpass', Q:2},
  envelope:{attack:0.01, decay:0.2, sustain:0.4, release:0.2},
  filterEnvelope:{attack:0.01, decay:0.2, sustain:0.3, release:0.2, baseFrequency:80, octaves:2.6},
  volume:-10 })` — monophonic, one bass note at a time.
- **chords:** `node = new Tone.PolySynth(Tone.Synth, { oscillator:{type:'triangle'},
  envelope:{attack:0.3, decay:0.2, sustain:0.7, release:0.8}, volume:-16 })` — a soft sustained pad.
- Both attach a `Tone.Meter({smoothing:0.8})` (ring pulse + cable react) and store the selected
  preset index. **Unify the preset index field as `presetIdx`** — refactor the Drummer's `grooveIdx`
  to `presetIdx` so Drummer/Bass/Chords share one field (`loopIdx` stays for the dormant sampler).

**Playback (`_onStep`, after the Drummer block):**
- **bass:** for each active `bass` module, read `line.steps[_step]`; if non-null, trigger
  `m.node.triggerAttackRelease(scaleDegreeFreq(BASS_BASE_FREQ, root, deg), '8n', time)`.
- **chords:** for each active `chords` module, read `prog.steps[_step]`; if non-null, build
  `[d,d+2,d+4]` → 3 freqs via `scaleDegreeFreq(CHORD_BASE_FREQ, root, x)` and trigger
  `m.node.triggerAttackRelease(freqs, '2n', time)` (held pad; `null` steps hold the prior chord).

**Selection (`_updateModule`):** `bass`/`chords` branches set `m.presetIdx = def.getLineIndex/getProgIndex(angle)`.
**Removal (`_removeModule`):** dispose the synth + meter (the generic `else if (m.node)` path already
stops/disposes; PolySynth/MonoSynth both support `dispose()`).

---

## 5. Routing & visual

- **Routing (`routingGraph.js`):** add `'bass'` and `'chords'` to the generator filter (alongside
  `oscillator`/`sampler`/`drummer`), so both reach `master` and **effects insert on their chains**
  (filter/delay on bass or pad). They are **not** controller targets.
- **Visual (`visualEngine.js`):** the "name under the ring" branch already special-cases `sampler`/
  `drummer`; add `bass`/`chords` so the ring shows the line/progression **name**. Level pulse +
  generator waveform cable apply unchanged. New markers **id 0 and id 6** keep their physical
  markers; `print.html` labels update (Oscillator→Bass, Sequencer→Chords).

---

## 6. Testing

- **Pure:** `bassLines` / `chordProgressions` data shapes (16 steps; degree-or-null); registry
  `getLineIndex` / `getProgIndex` arc→index extremes (0 and n−1).
- **browserLoad:** extend the Tone stub with `MonoSynth` and `PolySynth` (each a Node with
  `triggerAttackRelease`; pushed to `synths` so reach-the-speaker holds). Assert: a Bass (id 0) and a
  Chords (id 6) puck each reach `master`, rotate to a new preset without throwing, and run clean with
  Tonality present **and** absent; `getModuleLevel` returns a number for both.
- **On-wall:** drums + bass + chords groove together in one key; rotating Tonality transposes all of
  them; Tempo speeds the whole band; a Filter/Delay near the bass or pad shapes it.

---

## 7. Out of scope

- The Lead/Melody puck (the next bandmate that the parked Sequencer concept would become).
- Pruning the now-dormant Oscillator/Sequencer audio code.
- Polyphonic bass, chord inversions / voice-leading, per-note glides.
- LFO modulation of the Bass/Chords (LFO still targets effects only this phase).
- Scales beyond the existing minor-pentatonic (chords are stacked scale degrees, not functional harmony).
