import test from 'node:test';
import assert from 'node:assert/strict';

const { getDeckStudyPhaseFromMode } = await import('../lib/srs/deck-route.ts');

test('maps supported deck study modes from query params', () => {
  assert.equal(getDeckStudyPhaseFromMode('review'), 'review');
  assert.equal(getDeckStudyPhaseFromMode('learn'), 'learn');
  assert.equal(getDeckStudyPhaseFromMode('test'), 'test');
  assert.equal(getDeckStudyPhaseFromMode('stats'), 'stats');
});

test('returns null for unsupported or empty deck study modes', () => {
  assert.equal(getDeckStudyPhaseFromMode('quiz'), null);
  assert.equal(getDeckStudyPhaseFromMode(''), null);
  assert.equal(getDeckStudyPhaseFromMode(null), null);
  assert.equal(getDeckStudyPhaseFromMode(undefined), null);
});
