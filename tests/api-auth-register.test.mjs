/**
 * Tests for app/api/auth/register/route.ts
 * isDatabaseConfigured: true — tests validation, 409, and 201 paths.
 */
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

// ── Module mocks ──────────────────────────────────────────────────────────────

// mutable db state — reassign properties between tests
const mockState = {
  existingUser: null,
  insertResult: { id: 'new-user-id', email: 'test@example.com', name: 'Test' },
};

mock.module(resolve(ROOT, 'lib/db/index.ts'), {
  namedExports: {
    isDatabaseConfigured: true,
    get db() {
      return {
        query: {
          users: { findFirst: async () => mockState.existingUser },
        },
        insert: () => ({
          values: (data) => ({
            returning: async () => [Object.assign({}, mockState.insertResult, data)],
            onConflictDoNothing: () => Promise.resolve(),
          }),
        }),
      };
    },
  },
});

mock.module(resolve(ROOT, 'lib/supabase/auth-admin.ts'), {
  namedExports: {
    syncSupabaseAuthUser: async () => 'supabase-uid',
  },
});

const { POST } = await import('../app/api/auth/register/route.ts');

function req(body) {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Input validation ──────────────────────────────────────────────────────────

test('returns 400 when email is missing', async () => {
  const res = await POST(req({ password: 'password123' }));
  assert.equal(res.status, 400);
});

test('returns 400 when password is missing', async () => {
  const res = await POST(req({ email: 'a@b.com' }));
  assert.equal(res.status, 400);
});

test('returns 400 when both email and password are missing', async () => {
  const res = await POST(req({}));
  assert.equal(res.status, 400);
});

test('returns 400 for invalid email — missing @', async () => {
  const res = await POST(req({ email: 'notanemail', password: 'password123' }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error.toLowerCase().includes('email'));
});

test('returns 400 for invalid email — missing domain part', async () => {
  const res = await POST(req({ email: 'user@', password: 'password123' }));
  assert.equal(res.status, 400);
});

test('returns 400 when password is shorter than 8 characters', async () => {
  const res = await POST(req({ email: 'a@b.com', password: 'short' }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error.toLowerCase().includes('password'));
});

test('returns 400 when name exceeds 80 characters', async () => {
  const res = await POST(req({ email: 'a@b.com', password: 'password123', name: 'A'.repeat(81) }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error.toLowerCase().includes('name'));
});

test('returns 400 for invalid JSON body', async () => {
  const res = await POST(new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json',
  }));
  assert.equal(res.status, 400);
});

// ── Business logic ────────────────────────────────────────────────────────────

test('returns 409 when email already exists', async () => {
  mockState.existingUser = { id: 'existing-id' };
  const res = await POST(req({ email: 'existing@example.com', password: 'password123' }));
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.ok(body.error.toLowerCase().includes('already'));
  mockState.existingUser = null;
});

test('returns 201 with user on successful registration', async () => {
  mockState.existingUser = null;
  mockState.insertResult = { id: 'new-id', email: 'new@example.com', name: 'New User' };
  const res = await POST(req({ email: 'new@example.com', password: 'securepassword' }));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.id);
  assert.ok(body.email);
});

test('normalises email to lowercase on registration', async () => {
  mockState.existingUser = null;
  mockState.insertResult = { id: 'uid', email: 'user@example.com', name: 'User' };
  const res = await POST(req({ email: 'USER@EXAMPLE.COM', password: 'securepassword' }));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.email, 'user@example.com');
});
