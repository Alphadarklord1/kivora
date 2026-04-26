import test from 'node:test';
import assert from 'node:assert/strict';

const {
  normalizeAiMode,
  cloudProviderForModel,
  getDefaultAiRuntimePreferences,
  DEFAULT_LOCAL_MODEL,
  DEFAULT_CLOUD_MODEL,
  LOCAL_MODEL_OPTIONS,
  CLOUD_MODEL_OPTIONS,
} = await import('../lib/ai/runtime.ts');

// ── normalizeAiMode ───────────────────────────────────────────────────────────

test('normalizeAiMode maps Ollama aliases to "local"', () => {
  assert.equal(normalizeAiMode('ollama'), 'local');
  assert.equal(normalizeAiMode('local'), 'local');
  assert.equal(normalizeAiMode('desktop-local'), 'local');
  assert.equal(normalizeAiMode('offline'), 'local');
});

test('normalizeAiMode maps cloud provider names to "cloud"', () => {
  assert.equal(normalizeAiMode('cloud'), 'cloud');
  assert.equal(normalizeAiMode('openai'), 'cloud');
  assert.equal(normalizeAiMode('grok'), 'cloud');
  assert.equal(normalizeAiMode('groq'), 'cloud');
});

test('normalizeAiMode maps "auto" to "auto"', () => {
  assert.equal(normalizeAiMode('auto'), 'auto');
});

test('normalizeAiMode defaults to "auto" for unknown values', () => {
  assert.equal(normalizeAiMode(''), 'auto');
  assert.equal(normalizeAiMode(null), 'auto');
  assert.equal(normalizeAiMode(undefined), 'auto');
  assert.equal(normalizeAiMode('nonsense'), 'auto');
});

// ── cloudProviderForModel ─────────────────────────────────────────────────────

test('cloudProviderForModel identifies Groq models correctly', () => {
  assert.equal(cloudProviderForModel('llama-3.3-70b-versatile'), 'groq');
  assert.equal(cloudProviderForModel('llama-3.1-8b-instant'), 'groq');
  assert.equal(cloudProviderForModel('mixtral-8x7b-32768'), 'groq');
  assert.equal(cloudProviderForModel('gemma2-9b-it'), 'groq');
  assert.equal(cloudProviderForModel('deepseek-r1-distill-llama-70b'), 'groq');
});

test('cloudProviderForModel identifies Grok (xAI) models correctly', () => {
  assert.equal(cloudProviderForModel('grok-3-fast'), 'grok');
  assert.equal(cloudProviderForModel('grok-3-mini'), 'grok');
});

test('cloudProviderForModel identifies OpenAI models correctly', () => {
  assert.equal(cloudProviderForModel('gpt-4o-mini'), 'openai');
  assert.equal(cloudProviderForModel('gpt-4.1-mini'), 'openai');
});

test('cloudProviderForModel falls back to "groq" for unknown models', () => {
  assert.equal(cloudProviderForModel('some-unknown-model'), 'groq');
});

// ── defaults ──────────────────────────────────────────────────────────────────

test('DEFAULT_LOCAL_MODEL is qwen2.5', () => {
  assert.equal(DEFAULT_LOCAL_MODEL, 'qwen2.5');
});

test('DEFAULT_CLOUD_MODEL is the Groq Llama 3.3 70B model', () => {
  assert.equal(DEFAULT_CLOUD_MODEL, 'llama-3.3-70b-versatile');
});

test('getDefaultAiRuntimePreferences returns qwen2.5 as local model', () => {
  const prefs = getDefaultAiRuntimePreferences();
  assert.equal(prefs.localModel, 'qwen2.5');
  assert.equal(prefs.mode, 'auto');
});

test('getDefaultAiRuntimePreferences returns Groq model as cloud default', () => {
  const prefs = getDefaultAiRuntimePreferences();
  assert.equal(cloudProviderForModel(prefs.cloudModel), 'groq');
});

// ── model option lists ────────────────────────────────────────────────────────

test('LOCAL_MODEL_OPTIONS contains qwen2.5 as first entry', () => {
  assert.equal(LOCAL_MODEL_OPTIONS[0].id, 'qwen2.5');
});

test('LOCAL_MODEL_OPTIONS contains qwen2.5-math for STEM', () => {
  assert.ok(LOCAL_MODEL_OPTIONS.some(m => m.id === 'qwen2.5-math'));
});

test('CLOUD_MODEL_OPTIONS first entry is a Groq model', () => {
  assert.equal(CLOUD_MODEL_OPTIONS[0].provider, 'groq');
});

test('CLOUD_MODEL_OPTIONS contains Groq, Grok and OpenAI providers', () => {
  const providers = new Set(CLOUD_MODEL_OPTIONS.map(m => m.provider));
  assert.ok(providers.has('groq'), 'should have groq');
  assert.ok(providers.has('grok'), 'should have grok');
  assert.ok(providers.has('openai'), 'should have openai');
});

test('all CLOUD_MODEL_OPTIONS have non-empty id, label, hint, provider', () => {
  for (const model of CLOUD_MODEL_OPTIONS) {
    assert.ok(model.id.length > 0, `model id empty`);
    assert.ok(model.label.length > 0, `label empty for ${model.id}`);
    assert.ok(model.hint.length > 0, `hint empty for ${model.id}`);
    assert.ok(['groq','grok','openai'].includes(model.provider), `invalid provider for ${model.id}`);
  }
});

test('all LOCAL_MODEL_OPTIONS have non-empty id, label, hint', () => {
  for (const model of LOCAL_MODEL_OPTIONS) {
    assert.ok(model.id.length > 0, `model id empty`);
    assert.ok(model.label.length > 0, `label empty for ${model.id}`);
    assert.ok(model.hint.length > 0, `hint empty for ${model.id}`);
  }
});
