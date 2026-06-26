# Current Project

**Reactable Wall** — a wall-mounted, projection-mapped tangible music instrument.
Physical pucks with ArUco markers are tracked by a webcam; their position, proximity,
and rotation drive a Web Audio (Tone.js) synth/sequencer, and the system projects
reactive visuals (connection lines, waveforms) back onto the wall. It is a fork of the
Gizmo Factory tracking/calibration/projection spine with the physics layer swapped for
audio.

**Status:** Spec done, decisions locked (ADR 0002), Phase 0+1 handed to Devon as a
time-boxed fun-check — `AgentTeam/shared/memory/task_devon_reactable_wall_prototype.md`.
Paper/taped markers only, Tone.js, no metal, no MRT2. Awaiting prototype video for the
go/no-go on Phase 2.

## What good looks like

- A taped-marker prototype where a person can: drop a puck (a module appears + makes
  sound), drag two pucks near each other (they audibly patch together), and **turn a
  puck to change a parameter** (pitch/cutoff/volume) with smooth, glitch-free audio.
- Tracking is robust to a hand briefly covering a marker mid-turn (value smoothing).
- Visuals projected back onto the wall align with the physical pucks (homography from
  the ported Gizmo Factory calibration).
- Code reuses Gizmo Factory's calibration + detection wholesale; only the audio engine,
  patch graph, and rotation→param mapping are new.

## Roadmap notes (future phases)

- **Phase 6 (spec'd, approved 2026-06-26):** signal-shaped cables + reactive rings — purely
  visual. See `planning/specs/reactable-wall-phase6-signal-cables-design.md`.
- **Phase 7 (idea, not yet spec'd):** **Sampler / Loop puck** — a new module type (id 7,
  `type: 'sampler'`) playing pre-recorded audio loops (drums/bass/textures) via a
  `Tone.Player` (`loop: true`) synced to the Transport. Rotation selects the loop from a
  small royalty-free, tempo-matched library (grouped by category). Routes to `master` like
  oscillators, so effects + Phase 6 waveform cables apply for free (it would show its real
  sample waveform). Main dependency: sourcing the loop assets. Build **after** Phase 6.

## What to avoid

- Rewriting the homography solver or ArUco loop — port them from Gizmo Factory.
- Jumping to the metal/magnetic build before the paper prototype validates the
  interaction. Hardware spend comes after the gesture feel is proven.
- Glossy surfaces (specular glare kills detection) — matte only.
- Audio glitches when markers are briefly occluded — always smooth/hold param values.
- Over-engineering: keep the plain-HTML, no-build-step pattern for the prototype.
