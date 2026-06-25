# src/ — Context

Source for the Reactable Wall single-page app. Plain HTML + vanilla JS, no framework,
no build step (mirrors Gizmo Factory). Entry point will be `index.html` at project root.

## Layout

- `components/` — UI screens (title/calibrate/play), canvas layers, `visualEngine.js`
  (connection lines, waveform rings, param HUD).
- `services/` — `tracking.js` (ArUco loop, ported), `calibration.js` (homography +
  auto-cal, ported as-is), `audioEngine.js` (Tone.js, NEW), `patchGraph.js`
  (proximity routing, NEW), `moduleRegistry.js` (marker ID → module, NEW).
- `utils/` — `homography.js` (math, ported), `angleSmoothing.js` (occlusion-tolerant
  rotation, NEW).
- `tests/` — detection/calibration sanity, patch-graph edge logic, angle smoothing.

## Rules of reuse

Port `calibration.js`, the ArUco loop, and the marker-print page from Gizmo Factory
unchanged. Do **not** rewrite the homography solver. New work lives in `audioEngine.js`,
`patchGraph.js`, `angleSmoothing.js`, and `visualEngine.js`. See
`planning/architecture/system-architecture.md` for component contracts.
