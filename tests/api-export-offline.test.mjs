/**
 * Offline export regression test — the shape should still include savedSources.
 */
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

mock.module(resolve(ROOT, 'lib/db/index.ts'), {
  namedExports: {
    isDatabaseConfigured: false,
    db: null,
  },
});

mock.module(resolve(ROOT, 'lib/auth/session.ts'), {
  namedExports: {
    getUserId: async () => 'user-offline',
  },
});

const { GET } = await import('../app/api/export/route.ts');

test('GET /api/export preserves savedSources key in offline export', async () => {
  const res = await GET();
  assert.equal(res.status, 200);
  const body = JSON.parse(await res.text());
  assert.ok(Array.isArray(body.savedSources));
  assert.equal(body.savedSources.length, 0);
});
