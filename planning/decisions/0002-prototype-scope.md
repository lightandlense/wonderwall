# ADR 0002 — Prototype scope locked

**Date:** 2026-06-24
**Status:** Accepted

## Context

Before committing Devon to a build, Russell wanted the open questions resolved so the
prototype isn't written twice. The goal is a cheap fun-check, not a product commitment.

## Decision

- **Audio engine:** Tone.js (browser, matches the no-build Gizmo Factory pattern).
- **Orphan modules:** silent until patched — connection is the act that makes sound.
- **Puck count:** test with 3 pucks; design the module registry and detection tuning to
  handle 6–8 simultaneously.
- **Surface / projector:** reuse Gizmo Factory's existing rig and play-surface footprint
  (~4×6 ft per the calibration doc). No new hardware.
- **Scope:** Phase 0 + Phase 1 only. No metal/magnetic build (Phase 3), no Magenta MRT2
  (Phase 4) until the paper prototype proves it's fun.

## Consequences

- Devon's first task is tightly bounded: port the spine, get one puck turning pitch
  cleanly, then patch graph + a few modules — all on taped paper markers.
- Hardware spend and the generative-AI layer are gated behind a playtest, not assumed.
- Re-evaluate after Russell sees a video of the prototype.
