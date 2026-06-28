// src/services/routingGraph.js
// Pure, per-frame routing planner. Chains flow to a fixed central master node.

const CONSTANTS = {
  CONNECT_FRAC: 0.35,   // audio-hop distance as fraction of screen width
  KEEP_FACTOR: 1.0,     // existing hop stays connected out to KEEP_FACTOR x radius
  CONTROL_FRAC: 0.30,   // controller<->target distance as fraction of screen width
  CHAIN_HOLD_FRAMES: 1, // frames a chain change must persist before committing
};

function _dist(a, b) {
  const dx = a.wx - b.wx, dy = a.wy - b.wy;
  return Math.sqrt(dx * dx + dy * dy);
}

// Nearest-neighbor walk from each oscillator to the fixed center C (the master).
function buildRawPlan(modules, viewport, prevMembership) {
  const R = viewport.w * CONSTANTS.CONNECT_FRAC;
  const KEEP = R * CONSTANTS.KEEP_FACTOR;
  const controlR = viewport.w * CONSTANTS.CONTROL_FRAC;
  const prev = prevMembership || new Set();
  const C = { wx: viewport.w / 2, wy: viewport.h / 2 };

  const gens = modules.filter(m =>
    m.def.type === 'oscillator' || m.def.type === 'sampler' ||
    m.def.type === 'bass'      || m.def.type === 'lead');
  const effects = modules.filter(m => m.def.type === 'effect');
  const controllers = modules.filter(m => m.def.type === 'controller');
  const tonalityMod = modules.find(m => m.def.type === 'global' && m.def.subtype === 'tonality');

  const membership = new Set();

  // Exclusive mode: pre-assign each effect to its nearest generator.
  // An effect can only be picked up by the gen it's physically closest to.
  const nearestGen = {};
  effects.forEach(e => {
    let minDist = Infinity, nearestId = null;
    gens.forEach(g => { const d = _dist(g, e); if (d < minDist) { minDist = d; nearestId = g.id; } });
    nearestGen[e.id] = nearestId;
  });

  const chains = gens.map(gen => {
    const nodes = [gen.id];
    const localMembers = [];
    let current = gen;
    while (true) {
      let best = null, bestDist = Infinity;
      const curToC = _dist(current, C);
      effects.forEach(e => {
        if (nodes.includes(e.id)) return;                // already in this gen's chain
        if (nearestGen[e.id] !== gen.id) return;         // exclusive: only nearest gen claims
        if (_dist(e, C) >= curToC) return;               // must progress toward center
        const reach = prev.has(`${gen.id}:${e.id}`) ? KEEP : R;
        const d = _dist(current, e);
        if (d < reach && d < bestDist) { best = e; bestDist = d; }
      });
      if (!best) break;
      nodes.push(best.id);
      localMembers.push(`${gen.id}:${best.id}`);
      current = best;
    }
    nodes.push('master');                                 // osc ALWAYS reaches center
    localMembers.forEach(m => membership.add(m));
    return { genId: gen.id, nodeIds: nodes };
  });

  // controller links: lfo -> nearest osc|sampler|effect; sequencer -> nearest osc|sampler
  // (matches the original Reactable: all generators can receive control data)
  const controlLinks = [];
  controllers.forEach(c => {
    const wantsEffect = c.def.subtype === 'lfo';
    let target = null, td = Infinity;
    modules.forEach(m => {
      const ok = m.def.type === 'oscillator' || m.def.type === 'sampler' || (wantsEffect && m.def.type === 'effect');
      if (!ok) return;
      const d = _dist(c, m);
      if (d < controlR && d < td) { target = m; td = d; }
    });
    if (target) controlLinks.push({ controllerId: c.id, targetId: target.id });
  });

  const tonality = tonalityMod
    ? { active: true, root: tonalityMod.def.getRoot(tonalityMod.angle), scale: 'minorPentatonic' }
    : null;

  return { chains, controlLinks, tonality, membership };
}

// ---- stateful debounce ----
let _committed = { chains: [], controlLinks: [], tonality: null, membership: new Set() };
let _holds = {};
function _chainKey(c) { return `${c.genId}=${c.nodeIds.join('>')}`; }

function update(modules, viewport) {
  const raw = buildRawPlan(modules, viewport, _committed.membership);
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
    if (_holds[k] >= CONSTANTS.CHAIN_HOLD_FRAMES) { _holds[k] = 0; return rawChain; }
    return prevChain || { genId: rawChain.genId, nodeIds: [rawChain.genId, 'master'] };
  });
  _committed = { chains: newChains, controlLinks: raw.controlLinks, tonality: raw.tonality, membership: raw.membership };
  return _committed;
}

function reset() {
  _committed = { chains: [], controlLinks: [], tonality: null, membership: new Set() };
  _holds = {};
}

function getEdges(plan, modules, viewport) {
  const byId = {};
  modules.forEach(m => { byId[m.id] = m; });
  const C = { x: viewport.w / 2, y: viewport.h / 2 };
  const posOf = (id) => (id === 'master' ? C : (byId[id] ? { x: byId[id].wx, y: byId[id].wy } : null));
  const edges = [];

  plan.chains.forEach(c => {
    for (let i = 0; i < c.nodeIds.length - 1; i++) {
      const srcId = c.nodeIds[i], dstId = c.nodeIds[i + 1];
      const a = posOf(srcId), b = posOf(dstId);
      if (a && b) edges.push({ fromPos: a, toPos: b, kind: 'audio', connected: true, alpha: 1, srcId, dstId });
    }
  });
  plan.controlLinks.forEach(l => {
    const a = byId[l.controllerId], b = byId[l.targetId];
    if (!a || !b) return;
    edges.push({
      fromPos: { x: a.wx, y: a.wy }, toPos: { x: b.wx, y: b.wy },
      kind: 'control', ctrl: a.def.subtype, srcId: l.controllerId, dstId: l.targetId, connected: true, alpha: 1,
    });
  });
  return edges;
}

const routingGraph = { CONSTANTS, buildRawPlan, update, reset, getEdges };
if (typeof window !== 'undefined') window.routingGraph = routingGraph;
if (typeof module !== 'undefined') module.exports = routingGraph;
