/**
 * Tests for app/api/db/verify/route.ts — healthy and failing DB states.
 * isDatabaseConfigured: true
 */
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

const mockState = {
  shouldThrow: false,
  counts: [3, 5, 12, 8, 2], // users, folders, files, library, plans
};

mock.module(resolve(ROOT, 'lib/db/index.ts'), {
  namedExports: {
    isDatabaseConfigured: true,
    get db() {
      let call = 0;
      return {
        $count: () => {
          if (mockState.shouldThrow) throw new Error('connection refused');
          return Promise.resolve(mockState.counts[call++] ?? 0);
        },
      };
    },
  },
});

const { GET } = await import('../app/api/db/verify/route.ts');

test('returns 500 when database is configured but query fails', async () => {
  mockState.shouldThrow = true;
  const res = await GET();
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.configured, true);
  mockState.shouldThrow = false;
});

test('returns 200 with counts when database is healthy', async () => {
  mockState.shouldThrow = false;
  mockState.counts = [3, 5, 12, 8, 2];
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.configured, true);
  assert.ok(body.counts);
  assert.equal(typeof body.counts.users, 'number');
  assert.equal(typeof body.counts.folders, 'number');
});

test('verify response includes checkedAt timestamp when healthy', async () => {
  mockState.shouldThrow = false;
  mockState.counts = [0, 0, 0, 0, 0];
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(typeof body.checkedAt === 'string');
  assert.ok(!isNaN(new Date(body.checkedAt).getTime()));
});
