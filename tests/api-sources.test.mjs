/**
 * Tests for app/api/sources/route.ts
 * GET, POST, DELETE — auth, validation, ownership, CRUD paths.
 */
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

const state = {
  userId: 'user-abc',
  rows: [],
  existing: null,
  inserted: null,
};

mock.module(resolve(ROOT, 'lib/db/index.ts'), {
  namedExports: {
    isDatabaseConfigured: true,
    get db() {
      return {
        query: {
          savedSources: {
            findFirst: async () => state.existing,
          },
        },
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: async () => state.rows,
            }),
          }),
        }),
        insert: () => ({
          values: (data) => ({
            returning: async () => [state.inserted ?? { id: 'src-1', ...data }],
          }),
        }),
        delete: () => ({
          where: async () => {},
        }),
      };
    },
  },
});

mock.module(resolve(ROOT, 'lib/auth/get-user-id.ts'), {
  namedExports: {
    get getUserId() { return async () => state.userId; },
  },
});

const { GET, POST, DELETE } = await import('../app/api/sources/route.ts');

function req(method, url, body) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── GET ──────────────────────────────────────────────────────────────────────

test('GET /sources: 401 when unauthenticated', async () => {
  state.userId = null;
  const res = await GET(req('GET', 'http://localhost/api/sources'));
  assert.equal(res.status, 401);
  state.userId = 'user-abc';
});

test('GET /sources: returns rows array', async () => {
  state.rows = [{ id: 's1', title: 'Test paper', url: 'https://example.com', userId: 'user-abc' }];
  const res = await GET(req('GET', 'http://localhost/api/sources'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 1);
  state.rows = [];
});

// ── POST ─────────────────────────────────────────────────────────────────────

test('POST /sources: 401 when unauthenticated', async () => {
  state.userId = null;
  const res = await POST(req('POST', 'http://localhost/api/sources', { title: 'T', url: 'U' }));
  assert.equal(res.status, 401);
  state.userId = 'user-abc';
});

test('POST /sources: 400 when title is missing', async () => {
  const res = await POST(req('POST', 'http://localhost/api/sources', { url: 'https://example.com' }));
  assert.equal(res.status, 400);
});

test('POST /sources: 400 when url is missing', async () => {
  const res = await POST(req('POST', 'http://localhost/api/sources', { title: 'My Paper' }));
  assert.equal(res.status, 400);
});

test('POST /sources: 400 when body is unparseable JSON', async () => {
  const res = await POST(new Request('http://localhost/api/sources', {
    method: 'POST',
    body: 'not json',
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal(res.status, 400);
});

test('POST /sources: saves and returns source on success', async () => {
  state.inserted = { id: 'src-new', userId: 'user-abc', title: 'BERT paper', url: 'https://arxiv.org/abs/1810.04805', sourceType: 'arxiv' };
  const res = await POST(req('POST', 'http://localhost/api/sources', {
    title: 'BERT paper',
    url: 'https://arxiv.org/abs/1810.04805',
    sourceType: 'arxiv',
  }));
  assert.ok(res.ok);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.source.title, 'BERT paper');
});

test('POST /sources: truncates title to 300 chars', async () => {
  state.inserted = null;
  const longTitle = 'A'.repeat(500);
  const res = await POST(req('POST', 'http://localhost/api/sources', {
    title: longTitle,
    url: 'https://example.com',
  }));
  assert.ok(res.ok);
  const body = await res.json();
  assert.ok(body.source.title.length <= 300);
});

// ── DELETE ────────────────────────────────────────────────────────────────────

test('DELETE /sources: 400 when id param is missing', async () => {
  const res = await DELETE(req('DELETE', 'http://localhost/api/sources'));
  assert.equal(res.status, 400);
});

test('DELETE /sources: 404 when source does not exist', async () => {
  state.existing = null;
  const res = await DELETE(req('DELETE', 'http://localhost/api/sources?id=nonexistent'));
  assert.equal(res.status, 404);
});

test('DELETE /sources: 403 when source belongs to another user', async () => {
  state.existing = { id: 'src-other', userId: 'someone-else' };
  const res = await DELETE(req('DELETE', 'http://localhost/api/sources?id=src-other'));
  assert.equal(res.status, 403);
  state.existing = null;
});

test('DELETE /sources: 200 when owner deletes own source', async () => {
  state.existing = { id: 'src-mine', userId: 'user-abc' };
  const res = await DELETE(req('DELETE', 'http://localhost/api/sources?id=src-mine'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  state.existing = null;
});
