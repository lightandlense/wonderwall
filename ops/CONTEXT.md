# ops/ — Context

Run, deploy, and machine-setup for Reactable Wall installs.

- `deploy/` — `launch.bat` (Chrome kiosk: `--kiosk --app=file:///.../index.html`,
  mirrors Gizmo Factory's launcher), machine setup notes for an install.
- `monitoring/` — health checks for unattended installs (camera connected, audio output
  alive, calibration valid). Phase 3+.
- `scripts/` — helper scripts (e.g., generate/print a puck marker set).

Install constraints live in `planning/specs/reactable-wall-design.md` §9 (matte surface,
camera 15–30° off projector axis, short-throw projector, controlled lighting).
