// src/services/routingGraph.js
// Pure, per-frame routing planner. Replaces patchGraph.js.
// Produces a RoutingPlan that audioEngine.applyRoutingPlan() executes.

const geometry = (typeof require === 'function') ? require('../utils/geometry.js') : window.geometry;

const CONSTANTS = {
  PATCH_FRAC: 0.35,     // osc<->output connect distance as fraction of screen width
  BAND_ADD: 60,         // perpendicular px to JOIN a cable
  BAND_KEEP: 95,        // perpendicular px to STAY on a cable (hysteresis)
  CONTROL_FRAC: 0.30,   // lfo<->target distance as fraction of screen width
  CHAIN_HOLD_FRAMES: 3, // frames a chain change must persist before committing
};

function _dist(a, b) {
  const dx = a.wx - b.wx, dy = a.wy - b.wy;
  return Math.sqrt(dx * dx + dy * dy);
}

// Pure: build the desired plan from a module snapshot.
// prevMembership: Set of "genId:effId" strings (for spatial hysteresis).
function buildRawPlan(modules, screenWidth, prevMembership) {
  const patchR = screenWidth * CONSTANTS.PATCH_FRAC;
  const controlR = screenWidth * CONSTANTS.CONTROL_FRAC;
  const prev = prevMembership || new Set();

  const gens = modules.filter(m => m.def.type === 'oscillator');
  const effects = modules.filter(m => m.def.type === 'effect');
  const outputs = modules.filter(m => m.def.type === 'output');
  const lfos = modules.filter(m => m.def.type === 'controller');
  const tonalityMod = modules.find(m => m.def.type === 'global' && m.def.subtype === 'tonality');

  const membership = new Set();
  const chains = gens.map(gen => {
    // nearest output within patch radius
    let out = null, outDist = Infinity;
    outputs.forEach(o => { const d = _dist(gen, o); if (d < patchR && d < outDist) { out = o; outDist = d; } });

    if (!out) return { genId: gen.id, nodeIds: [gen.id], outputId: null };

    // effects on the cable gen->out
    const onCable = [];
    effects.forEach(e => {
      const { dist, t } = geometry.pointToSegment(e.wx, e.wy, gen.wx, gen.wy, out.wx, out.wy);
      if (t <= 0 || t >= 1) return;
      const wasMember = prev.has(`${gen.id}:${e.id}`);
      const band = wasMember ? CONSTANTS.BAND_KEEP : CONSTANTS.BAND_ADD;
      if (dist < band) { onCable.push({ id: e.id, t }); membership.add(`${gen.id}:${e.id}`); }
    });
    onCable.sort((a, b) => a.t - b.t);

    return { genId: gen.id, nodeIds: [gen.id, ...onCable.map(e => e.id), out.id], outputId: out.id };
  });

  // control links: each LFO -> nearest audio module (osc or effect) in range
  const controlLinks = [];
  lfos.forEach(l => {
    let target = null, td = Infinity;
    modules.forEach(m => {
      if (m.def.type !== 'oscillator' && m.def.type !== 'effect') return;
      const d = _dist(l, m);
      if (d < controlR && d < td) { target = m; td = d; }
    });
    if (target) controlLinks.push({ lfoId: l.id, targetId: target.id });
  });

  const tonality = tonalityMod
    ? { active: true, root: tonalityMod.def.getRoot(tonalityMod.angle), scale: 'minorPentatonic' }
    : null;

  return { chains, controlLinks, tonality, membership };
}

// ---- stateful debounce layer ----
let _committed = { chains: [], controlLinks: [], tonality: null, membership: new Set() };
let _holds = {}; // key -> frames the pending value has persisted

function _chainKey(c) { return `${c.genId}=${c.nodeIds.join('>')}`; }

function update(modules, screenWidth) {
  const raw = buildRawPlan(modules, screenWidth, _committed.membership);

  // Debounce per generator chain: a changed chain must persist CHAIN_HOLD_FRAMES.
  const committedByGen = {};
  _committed.chains.forEach(c => { committedByGen[c.genId] = c; });
  const newChains = raw.chains.map(rawChain => {
    const prevChain = committedByGen[rawChain.genId];
    if (prevChain && _chainKey(prevChain) === _chainKey(rawChain)) {
      _holds[`chain:${rawChain.genId}`] = 0;
      return prevChain;
    }
    const k = `chain:${rawChain.genId}`;
    _holds[k] = (_holds[k] || 0) + 1;
    if (_holds[k] >= CONSTANTS.CHAIN_HOLD_FRAMES) {
      _holds[k] = 0;
      return rawChain;
    }
    return prevChain || { genId: rawChain.genId, nodeIds: [rawChain.genId], outputId: null };
  });

  // Control links + tonality commit immediately (low pop risk).
  _committed = {
    chains: newChains,
    controlLinks: raw.controlLinks,
    tonality: raw.tonality,
    membership: raw.membership,
  };
  return _committed;
}

function reset() {
  _committed = { chains: [], controlLinks: [], tonality: null, membership: new Set() };
  _holds = {};
}

// Visual edges from the committed plan.
function getEdges(plan, modules) {
  const byId = {};
  modules.forEach(m => { byId[m.id] = m; });
  const edges = [];

  plan.chains.forEach(c => {
    if (!c.outputId) return;
    for (let i = 0; i < c.nodeIds.length - 1; i++) {
      const a = byId[c.nodeIds[i]], b = byId[c.nodeIds[i + 1]];
      if (!a || !b) continue;
      edges.push({ fromPos: { x: a.wx, y: a.wy }, toPos: { x: b.wx, y: b.wy }, kind: 'audio', connected: true, alpha: 1 });
    }
  });

  plan.controlLinks.forEach(l => {
    const a = byId[l.lfoId], b = byId[l.targetId];
    if (!a || !b) return;
    edges.push({ fromPos: { x: a.wx, y: a.wy }, toPos: { x: b.wx, y: b.wy }, kind: 'control', connected: true, alpha: 1 });
  });

  return edges;
}

const routingGraph = { CONSTANTS, buildRawPlan, update, reset, getEdges };

if (typeof window !== 'undefined') window.routingGraph = routingGraph;
if (typeof module !== 'undefined') module.exports = routingGraph;
