const { test } = require('node:test');
const assert = require('node:assert');
const geometry = require('../utils/geometry.js');

test('point on the segment midpoint: t=0.5, dist=0', () => {
  const r = geometry.pointToSegment(5, 0, 0, 0, 10, 0);
  assert.ok(Math.abs(r.t - 0.5) < 1e-9);
  assert.ok(Math.abs(r.dist - 0) < 1e-9);
});

test('point perpendicular to midpoint: t=0.5, dist=perp', () => {
  const r = geometry.pointToSegment(5, 4, 0, 0, 10, 0);
  assert.ok(Math.abs(r.t - 0.5) < 1e-9);
  assert.ok(Math.abs(r.dist - 4) < 1e-9);
});

test('point beyond endpoint B clamps to t=1', () => {
  const r = geometry.pointToSegment(20, 0, 0, 0, 10, 0);
  assert.strictEqual(r.t, 1);
  assert.ok(Math.abs(r.dist - 10) < 1e-9);
});

test('point before endpoint A clamps to t=0', () => {
  const r = geometry.pointToSegment(-5, 0, 0, 0, 10, 0);
  assert.strictEqual(r.t, 0);
  assert.ok(Math.abs(r.dist - 5) < 1e-9);
});

test('zero-length segment returns distance to the point', () => {
  const r = geometry.pointToSegment(3, 4, 0, 0, 0, 0);
  assert.strictEqual(r.t, 0);
  assert.ok(Math.abs(r.dist - 5) < 1e-9);
});
