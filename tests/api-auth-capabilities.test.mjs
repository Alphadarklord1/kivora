/**
 * Tests for app/api/auth/capabilities/route.ts
 */
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

mock.module(resolve(ROOT, 'lib/db/index.ts'), {
  namedExports: { isDatabaseConfigured: false, db: null },
});

const { GET } = await import('../app/api/auth/capabilities/route.ts');

// ── Response shape ────────────────────────────────────────────────────────────

test('capabilities endpoint returns 200', async () => {
  const res = await GET();
  assert.equal(res.status, 200);
});

test('capabilities response includes all required fields', async () => {
  const res = await GET();
  const body = await res.json();
  const required = [
    'googleConfigured', 'githubConfigured', 'microsoftConfigured',
    'guestModeEnabled', 'authSecretConfigured', 'authDisabled',
    'dbConfigured', 'supabaseUrlConfigured', 'supabaseAnonKeyConfigured',
  ];
  for (const field of required) {
    assert.ok(field in body, `missing field: ${field}`);
  }
});

test('all boolean fields are actually booleans', async () => {
  const res = await GET();
  const body = await res.json();
  const boolFields = [
    'googleConfigured', 'githubConfigured', 'microsoftConfigured',
    'guestModeEnabled', 'authSecretConfigured', 'authDisabled',
    'dbConfigured', 'supabaseUrlConfigured', 'supabaseAnonKeyConfigured',
    'oauthDisabled', 'supabaseBrowserConfigured', 'supabaseAdminConfigured',
    'supabaseAuthConfigured', 'supabaseStorageConfigured',
  ];
  for (const field of boolFields) {
    if (field in body) {
      assert.equal(typeof body[field], 'boolean', `${field} is not boolean`);
    }
  }
});

test('dbConfigured is false when isDatabaseConfigured mock is false', async () => {
  const res = await GET();
  const body = await res.json();
  assert.equal(body.dbConfigured, false);
});

test('googleConfigured is false when GOOGLE_CLIENT_ID is unset', async () => {
  const orig = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  const res = await GET();
  const body = await res.json();
  assert.equal(body.googleConfigured, false);
  if (orig) process.env.GOOGLE_CLIENT_ID = orig;
});

test('githubConfigured is false when GITHUB_ID is unset', async () => {
  const orig = process.env.GITHUB_ID;
  delete process.env.GITHUB_ID;
  const res = await GET();
  const body = await res.json();
  assert.equal(body.githubConfigured, false);
  if (orig) process.env.GITHUB_ID = orig;
});

test('desktopAuthPort is a number or null', async () => {
  const res = await GET();
  const body = await res.json();
  assert.ok(
    body.desktopAuthPort === null || typeof body.desktopAuthPort === 'number',
    'desktopAuthPort should be number or null',
  );
});

test('supabaseStorageBucket is a string', async () => {
  const res = await GET();
  const body = await res.json();
  assert.equal(typeof body.supabaseStorageBucket, 'string');
});
