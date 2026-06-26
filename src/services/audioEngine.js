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
const _rhythm = (typeof require === 'function') ? require('../utils/rhythmPatterns.js') : window.rhythmPatterns;
const _cableAnim = (typeof require === 'function') ? require('../utils/cableAnim.js') : window.cableAnim;
const _loopBank = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
const LOOP_BUFFERS = {};   // file -> Tone.ToneAudioBuffer
const LOOP_PEAKS = {};     // file -> number[] peak envelope

// Sequencer clock state
let _step = 0;             // current 16th-note step (0..STEPS-1)
let _stepLoop = null;      // Tone.Loop instance
let _seqIndex = {};        // sequencerId -> melodic-walk counter
let _sequencedOscs = new Set(); // oscillator ids currently gated by a sequencer
let _seqPulses = {};       // sequencerId -> performance.now() of last hit (for cable animation)

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
  await preloadLoops();                         // decode loop buffers + peak envelopes
  master = new Tone.Volume(-6).toDestination(); // DEFAULT_DB
  Tone.Transport.bpm.value = 110;               // BPM
  _step = 0;
  _stepLoop = new Tone.Loop((time) => { _onStep(time); }, '16n').start(0);
  Tone.Transport.start();
  audioInitialized = true;
  console.log('[audio] AudioContext started');
}

// Decode every loop in the bank once and precompute its peak envelope for the cable view.
async function preloadLoops() {
  // Loops are fetched at runtime; file:// blocks fetch (CORS "unique origin"), so the
  // Loop puck is silent unless the app is served over http. Warn loudly and actionably.
  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    console.warn('[audio] Loop puck DISABLED: open the app via http://localhost (run `npm start`), not as a file:// page.');
    return;
  }
  for (const entry of _loopBank.LOOP_BANK) {
    try {
      const buf = await Tone.ToneAudioBuffer.fromUrl(entry.file);
      LOOP_BUFFERS[entry.file] = buf;
      let data = null;
      try { data = (typeof buf.toArray === 'function') ? buf.toArray(0) : null; }
      catch (pe) { /* peaks are cosmetic; audio still plays without them */ }
      LOOP_PEAKS[entry.file] = data ? _cableAnim.peakEnvelope(data, 200) : [];
    } catch (e) {
      console.error('[audio] loop load failed:', entry.file, '|', e && (e.message || e));
      LOOP_PEAKS[entry.file] = [];
    }
  }
  console.log('[audio] loops loaded:', Object.keys(LOOP_BUFFERS).length, '/', _loopBank.LOOP_BANK.length);
}

// Fired once per 16th note by the Transport loop: each active sequencer fires
// its target oscillator on hit steps.
function _onStep(time) {
  _step = (_step + 1) % _rhythm.STEPS;
  Object.keys(_activeLinks).forEach(cidStr => {
    const cid = Number(cidStr);
    const ctrl = activeModules[cid];
    if (!ctrl || ctrl.def.subtype !== 'sequencer') return;
    const osc = activeModules[_activeLinks[cid]];
    if (!osc || osc.def.type !== 'oscillator' || !osc.node) return;
    const pat = _rhythm.PATTERNS[ctrl.def.getPatternIndex(ctrl.smoother.get())];
    if (!pat || !pat.steps[_step]) return;
    _seqPulses[cid] = (typeof performance !== 'undefined') ? performance.now() : 0; // for cable pulse anim
    let freq;
    if (_tonality && _tonality.active) {
      const idx = (_seqIndex[cid] || 0);
      freq = _tonalityUtil.scaleDegreeFreq(osc.def.getFreq(osc.smoother.get()), _tonality.root, idx);
      _seqIndex[cid] = idx + 1;
    } else {
      freq = _oscFreq(osc.def, osc.smoother.get());
    }
    try { osc.node.triggerAttackRelease(freq, '16n', time); } catch (_) {}
  });
}

function getSeqStep() { return _step; }
function getSeqPulses() { return _seqPulses; }

// Live output level [0,1] for a module's ring pulse + waveform amplitude (0 if no meter).
function getModuleLevel(id) {
  const m = activeModules[id];
  if (!m || !m.meter) return 0;
  let db;
  try { db = m.meter.getValue(); } catch (_) { return 0; }
  if (Array.isArray(db)) db = db[0];      // stereo meter -> use first channel
  return _cableAnim.meterToUnit(db);
}
// LFO modulation rate in Hz for a control cable's scroll speed (default 1).
function getLfoRate(srcId) {
  const m = activeModules[srcId];
  if (m && m.def && typeof m.def.getRateHz === 'function') {
    return m.def.getRateHz(m.smoother.get());
  }
  return 1;
}

function _addModule(id, marker) {
  const def = MODULE_REGISTRY[id];
  if (!def) return;

  const smoother = createAngleSmoother();
  smoother.update(marker.angle, performance.now());

  let node = null;
  let meter = null;
  let loopIdx = -1;

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
    meter = new Tone.Meter({ smoothing: 0.8 });
    synth.connect(meter);           // passive tap; routing to master is unchanged
  } else if (def.type === 'effect') {
    node = def.makeNode();          // created disconnected; routing inserts it
    def.applyParam(node, def.getParamT(smoother.get()));
    meter = new Tone.Meter({ smoothing: 0.8 });
    node.connect(meter);            // passive tap
  } else if (def.type === 'sampler') {
    loopIdx = def.getLoopIndex(smoother.get());
    const entry = _loopBank.LOOP_BANK[loopIdx];
    const buf = LOOP_BUFFERS[entry.file];
    if (buf) {
      const player = new Tone.Player({ url: buf, loop: true });
      player.playbackRate = _loopBank.playbackRateFor(entry.bpm, Tone.Transport.bpm.value);
      player.sync().start('@1m');   // launch on the next bar, locked to the Transport
      node = player;
      meter = new Tone.Meter({ smoothing: 0.8 });
      player.connect(meter);
    } else {
      console.warn('[audio] Loop puck: no buffer for', entry.file, '— serve over http (npm start) so loops can load.');
    }
  } else if (def.type === 'controller') {
    node = null;                    // LFO + Sequencer are JS-driven, no audio node
  } else if (def.type === 'global') {
    node = null;                    // tonality / volume / tempo have no audio node
  }

  activeModules[id] = {
    def,
    node,
    meter,
    loopIdx,
    smoother,
    missCount: 0,
    lastPos: { wx: marker.wx, wy: marker.wy },
  };

  console.log(`[audio] added module ID ${id} (${def.name})`);
}

function _removeModule(id) {
  const m = activeModules[id];
  if (!m) return;

  if (m.meter) { try { m.meter.dispose(); } catch (_) {} }

  if (m.def.type === 'oscillator' && m.node) {
    m.node.triggerRelease();
    // Dispose after the release envelope finishes (~300ms)
    setTimeout(() => { try { m.node.dispose(); } catch (_) {} }, 500);
  } else if (m.node) {
    try { if (typeof m.node.stop === 'function') m.node.stop(); } catch (_) {}
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
  } else if (m.def.type === 'sampler' && m.node) {
    const idx = m.def.getLoopIndex(angle);
    if (idx !== m.loopIdx) { m.loopIdx = idx; _swapLoop(id, idx); }
    const entry = _loopBank.LOOP_BANK[m.loopIdx];
    if (entry) m.node.playbackRate = _loopBank.playbackRateFor(entry.bpm, Tone.Transport.bpm.value);
  } else if (m.def.type === 'global' && m.def.subtype === 'tempo') {
    const bpm = m.def.getBpm(angle);
    Tone.Transport.bpm.rampTo(bpm, 0.1);
    _applyLoopRates(bpm);
  } else if (m.def.type === 'controller' && m.node) {
    m.node.frequency.rampTo(m.def.getRateHz(angle), 0.05);
  }
}

// Swap a loop puck's buffer on the next bar (keeps node identity so routing stays wired).
function _swapLoop(id, idx) {
  const m = activeModules[id];
  if (!m || !m.node) return;
  const entry = _loopBank.LOOP_BANK[idx];
  const buf = entry && LOOP_BUFFERS[entry.file];
  if (!buf) return;
  Tone.Transport.scheduleOnce((time) => {
    try {
      m.node.buffer = buf;
      m.node.playbackRate = _loopBank.playbackRateFor(entry.bpm, Tone.Transport.bpm.value);
      // A looping Player keeps playing its OLD buffer until the source is recreated;
      // restart() makes a fresh source so the new loop actually plays.
      m.node.restart(time);
      console.log('[audio] loop ->', entry.name);
    } catch (_) {}
  }, '@1m');
}

// Re-rate every active loop when the tempo changes (keeps loops locked to the new BPM).
function _applyLoopRates(bpm) {
  Object.keys(activeModules).forEach(k => {
    const m = activeModules[k];
    if (m && m.def.type === 'sampler' && m.node) {
      const entry = _loopBank.LOOP_BANK[m.loopIdx];
      if (entry) m.node.playbackRate = _loopBank.playbackRateFor(entry.bpm, bpm);
    }
  });
}

// Peak envelope for a sampler's current loop (read by the visual layer). [] if none.
function getLoopPeaks(srcId) {
  const m = activeModules[srcId];
  if (!m || m.def.type !== 'sampler') return [];
  const entry = _loopBank.LOOP_BANK[m.loopIdx];
  return (entry && LOOP_PEAKS[entry.file]) || [];
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
    if (!lfoMod || lfoMod.def.subtype !== 'lfo') return; // sequencers handled by _onStep
    const tgt = activeModules[_activeLinks[lfoId]];
    if (!tgt || !tgt.node) return;
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

  // ---- controller links (JS-driven; no audio-graph connections) ----
  // Track which controller drives which target; _onStep / updateModulation act on it.
  const desired = {}; plan.controlLinks.forEach(l => { desired[l.controllerId] = l.targetId; });

  Object.keys(_activeLinks).forEach(cidStr => {
    const cid = Number(cidStr);
    if (desired[cid] !== _activeLinks[cid]) {
      delete _activeLinks[cid]; delete _lfoPhase[cid]; delete _seqIndex[cid];
    }
  });
  plan.controlLinks.forEach(l => {
    const ctrl = activeModules[l.controllerId];
    const tgt = activeModules[l.targetId];
    if (!ctrl || !tgt || !tgt.node) return;
    if (_activeLinks[l.controllerId] !== l.targetId) {
      _activeLinks[l.controllerId] = l.targetId;
      if (ctrl.def.subtype === 'lfo') _lfoPhase[l.controllerId] = 0;
      if (ctrl.def.subtype === 'sequencer') _seqIndex[l.controllerId] = 0;
      console.log(`[audio] ${ctrl.def.subtype} ${l.controllerId} -> module ${l.targetId}`);
    }
  });

  // Recompute which oscillators are sequencer-gated and which modules an LFO drives.
  const nowSeq = new Set(), nowLfo = new Set();
  Object.keys(_activeLinks).forEach(cidStr => {
    const ctrl = activeModules[Number(cidStr)];
    if (!ctrl) return;
    if (ctrl.def.subtype === 'sequencer') nowSeq.add(_activeLinks[Number(cidStr)]);
    if (ctrl.def.subtype === 'lfo') nowLfo.add(_activeLinks[Number(cidStr)]);
  });
  // Gate transitions: newly sequenced osc stops droning; un-sequenced resumes its drone.
  nowSeq.forEach(oscId => {
    if (!_sequencedOscs.has(oscId)) {
      const m = activeModules[oscId];
      if (m && m.node) { try { m.node.triggerRelease(); } catch (_) {} }
    }
  });
  _sequencedOscs.forEach(oscId => {
    if (!nowSeq.has(oscId)) {
      const m = activeModules[oscId];
      if (m && m.node) { try { m.node.triggerAttack(_oscFreq(m.def, m.smoother.get())); } catch (_) {} }
    }
  });
  _sequencedOscs = nowSeq;
  _lfoTargets = nowLfo;
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
window.getSeqStep         = getSeqStep;
window.getSeqPulses       = getSeqPulses;
window.getModuleLevel     = getModuleLevel;
window.getLfoRate         = getLfoRate;
window.getLoopPeaks       = getLoopPeaks;
