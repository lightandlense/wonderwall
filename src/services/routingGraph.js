// src/services/routingGraph.js
// Pure, per-frame routing planner. Replaces patchGraph.js.
// Produces a RoutingPlan that audioEngine.applyRoutingPlan() executes.

const CONSTANTS = {
  CONNECT_FRAC: 0.35,   // audio-hop distance as fraction of screen width
  KEEP_FACTOR: 1.25,    // an existing hop stays connected out to KEEP_FACTOR x radius (hysteresis)
  CONTROL_FRAC: 0.30,   // lfo<->target distance as fraction of screen width
  CHAIN_HOLD_FRAMES: 3, // frames a chain change must persist before committing
};

function _dist(a, b) {
  const dx = a.wx - b.wx, dy = a.wy - b.wy;
  return Math.sqrt(dx * dx + dy * dy);
}

// Pure: build the desired plan from a module snapshot.
// Nearest-neighbor proximity model (like the real Reactable): each generator
// walks toward its nearest output, hopping to the nearest unused effect that is
// (a) within reach and (b) strictly closer to the output, until it can connect
// to the output. Effects insert by being NEAR the path, not on a precise line.
// prevMembership: Set of "genId:nodeId" strings (for spatial hysteresis).
function buildRawPlan(modules, screenWidth, prevMembership) {
  const R = screenWidth * CONSTANTS.CONNECT_FRAC;
  const KEEP = R * CONSTANTS.KEEP_FACTOR;
  const controlR = screenWidth * CONSTANTS.CONTROL_FRAC;
  const prev = prevMembership || new Set();

  const gens = modules.filter(m => m.def.type === 'oscillator');
  const effects = modules.filter(m => m.def.type === 'effect');
  const outputs = modules.filter(m => m.def.type === 'output');
  const lfos = modules.filter(m => m.def.type === 'controller');
  const tonalityMod = modules.find(m => m.def.type === 'global' && m.def.subtype === 'tonality');

  const membership = new Set();
  const claimed = new Set(); // effect ids already used by an earlier chain

  const chains = gens.map(gen => {
    // target = nearest output overall (reachability is enforced by the hop radii)
    let out = null, outDist = Infinity;
    outputs.forEach(o => { const d = _dist(gen, o); if (d < outDist) { out = o; outDist = d; } });
    if (!out) return { genId: gen.id, nodeIds: [gen.id], outputId: null };

    const nodes = [gen.id];
    const localMembers = [];
    let current = gen;

    // Greedy walk toward the output through effects.
    while (true) {
      let best = null, bestDist = Infinity;
      const curToOut = _dist(current, out);
      effects.forEach(e => {
        if (claimed.has(e.id) || nodes.includes(e.id)) return;
        if (_dist(e, out) >= curToOut) return;                 // must progress toward the output
        const reach = prev.has(`${gen.id}:${e.id}`) ? KEEP : R; // hysteresis on existing hops
        const d = _dist(current, e);
        if (d < reach && d < bestDist) { best = e; bestDist = d; }
      });
      if (!best) break;
      nodes.push(best.id);
      localMembers.push(`${gen.id}:${best.id}`);
      current = best;
    }

    // Connect the last node to the output only if it's within reach.
    const finalReach = prev.has(`${gen.id}:out`) ? KEEP : R;
    if (_dist(current, out) < finalReach) {
      nodes.push(out.id);
      localMembers.push(`${gen.id}:out`);
      localMembers.forEach(m => membership.add(m));
      nodes.slice(1, -1).forEach(id => claimed.add(id));
      return { genId: gen.id, nodeIds: nodes, outputId: out.id };
    }
    return { genId: gen.id, nodeIds: [gen.id], outputId: null }; // couldn't reach output -> silent
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
