import test from 'node:test';
import assert from 'node:assert/strict';

const MODE_MODULE = '../lib/runtime/mode.ts';

async function withEnv(nextEnv, fn) {
  const original = {
    AUTH_REQUIRED: process.env.AUTH_REQUIRED,
    AUTH_GUEST_MODE: process.env.AUTH_GUEST_MODE,
    LOCAL_DEMO_MODE: process.env.LOCAL_DEMO_MODE,
    STUDYPILOT_DESKTOP_ONLY: process.env.STUDYPILOT_DESKTOP_ONLY,
  };

  for (const [key, value] of Object.entries(nextEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function loadModeModule() {
  return import(`${MODE_MODULE}?t=${Date.now()}-${Math.random()}`);
}

test('guest mode defaults to enabled when no env is provided', async () => {
  await withEnv(
    {
      AUTH_REQUIRED: undefined,
      AUTH_GUEST_MODE: undefined,
      LOCAL_DEMO_MODE: undefined,
      STUDYPILOT_DESKTOP_ONLY: undefined,
    },
    async () => {
      const mod = await loadModeModule();
      assert.equal(mod.isGuestModeEnabled(), true);
    }
  );
});

test('AUTH_REQUIRED=1 disables guest mode even if AUTH_GUEST_MODE=1', async () => {
  await withEnv(
    {
      AUTH_REQUIRED: '1',
      AUTH_GUEST_MODE: '1',
      LOCAL_DEMO_MODE: '1',
      STUDYPILOT_DESKTOP_ONLY: '1',
    },
    async () => {
      const mod = await loadModeModule();
      assert.equal(mod.isGuestModeEnabled(), false);
    }
  );
});

test('AUTH_GUEST_MODE=0 disables guest mode when AUTH_REQUIRED is unset', async () => {
  await withEnv(
    {
      AUTH_REQUIRED: undefined,
      AUTH_GUEST_MODE: '0',
      LOCAL_DEMO_MODE: '1',
      STUDYPILOT_DESKTOP_ONLY: '1',
    },
    async () => {
      const mod = await loadModeModule();
      assert.equal(mod.isGuestModeEnabled(), false);
    }
  );
});
