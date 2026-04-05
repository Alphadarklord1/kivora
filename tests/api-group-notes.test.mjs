/**
 * Tests for app/api/groups/[code]/notes/route.ts
 * GET, POST, DELETE — auth, membership checks, CRUD paths.
 */
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

const state = {
  userId: 'user-abc',
  group: { id: 'grp-1', joinCode: 'ABC123', ownerId: 'owner-xyz' },
  member: { groupId: 'grp-1', userId: 'user-abc' },
  notes: [],
  insertedNote: null,
};

mock.module(resolve(ROOT, 'lib/db/index.ts'), {
  namedExports: {
    isDatabaseConfigured: true,
    get db() {
      return {
        query: {
          studyGroups: {
            findFirst: async () => state.group,
          },
          studyGroupMembers: {
            findFirst: async () => state.member,
          },
          studyGroupNotes: {
            findFirst: async () => state.notes[0] ?? null,
          },
        },
        select: () => ({
          from: () => ({
            leftJoin: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: async () => state.notes,
                }),
              }),
            }),
          }),
        }),
        insert: () => ({
          values: (data) => ({
            returning: async () => [state.insertedNote ?? { id: 'note-1', ...data }],
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

const { GET, POST, DELETE } = await import('../app/api/groups/[code]/notes/route.ts');

function makeReq(method, url, body) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const params = Promise.resolve({ code: 'ABC123' });

// ── GET ──────────────────────────────────────────────────────────────────────

test('GET /notes: 401 when not authenticated', async () => {
  state.userId = null;
  const res = await GET(makeReq('GET', 'http://localhost/api/groups/ABC123/notes'), { params });
  assert.equal(res.status, 401);
  state.userId = 'user-abc';
});

test('GET /notes: 404 when group does not exist', async () => {
  const saved = state.group;
  state.group = null;
  const res = await GET(makeReq('GET', 'http://localhost/api/groups/ABC123/notes'), { params });
  assert.equal(res.status, 404);
  state.group = saved;
});

test('GET /notes: 403 when user is not a member', async () => {
  const saved = state.member;
  state.member = null;
  const res = await GET(makeReq('GET', 'http://localhost/api/groups/ABC123/notes'), { params });
  assert.equal(res.status, 403);
  state.member = saved;
});

test('GET /notes: returns notes array for member', async () => {
  state.notes = [
    { id: 'n1', content: 'Hello', postedAt: new Date().toISOString(), userId: 'user-abc', authorName: 'Alice', authorEmail: null },
  ];
  const res = await GET(makeReq('GET', 'http://localhost/api/groups/ABC123/notes'), { params });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 1);
  assert.equal(body[0].isOwn, true);
  state.notes = [];
});

// ── POST ─────────────────────────────────────────────────────────────────────

test('POST /notes: 401 when not authenticated', async () => {
  state.userId = null;
  const res = await POST(makeReq('POST', 'http://localhost/api/groups/ABC123/notes', { content: 'Hi' }), { params });
  assert.equal(res.status, 401);
  state.userId = 'user-abc';
});

test('POST /notes: 400 when content is missing', async () => {
  const res = await POST(makeReq('POST', 'http://localhost/api/groups/ABC123/notes', {}), { params });
  assert.equal(res.status, 400);
});

test('POST /notes: 400 when content exceeds 2000 chars', async () => {
  const res = await POST(makeReq('POST', 'http://localhost/api/groups/ABC123/notes', { content: 'x'.repeat(2001) }), { params });
  assert.equal(res.status, 400);
});

test('POST /notes: 201/200 and returns note on success', async () => {
  state.insertedNote = { id: 'note-new', groupId: 'grp-1', userId: 'user-abc', content: 'Study hard', postedAt: new Date().toISOString() };
  const res = await POST(makeReq('POST', 'http://localhost/api/groups/ABC123/notes', { content: 'Study hard' }), { params });
  assert.ok(res.ok);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.note.content, 'Study hard');
});

// ── DELETE ────────────────────────────────────────────────────────────────────

test('DELETE /notes: 400 when noteId is missing', async () => {
  const res = await DELETE(makeReq('DELETE', 'http://localhost/api/groups/ABC123/notes'), { params });
  assert.equal(res.status, 400);
});

test('DELETE /notes: 403 when user is not author or group owner', async () => {
  state.notes = [{ id: 'note-other', userId: 'someone-else', groupId: 'grp-1' }];
  const url = 'http://localhost/api/groups/ABC123/notes?noteId=note-other';
  const res = await DELETE(makeReq('DELETE', url), { params });
  assert.equal(res.status, 403);
  state.notes = [];
});

test('DELETE /notes: 200 when user is the author', async () => {
  state.notes = [{ id: 'note-mine', userId: 'user-abc', groupId: 'grp-1' }];
  const url = 'http://localhost/api/groups/ABC123/notes?noteId=note-mine';
  const res = await DELETE(makeReq('DELETE', url), { params });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  state.notes = [];
});

test('DELETE /notes: group owner can delete any note', async () => {
  state.group = { id: 'grp-1', joinCode: 'ABC123', ownerId: 'user-abc' }; // user is owner
  state.notes = [{ id: 'note-other', userId: 'someone-else', groupId: 'grp-1' }];
  const url = 'http://localhost/api/groups/ABC123/notes?noteId=note-other';
  const res = await DELETE(makeReq('DELETE', url), { params });
  assert.equal(res.status, 200);
  state.group = { id: 'grp-1', joinCode: 'ABC123', ownerId: 'owner-xyz' };
  state.notes = [];
});
