const { test } = require('node:test');
const assert = require('node:assert');
const modulationMatrix = require('../services/modulationMatrix.js');

test('returns empty map when no modules', () => {
  const result = modulationMatrix.compute([], { w: 1920, h: 1080 });
  assert.ok(result instanceof Map);
  assert.strictEqual(result.size, 0);
});

test('ignores non-band puck types (controller, effect, global)', () => {
  const modules = [
    { def: { type: 'controller', color: '#aaa' }, wx: 100, wy: 100 },
    { def: { type: 'effect', color: '#bbb' }, wx: 110, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.strictEqual(result.size, 0);
});

test('returns depth > 0 when two band pucks are within threshold', () => {
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 100, wy: 100 },
    { def: { type: 'lead', color: '#00f' }, wx: 200, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(result.has('bass:lead'), 'expected bass:lead key');
  const mod = result.get('bass:lead');
  assert.ok(mod.depth > 0 && mod.depth <= 1, `depth should be (0,1], got ${mod.depth}`);
});

test('returns depth = 1 at zero distance', () => {
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 100, wy: 100 },
    { def: { type: 'lead', color: '#00f' }, wx: 100, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.strictEqual(result.get('bass:lead').depth, 1);
});

test('returns nothing when pucks beyond threshold', () => {
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 0, wy: 100 },
    { def: { type: 'lead', color: '#00f' }, wx: 800, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(!result.has('bass:lead'), 'should not have bass:lead beyond threshold');
});

test('generates both directions for a pair', () => {
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 100, wy: 100 },
    { def: { type: 'lead', color: '#00f' }, wx: 200, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(result.has('bass:lead'), 'bass:lead missing');
  assert.ok(result.has('lead:bass'), 'lead:bass missing');
});

test('getEdges returns correct structure', () => {
  const modulations = new Map([
    ['bass:lead', {
      depth: 0.7,
      srcType: 'bass', dstType: 'lead',
      srcPos: { wx: 100, wy: 200 }, dstPos: { wx: 300, wy: 400 },
      srcColor: '#0f0', dstColor: '#00f',
    }],
  ]);
  const edges = modulationMatrix.getEdges(modulations);
  assert.strictEqual(edges.length, 1);
  assert.strictEqual(edges[0].kind, 'modulation');
  assert.strictEqual(edges[0].depth, 0.7);
  assert.deepStrictEqual(edges[0].fromPos, { x: 100, y: 200 });
  assert.deepStrictEqual(edges[0].toPos, { x: 300, y: 400 });
  assert.strictEqual(edges[0].srcColor, '#0f0');
});

test('only the 2 bass/lead pairs remain (no drummer, no chords)', () => {
  const types = ['bass', 'lead'];
  const allValid = modulationMatrix.VALID_PAIRS;
  let count = 0;
  types.forEach(src => types.forEach(dst => {
    if (src !== dst) { assert.ok(allValid.has(`${src}:${dst}`), `missing pair ${src}:${dst}`); count++; }
  }));
  assert.strictEqual(count, 2);
  assert.strictEqual(allValid.size, 2, 'no chords/drummer pairs should remain');
});
