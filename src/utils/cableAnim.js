// src/utils/cableAnim.js
// Pure helpers for cable flow animation. No DOM. Time-driven (performance.now()).
const cableAnim = {
  // Distances along a cable of `length` px where flowing dots should be drawn.
  flowDotDistances(length, spacing, speed, nowMs) {
    if (!(length > 0) || !(spacing > 0)) return [];
    const offset = ((nowMs / 1000) * speed) % spacing;
    const out = [];
    for (let d = offset; d < length; d += spacing) out.push(d);
    return out;
  },
  // Progress [0,1) of a one-shot pulse since lastHitMs, or null if outside the window.
  pulseProgress(lastHitMs, nowMs, durMs) {
    if (lastHitMs == null || !(durMs > 0)) return null;
    const p = (nowMs - lastHitMs) / durMs;
    return (p >= 0 && p < 1) ? p : null;
  },
};

if (typeof window !== 'undefined') window.cableAnim = cableAnim;
if (typeof module !== 'undefined') module.exports = cableAnim;
