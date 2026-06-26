# src/ — Context

Source for the Reactable Wall single-page app. Plain HTML + vanilla JS, no framework,
no build step (mirrors Gizmo Factory). Entry point will be `index.html` at project root.

## Layout

- `components/` — UI screens (title/calibrate/play), canvas layers, `visualEngine.js`
  (connection lines, waveform rings, param HUD).
- `services/` — `tracking.js` (ArUco loop, ported), `calibration.js` (homography +
  auto-cal, ported as-is), `audioEngine.js` (Tone.js, NEW), `routingGraph.js`
  (on-the-cable signal-chain planner, NEW — replaced patchGraph), `moduleRegistry.js`
  (marker ID → module, NEW).
- `utils/` — `homography.js` (math, ported), `angleSmoothing.js` (occlusion-tolerant
  rotation, NEW), `tonality.js` (scale quantization, NEW).
- `tests/` — tonality, module registry, routingGraph plan logic, and a shared-scope
  browser-load test (Node `--test`).

## Rules of reuse

Port `calibration.js`, the ArUco loop, and the marker-print page from Gizmo Factory
unchanged. Do **not** rewrite the homography solver. New work lives in `audioEngine.js`,
`routingGraph.js`, `angleSmoothing.js`, and `visualEngine.js`. See
`planning/architecture/system-architecture.md` for component contracts.
