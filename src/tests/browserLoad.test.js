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
  class Synth extends Node { constructor() { super(); this.frequency = param(); this.detune = param(); synths.push(this); } triggerAttack() {} triggerRelease() {} }
  class Volume extends Node { constructor() { super(); this.volume = param(); } }
  class Filter extends Node { constructor() { super(); this.frequency = param(); } }
  class FeedbackDelay extends Node { constructor() { super(); this.feedback = param(); } }
  class LFO extends Node { constructor() { super(); this.frequency = param(); } start() { return this; } set min(v) {} set max(v) {} }
  sandbox.Tone = { Synth, Volume, Filter, FeedbackDelay, LFO, start: async () => {} };

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
  'src/utils/geometry.js',
  'src/utils/tonality.js',
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
  for (const name of ['reconcileModules', 'getActiveModules', 'applyRoutingPlan', 'routingGraph', 'visualEngine', 'MODULE_REGISTRY']) {
    assert.ok(ctx[name] !== undefined, `global '${name}' not exposed`);
  }
});

test('the per-frame handler does not throw (audio off and on, empty + osc/out markers)', () => {
  const ctx = makeSandbox();
  loadAll(ctx);
  const fakeCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 1280, height: 720 } : () => {}) });
  ctx.__fakeCtx = fakeCtx;
  vm.runInContext('visualEngine.init({getContext:()=>window.__fakeCtx},{getContext:()=>window.__fakeCtx})', ctx);
  vm.runInContext(`
    window.onMarkersDetected = function (detected) {
      reconcileModules(detected);
      const active = getActiveModules();
      const plan = routingGraph.update(active, 1280);
      applyRoutingPlan(plan);
      const edges = routingGraph.getEdges(plan, active);
      visualEngine.draw(detected, edges);
    };
  `, ctx);

  const osc = { id: 0, wx: 100, wy: 100, angle: 0, screenCorners: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] };
  const out = { id: 3, wx: 300, wy: 100, angle: 0, screenCorners: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] };

  assert.doesNotThrow(() => {
    ctx.onMarkersDetected([]);          // audio off, no markers
    ctx.onMarkersDetected([osc, out]);  // audio off, markers present
    vm.runInContext('initAudio()', ctx);
    for (let i = 0; i < 4; i++) ctx.onMarkersDetected([osc, out]); // audio on, debounce commits chain
  });
});

test('oscillator + output produces an audio path that reaches the speaker', async () => {
  const ctx = makeSandbox();
  loadAll(ctx);
  const fakeCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 1280, height: 720 } : () => {}) });
  ctx.__fakeCtx = fakeCtx;
  vm.runInContext('visualEngine.init({getContext:()=>window.__fakeCtx},{getContext:()=>window.__fakeCtx})', ctx);
  vm.runInContext(`
    window.onMarkersDetected = function (detected) {
      reconcileModules(detected);
      const active = getActiveModules();
      const plan = routingGraph.update(active, 1280);
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
