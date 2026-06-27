// src/services/modulationMatrix.js
// Computes cross-modulation depths for the 12 band-puck-pair relationships.
// Pure — no Tone.js, no DOM. Call compute() each detection frame.

const MODULATION_THRESHOLD_FRAC = 0.32; // fraction of viewport width

const VALID_PAIRS = new Set([
  'drummer:bass',   'drummer:chords', 'drummer:lead',
  'bass:drummer',   'bass:chords',    'bass:lead',
  'chords:drummer', 'chords:bass',    'chords:lead',
  'lead:drummer',   'lead:bass',      'lead:chords',
]);

const BAND_TYPES = new Set(['drummer', 'bass', 'chords', 'lead']);

function _dist(a, b) {
  const dx = a.wx - b.wx, dy = a.wy - b.wy;
  return Math.sqrt(dx * dx + dy * dy);
}

// Returns Map<"srcType:dstType", {depth, srcType, dstType, srcPos, dstPos, srcColor, dstColor}>.
// depth [0,1]: 0 = at threshold edge, 1 = contact. Only entries within threshold are included.
function compute(modules, viewport) {
  const result = new Map();
  const threshold = viewport.w * MODULATION_THRESHOLD_FRAC;
  const relevant = modules.filter(m => m.def && BAND_TYPES.has(m.def.type));

  for (let i = 0; i < relevant.length; i++) {
    for (let j = 0; j < relevant.length; j++) {
      if (i === j) continue;
      const src = relevant[i], dst = relevant[j];
      const key = `${src.def.type}:${dst.def.type}`;
      if (!VALID_PAIRS.has(key)) continue;
      if (result.has(key)) continue; // one entry per pair (only one drummer, etc.)

      const dist = _dist(src, dst);
      if (dist >= threshold) continue;

      result.set(key, {
        depth: 1 - dist / threshold,
        srcType: src.def.type,
        dstType: dst.def.type,
        srcPos: { wx: src.wx, wy: src.wy },
        dstPos: { wx: dst.wx, wy: dst.wy },
        srcColor: src.def.color || '#ffffff',
        dstColor: dst.def.color || '#ffffff',
      });
    }
  }
  return result;
}

// Returns edge objects for the visual engine's modulation cable renderer.
function getEdges(modulations) {
  const edges = [];
  modulations.forEach((mod) => {
    edges.push({
      fromPos: { x: mod.srcPos.wx, y: mod.srcPos.wy },
      toPos:   { x: mod.dstPos.wx, y: mod.dstPos.wy },
      kind:    'modulation',
      depth:   mod.depth,
      srcType: mod.srcType,
      dstType: mod.dstType,
      srcColor: mod.srcColor,
      dstColor: mod.dstColor,
    });
  });
  return edges;
}

const modulationMatrix = { compute, getEdges, VALID_PAIRS, MODULATION_THRESHOLD_FRAC };
if (typeof window !== 'undefined') window.modulationMatrix = modulationMatrix;
if (typeof module !== 'undefined') module.exports = modulationMatrix;
