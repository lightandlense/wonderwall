# ADR 0001 — Fork the Gizmo Factory spine instead of building fresh

**Date:** 2026-06-24
**Status:** Accepted

## Context

Reactable Wall needs: fiducial tracking, webcam→projector calibration, projection of
reactive visuals, and a marker-ID→behavior registry. Gizmo Factory already ships all of
these, battle-tested (including projector-beamed auto-calibration built in
ball-fall-editor). The original Reactable stack (reacTIVision + TUIO) is an alternative
but would be net-new integration on this machine.

## Decision

Fork the Gizmo Factory tracking/calibration/projection spine. Keep its plain-HTML,
no-build-step, vanilla-JS pattern. Replace the Matter.js physics layer with a Web Audio
(Tone.js) engine, and add two new subsystems: a **patch graph** (proximity → routing)
and **rotation→parameter** mapping with occlusion-tolerant angle smoothing.

## Consequences

- Fastest path to a working prototype; ~80% of plumbing is reuse.
- Rotation tracking comes for free — ArUco already returns marker angle, which is the
  primary Reactable gesture.
- Constraint inherited: surfaces must be matte (specular glare breaks detection +
  projection). Documented for the Phase 3 metal build.
- We deliberately defer reacTIVision/TUIO and Magenta MRT2; MRT2 becomes an optional
  Phase 4 generative layer (Apple Silicon + OSC bridge).

## Alternatives considered

- **reacTIVision + TUIO (original Reactable stack):** authentic, but net-new integration
  and a separate runtime. Rejected for the prototype; could revisit if scaling.
- **MediaPipe hands-as-objects (arpeggiator pattern):** no physical pucks, no rotation
  tactility. Good fallback/demo, but loses the tangible Reactable feel. Kept as a
  reference for the audio/visual layer only.
