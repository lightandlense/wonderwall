// Loads every browser <script> into ONE shared VM context, in index.html order,
// to mirror how classic scripts share a single top-level lexical scope.
// Per-module require() tests give each file its own scope and so CANNOT catch
// cross-file top-level `const`/`let`/`class` redeclaration collisions — this can.
const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function makeSandbox() {
  const sandbox = {};
  sandbox.window = sandbox;        // window === global, like a browser
  sandbox.globalThis = sandbox;
  sandbox.console = { log() {}, warn() {}, error() {} };
  sandbox.performance = { now: () => 0 };
  sandbox.requestAnimationFrame = () => {};
  sandbox.alert = () => {};

  // Connection-tracking stub: records the audio graph so tests can assert an
  // oscillator actually reaches the speaker (Destination), not just that nothing threw.
  const DEST = { __dest: true };
  const synths = [];
  const param = () => ({ rampTo() {}, value: 0 });
  class Node {
    constructor() { this._out = new Set(); }
    connect(t) { this._out.add(t); return this; }
    disconnect() { this._out.clear(); }
    toDestination() { this._out.add(DEST); return this; }
    dispose() {}
  }
  class Synth extends Node { constructor() { super(); this.frequency = param(); this.detune = param(); synths.push(this); } triggerAttack() {} triggerRelease() {} triggerAttackRelease() {} }
  class Volume extends Node { constructor() { super(); this.volume = param(); } }
  class Filter extends Node { constructor() { super(); this.frequency = param(); } }
  class FeedbackDelay extends Node { constructor() { super(); this.feedback = param(); } }
  class LFO extends Node { constructor() { super(); this.frequency = param(); } start() { return this; } set min(v) {} set max(v) {} }
  class Loop { constructor(cb) { this.cb = cb; } start() { return this; } }
  class Meter extends Node { constructor() { super(); } getValue() { return -100; } }
  class Player extends Node {
    constructor() { super(); this.playbackRate = 1; this.buffer = null; synths.push(this); }
    sync() { return this; } unsync() { return this; } start() { return this; } stop() { return this; } restart() { return this; }
  }
  const ToneAudioBuffer = { fromUrl: async () => ({ toArray: () => new Float32Array([0, 0.5, -0.5, 1, -1, 0.25]), duration: 2 }) };
  class Gain extends Node { constructor() { super(); } }
  class MembraneSynth extends Node { constructor() { super(); synths.push(this); } triggerAttackRelease() {} }
  class NoiseSynth extends Node { constructor() { super(); synths.push(this); } triggerAttackRelease() {} }
  class MetalSynth extends Node { constructor() { super(); synths.push(this); } triggerAttackRelease() {} }
  sandbox.Tone = { Synth, Volume, Filter, FeedbackDelay, LFO, Loop, Meter, Player, ToneAudioBuffer,
    Gain, MembraneSynth, NoiseSynth, MetalSynth,
    start: async () => {},
    Transport: { bpm: { value: 110, rampTo() {} }, start() {}, stop() {}, scheduleOnce(cb) { cb(); } } };

  // BFS over audio edges: does any oscillator reach Destination?
  sandbox.__synthReachesDest = () => synths.some(s => {
    const seen = new Set(); const q = [s];
    while (q.length) {
      const n = q.shift();
      if (n === DEST) return true;
      if (seen.has(n)) continue; seen.add(n);
      if (n && n._out) n._out.forEach(t => q.push(t));
    }
    return false;
  });

  return vm.createContext(sandbox);
}

// Same order as index.html's <script> tags (CDN libs excluded — pure app scripts).
const SCRIPTS = [
  'src/utils/angleSmoothing.js',
  'src/utils/tonality.js',
  'src/utils/rhythmPatterns.js',
  'src/utils/cableAnim.js',
  'src/data/loopBank.js',
  'src/data/drumGrooves.js',
  'src/data/bassLines.js',
  'src/data/chordProgressions.js',
  'src/services/moduleRegistry.js',
  'src/services/audioEngine.js',
  'src/components/visualEngine.js',
  'src/services/routingGraph.js',
];

function loadAll(ctx) {
  for (const rel of SCRIPTS) {
    const code = fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  }
}

test('all browser scripts load in one shared scope without redeclaration errors', () => {
  const ctx = makeSandbox();
  assert.doesNotThrow(() => loadAll(ctx), 'a top-level const/let/class collides across scripts');
  // Globals the frame loop depends on must be exposed.
  for (const name of ['reconcileModules', 'getActiveModules', 'applyRoutingPlan', 'routingGraph', 'visualEngine', 'MODULE_REGISTRY', 'getSeqPulses']) {
    assert.ok(ctx[name] !== undefined, `global '${name}' not exposed`);
  }
});

test('the per-frame handler does not throw (audio off and on, empty + osc/out markers)', async () => {
  const ctx = makeSandbox();
  loadAll(ctx);
  const fakeCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 1280, height: 720 } : k === 'createLinearGradient' ? (() => ({ addColorStop() {} })) : () => {}) });
  ctx.__fakeCtx = fakeCtx;
  vm.runInContext('visualEngine.init({getContext:()=>window.__fakeCtx},{getContext:()=>window.__fakeCtx})', ctx);
  vm.runInContext(`
    window.onMarkersDetected = function (detected) {
      reconcileModules(detected);
      const active = getActiveModules();
      const plan = routingGraph.update(active, { w: 1280, h: 720 });
      applyRoutingPlan(plan);
      updateModulation();
      const edges = routingGraph.getEdges(plan, active, { w: 1280, h: 720 });
      visualEngine.draw(detected, edges);
    };
  `, ctx);

  const osc = { id: 0, wx: 100, wy: 100, angle: 0, screenCorners: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] };
  const out = { id: 3, wx: 300, wy: 100, angle: 0, screenCorners: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] };
  const filt = { id: 1, wx: 200, wy: 100, angle: 0, screenCorners: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] };
  const lfo = { id: 4, wx: 210, wy: 130, angle: 0, screenCorners: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] };

  ctx.onMarkersDetected([]);          // audio off, no markers
  ctx.onMarkersDetected([osc, out]);  // audio off, markers present
  await vm.runInContext('initAudio()', ctx); // await so audioInitialized is set before the scenarios run

  assert.doesNotThrow(() => {
    for (let i = 0; i < 4; i++) ctx.onMarkersDetected([osc, out]); // audio on, debounce commits chain
    // LFO + osc + filter + output (the combo that froze): many frames, must stay clean
    for (let i = 0; i < 12; i++) ctx.onMarkersDetected([osc, filt, out, lfo]);
    // Sequencer + oscillator: exercises sequencer link, gating transitions, melodic walk path
    const seqM = { id: 6, wx: 110, wy: 130, angle: 0, screenCorners: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] };
    const ton5 = { id: 5, wx: 600, wy: 600, angle: 0, screenCorners: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] };
    for (let i = 0; i < 12; i++) ctx.onMarkersDetected([osc, seqM]);        // gates the oscillator
    for (let i = 0; i < 6; i++) ctx.onMarkersDetected([osc, seqM, ton5]);   // melodic walk active
    for (let i = 0; i < 4; i++) ctx.onMarkersDetected([osc]);               // sequencer removed -> resume drone
  });
});

test('oscillator + output produces an audio path that reaches the speaker', async () => {
  const ctx = makeSandbox();
  loadAll(ctx);
  const fakeCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 1280, height: 720 } : k === 'createLinearGradient' ? (() => ({ addColorStop() {} })) : () => {}) });
  ctx.__fakeCtx = fakeCtx;
  vm.runInContext('visualEngine.init({getContext:()=>window.__fakeCtx},{getContext:()=>window.__fakeCtx})', ctx);
  vm.runInContext(`
    window.onMarkersDetected = function (detected) {
      reconcileModules(detected);
      const active = getActiveModules();
      const plan = routingGraph.update(active, { w: 1280, h: 720 });
      applyRoutingPlan(plan);
    };
  `, ctx);
  await vm.runInContext('initAudio()', ctx); // await: audioInitialized is set on promise resolve

  const osc = { id: 0, wx: 100, wy: 100, angle: 0 };
  const out = { id: 3, wx: 300, wy: 100, angle: 0 };
  // Run enough frames for the routing debounce (CHAIN_HOLD_FRAMES) to commit osc->out.
  for (let i = 0; i < 6; i++) ctx.onMarkersDetected([osc, out]);

  assert.ok(ctx.__synthReachesDest(),
    'oscillator is not connected through to Destination — the output got disconnected from the speaker');
});

test('getModuleLevel / getLfoRate are exposed and return numbers', async () => {
  const ctx = makeSandbox();
  loadAll(ctx);
  const fakeCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 1280, height: 720 } : k === 'createLinearGradient' ? (() => ({ addColorStop() {} })) : () => {}) });
  ctx.__fakeCtx = fakeCtx;
  vm.runInContext('visualEngine.init({getContext:()=>window.__fakeCtx},{getContext:()=>window.__fakeCtx})', ctx);
  vm.runInContext(`window.onMarkersDetected = function (d) {
    reconcileModules(d); const a = getActiveModules();
    const p = routingGraph.update(a, { w: 1280, h: 720 }); applyRoutingPlan(p);
  };`, ctx);
  await vm.runInContext('initAudio()', ctx);

  const osc = { id: 0, wx: 100, wy: 100, angle: 0 };
  const lfo = { id: 4, wx: 200, wy: 120, angle: 0 };
  for (let i = 0; i < 3; i++) ctx.onMarkersDetected([osc, lfo]);

  const lvl = vm.runInContext('getModuleLevel(0)', ctx);
  assert.strictEqual(typeof lvl, 'number');
  assert.ok(lvl >= 0 && lvl <= 1, 'level in [0,1]');
  assert.strictEqual(vm.runInContext('getModuleLevel(999)', ctx), 0, 'unknown id -> 0');
  const rate = vm.runInContext('getLfoRate(4)', ctx);
  assert.strictEqual(typeof rate, 'number');
  assert.ok(rate >= 0.1 && rate <= 8, 'lfo rate within design range');
});

test('Drummer + Tempo pucks: drummer plays through master; groove rotates clean', async () => {
  const ctx = makeSandbox();
  loadAll(ctx);
  const fakeCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 1280, height: 720 } : k === 'createLinearGradient' ? (() => ({ addColorStop() {} })) : () => {}) });
  ctx.__fakeCtx = fakeCtx;
  vm.runInContext('visualEngine.init({getContext:()=>window.__fakeCtx},{getContext:()=>window.__fakeCtx})', ctx);
  vm.runInContext(`window.onMarkersDetected = function (d) {
    reconcileModules(d); const a = getActiveModules();
    const p = routingGraph.update(a, { w: 1280, h: 720 }); applyRoutingPlan(p);
    updateModulation();
    const edges = routingGraph.getEdges(p, a, { w: 1280, h: 720 });
    visualEngine.draw(d, edges);
  };`, ctx);
  await vm.runInContext('initAudio()', ctx);

  const drum = { id: 7, wx: 200, wy: 200, angle: 0, screenCorners: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] };
  const tempo = { id: 8, wx: 600, wy: 600, angle: 3, screenCorners: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] };
  for (let i = 0; i < 6; i++) ctx.onMarkersDetected([drum, tempo]);

  assert.ok(ctx.__synthReachesDest(), 'drummer should reach the master/destination');
  assert.strictEqual(vm.runInContext('typeof getModuleLevel(7)', ctx), 'number');
  // Rotate the drummer to a different groove — no throw.
  assert.doesNotThrow(() => {
    const drumRot = { id: 7, wx: 200, wy: 200, angle: Math.PI / 4, screenCorners: drum.screenCorners };
    for (let i = 0; i < 4; i++) ctx.onMarkersDetected([drumRot, tempo]);
  });
  assert.doesNotThrow(() => { for (let i = 0; i < 4; i++) ctx.onMarkersDetected([drum]); });
});
