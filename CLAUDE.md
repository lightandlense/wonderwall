# CLAUDE.md — Reactable Wall

## Identity

You are helping **Russell (Parsimony Labs)** build **Reactable Wall** — a wall-mounted,
projection-mapped tangible music instrument. Physical pucks carrying fiducial (ArUco)
markers are tracked by a webcam; moving and **rotating** them controls a generative/
synth audio engine, and the system projects reactive visuals back onto the wall.

This is a **fork of the Gizmo Factory tracking spine** (ArUco + webcam→projector
homography + marker registry), with the Matter.js physics layer replaced by an audio
engine. If you know how Gizmo Factory works, you already know 80% of this project.

## Folder Structure

```
Reactable Wall/
├── CLAUDE.md            ← this file, read first
├── REFERENCES.md        ← background: repos, prior art, source code to mine
├── planning/
│   ├── CONTEXT.md       ← current project state
│   ├── specs/           ← design specs (start with reactable-wall-design.md)
│   ├── architecture/    ← system architecture & data flow
│   └── decisions/       ← decision log (ADRs)
├── src/
│   ├── CONTEXT.md
│   ├── components/      ← UI screens, canvas layers, visual modules
│   ├── services/        ← tracking, calibration, audio engine, patch graph
│   ├── utils/           ← math (homography, angle smoothing), helpers
│   └── tests/
├── docs/
│   ├── CONTEXT.md
│   ├── api/             ← module/param reference
│   ├── guides/          ← install + calibration guide
│   └── changelog/
└── ops/
    ├── CONTEXT.md
    ├── deploy/          ← kiosk launch, machine setup
    ├── monitoring/
    └── scripts/
```

## Rules

- Read this file first on every new task. Then read `planning/CONTEXT.md`.
- Reuse the Gizmo Factory codebase wherever possible — do **not** rewrite the
  homography solver, the ArUco detection loop, or the calibration flow. Port them.
- Ask before creating files outside `planning/` and `src/` while the project is
  still in spec/prototype stage.
- Keep the plain-HTML + vanilla-JS pattern from Gizmo Factory (no framework, no
  build step) for the prototype. Revisit only if the audio graph demands it.
- When unsure, ask. Flag any deviation from the spec in `planning/decisions/`.

## Approval Required

Ask before: deleting files, installing packages, buying hardware, or publishing
anything externally. Safe operations (reading, prototyping, testing) — just do it.
