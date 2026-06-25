// src/services/patchGraph.js
// Proximity-based patch graph: connects oscillator modules to output modules
// when placed close enough on the wall.

// Connection radius as a fraction of screen width — scales with display size.
const PATCH_RADIUS_FRAC = 0.35;

function _patchRadius()   { return window.innerWidth * PATCH_RADIUS_FRAC; }
function _approachRadius(){ return window.innerWidth * PATCH_RADIUS_FRAC * 1.5; }

// _patches[oscId] = outputId | null
const _patches = {};

// Call each detection frame with the current active module snapshot.
// Calls rerouteOscillator() whenever a patch is gained or lost.
function reconcilePatches(activeModules) {
  const oscs   = activeModules.filter(m => m.def.type === 'oscillator');
  const outputs = activeModules.filter(m => m.def.type === 'output');
  const oscIds  = new Set(oscs.map(o => o.id));

  // Remove patches for oscillators that are no longer active.
  Object.keys(_patches).forEach(oscIdStr => {
    const oscId = Number(oscIdStr);
    if (!oscIds.has(oscId)) {
      if (_patches[oscId] !== null) rerouteOscillator(oscId, null);
      delete _patches[oscId];
    }
  });

  // Update patches for active oscillators.
  oscs.forEach(osc => {
    // Find the nearest output within PATCH_RADIUS.
    let nearest     = null;
    let nearestDist = Infinity;
    outputs.forEach(out => {
      const dx   = osc.wx - out.wx;
      const dy   = osc.wy - out.wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < _patchRadius() && dist < nearestDist) {
        nearest     = out;
        nearestDist = dist;
      }
    });

    const prevOutputId = Object.prototype.hasOwnProperty.call(_patches, osc.id)
      ? _patches[osc.id]
      : undefined;
    const newOutputId = nearest ? nearest.id : null;

    if (prevOutputId !== newOutputId) {
      if (prevOutputId != null) rerouteOscillator(osc.id, null);
      if (newOutputId  != null) rerouteOscillator(osc.id, newOutputId);
      _patches[osc.id] = newOutputId;
    }
  });
}

// Returns visual edge descriptors for rendering.
// Each edge has: fromId, toId, fromPos, toPos, connected (bool), alpha (0-1).
function getPatchEdges(activeModules) {
  const oscs    = activeModules.filter(m => m.def.type === 'oscillator');
  const outputs = activeModules.filter(m => m.def.type === 'output');
  const edges   = [];

  oscs.forEach(osc => {
    outputs.forEach(out => {
      const dx   = osc.wx - out.wx;
      const dy   = osc.wy - out.wy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const pr = _patchRadius();
      const ar = _approachRadius();
      if (dist < pr) {
        edges.push({
          fromId:    osc.id,
          toId:      out.id,
          fromPos:   { x: osc.wx, y: osc.wy },
          toPos:     { x: out.wx, y: out.wy },
          connected: true,
          alpha:     1,
        });
      } else if (dist < ar) {
        const alpha = 1 - (dist - pr) / (ar - pr);
        edges.push({
          fromId:    osc.id,
          toId:      out.id,
          fromPos:   { x: osc.wx, y: osc.wy },
          toPos:     { x: out.wx, y: out.wy },
          connected: false,
          alpha,
        });
      }
    });
  });

  return edges;
}

window.patchGraph = { reconcilePatches, getPatchEdges };
