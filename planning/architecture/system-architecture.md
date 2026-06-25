# System Architecture — Reactable Wall

See `planning/specs/reactable-wall-design.md` for the full spec. This doc is the
condensed architectural view and component contract.

## Pipeline (decoupled, ported from Gizmo Factory)

```
webcam ─► ArUco detect ─► homography ─► {id,x,y,angle} ─► patchGraph ─► audioEngine
 (ported)   (ported)        (ported)      (per frame)       (NEW)         (NEW)
                                                  └────────────────────► visualEngine ─► projector
                                                                            (NEW)
```

## Component contracts

| Component | Input | Output | Origin |
|-----------|-------|--------|--------|
| `tracking` | webcam frame | raw markers `{id, corners}` | port |
| `calibration` | corner markers | homography matrix | port (as-is) |
| `homography apply` | raw markers + matrix | world `{id, x, y, angle}` | port |
| `angleSmoothing` | per-id angle stream | de-glitched angle (holds on dropout) | NEW |
| `patchGraph` | world markers | debounced edge list `[{from, to}]` | NEW |
| `moduleRegistry` | marker id | module definition (type, param range) | NEW (mirror PROP_REGISTRY) |
| `audioEngine` | modules + edges + params | live Tone.js graph | NEW |
| `visualEngine` | modules + edges + params | canvas frame → projector | NEW |

## Reuse boundary (do not rewrite)

- Homography solver (`calibration.js`) — Gaussian elimination, proven.
- Projector-beamed auto-calibration sequence (corner ArUco IDs 20–23).
- ArUco detection loop cadence (every 3rd rAF ≈ 20fps).
- Marker print page + dictionary (`aruco-4x4-dict.js`).

## New surface area (where the work is)

1. `audioEngine.js` — Tone.js module lifecycle + routing.
2. `patchGraph.js` — proximity → debounced edges, cycle-breaking.
3. `angleSmoothing.js` — occlusion-tolerant rotation.
4. `visualEngine.js` — Reactable visual vocabulary.

## Performance budget

- Detection throttled to ~20fps; audio scheduling on the Web Audio clock (independent).
- Patch-graph recompute is O(n²) over active pucks — trivial for n < ~20.
- Visual redraw every rAF; keep draw calls cheap (no per-frame allocation).
