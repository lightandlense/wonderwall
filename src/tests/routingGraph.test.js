const { test } = require('node:test');
const assert = require('node:assert');
const routingGraph = require('../services/routingGraph.js');

// Minimal module stubs; def only needs `type`/`subtype`.
const osc = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'oscillator' } });
const out = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'output' } });
const eff = (id, x, y, st) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'effect', subtype: st } });
const lfo = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'controller', subtype: 'lfo' } });
const ton = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'global', subtype: 'tonality', getRoot: () => 0 } });

const SW = 1000; // screenWidth -> CONNECT_RADIUS=350, KEEP=437.5, CONTROL_RADIUS=300

test('osc near output with no effects -> direct chain', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 100, 100), out(3, 300, 100)], SW, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 3]);
  assert.strictEqual(plan.chains[0].outputId, 3);
});

test('osc that cannot reach any output -> silent chain (no outputId)', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 0, 0), out(3, 900, 0)], SW, new Set());
  assert.strictEqual(plan.chains[0].outputId, null);
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0]);
});

test('effect OFF the straight line still inserts by proximity (nearest-neighbor behavior)', () => {
  // filter sits 180px off the osc->out line; on-the-cable would have rejected it.
  const mods = [osc(0, 0, 0), out(3, 300, 0), eff(1, 150, 180, 'filter')];
  const plan = routingGraph.buildRawPlan(mods, SW, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 1, 3]);
});

test('effect behind the oscillator (not closer to output) is NOT inserted', () => {
  const mods = [osc(0, 0, 0), out(3, 300, 0), eff(1, -100, 0, 'filter')];
  const plan = routingGraph.buildRawPlan(mods, SW, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 3]);
});

test('two effects chain in proximity order toward the output', () => {
  // out is 600px away (>CONNECT_RADIUS) so the chain must bridge: osc->filter->delay->out
  const mods = [osc(0, 0, 0), out(3, 600, 0), eff(1, 200, 0, 'filter'), eff(2, 400, 0, 'delay')];
  const plan = routingGraph.buildRawPlan(mods, SW, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 1, 2, 3]);
});

test('spatial hysteresis: a hop between CONNECT_RADIUS and KEEP holds only if already connected', () => {
  // osc->filter hop is 360px: > CONNECT_RADIUS(350), < KEEP(437.5). out unreachable directly.
  const mods = [osc(0, 0, 0), out(3, 700, 0), eff(1, 360, 0, 'filter')];
  const fresh = routingGraph.buildRawPlan(mods, SW, new Set());
  assert.deepStrictEqual(fresh.chains[0].nodeIds, [0], 'fresh: hop too far to join');
  const sticky = routingGraph.buildRawPlan(mods, SW, new Set(['0:1', '0:out']));
  assert.deepStrictEqual(sticky.chains[0].nodeIds, [0, 1, 3], 'sticky: stays connected within KEEP');
});

test('LFO links to nearest audio module, never to output', () => {
  const mods = [osc(0, 0, 0), out(3, 300, 0), eff(1, 150, 0, 'filter'), lfo(4, 160, 30)];
  const plan = routingGraph.buildRawPlan(mods, SW, new Set());
  assert.deepStrictEqual(plan.controlLinks, [{ lfoId: 4, targetId: 1 }]);
});

test('tonality present -> plan carries active tonality state', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 0, 0), ton(5, 50, 50)], SW, new Set());
  assert.strictEqual(plan.tonality.active, true);
  assert.strictEqual(plan.tonality.scale, 'minorPentatonic');
});

test('temporal debounce: a new chain commits only after CHAIN_HOLD_FRAMES updates', () => {
  routingGraph.reset();
  const mods = [osc(0, 0, 0), out(3, 300, 0)];
  let plan;
  for (let i = 0; i < routingGraph.CONSTANTS.CHAIN_HOLD_FRAMES - 1; i++) {
    plan = routingGraph.update(mods, SW);
    assert.deepStrictEqual(plan.chains[0].nodeIds, [0], `frame ${i} not yet committed`);
  }
  plan = routingGraph.update(mods, SW); // reaches the threshold
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 3]);
});
