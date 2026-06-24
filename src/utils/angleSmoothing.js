// src/utils/angleSmoothing.js
// Per-marker angle smoother:
//   - EMA during continuous detection (snappy, jitter-rejected)
//   - Hold last good value when marker drops (up to ~1.5s)
//   - Slew interpolation on re-acquire so pitch doesn't jump

function createAngleSmoother() {
  const EMA_ALPHA   = 0.2;   // frame-to-frame smoothing weight
  const HOLD_FRAMES = 30;    // detection frames to hold before expiring (~1.5s at 20fps)
  const SLEW_MS     = 75;    // wall-clock ms to interpolate on re-acquire

  let value      = null;     // current smoothed angle [0, 2π)
  let missFrames = 0;        // detection frames since last real sighting

  // Slew state — active when re-acquiring after a dropout
  let slewFrom  = 0;
  let slewDelta = 0;
  let slewStart = 0;
  let slewActive = false;

  function wrap(a) {
    return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  }

  // Signed shortest-arc difference (b - a), result in (-π, π]
  function shortDiff(from, to) {
    let d = wrap(to) - wrap(from);
    if (d >  Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  return {
    // Called each detection frame when the marker IS visible.
    // now = performance.now() timestamp.
    update(rawAngle, now) {
      const a = wrap(rawAngle);

      if (value === null) {
        // First detection ever
        value = a;
        missFrames = 0;
        return;
      }

      if (missFrames > 0) {
        // Re-acquiring after a dropout — start a timed slew
        slewActive = true;
        slewFrom   = value;
        slewDelta  = shortDiff(value, a);
        slewStart  = now;
        missFrames = 0;
      }

      if (slewActive) {
        const t = Math.min(1, (now - slewStart) / SLEW_MS);
        value = wrap(slewFrom + slewDelta * t);
        if (t >= 1) slewActive = false;
      } else {
        // Steady-state: EMA using shortest-arc interpolation to avoid wrap artifacts
        value = wrap(value + EMA_ALPHA * shortDiff(value, a));
      }
    },

    // Called each detection frame when the marker is NOT visible.
    markMissed() {
      missFrames++;
    },

    // True once the hold window expires — caller should remove the module.
    isExpired() {
      return missFrames > HOLD_FRAMES;
    },

    // Current smoothed angle in [0, 2π). Holds last good value during dropout.
    get() {
      return value ?? 0;
    },
  };
}

window.createAngleSmoother = createAngleSmoother;
