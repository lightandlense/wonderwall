const { test } = require('node:test');
const assert = require('node:assert');
const routingGraph = require('../services/routingGraph.js');

const osc = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'oscillator' } });
const eff = (id, x, y, st) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'effect', subtype: st } });
const lfo = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'controller', subtype: 'lfo' } });
const seq = (id, x, y) => ({ id, wx: x, wy: y, angle: 0, def: { type: 'controller', subtype: 'sequencer' } });
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

test('LFO links to nearest oscillator or effect', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 200, 500), eff(1, 350, 500, 'filter'), lfo(4, 360, 520)], VP, new Set());
  assert.deepStrictEqual(plan.controlLinks, [{ controllerId: 4, targetId: 1 }]);
});

test('Sequencer links to nearest OSCILLATOR only (never an effect)', () => {
  const plan = routingGraph.buildRawPlan([osc(0, 200, 500), eff(1, 350, 500, 'filter'), seq(6, 360, 520)], VP, new Set());
  assert.deepStrictEqual(plan.controlLinks, [{ controllerId: 6, targetId: 0 }]);
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
