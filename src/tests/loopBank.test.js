const { test } = require('node:test');
const assert = require('node:assert');
const loopBank = require('../data/loopBank.js');

test('LOOP_BANK: every entry well-formed (pre-baked 128, under loops/_128/)', () => {
  assert.ok(Array.isArray(loopBank.LOOP_BANK) && loopBank.LOOP_BANK.length >= 1);
  for (const e of loopBank.LOOP_BANK) {
    assert.ok(typeof e.name === 'string' && e.name.length > 0, 'name');
    assert.ok(e.file.startsWith('loops/_128/'), `file path: ${e.file}`);
    assert.ok(e.file.toLowerCase().endsWith('.wav'), `wav: ${e.file}`);
    assert.strictEqual(e.bpm, 128, `bpm 128: ${e.name}`);
    assert.ok(e.category === 'drums' || e.category === 'melody', `category: ${e.category}`);
  }
});

test('LOOP_BANK: 10 drum loops and 8 melody loops', () => {
  const drums = loopBank.LOOP_BANK.filter(e => e.category === 'drums');
  const melody = loopBank.LOOP_BANK.filter(e => e.category === 'melody');
  assert.strictEqual(drums.length, 10, 'drum count');
  assert.strictEqual(melody.length, 8, 'melody count');
});

test('playbackRateFor: ratio of current to loop bpm, guarded', () => {
  assert.strictEqual(loopBank.playbackRateFor(128, 128), 1);
  assert.strictEqual(loopBank.playbackRateFor(98, 128), 128 / 98);
  assert.strictEqual(loopBank.playbackRateFor(0, 110), 1);
  assert.strictEqual(loopBank.playbackRateFor(-5, 110), 1);
});
