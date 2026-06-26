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

// Always-on central master output (the wall-center hub). Created in initAudio,
// always wired to the speaker; every chain terminates here.
let master = null;

// Must be called once from a user gesture (click) to resume the AudioContext.
async function initAudio() {
  if (audioInitialized) return;
  await Tone.start();
  master = new Tone.Volume(-6).toDestination(); // DEFAULT_DB
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
    node = synth; // routing connects it to the center master
  } else if (def.type === 'effect') {
    node = def.makeNode();          // created disconnected; routing inserts it
    def.applyParam(node, def.getParamT(smoother.get()));
  } else if (def.type === 'controller') {
    node = null;                    // LFO + Sequencer are JS-driven, no audio node
  } else if (def.type === 'global') {
    node = null;                    // tonality / volume have no audio node
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
  } else if (m.def.type === 'global' && m.def.subtype === 'volume' && master) {
    master.volume.rampTo(m.def.getVolDb(angle), 0.05);
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

let _lastChainKeys = {};   // genId -> last applied "a>b>c" string
let _activeLinks = {};     // lfoId -> targetId currently modulated
let _lfoPhase = {};        // lfoId -> running phase (radians)
let _lastModTime = null;   // performance.now() of the last modulation tick

// Apply one LFO's modulation to its target's parameter (JS-driven, option B:
// the target's rotation sets the center; the LFO oscillates around it).
function _applyLfoMod(lfoMod, tgt, s) {
  const t = tgt.def.getParamT(tgt.smoother.get());
  try {
    if (tgt.def.type === 'oscillator') {
      tgt.node.detune.rampTo(30 * s, 0.02);                          // +-30 cents vibrato
    } else if (tgt.def.subtype === 'filter') {
      const c = tgt.def.centerValue(t);
      tgt.node.frequency.rampTo(c * Math.pow(2, 0.5 * s), 0.02);     // +-half octave around cutoff
    } else if (tgt.def.subtype === 'delay') {
      const c = tgt.def.centerValue(t);
      tgt.node.feedback.rampTo(Math.max(0, Math.min(0.85, c + 0.2 * s)), 0.02);
    }
  } catch (_) {}
}

// Call once per frame: advance each active LFO's phase and modulate its target.
// Pure rampTo writes (bounded) — no audio-graph param connections, which is what
// previously froze the WebAudio thread when an LFO was linked to a filter.
function updateModulation() {
  if (!audioInitialized) return;
  const now = (typeof performance !== 'undefined') ? performance.now() : 0;
  let dt = _lastModTime == null ? 0.016 : (now - _lastModTime) / 1000;
  _lastModTime = now;
  if (dt <= 0 || dt > 0.1) dt = 0.016; // guard first frame / tab-away pauses

  Object.keys(_activeLinks).forEach(lfoIdStr => {
    const lfoId = Number(lfoIdStr);
    const lfoMod = activeModules[lfoId];
    const tgt = activeModules[_activeLinks[lfoId]];
    if (!lfoMod || !tgt || !tgt.node) return;
    const rate = lfoMod.def.getRateHz(lfoMod.smoother.get());
    _lfoPhase[lfoId] = ((_lfoPhase[lfoId] || 0) + 2 * Math.PI * rate * dt) % (2 * Math.PI);
    _applyLfoMod(lfoMod, tgt, Math.sin(_lfoPhase[lfoId]));
  });
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

    // 'master' resolves to the always-on center node; it is the terminal and is
    // never disconnected (it reaches the speaker via .toDestination()).
    const nodeOf = (id) => (id === 'master' ? master : (activeModules[id] && activeModules[id].node));

    chain.nodeIds.forEach(id => {
      if (id === 'master') return;
      const n = nodeOf(id);
      if (n) { try { n.disconnect(); } catch (_) {} }
    });

    for (let i = 0; i < chain.nodeIds.length - 1; i++) {
      const a = nodeOf(chain.nodeIds[i]);
      const b = nodeOf(chain.nodeIds[i + 1]);
      if (a && b) { try { a.connect(b); } catch (_) {} }
    }
    console.log(`[audio] chain ${chain.nodeIds.join('->')}`);
  });
  // generators that vanished from the plan: drop their cached key
  Object.keys(_lastChainKeys).forEach(g => { if (!seenGen.has(Number(g))) delete _lastChainKeys[g]; });

  // ---- control links (JS-driven; no audio-graph connections) ----
  // Just track which LFO drives which target; updateModulation() does the work.
  const desired = {}; plan.controlLinks.forEach(l => { desired[l.lfoId] = l.targetId; });

  Object.keys(_activeLinks).forEach(lfoIdStr => {
    const lfoId = Number(lfoIdStr);
    if (desired[lfoId] !== _activeLinks[lfoId]) {
      delete _activeLinks[lfoId];
      delete _lfoPhase[lfoId];
      // target resumes rotation control next frame (it leaves _lfoTargets below)
    }
  });
  plan.controlLinks.forEach(l => {
    const lfoMod = activeModules[l.lfoId];
    const tgtMod = activeModules[l.targetId];
    if (!lfoMod || !tgtMod || !tgtMod.node) return;
    if (_activeLinks[l.lfoId] !== l.targetId) {
      _activeLinks[l.lfoId] = l.targetId;
      _lfoPhase[l.lfoId] = 0;
      console.log(`[audio] LFO ${l.lfoId} -> module ${l.targetId}`);
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
window.updateModulation   = updateModulation;
