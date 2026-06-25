# References

Background material the project draws on. Do not act on these directly — they are
context for design and porting decisions.

## Internal — the spine we fork from (Gizmo Factory)

- **Gizmo Factory** — `E:\Antigravity\Projects\Gizmo Factory\src\` — the original
  ArUco + Matter.js + projector app. Mine these:
  - `src/calibration.js` — 4-point perspective homography (Gaussian elimination),
    manual 8-click flow + projector-beamed auto-calibration. **Reuse as-is.**
  - `src/mechanics.js` — `PROP_REGISTRY` (marker ID → behavior). The pattern we
    copy for ID → audio module.
  - ArUco detection loop — `js-aruco2`, dictionary `ARUCO_MIP_36h12` (IDs 0–999),
    runs ~20fps (every 3rd rAF frame). `cv.js` loads before `aruco.js`.
  - `print.html` / `marker-gen.html` + `aruco-4x4-dict.js` — marker printing.
- **ball-fall-editor** — `E:\Antigravity\Projects\ball-fall-editor\`
  (`github.com/lightandlense/ball-fall-editor`) — where the auto-calibration work
  was built. Calibration task spec:
  `AgentTeam/shared/memory/task_devon_gizmo_factory_qr_calibration.md`.
- **Gizmo Factory Game design spec** —
  `AgentTeam/docs/superpowers/specs/2026-06-05-gizmo-factory-game-design.md` — the
  single-page-app + kiosk-launch pattern we mirror.

## External — prior art & libraries

- **Reactable / reacTIVision** — the original tangible tabletop synth.
  `github.com/mkalten/reacTIVision` · `en.wikipedia.org/wiki/Reactable`.
  Architecture spine: tracking → TUIO/OSC → sound + visuals → projection.
- **Spyractable** — academic Reactable clone (reacTIVision + projector + IR-lit
  surface). Hardware reference: `link.springer.com/chapter/10.1007/978-3-319-07230-2_57`.
- **collidingScopes/arpeggiator** (MIT) — modern browser stack: MediaPipe hand
  tracking + **Tone.js** audio + Three.js visuals. Clean module split
  (`MusicManager.js`, `DrumManager.js`, `WaveformVisualizer.js`). Best reference
  for the audio + visual layer. `github.com/collidingScopes/arpeggiator`.
- **Tone.js** — `tonejs.github.io` — Web Audio synthesis framework. Primary audio
  engine for the prototype.
- **Magenta RealTime 2 (MRT2)** (Apache-2.0) — Google's real-time generative music
  model; Python (JAX/MLX) + C++, runs on Apple Silicon; explicitly supports camera
  steering through latent space. The "AI jam" upgrade for a later phase.
  `github.com/magenta/magenta-realtime` · `magenta.withgoogle.com/mrt2`.
- **Projection mapping (warp/keystone only):** MapMap / HeavyM (free), Splash
  (open source), ofxPiMapper (Raspberry Pi). We render visuals in-app; mapping
  software only corrects geometry.

## Hardware notes (for the metal endgame)

- ArUco markers natively expose **position AND rotation angle** — rotation is the
  core Reactable gesture, and the detector already returns it.
- Bare steel is specular → blows out ArUco detection and projection. Use a **matte**
  magnetic surface (powder-coated steel, matte magnetic primer, or matte vinyl over
  steel). Angle camera 15–30° off projector axis to dodge the hotspot.
- Pucks: neodymium magnet base + matte-printed ArUco face. Magnet holds position,
  hand rotates freely.
- Front projection: use a short-throw projector mounted above to minimize body shadow.
