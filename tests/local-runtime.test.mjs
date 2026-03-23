import test from 'node:test';
import assert from 'node:assert/strict';

const {
  DEFAULT_DESKTOP_LOCAL_MODEL,
  deriveDesktopLocalRuntimeStatus,
  OFFLINE_READY_FEATURES,
  INTERNET_REQUIRED_FEATURES,
} = await import('../lib/ai/local-runtime.ts');

test('desktop bundled model is treated as ready', () => {
  const status = deriveDesktopLocalRuntimeStatus({
    selectedModelKey: 'mini',
    activeModelKey: 'mini',
    runtimeAvailable: true,
    models: [
      {
        key: 'mini',
        modelId: 'Qwen2.5-1.5B-Instruct',
        bundled: true,
        isInstalled: true,
        installedSource: 'bundled',
      },
    ],
  });

  assert.equal(status.state, 'ready');
  assert.equal(status.source, 'desktop-bundled');
  assert.match(status.label, /included/i);
});

test('installed desktop model without runtime is surfaced as missing', () => {
  const status = deriveDesktopLocalRuntimeStatus({
    selectedModelKey: 'balanced',
    runtimeAvailable: false,
    models: [
      {
        key: 'balanced',
        modelId: 'Qwen2.5-3B-Instruct',
        bundled: false,
        isInstalled: true,
        installedSource: 'userData',
      },
    ],
  });

  assert.equal(status.state, 'missing');
  assert.match(status.detail, /runtime binary is missing|runtime binary is missing or unavailable/i);
});

test('offline capability lists stay anchored to local-first product behavior', () => {
  assert.equal(DEFAULT_DESKTOP_LOCAL_MODEL, 'qwen2.5');
  assert.ok(OFFLINE_READY_FEATURES.some((item) => /workspace/i.test(item)));
  assert.ok(INTERNET_REQUIRED_FEATURES.some((item) => /Scholar Hub topic research/i.test(item)));
});
