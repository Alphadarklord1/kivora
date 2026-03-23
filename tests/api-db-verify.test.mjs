/**
 * Tests for app/api/db/verify/route.ts
 * isDatabaseConfigured: false — tests the 503 "not configured" path.
 */
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

mock.module(resolve(ROOT, 'lib/db/index.ts'), {
  namedExports: { isDatabaseConfigured: false, db: null },
});

const { GET } = await import('../app/api/db/verify/route.ts');

test('returns 503 when database is not configured', async () => {
  const res = await GET();
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.configured, false);
  assert.ok(body.reason);
});

test('503 response includes database summary object', async () => {
  const res = await GET();
  const body = await res.json();
  assert.ok('database' in body);
  assert.equal(body.database.configured, false);
});

test('503 response database.provider is null when no URL set', async () => {
  const origDb = process.env.DATABASE_URL;
  const origSupabase = process.env.SUPABASE_DATABASE_URL;
  delete process.env.DATABASE_URL;
  delete process.env.SUPABASE_DATABASE_URL;
  const res = await GET();
  const body = await res.json();
  assert.equal(body.database.provider, null);
  if (origDb) process.env.DATABASE_URL = origDb;
  if (origSupabase) process.env.SUPABASE_DATABASE_URL = origSupabase;
});
