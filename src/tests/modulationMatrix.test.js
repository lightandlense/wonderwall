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
  // threshold = 0.32 * 1920 = 614.4px; pucks 100px apart < threshold
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 100, wy: 100 },
    { def: { type: 'chords', color: '#00f' }, wx: 200, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(result.has('bass:chords'), 'expected bass:chords key');
  const mod = result.get('bass:chords');
  assert.ok(mod.depth > 0 && mod.depth <= 1, `depth should be (0,1], got ${mod.depth}`);
});

test('returns depth = 1 at zero distance', () => {
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 100, wy: 100 },
    { def: { type: 'chords', color: '#00f' }, wx: 100, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.strictEqual(result.get('bass:chords').depth, 1);
});

test('returns nothing when pucks beyond threshold', () => {
  // 0.32 * 1920 = 614.4px; 800px > threshold
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 0, wy: 100 },
    { def: { type: 'chords', color: '#00f' }, wx: 800, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(!result.has('bass:chords'), 'should not have bass:chords beyond threshold');
});

test('generates both directions for a pair', () => {
  const modules = [
    { def: { type: 'bass', color: '#0f0' }, wx: 100, wy: 100 },
    { def: { type: 'chords', color: '#00f' }, wx: 200, wy: 100 },
  ];
  const result = modulationMatrix.compute(modules, { w: 1920, h: 1080 });
  assert.ok(result.has('bass:chords'), 'bass:chords missing');
  assert.ok(result.has('chords:bass'), 'chords:bass missing');
});

test('getEdges returns correct structure', () => {
  const modulations = new Map([
    ['bass:chords', {
      depth: 0.7,
      srcType: 'bass', dstType: 'chords',
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

test('all 6 valid pair keys are recognized (no drummer)', () => {
  const types = ['bass', 'chords', 'lead'];
  const allValid = modulationMatrix.VALID_PAIRS;
  let count = 0;
  types.forEach(src => types.forEach(dst => {
    if (src !== dst) { assert.ok(allValid.has(`${src}:${dst}`), `missing pair ${src}:${dst}`); count++; }
  }));
  assert.strictEqual(count, 6);
  assert.strictEqual(allValid.size, 6, 'no drummer pairs should remain');
});
