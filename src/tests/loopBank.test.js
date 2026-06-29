const { test } = require('node:test');
const assert = require('node:assert');
const loopBank = require('../data/loopBank.js');

test('LOOP_BANK: every entry well-formed (128 BPM, under loops/_128/, valid group+category)', () => {
  assert.ok(Array.isArray(loopBank.LOOP_BANK) && loopBank.LOOP_BANK.length >= 1);
  for (const e of loopBank.LOOP_BANK) {
    assert.ok(typeof e.name === 'string' && e.name.length > 0, 'name');
    assert.ok(e.file.startsWith('loops/_128/'), `file path: ${e.file}`);
    assert.ok(e.file.toLowerCase().endsWith('.wav'), `wav: ${e.file}`);
    assert.strictEqual(e.bpm, 128, `bpm 128: ${e.name}`);
    assert.ok(['drums', 'melody', 'chords', 'bass'].includes(e.category), `category: ${e.category}`);
    assert.ok(loopBank.GROUPS.includes(e.group), `group: ${e.group}`);
  }
});

test('LOOP_BANK: per-(group,category) counts', () => {
  const by = (g, c) => loopBank.LOOP_BANK.filter(e => e.group === g && e.category === c).length;
  assert.strictEqual(by('og', 'drums'), 10, 'og drums');
  assert.strictEqual(by('og', 'bass'), 8, 'og bass');
  assert.strictEqual(by('og', 'chords'), 8, 'og chords');
  assert.strictEqual(by('og', 'melody'), 8, 'og melody');
  assert.strictEqual(by('futurebass', 'drums'), 8, 'fb drums');
  assert.strictEqual(by('futurebass', 'bass'), 4, 'fb bass');
  assert.strictEqual(by('futurebass', 'chords'), 9, 'fb chords');
  assert.strictEqual(by('futurebass', 'melody'), 8, 'fb melody');
  assert.strictEqual(loopBank.LOOP_BANK.length, 63, 'total');
});

test('activeGroup: defaults to og, setActiveGroup validates', () => {
  assert.strictEqual(loopBank.activeGroup, 'og');
  loopBank.setActiveGroup('futurebass');
  assert.strictEqual(loopBank.activeGroup, 'futurebass');
  loopBank.setActiveGroup('bogus');                 // ignored
  assert.strictEqual(loopBank.activeGroup, 'futurebass');
  loopBank.setActiveGroup('og');                    // restore for other tests
  assert.strictEqual(loopBank.activeGroup, 'og');
});

test('playbackRateFor: ratio of current to loop bpm, guarded', () => {
  assert.strictEqual(loopBank.playbackRateFor(128, 128), 1);
  assert.strictEqual(loopBank.playbackRateFor(98, 128), 128 / 98);
  assert.strictEqual(loopBank.playbackRateFor(0, 110), 1);
  assert.strictEqual(loopBank.playbackRateFor(-5, 110), 1);
});
