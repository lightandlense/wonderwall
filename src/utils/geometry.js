// src/utils/geometry.js
// Pure 2D geometry helpers. No DOM, no Tone — safe to unit-test in Node.

const geometry = {
  // Distance from point P to segment A->B, plus the clamped projection
  // parameter t in [0,1] (0 = at A, 1 = at B).
  pointToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) {
      const ddx = px - ax;
      const ddy = py - ay;
      return { dist: Math.sqrt(ddx * ddx + ddy * ddy), t: 0 };
    }

    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));

    const projX = ax + t * dx;
    const projY = ay + t * dy;
    const ex = px - projX;
    const ey = py - projY;

    return { dist: Math.sqrt(ex * ex + ey * ey), t };
  },
};

if (typeof window !== 'undefined') window.geometry = geometry;
if (typeof module !== 'undefined') module.exports = geometry;
