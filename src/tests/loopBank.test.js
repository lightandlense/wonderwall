const { test } = require('node:test');
const assert = require('node:assert');
const loopBank = require('../data/loopBank.js');

test('LOOP_BANK: every entry well-formed', () => {
  assert.ok(Array.isArray(loopBank.LOOP_BANK) && loopBank.LOOP_BANK.length >= 1);
  for (const e of loopBank.LOOP_BANK) {
    assert.ok(typeof e.name === 'string' && e.name.length > 0);
    assert.ok(e.file.startsWith('assets/loops/'));
    assert.ok(typeof e.bpm === 'number' && e.bpm > 0);
  }
});

test('playbackRateFor: ratio of current to loop bpm, guarded', () => {
  assert.strictEqual(loopBank.playbackRateFor(100, 110), 1.1);
  assert.strictEqual(loopBank.playbackRateFor(150, 150), 1);
  assert.strictEqual(loopBank.playbackRateFor(0, 110), 1);
  assert.strictEqual(loopBank.playbackRateFor(-5, 110), 1);
});
