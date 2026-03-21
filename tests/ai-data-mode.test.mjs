import test from 'node:test';
import assert from 'node:assert/strict';

const {
  normalizeAiDataMode,
  resolveAiDataMode,
  buildMetadataOnlyPlaceholder,
  redactForAi,
} = await import('../lib/privacy/ai-data.ts');

test('normalizes privacy modes and falls back safely', () => {
  assert.equal(normalizeAiDataMode('full'), 'full');
  assert.equal(normalizeAiDataMode('metadata-only'), 'metadata-only');
  assert.equal(normalizeAiDataMode('offline'), 'offline');
  assert.equal(normalizeAiDataMode('unexpected'), 'full');
  assert.equal(resolveAiDataMode({ privacyMode: 'offline' }), 'offline');
  assert.equal(resolveAiDataMode({}), 'full');
});

test('redacts source text when metadata-only mode is active', () => {
  const placeholder = buildMetadataOnlyPlaceholder('alpha beta gamma', 'biology notes');
  assert.match(placeholder, /Content withheld for privacy/i);
  assert.match(placeholder, /biology notes/i);

  assert.equal(redactForAi('full', 'secret text', 'source'), 'secret text');
  assert.match(redactForAi('metadata-only', 'secret text', 'source'), /Content withheld for privacy/i);
});
