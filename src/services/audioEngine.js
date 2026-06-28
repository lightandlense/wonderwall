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
const _cableAnim = (typeof require === 'function') ? require('../utils/cableAnim.js') : window.cableAnim;
const _loopBank = (typeof require === 'function') ? require('../data/loopBank.js') : window.loopBank;
const LOOP_BUFFERS = {};   // file -> Tone.ToneAudioBuffer
const LOOP_PEAKS = {};     // file -> number[] peak envelope

// Oscillator frequency with optional scale quantization.
function _oscFreq(def, angle) {
  const f = def.getFreq(angle);
  if (_tonality && _tonality.active) return _tonalityUtil.quantizeFreqToScale(f, _tonality.root);
  return f;
}

// Always-on central master output (the wall-center hub). Created in initAudio,
// always wired to the speaker; every chain terminates here.
let master = null;

// Must be called once from a user gesture (click) to resume the AudioContext.
async function initAudio() {
  if (audioInitialized) return;
  await Tone.start();
  await preloadLoops();                         // decode loop buffers + peak envelopes
  master = new Tone.Volume(-6).toDestination(); // DEFAULT_DB
  Tone.Transport.bpm.value = 128;               // BPM — EDM default
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
      const encodedUrl = entry.file.split('/').map(encodeURIComponent).join('/');
      const buf = await Tone.ToneAudioBuffer.fromUrl(encodedUrl);
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
  _loopBank.LOOP_BANK.forEach(e => {
    if (!LOOP_BUFFERS[e.file]) console.warn('[audio] MISSING buffer:', e.file);
    else console.log('[audio] OK:', e.file, 'loaded=', LOOP_BUFFERS[e.file].loaded);
  });
}

// Live output level [0,1] for a module's ring pulse + waveform amplitude (0 if no meter).
function getModuleLevel(id) {
  const m = activeModules[id];
  if (!m || !m.meter) return 0;
  let db;
  try { db = m.meter.getValue(); } catch (_) { return 0; }
  if (Array.isArray(db)) db = db[0];      // stereo meter -> use first channel
  return _cableAnim.meterToUnit(db);
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
    const buf = entry && LOOP_BUFFERS[entry.file];
    console.log('[sampler] add id', id, 'loopIdx', loopIdx, 'file', entry && entry.file, 'buf?', !!buf, 'bufLoaded?', buf && buf.loaded, 'master?', !!master);
    if (buf) {
      try {
        const player = new Tone.Player(buf);
        player.loop = true;
        player.playbackRate = _loopBank.playbackRateFor(entry.bpm, Tone.Transport.bpm.value);
        player.connect(master);
        // Phase-sync (instant): start now but offset into the loop to the current grid
        // position, so it locks to the global bar grid without waiting for the next bar.
        const loopDur = buf.duration / player.playbackRate;        // real seconds per loop cycle
        const phase = (((Tone.Transport.seconds || 0) % loopDur) + loopDur) % loopDur;
        player.start(undefined, phase * player.playbackRate);      // offset is in buffer seconds
        node = player;
        meter = new Tone.Meter({ smoothing: 0.8 });
        player.connect(meter);
        console.log('[sampler] player started, state=', player.state, 'loaded=', player.buffer && player.buffer.loaded);
      } catch (e) {
        console.error('[sampler] player creation/start failed:', e);
      }
    } else {
      console.warn('[audio] Loop puck: no buffer for', entry && entry.file, '— serve over http (npm start) so loops can load.');
    }
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
  } else if (m.def.type === 'effect' && m.node) {
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
  } else if (m.def.type === 'global' && m.def.subtype === 'loopgroup') {
    _loopBank.setActiveGroup(m.def.getGroup(angle));
  }
}

// Swap a loop puck's buffer instantly, offset to the current grid position so the new
// loop stays phase-locked (keeps node identity so routing stays wired).
function _swapLoop(id, idx) {
  const m = activeModules[id];
  if (!m || !m.node) return;
  const entry = _loopBank.LOOP_BANK[idx];
  const buf = entry && LOOP_BUFFERS[entry.file];
  if (!buf) return;
  try {
    m.node.buffer = buf;
    m.node.playbackRate = _loopBank.playbackRateFor(entry.bpm, Tone.Transport.bpm.value);
    // A looping Player keeps playing its OLD buffer until the source is recreated;
    // restart() makes a fresh source so the new loop actually plays — offset to the
    // grid phase so the swapped loop comes in immediately, still aligned.
    const loopDur = buf.duration / m.node.playbackRate;
    const phase = (((Tone.Transport.seconds || 0) % loopDur) + loopDur) % loopDur;
    m.node.restart(undefined, phase * m.node.playbackRate);
    console.log('[audio] loop ->', entry.name);
  } catch (_) {}
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

// Execute a RoutingPlan: rewire only the audio chains that changed.
function applyRoutingPlan(plan) {
  if (!audioInitialized) return;
  _tonality = plan.tonality;

  // ---- audio chains (per-generator spatial routing) ----
  // Each generator's cable routes through whichever effects its path crosses.
  // Multiple generators can fan into the same effect node (Web Audio fan-in is valid).
  const nodeOf = (id) => (id === 'master' ? master : (activeModules[id] && activeModules[id].node));

  const seenGen = new Set();
  plan.chains.forEach(chain => {
    seenGen.add(chain.genId);
    const key = chain.nodeIds.join('>');
    if (_lastChainKeys[chain.genId] === key) return; // unchanged
    _lastChainKeys[chain.genId] = key;

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
    // Reconnect meter taps for all modules (n.disconnect() removes outgoing connections including the tap)
    chain.nodeIds.forEach(id => {
      if (id === 'master') return;
      const m = activeModules[id];
      if (m && m.meter) { try { nodeOf(id).connect(m.meter); } catch (_) {} }
    });
    console.log(`[audio] chain ${chain.nodeIds.join('->')}`);
  });
  Object.keys(_lastChainKeys).forEach(g => { if (!seenGen.has(Number(g))) delete _lastChainKeys[g]; });
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
window.getModuleLevel     = getModuleLevel;
window.getLoopPeaks       = getLoopPeaks;
