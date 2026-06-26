// src/services/audioEngine.js
// Tone.js module lifecycle: add on marker appear, remove on marker gone,
// update params from smoothed rotation each detection frame.

// Detection cycles a module survives without being re-detected before removal.
// 2 cycles ≈ 6 rAF frames ≈ 100ms at 60fps — absorbs single-frame dropouts.
const PROP_MISS_CYCLES = 2;

// activeModules[id] = { def, node, smoother, missCount, lastPos: {wx, wy} }
const activeModules = {};

let audioInitialized = false;

// Global tonality state, set by applyRoutingPlan from the routing plan.
let _tonality = null; // { active, root, scale } | null
const _tonalityUtil = (typeof require === 'function') ? require('../utils/tonality.js') : window.tonality;

// Oscillator frequency with optional scale quantization.
function _oscFreq(def, angle) {
  const f = def.getFreq(angle);
  if (_tonality && _tonality.active) return _tonalityUtil.quantizeFreqToScale(f, _tonality.root);
  return f;
}

// Set of module ids currently driven by an LFO (skip direct param ramp for them).
let _lfoTargets = new Set();

// Must be called once from a user gesture (click) to resume the AudioContext.
async function initAudio() {
  if (audioInitialized) return;
  await Tone.start();
  audioInitialized = true;
  console.log('[audio] AudioContext started');
}

function _addModule(id, marker) {
  const def = MODULE_REGISTRY[id];
  if (!def) return;

  const smoother = createAngleSmoother();
  smoother.update(marker.angle, performance.now());

  let node = null;

  if (def.type === 'oscillator') {
    // Sawtooth (harmonically rich) so the low-pass Filter and Delay are clearly
    // audible. A pure sine has no harmonics for a filter to act on, making the
    // effects nearly silent. -8 dB tames the saw's harshness; Output sets level.
    const synth = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.1, decay: 0, sustain: 1, release: 0.3 },
      volume: -8,
    });
    synth.triggerAttack(_oscFreq(def, smoother.get()));
    node = synth; // routing connects it; starts disconnected (silent until patched)
  } else if (def.type === 'output') {
    node = new Tone.Volume(def.getVolDb(smoother.get())).toDestination();
  } else if (def.type === 'effect') {
    node = def.makeNode();          // created disconnected; routing inserts it
    def.applyParam(node, def.getParamT(smoother.get()));
  } else if (def.type === 'controller' && def.subtype === 'lfo') {
    node = new Tone.LFO(def.getRateHz(smoother.get()), 0, 1).start();
  } else if (def.type === 'global') {
    node = null;                    // tonality has no audio node
  }

  activeModules[id] = {
    def,
    node,
    smoother,
    missCount: 0,
    lastPos: { wx: marker.wx, wy: marker.wy },
  };

  console.log(`[audio] added module ID ${id} (${def.name})`);
}

function _removeModule(id) {
  const m = activeModules[id];
  if (!m) return;

  if (m.def.type === 'oscillator' && m.node) {
    m.node.triggerRelease();
    // Dispose after the release envelope finishes (~300ms)
    setTimeout(() => { try { m.node.dispose(); } catch (_) {} }, 500);
  } else if (m.node) {
    try { m.node.dispose(); } catch (_) {}
  }

  delete activeModules[id];
  console.log(`[audio] removed module ID ${id}`);
}

function _updateModule(id, marker) {
  const m = activeModules[id];
  if (!m) return;

  m.smoother.update(marker.angle, performance.now());
  m.missCount = 0;
  m.lastPos = { wx: marker.wx, wy: marker.wy };

  const angle = m.smoother.get();

  if (m.def.type === 'oscillator' && m.node) {
    // 50ms ramp — smooths pitch between detection frames without perceptible lag
    m.node.frequency.rampTo(_oscFreq(m.def, angle), 0.05);
  } else if (m.def.type === 'output' && m.node) {
    m.node.volume.rampTo(m.def.getVolDb(angle), 0.05);
  } else if (m.def.type === 'effect' && m.node && !_lfoTargets.has(m.def.id)) {
    // While an LFO drives this effect, its rotation feeds the LFO window instead
    // (handled in applyRoutingPlan), so skip the direct ramp to avoid fighting it.
    m.def.applyParam(m.node, m.def.getParamT(angle));
  } else if (m.def.type === 'controller' && m.node) {
    m.node.frequency.rampTo(m.def.getRateHz(angle), 0.05);
  }
}

// Called each detection frame with the currently visible module markers.
// markers: [{id, wx, wy, angle}] — already in world (screen pixel) coordinates.
function reconcileModules(markers) {
  if (!audioInitialized) return;

  const seenIds = new Set(markers.map(m => m.id));

  // Increment miss counter for absent modules; remove if past grace window.
  Object.keys(activeModules).forEach(idStr => {
    const id = Number(idStr);
    if (seenIds.has(id)) {
      const marker = markers.find(m => m.id === id);
      _updateModule(id, marker);
    } else {
      activeModules[id].missCount++;
      if (activeModules[id].missCount > PROP_MISS_CYCLES) {
        _removeModule(id);
      }
    }
  });

  // Add newly visible modules.
  markers.forEach(marker => {
    const id = marker.id;
    if (MODULE_REGISTRY[id] && !activeModules[id]) {
      _addModule(id, marker);
    }
  });
}

let _lastChainKeys = {}; // genId -> last applied "a>b>c" string
let _activeLinks = {};   // lfoId -> targetId currently connected

// Map an effect/osc module to the Tone Param the LFO should modulate (option B).
function _modTargetParam(mod) {
  if (mod.def.type === 'oscillator') return mod.node.detune; // vibrato
  return mod.node[mod.def.modParam];                         // filter.frequency / delay.feedback
}

// Set the LFO's min/max window centered on the target's current rotation value.
// Tone requires min < max; clamp defensively so a degenerate window can't throw.
function _setLfoWindow(lfoMod, targetMod) {
  const t = targetMod.def.getParamT(targetMod.smoother.get());
  let min, max;
  if (targetMod.def.type === 'oscillator') {
    min = -30; max = 30;                                      // +-30 cents vibrato
  } else if (targetMod.def.subtype === 'filter') {
    const c = targetMod.def.centerValue(t);
    min = c * 0.5; max = c * 2;                               // +- octave around cutoff
  } else if (targetMod.def.subtype === 'delay') {
    const c = targetMod.def.centerValue(t);
    min = Math.max(0, c - 0.2); max = Math.min(0.85, c + 0.2);
  } else {
    return;
  }
  if (!(max > min)) max = min + 1e-3;                         // guarantee a valid window
  try { lfoMod.node.min = min; lfoMod.node.max = max; } catch (_) {}
}

// Execute a RoutingPlan: rewire only chains/links that changed; refresh LFO windows.
function applyRoutingPlan(plan) {
  if (!audioInitialized) return;
  _tonality = plan.tonality;

  // ---- audio chains ----
  const seenGen = new Set();
  plan.chains.forEach(chain => {
    seenGen.add(chain.genId);
    const key = chain.nodeIds.join('>');
    if (_lastChainKeys[chain.genId] === key) return; // unchanged
    _lastChainKeys[chain.genId] = key;

    // Disconnect the source nodes (generator + effects) before re-wiring.
    // NEVER disconnect the output node: it reaches the speaker via .toDestination()
    // set at creation, and disconnect() would sever that, killing all sound.
    chain.nodeIds.forEach(id => {
      if (id === chain.outputId) return;
      const m = activeModules[id];
      if (m && m.node) { try { m.node.disconnect(); } catch (_) {} }
    });

    if (!chain.outputId) return; // silent: leave generator disconnected

    for (let i = 0; i < chain.nodeIds.length - 1; i++) {
      const a = activeModules[chain.nodeIds[i]];
      const b = activeModules[chain.nodeIds[i + 1]];
      if (a && a.node && b && b.node) { try { a.node.connect(b.node); } catch (_) {} }
    }
    // output node still routes to Destination (never disconnected above)
    console.log(`[audio] chain ${chain.nodeIds.join('->')}`);
  });
  // generators that vanished from the plan: drop their cached key
  Object.keys(_lastChainKeys).forEach(g => { if (!seenGen.has(Number(g))) delete _lastChainKeys[g]; });

  // ---- control links ----
  const desired = {}; plan.controlLinks.forEach(l => { desired[l.lfoId] = l.targetId; });

  // tear down links that changed/disappeared
  Object.keys(_activeLinks).forEach(lfoIdStr => {
    const lfoId = Number(lfoIdStr);
    if (desired[lfoId] !== _activeLinks[lfoId]) {
      const lfoMod = activeModules[lfoId];
      if (lfoMod && lfoMod.node) { try { lfoMod.node.disconnect(); } catch (_) {} }
      delete _activeLinks[lfoId];
    }
  });
  // establish / refresh links
  plan.controlLinks.forEach(l => {
    const lfoMod = activeModules[l.lfoId];
    const tgtMod = activeModules[l.targetId];
    if (!lfoMod || !lfoMod.node || !tgtMod || !tgtMod.node) return;
    if (_activeLinks[l.lfoId] !== l.targetId) {
      _setLfoWindow(lfoMod, tgtMod);
      try { lfoMod.node.connect(_modTargetParam(tgtMod)); } catch (_) {}
      _activeLinks[l.lfoId] = l.targetId;
      console.log(`[audio] LFO ${l.lfoId} -> module ${l.targetId}`);
    } else {
      _setLfoWindow(lfoMod, tgtMod); // keep window centered as the target is turned (option B, live)
    }
  });

  // refresh the set of LFO-driven targets so _updateModule stops fighting the LFO
  _lfoTargets = new Set(Object.values(_activeLinks));
}

// Returns smoothed angle [0, 2π) for a module, or null if not active.
function getModuleParam(id) {
  const m = activeModules[id];
  return m ? m.smoother.get() : null;
}

// Returns snapshot of all active modules for the visual engine.
function getActiveModules() {
  return Object.values(activeModules).map(m => ({
    id:    m.def.id,
    def:   m.def,
    angle: m.smoother.get(),
    wx:    m.lastPos.wx,
    wy:    m.lastPos.wy,
  }));
}

window.initAudio          = initAudio;
window.reconcileModules   = reconcileModules;
window.getModuleParam     = getModuleParam;
window.getActiveModules   = getActiveModules;
window.applyRoutingPlan   = applyRoutingPlan;
