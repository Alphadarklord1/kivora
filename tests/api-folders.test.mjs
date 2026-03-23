/**
 * Tests for app/api/folders/route.ts
 * isDatabaseConfigured: true — tests auth, validation, and CRUD paths.
 */
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

const mockState = {
  userId: 'user-123',
  folders: [],
  inserted: null,
};

mock.module(resolve(ROOT, 'lib/db/index.ts'), {
  namedExports: {
    isDatabaseConfigured: true,
    get db() {
      return {
        query: {
          folders: { findMany: async () => mockState.folders },
        },
        insert: () => ({
          values: (data) => ({
            returning: async () => [mockState.inserted ?? { id: 'folder-id', ...data }],
          }),
        }),
      };
    },
  },
});

mock.module(resolve(ROOT, 'lib/auth/session.ts'), {
  namedExports: {
    get getUserId() { return async () => mockState.userId; },
    GUEST_USER_ID: 'guest',
  },
});

const { GET, POST } = await import('../app/api/folders/route.ts');

function postReq(body) {
  return new Request('http://localhost/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── GET /api/folders ──────────────────────────────────────────────────────────

test('GET returns 401 when user is not authenticated', async () => {
  mockState.userId = null;
  const res = await GET();
  assert.equal(res.status, 401);
  mockState.userId = 'user-123';
});

test('GET returns 200 with empty array when user has no folders', async () => {
  mockState.folders = [];
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, []);
});

test('GET returns 200 with folders array', async () => {
  mockState.folders = [
    { id: 'f1', name: 'Biology', userId: 'user-123', topics: [] },
    { id: 'f2', name: 'Physics', userId: 'user-123', topics: [] },
  ];
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.length, 2);
  assert.equal(body[0].id, 'f1');
  mockState.folders = [];
});

// ── POST /api/folders ─────────────────────────────────────────────────────────

test('POST returns 401 when user is not authenticated', async () => {
  mockState.userId = null;
  const res = await POST(postReq({ name: 'My Folder' }));
  assert.equal(res.status, 401);
  mockState.userId = 'user-123';
});

test('POST returns 400 when name is missing', async () => {
  const res = await POST(postReq({}));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error.toLowerCase().includes('name'));
});

test('POST returns 400 when name is empty string', async () => {
  const res = await POST(postReq({ name: '   ' }));
  assert.equal(res.status, 400);
});

test('POST returns 400 when name is not a string', async () => {
  const res = await POST(postReq({ name: 42 }));
  assert.equal(res.status, 400);
});

test('POST creates a folder and returns 201', async () => {
  mockState.inserted = { id: 'new-folder', name: 'Chemistry', userId: 'user-123', expanded: true, sortOrder: 0 };
  const res = await POST(postReq({ name: 'Chemistry' }));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.id, 'new-folder');
  assert.equal(body.name, 'Chemistry');
  mockState.inserted = null;
});
