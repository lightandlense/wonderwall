const { test } = require('node:test');
const assert = require('node:assert');
const routingGraph = require('../services/routingGraph.js');

const osc = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'oscillator' } });
const eff = (id, x, y, st) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'effect', subtype: st } });
const ton = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'global', subtype: 'tonality', getRoot: () => 0 } });

const VP = { w: 1000, h: 1000 }; // center (500,500); CONNECT_RADIUS=350

test('a lone oscillator always reaches the center master (always audible)', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 480, 480)], VP, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 'master']);
});

test('a far oscillator still reaches center (no distance gate)', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 10, 10)], VP, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 'master']);
});

test('an effect near the osc->center path inserts by proximity', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 200, 500), eff(1, 350, 500, 'filter')], VP, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 1, 'master']);
});

test('an effect farther from center than the osc is NOT inserted', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 450, 500), eff(1, 200, 500, 'filter')], VP, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 'master']);
});

test('tonality present -> plan carries active tonality state', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 500, 500), ton(5, 50, 50)], VP, new Set());
  assert.strictEqual(plan.tonality.active, true);
});

test('temporal debounce: chain commits after CHAIN_HOLD_FRAMES', () => {
  routingGraph.reset();
  const mods = [osc(0, 200, 500), eff(1, 350, 500, 'filter')];
  let plan;
  for (let i = 0; i < routingGraph.CONSTANTS.CHAIN_HOLD_FRAMES - 1; i++) {
    plan = routingGraph.update(mods, VP);
    assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 'master'], `frame ${i}: filter not committed yet`);
  }
  plan = routingGraph.update(mods, VP);
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 1, 'master']);
});

test('getEdges maps the master node to the center position', () => {
  const mods = [osc(0, 200, 500)];
  const plan = routingGraph.buildRawPlan(mods, VP, new Set());
  const edges = routingGraph.getEdges(plan, mods, VP);
  const audio = edges.find(e => e.kind === 'audio');
  assert.deepStrictEqual(audio.toPos, { x: 500, y: 500 });
});

test('getEdges: audio edges carry srcId and dstId', () => {
  const modules = [
    { id: 0, wx: 100, wy: 100, def: { id: 0, type: 'oscillator', subtype: undefined, color: '#44aaff' } },
    { id: 3, wx: 300, wy: 100, def: { id: 3, type: 'global', subtype: 'volume', color: '#ffcc44' } },
  ];
  const plan = { chains: [{ genId: 0, nodeIds: [0, 'master'] }], tonality: null, membership: {} };
  const edges = routingGraph.getEdges(plan, modules, { w: 1280, h: 720 });
  const audio = edges.find(e => e.kind === 'audio');
  assert.ok(audio, 'expected an audio edge');
  assert.strictEqual(audio.srcId, 0);
  assert.strictEqual(audio.dstId, 'master');
});

const samp = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'sampler' } });
test('buildRawPlan: a sampler is a generator (gets a chain to master)', () => {
  const plan = routingGraph.buildRawPlan([samp(7, 480, 480)], VP, new Set());
  assert.strictEqual(plan.chains.length, 1);
  assert.deepStrictEqual(plan.chains[0].nodeIds, [7, 'master']);
});

test('buildRawPlan: a filter inserts on a sampler chain', () => {
  const plan = routingGraph.buildRawPlan([samp(7, 200, 500), eff(1, 350, 500, 'filter')], VP, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [7, 1, 'master']);
});

test('buildRawPlan: oscillator is the sole generator type (chain to master)', () => {
  const oscMod = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'oscillator' } });
  const p = routingGraph.buildRawPlan([oscMod(0, 480, 480)], VP, new Set());
  assert.deepStrictEqual(p.chains[0].nodeIds, [0, 'master']);
});
