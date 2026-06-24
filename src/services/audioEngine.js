// src/services/audioEngine.js
// Tone.js module lifecycle: add on marker appear, remove on marker gone,
// update params from smoothed rotation each detection frame.

// Detection cycles a module survives without being re-detected before removal.
// 2 cycles ≈ 6 rAF frames ≈ 100ms at 60fps — absorbs single-frame dropouts.
const PROP_MISS_CYCLES = 2;

// activeModules[id] = { def, node, smoother, missCount, lastPos: {wx, wy} }
const activeModules = {};

let audioInitialized = false;

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
    const freq = def.getFreq(smoother.get());
    const synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.1, decay: 0, sustain: 1, release: 0.3 },
    }).toDestination();
    synth.triggerAttack(freq);
    node = synth;
  } else if (def.type === 'output') {
    // Phase 1: output module controls master volume via a Tone.Volume node.
    // In Phase 2 the patch graph will route oscillators through it.
    const vol = new Tone.Volume(def.getVolDb(smoother.get())).toDestination();
    node = vol;
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
    const freq = m.def.getFreq(angle);
    // 50ms ramp — smooths pitch between detection frames without perceptible lag
    m.node.frequency.rampTo(freq, 0.05);
  } else if (m.def.type === 'output' && m.node) {
    m.node.volume.rampTo(m.def.getVolDb(angle), 0.05);
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

window.initAudio         = initAudio;
window.reconcileModules  = reconcileModules;
window.getModuleParam    = getModuleParam;
window.getActiveModules  = getActiveModules;
