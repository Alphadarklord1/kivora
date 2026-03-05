import test from 'node:test';
import assert from 'node:assert/strict';

const ORIGINAL_ENV = {
  AUTH_REQUIRED: process.env.AUTH_REQUIRED,
  AUTH_GUEST_MODE: process.env.AUTH_GUEST_MODE,
  LOCAL_DEMO_MODE: process.env.LOCAL_DEMO_MODE,
  STUDYPILOT_DESKTOP_ONLY: process.env.STUDYPILOT_DESKTOP_ONLY,
  STUDYPILOT_DESKTOP_AUTH_PORT: process.env.STUDYPILOT_DESKTOP_AUTH_PORT,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  STUDYPILOT_OAUTH_DISABLED: process.env.STUDYPILOT_OAUTH_DISABLED,
  STUDYPILOT_OAUTH_DISABLED_REASON: process.env.STUDYPILOT_OAUTH_DISABLED_REASON,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function loadAuthCapabilitiesModule() {
  const mod = await import(`../lib/auth/capabilities.ts?t=${Date.now()}-${Math.random()}`);
  return mod;
}

test('getAuthCapabilities reflects configured providers and desktop auth port', async () => {
  delete process.env.AUTH_REQUIRED;
  process.env.AUTH_GUEST_MODE = '1';
  delete process.env.LOCAL_DEMO_MODE;
  process.env.STUDYPILOT_DESKTOP_ONLY = '1';
  process.env.STUDYPILOT_DESKTOP_AUTH_PORT = '3893';
  process.env.GOOGLE_CLIENT_ID = 'gid';
  process.env.GOOGLE_CLIENT_SECRET = 'gsecret';
  process.env.GITHUB_CLIENT_ID = '';
  process.env.GITHUB_CLIENT_SECRET = '';
  process.env.STUDYPILOT_OAUTH_DISABLED = '0';
  delete process.env.STUDYPILOT_OAUTH_DISABLED_REASON;

  const mod = await loadAuthCapabilitiesModule();
  const caps = mod.getAuthCapabilities();

  assert.equal(caps.googleConfigured, true);
  assert.equal(caps.githubConfigured, false);
  assert.equal(caps.guestModeEnabled, true);
  assert.equal(caps.desktopAuthPort, 3893);
  assert.equal(caps.oauthDisabled, false);
});

test('desktop auth port falls back to default for invalid env values', async () => {
  process.env.STUDYPILOT_DESKTOP_AUTH_PORT = 'invalid';
  const mod = await loadAuthCapabilitiesModule();
  assert.equal(mod.getDesktopAuthPort(), 3893);
});

test('normalizeAuthEmail trims and lowercases values', async () => {
  const mod = await loadAuthCapabilitiesModule();
  assert.equal(mod.normalizeAuthEmail('  USER@Example.COM  '), 'user@example.com');
  assert.equal(mod.normalizeAuthEmail('   '), null);
  assert.equal(mod.normalizeAuthEmail(null), null);
});

test.after(() => {
  restoreEnv();
});
