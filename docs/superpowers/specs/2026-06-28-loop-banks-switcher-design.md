# Loop Banks + Switcher Puck — Design Spec

**Date:** 2026-06-28
**Status:** Approved (pending written-spec review)

## Overview

Today every loop puck (Drummer, Chords, Melody, Bass) picks from a flat pool keyed
only by `category`. We are adding the concept of a **loop bank (group)** so the same
four pucks can switch between two curated sets of loops — **OG** and **Futurebass** —
via a single global **Loop Bank** switcher puck.

Approach (the "sticker + one switch" model): tag every loop with a `group` label
alongside its `category`, keep one flat `LOOP_BANK`, and have a global `activeGroup`
flag that the sampler pucks read when choosing a loop. The switcher puck sets
`activeGroup`; flipping it instantly re-points all four sampler pucks to the other
bank, phase-locked, through the existing per-frame loop-swap path.

This also fixes a regression: the baked OG loops were moved on disk into
`loops/_128/OG Loops/…`, so the current `loops/_128/<cat>/…` paths in `loopBank.js`
are broken (404 at runtime). Repointing them is part of this work.

## Goals

- Add a `group` dimension to the loop bank without restructuring the sampler pucks.
- New global **Loop Bank** puck (marker **ID 12**) selects the active group by rotation.
- Convert the 29 Futurebass source loops to 128 BPM + D# minor (best-effort).
- Repair the OG loop paths to `loops/_128/OG Loops/…`.
- Surface the active bank in the HUD.

## Non-Goals / Out of Scope

- The 4 loose unsorted `.wav` files at `loops/` root (not part of either bank).
- Curating/trimming Futurebass — we keep all 29 (best-effort policy).
- More than two groups (the data model supports N groups via a `GROUPS` array, but
  only OG + Futurebass exist now).
- Removing the now-latent Tonality code (separate concern, untouched).

## Data Model (`src/data/loopBank.js`)

Each `LOOP_BANK` entry gains a `group` field next to `category`:

```js
{ name: 'Phrog', file: 'loops/_128/OG Loops/Chords/….wav', bpm: 128, category: 'chords', group: 'og' }
```

New module-level state and helpers (single source of truth):

```js
const GROUPS = ['og', 'futurebass'];
const GROUP_LABELS = { og: 'OG', futurebass: 'Futurebass' };
// mutable active selection, default OG
const loopBank = { LOOP_BANK, GROUPS, GROUP_LABELS, activeGroup: 'og', setActiveGroup, playbackRateFor };
function setActiveGroup(g) { if (GROUPS.includes(g)) loopBank.activeGroup = g; }
```

- All 34 existing entries → `group: 'og'`, with `file` paths fixed from
  `loops/_128/<cat>/…` to `loops/_128/OG Loops/<cat>/…`.
- 29 new Futurebass entries → `group: 'futurebass'`, paths
  `loops/_128/Futurebass/<Cat>/…`.

**Counts (total 63):**

| group       | drums | bass | chords | melody |
|-------------|-------|------|--------|--------|
| og          | 10    | 8    | 8      | 8      |
| futurebass  | 8     | 4    | 9      | 8      |

## Sampler Pucks (`src/services/moduleRegistry.js`)

The four sampler pucks (Drummer id 4, Chords id 6, Melody id 7, Bass id 16) change
their selection rule from *"match my category"* to *"match my category **and** the
active group"*:

```js
const indices = lb.LOOP_BANK
  .map((e, i) => i)
  .filter(i => lb.LOOP_BANK[i].category === '<cat>' && lb.LOOP_BANK[i].group === lb.activeGroup);
```

`getName` follows the same filter. Guard: if a (group, category) pair is empty,
`getLoopIndex` returns `-1` and the sampler renders no loop (all current pairs are
non-empty, min 4).

## Loop Bank Switcher Puck — ID 12 (`moduleRegistry.js`)

A global puck like Tempo. Makes no sound; sets the active group.

```js
12: {
  id: 12, name: 'Loop Bank', type: 'global', subtype: 'loopgroup',
  color: '#aa88ff', paramLabel: 'Bank',
  getParamT(angle) { return _arcT(angle); },
  getGroup(angle) {
    const lb = …loopBank;
    const n = lb.GROUPS.length;
    return lb.GROUPS[Math.max(0, Math.min(n - 1, Math.floor(_arcT(angle) * n)))];
  },
  getName(angle) {
    const lb = …loopBank;
    return lb.GROUP_LABELS[this.getGroup(angle)] || this.getGroup(angle);
  },
}
```

Rotation splits the ±45° tracking arc across `GROUPS`: lower half → `og`,
upper half → `futurebass`. ID 12 is free in the registry and is not a reserved
calibration ID (10, 11, 13, 18). ArUco DICT_4X4_50 includes marker 12.

## Audio Wiring (`src/services/audioEngine.js`)

`_updateModule` gains one branch (runs each detection frame, idempotent):

```js
} else if (m.def.type === 'global' && m.def.subtype === 'loopgroup') {
  _loopBank.setActiveGroup(m.def.getGroup(angle));
}
```

`_addModule`'s existing `global` branch already creates no node for it. When
`activeGroup` changes, each sampler's next-frame `_updateModule` recomputes
`getLoopIndex` (now a different group), sees the index changed, and fires the
existing `_swapLoop` — phase-locked. `preloadLoops` already iterates the whole
`LOOP_BANK`, so all 63 buffers (both banks) load up front. Acceptable ~1-frame lag
between flipping the switch and the samplers swapping.

## Conversion (`scripts/convert-loops-128.mjs`)

Restructure source→output as explicit group mappings:

- OG: `loops/bass|Chords|drummer|Melody` → `loops/_128/OG Loops/<same>`
- Futurebass: `loops/Futurebass/Bass|Chords|Drums|Melody` → `loops/_128/Futurebass/<same>`

OG outputs already exist on disk, so `skip-if-exists` means the run only bakes the
29 Futurebass loops. Parsing upgrades for the messier Futurebass filenames:

**BPM** (first match wins, else default + warn):
1. `(\d{2,3})\s*bpm`
2. `(\d{2,3})\s+(?:key|[a-g][#bs]?\s*m(?:in|aj)?\b|[a-g]m\b|unknown|unkown|bm\b)`
   (a number space-joined to a key/“key”/“unknown” word — avoids matching the
   hyphen-joined looperman id digits, which have no spaces)
3. else `128` BPM (no time-stretch) + logged warning

**Key** (→ pitch ratio to D# root; best-effort):
- If the key region contains `unknown`/`unkown` → no shift (null).
- Else find a note token after the BPM marker or after a literal `Key `:
  `(?:key\s+)?([a-g])\s*([#bs]|b)?\s*(maj|min|m)?` — handles `D# Min`, `F Min`,
  `C# Min`, `A#min` (no space), `A#`, `Bm`, `F Maj`, `Key D`, `Key F`.
- `s` and `#` both mean sharp; quality (maj/min) is ignored — we always pitch the
  **root** to D# (drums are keyless and skip pitch entirely).

Expected Futurebass results (pitch shown as semitone move to D#):

- **Bass (4):** Arp 4 (150, F Min → −2), Chord 1 (140, C# Min → +2),
  Chord 4 (150, F Min → −2), Titan Drop 10 (140, F Min → −2).
- **Chords (9):** Arp 12 (140, F# Min → −3), Arp 3 (150, D Min → +1),
  Scarlet Piano 19 (150, C# Min → +2), Scarlet String 14 (140, D Min → +1),
  Soft Chord 47 (100, A#min → +5), Strangers 11 (110, G# Min → −5),
  Titan Chord 50 (150, G Min → −4), kawaii chord-stack (160, A# → +5),
  kawaii retro (150, Key D → +1).
- **Drums (8, keyless):** 140, 160, 110 (`fb-drums-110 Bm` via fallback #2),
  150, 150, 150 (`…loop-150 unknown` via fallback #2), `kawaii-bass-drums`
  (no BPM → 128 default + warn), 130.
- **Melody (8):** Heater 29 (150, A Min → +6), Moonlight Guitar 3 (100, F Maj → −2),
  Moonlight String 18 (140, G# Min → −5), Prometheus Arp 20 (140, E Min → −1),
  Prometheus Arp 30 (150, D Min → +1), Prometheus Arp 40 (160, D# Min → 0),
  Soft Chord 48 (115, A#min → +5), Titan Chord 11 (100, A Min → +6). At a ±6
  tritone the move is taken upward (+6) by convention.

The run prints a per-file summary; I'll report the final table.

## Visuals (`src/components/visualEngine.js`)

- A small **BANK: OG / BANK: Futurebass** HUD pill (styled like the tonality pill),
  shown when a Loop Bank puck is active, reading the switcher's `getName(angle)`.
- The switcher puck's below-label shows the group name (via `getName`) rather than a
  percentage.

## Testing

- `loopBank.test.js`: every entry has `group ∈ GROUPS` and `category ∈ {drums,
  melody, chords, bass}`; per-(group,category) counts match the table; `activeGroup`
  defaults to `'og'`; `setActiveGroup('futurebass')` works; `setActiveGroup('bogus')`
  is ignored; all `file` paths start with `loops/_128/`.
- `moduleRegistry.test.js`: `MODULE_REGISTRY[12]` is `global`/`loopgroup`; `getGroup`
  maps low arc → `'og'`, high arc → `'futurebass'`; with `activeGroup` set, each
  sampler's `getLoopIndex` returns only entries of that group+category (restore after);
  calibration IDs still absent.
- `browserLoad.test.js`: VM load of all scripts stays green; add a frame-loop
  scenario including marker 12 to confirm no throw and that the group swap path runs.

## File-by-File Change List

1. `loops/_128/Futurebass/{Bass,Chords,Drums,Melody}/*.wav` — new baked assets (script output).
2. `scripts/convert-loops-128.mjs` — group source→output map; improved BPM/key parsing with best-effort fallbacks.
3. `src/data/loopBank.js` — add `group` to all entries; fix OG paths to `OG Loops`; add 29 Futurebass entries; add `GROUPS`/`GROUP_LABELS`/`activeGroup`/`setActiveGroup`.
4. `src/services/moduleRegistry.js` — new ID 12 Loop Bank puck; samplers (4, 6, 7, 16) filter by `activeGroup`.
5. `src/services/audioEngine.js` — `_updateModule` `loopgroup` branch sets active group.
6. `src/components/visualEngine.js` — BANK HUD pill + switcher puck label.
7. `src/tests/{loopBank,moduleRegistry,browserLoad}.test.js` — updated/added coverage.

## Edge Cases

- Switching banks when the new (group, category) pool has a different count:
  `getLoopIndex` clamps to `[0, n-1]`, so the rotation still maps cleanly.
- Empty (group, category) pool: `getLoopIndex` returns `-1`; sampler renders nothing
  (does not occur with current data; guard present for safety).
- Switcher absent: `activeGroup` keeps its last value; initial default is `og`.
- Per-frame ordering: if the switcher is processed after a sampler in the same frame,
  the swap lands one frame later — imperceptible.
