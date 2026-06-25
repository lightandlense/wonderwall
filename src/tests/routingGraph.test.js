const { test } = require('node:test');
const assert = require('node:assert');
const routingGraph = require('../services/routingGraph.js');

// Minimal module stubs; def only needs `type`/`subtype`.
const osc = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'oscillator' } });
const out = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'output' } });
const eff = (id, x, y, st) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'effect', subtype: st } });
const lfo = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'controller', subtype: 'lfo' } });
const ton = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'global', subtype: 'tonality', getRoot: () => 0 } });

const SW = 1000; // screenWidth -> PATCH_RADIUS=350, CONTROL_RADIUS=300

test('osc near output with no effects -> direct chain', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 100, 100), out(3, 300, 100)], SW, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 3]);
  assert.strictEqual(plan.chains[0].outputId, 3);
});

test('osc with NO output in range -> silent chain (no outputId)', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 0, 0), out(3, 900, 0)], SW, new Set());
  assert.strictEqual(plan.chains[0].outputId, null);
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0]);
});

test('effect on the cable is inserted; off the cable is not', () => {
  // cable (0,0)->(300,0) is within PATCH_RADIUS(350). filter on it; delay far.
  const mods = [osc(0, 0, 0), out(3, 300, 0), eff(1, 150, 10, 'filter'), eff(2, 150, 300, 'delay')];
  const plan = routingGraph.buildRawPlan(mods, SW, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 1, 3]);
});

test('two on-cable effects ordered by projection t', () => {
  // filter at x=225 (t~0.75), delay at x=75 (t~0.25): chain order delay then filter
  const mods = [osc(0, 0, 0), out(3, 300, 0), eff(1, 225, 5, 'filter'), eff(2, 75, 5, 'delay')];
  const plan = routingGraph.buildRawPlan(mods, SW, new Set());
  assert.deepStrictEqual(plan.chains[0].nodeIds, [0, 2, 1, 3]);
});

test('spatial hysteresis: effect between BAND_ADD and BAND_KEEP stays only if previously a member', () => {
  // perpendicular distance 80 is > BAND_ADD(60) and < BAND_KEEP(95)
  const mods = [osc(0, 0, 0), out(3, 300, 0), eff(1, 150, 80, 'filter')];
  const fresh = routingGraph.buildRawPlan(mods, SW, new Set());
  assert.deepStrictEqual(fresh.chains[0].nodeIds, [0, 3]); // not joined (needs <60)
  const sticky = routingGraph.buildRawPlan(mods, SW, new Set(['0:1']));
  assert.deepStrictEqual(sticky.chains[0].nodeIds, [0, 1, 3]); // stays (was member, <95)
});

test('LFO links to nearest audio module, never to output', () => {
  const mods = [osc(0, 0, 0), out(3, 400, 0), eff(1, 200, 0, 'filter'), lfo(4, 210, 30)];
  const plan = routingGraph.buildRawPlan(mods, SW, new Set(['0:1']));
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
