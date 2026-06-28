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
const _drumGrooves = (typeof require === 'function') ? require('../data/drumGrooves.js') : window.drumGrooves;
const _bassLines = (typeof require === 'function') ? require('../data/bassLines.js') : window.bassLines;
const _chordProgs = (typeof require === 'function') ? require('../data/chordProgressions.js') : window.chordProgressions;
const _melodyLines = (typeof require === 'function') ? require('../data/melodyLines.js') : window.melodyLines;
const BASS_BASE_FREQ = 65.41;    // C2 anchor for the bass register
const CHORD_BASE_FREQ = 261.63;  // C4 anchor for the chord pad
const LEAD_BASE_FREQ = 523.25;   // C5 anchor for the lead (sits above bass + pad)
const DEFAULT_ROOT = 0;          // C, when no Tonality puck is present
const LOOP_BUFFERS = {};   // file -> Tone.ToneAudioBuffer
const LOOP_PEAKS = {};     // file -> number[] peak envelope

// Build the three drum voices for a Drummer puck, mixed into one output node.
function _makeDrums() {
  const out = new Tone.Gain();
  const kick = new Tone.MembraneSynth({ octaves: 6, pitchDecay: 0.05, envelope: { attack: 0.001, decay: 0.4, sustain: 0 } });
  const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.18, sustain: 0 }, volume: -6 });
  const hat = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.06, release: 0.01 }, harmonicity: 5.1, modulationIndex: 32, resonance: 6000, octaves: 1.5, volume: -18 });
  kick.connect(out); snare.connect(out); hat.connect(out);
  return { out, kick, snare, hat };
}

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
  Tone.Transport.bpm.value = 128;               // BPM — EDM default
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

// Fired once per 16th note by the Transport loop: each active sequencer fires
// its target on hit steps — pulses an oscillator, or stutter-retriggers a loop.
function _onStep(time) {
  _step = (_step + 1) % _rhythm.STEPS;

  // --- Cross-modulation: gather this-step intent for all band pucks ---
  let _xm_kickFired = false, _xm_snareFired = false;
  let _xm_chordDeg = null, _xm_bassDeg = null, _xm_melodyDeg = null;
  let _xm_bassStepCount = 0;

  Object.values(activeModules).forEach(m => {
    if (m.def.type === 'drummer') {
      const groove = _drumGrooves.DRUM_GROOVES[m.presetIdx];
      if (groove) {
        if (groove.kick[_step]) _xm_kickFired = true;
        if (groove.snare[_step]) _xm_snareFired = true;
      }
    } else if (m.def.type === 'bass') {
      const line = _bassLines.BASS_LINES[m.presetIdx];
      const d = line && line.steps[_step];
      if (d != null) _xm_bassDeg = d;
      if (line) _xm_bassStepCount = line.steps.filter(s => s != null).length;
    } else if (m.def.type === 'chords') {
      const prog = _chordProgs.CHORD_PROGRESSIONS[m.presetIdx];
      const d = prog && prog.steps[_step];
      if (d != null) _xm_chordDeg = d;
    } else if (m.def.type === 'lead') {
      const mel = _melodyLines.MELODY_LINES[m.presetIdx];
      const d = mel && mel.steps[_step];
      if (d != null) _xm_melodyDeg = d;
    }
  });

  // Chord-change detection for fill trigger (Chords → Drums: chord change = fill)
  if (_xm_chordDeg !== null && _xm_chordDeg !== _modState.prevChordDeg) {
    const depth = _modDepth('chords', 'drummer');
    if (depth > 0) _modState.fillStepsRemaining = Math.round(4 * depth);
    _modState.prevChordDeg = _xm_chordDeg;
  }
  if (_modState.fillStepsRemaining > 0) _modState.fillStepsRemaining--;
  const _xm_inFill = _modState.fillStepsRemaining > 0;

  // Melody contour tracking (Melody → Bass)
  if (_xm_melodyDeg != null) {
    _modState.melodyHistory.push(_xm_melodyDeg);
    if (_modState.melodyHistory.length > 3) _modState.melodyHistory.shift();
  }
  const _xm_melodyAscending = _modState.melodyHistory.length >= 2
    && _modState.melodyHistory[_modState.melodyHistory.length - 1] > _modState.melodyHistory[0];

  Object.keys(_activeLinks).forEach(cidStr => {
    const cid = Number(cidStr);
    const ctrl = activeModules[cid];
    if (!ctrl || ctrl.def.subtype !== 'sequencer') return;
    const tgt = activeModules[_activeLinks[cid]];
    if (!tgt || !tgt.node) return;
    const pat = _rhythm.PATTERNS[ctrl.def.getPatternIndex(ctrl.smoother.get())];
    if (!pat || !pat.steps[_step]) return;
    _seqPulses[cid] = (typeof performance !== 'undefined') ? performance.now() : 0; // for cable pulse anim

    if (tgt.def.type === 'sampler') {
      try { tgt.node.restart(time); } catch (_) {}   // stutter: retrigger the loop from the start
      return;
    }
    if (tgt.def.type !== 'oscillator') return;
    let freq;
    if (_tonality && _tonality.active) {
      const idx = (_seqIndex[cid] || 0);
      freq = _tonalityUtil.scaleDegreeFreq(tgt.def.getFreq(tgt.smoother.get()), _tonality.root, idx);
      _seqIndex[cid] = idx + 1;
    } else {
      freq = _oscFreq(tgt.def, tgt.smoother.get());
    }
    try { tgt.node.triggerAttackRelease(freq, '16n', time); } catch (_) {}
  });

  // Drummer pucks play their own groove on every step (self-contained drum machine).
  Object.keys(activeModules).forEach(idStr => {
    const m = activeModules[idStr];
    if (!m || m.def.type !== 'drummer' || !m.drums) return;
    const groove = _drumGrooves.DRUM_GROOVES[m.presetIdx];
    if (!groove) return;
    if (groove.kick[_step])  { try { m.drums.kick.triggerAttackRelease('C1', '8n', time); } catch (_) {} }

    // Snare: normal groove + fill injection (Chords → Drums: chord change = fill)
    const snareHit = groove.snare[_step] || (_xm_inFill && _step % 4 === 2);
    if (snareHit) { try { m.drums.snare.triggerAttackRelease('16n', time); } catch (_) {} }

    // Hat: normal groove
    //   + melody-driven hat (Melody → Drums: each melody note gates a hat)
    //   + bass-density hat (Bass → Drums: busy bass adds extra hat probability)
    const extraHatChance = _modDepth('bass', 'drummer') * (_xm_bassStepCount / 16);
    const hatFromBass = Math.random() < extraHatChance;
    const hatFromMelody = _modDepth('lead', 'drummer') > 0 && _xm_melodyDeg != null;

    if (groove.hat[_step] || hatFromMelody || hatFromBass) {
      try { m.drums.hat.triggerAttackRelease('32n', time); } catch (_) {}
    }
  });

  // Bass + Chords pucks: self-play their selected preset each step, voiced in the Tonality key.
  const _root = (_tonality && _tonality.active) ? _tonality.root : DEFAULT_ROOT;
  Object.keys(activeModules).forEach(idStr => {
    const m = activeModules[idStr];
    if (!m || !m.node) return;
    if (m.def.type === 'bass') {
      const line = _bassLines.BASS_LINES[m.presetIdx];
      let deg = line && line.steps[_step];
      if (deg == null) return;

      // Chords → Bass: chord root gravity — bias bass note toward chord root
      if (_modDepth('chords', 'bass') > 0 && _xm_chordDeg != null
          && Math.random() < _modDepth('chords', 'bass')) {
        deg = _xm_chordDeg;
      }

      // Melody → Bass: ascending melody lifts bass an octave
      const octShift = (_modDepth('lead', 'bass') > 0.5 && _xm_melodyAscending
        && _modState.melodyHistory.length >= 2) ? 7 : 0;

      // Drums → Bass: velocity boost on kick steps (lower on non-kick steps)
      const dDepth = _modDepth('drummer', 'bass');
      const vel = dDepth > 0 ? (_xm_kickFired ? 1.0 : Math.max(0.3, 1.0 - dDepth * 0.6)) : 1;

      try { m.node.triggerAttackRelease(
        _tonalityUtil.scaleDegreeFreq(BASS_BASE_FREQ, _root, deg + octShift),
        '8n', time, vel,
      ); } catch (_) {}

    } else if (m.def.type === 'chords') {
      const prog = _chordProgs.CHORD_PROGRESSIONS[m.presetIdx];
      let d = prog && prog.steps[_step];

      // Drums → Chords: retrigger current chord on snare steps (even if not a chord step)
      if (d == null && _modDepth('drummer', 'chords') > 0 && _xm_snareFired
          && _modState.prevChordDeg != null) {
        d = _modState.prevChordDeg;
      }
      if (d == null) return;

      // Bass → Chords: bass rotation spreads the top chord note upward
      let topDeg = d + 4;
      const bCDepth = _modDepth('bass', 'chords');
      if (bCDepth > 0) {
        const bm = Object.values(activeModules).find(x => x.def.type === 'bass');
        if (bm) {
          const bassT = bm.smoother.get() / (2 * Math.PI); // [0,1]
          topDeg += Math.round(bassT * bCDepth * 7);        // spread up to one extra octave
        }
      }

      // Melody → Chords: inversion that puts melody note on top
      if (_modDepth('lead', 'chords') > 0.5 && _xm_melodyDeg != null
          && _xm_melodyDeg > topDeg) {
        topDeg = topDeg + 7; // raise top note one octave to sit above melody
      }

      const freqs = [d, d + 2, topDeg].map(
        x => _tonalityUtil.scaleDegreeFreq(CHORD_BASE_FREQ, _root, x)
      );
      try { m.node.triggerAttackRelease(freqs, '2n', time); } catch (_) {}

    } else if (m.def.type === 'lead') {
      const mel = _melodyLines.MELODY_LINES[m.presetIdx];
      let deg = mel && mel.steps[_step];
      if (deg == null) return;

      // Drums → Melody: kick gates melody — skip this step if kick didn't fire
      if (_modDepth('drummer', 'lead') > 0 && !_xm_kickFired
          && Math.random() < _modDepth('drummer', 'lead')) return;

      // Bass → Melody: bass root pulls melody toward unison (one octave above bass)
      if (_modDepth('bass', 'lead') > 0 && _xm_bassDeg != null
          && Math.random() < _modDepth('bass', 'lead')) {
        deg = _xm_bassDeg + 7; // same scale degree, one octave up
      }

      // Chords → Melody: snap to nearest chord tone
      if (_modDepth('chords', 'lead') > 0 && _xm_chordDeg != null
          && Math.random() < _modDepth('chords', 'lead')) {
        const tones = [_xm_chordDeg, _xm_chordDeg + 2, _xm_chordDeg + 4];
        deg = tones.reduce((best, t) =>
          Math.abs(t - deg) < Math.abs(best - deg) ? t : best, tones[0]
        );
      }

      try { m.node.triggerAttackRelease(
        _tonalityUtil.scaleDegreeFreq(LEAD_BASE_FREQ, _root, deg), '8n', time
      ); } catch (_) {}
    }
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
  let drums = null;
  let presetIdx = 0;

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
    console.log('[sampler] add id', id, 'loopIdx', loopIdx, 'file', entry && entry.file, 'buf?', !!buf, 'bufLoaded?', buf && buf.loaded, 'master?', !!master);
    if (buf) {
      try {
        const player = new Tone.Player(buf);
        player.loop = true;
        player.playbackRate = _loopBank.playbackRateFor(entry.bpm, Tone.Transport.bpm.value);
        player.connect(master);
        player.start();
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
  } else if (def.type === 'drummer') {
    presetIdx = def.getGrooveIndex(smoother.get());
    drums = _makeDrums();           // kick/snare/hat -> drums.out; _onStep triggers them
    node = drums.out;               // routing connects this to the center master
    meter = new Tone.Meter({ smoothing: 0.8 });
    node.connect(meter);
  } else if (def.type === 'bass') {
    presetIdx = def.getLineIndex(smoother.get());
    node = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { type: 'lowpass', Q: 2 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.2 },
      filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2, baseFrequency: 80, octaves: 2.6 },
      volume: -10,
    });
    meter = new Tone.Meter({ smoothing: 0.8 });
    node.connect(meter);
  } else if (def.type === 'chords') {
    presetIdx = def.getProgIndex(smoother.get());
    node = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.3, decay: 0.2, sustain: 0.7, release: 0.8 },
      volume: -16,
    });
    meter = new Tone.Meter({ smoothing: 0.8 });
    node.connect(meter);
  } else if (def.type === 'lead') {
    presetIdx = def.getMelodyIndex(smoother.get());
    node = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.12, sustain: 0.25, release: 0.18 },
      volume: -16,
    });
    meter = new Tone.Meter({ smoothing: 0.8 });
    node.connect(meter);
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
    drums,
    presetIdx,
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
  if (m.drums) { ['kick', 'snare', 'hat', 'out'].forEach(k => { try { m.drums[k].dispose(); } catch (_) {} }); }

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
  } else if (m.def.type === 'effect' && m.node && !_lfoTargets.has(m.def.id)) {
    // While an LFO drives this effect, its rotation feeds the LFO window instead
    // (handled in applyRoutingPlan), so skip the direct ramp to avoid fighting it.
    m.def.applyParam(m.node, m.def.getParamT(angle));
  } else if (m.def.type === 'sampler' && m.node) {
    const idx = m.def.getLoopIndex(angle);
    if (idx !== m.loopIdx) { m.loopIdx = idx; _swapLoop(id, idx); }
    // While an LFO drives this loop, it owns playbackRate (wobble) — don't fight it.
    if (!_lfoTargets.has(m.def.id)) {
      const entry = _loopBank.LOOP_BANK[m.loopIdx];
      if (entry) m.node.playbackRate = _loopBank.playbackRateFor(entry.bpm, Tone.Transport.bpm.value);
    }
  } else if (m.def.type === 'drummer') {
    m.presetIdx = m.def.getGrooveIndex(angle);   // rotation picks the groove; _onStep reads it
  } else if (m.def.type === 'bass') {
    m.presetIdx = m.def.getLineIndex(angle);
  } else if (m.def.type === 'chords') {
    m.presetIdx = m.def.getProgIndex(angle);
  } else if (m.def.type === 'lead') {
    m.presetIdx = m.def.getMelodyIndex(angle);
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

// Cross-modulation state (Phase 9)
let _modulations = new Map();          // set each detection frame by setModulations()
const _modState = {
  prevChordDeg: null,                  // tracks chord changes for fill triggering
  fillStepsRemaining: 0,               // countdown: how many steps the fill lasts
  melodyHistory: [],                   // last 3 melody degrees for contour detection
};

function setModulations(map) { _modulations = map || new Map(); }
function _modDepth(src, dst) {
  const m = _modulations.get(`${src}:${dst}`);
  return m ? m.depth : 0;
}

// Apply one LFO's modulation to its target's parameter (JS-driven, option B:
// the target's rotation sets the center; the LFO oscillates around it).
function _applyLfoMod(lfoMod, tgt, s) {
  const t = tgt.def.getParamT(tgt.smoother.get());
  try {
    if (tgt.def.type === 'oscillator') {
      tgt.node.detune.rampTo(30 * s, 0.02);                          // +-30 cents vibrato
    } else if (tgt.def.type === 'sampler') {
      const entry = _loopBank.LOOP_BANK[tgt.loopIdx];
      const base = entry ? _loopBank.playbackRateFor(entry.bpm, Tone.Transport.bpm.value) : 1;
      tgt.node.playbackRate = base * Math.pow(2, 0.5 * s);           // +-half-octave speed/pitch wobble
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
  // Gate transitions: newly sequenced target goes quiet (osc stops droning, loop stops
  // free-running so _onStep can stutter it); un-sequenced resumes.
  // Only oscillators are gated (drone off while sequenced). A sampler keeps its synced
  // free-run playing — _onStep retriggers it in place (restart), the same call loop-swap
  // uses successfully. Stopping it here is what made it go silent, so we don't.
  nowSeq.forEach(tid => {
    if (!_sequencedOscs.has(tid)) {
      const m = activeModules[tid];
      if (m && m.node && m.def.type === 'oscillator') { try { m.node.triggerRelease(); } catch (_) {} }
    }
  });
  _sequencedOscs.forEach(tid => {
    if (!nowSeq.has(tid)) {
      const m = activeModules[tid];
      if (m && m.node && m.def.type === 'oscillator') {
        try { m.node.triggerAttack(_oscFreq(m.def, m.smoother.get())); } catch (_) {}
      }
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
window.setModulations     = setModulations;
window.getLoopPeaks       = getLoopPeaks;
