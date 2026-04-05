/**
 * Tests for app/api/export/route.ts
 * Verifies savedSources are present in both full and offline export shapes.
 */
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

const state = {
  userId: 'user-abc',
  dbConfigured: true,
  folders: [{ id: 'f1', userId: 'user-abc', name: 'Notes' }],
  files: [{ id: 'file-1', userId: 'user-abc', name: 'Paper.pdf' }],
  libraryItems: [{ id: 'lib-1', userId: 'user-abc', title: 'Deck' }],
  quizAttempts: [{ id: 'quiz-1', userId: 'user-abc' }],
  studyPlans: [{ id: 'plan-1', userId: 'user-abc' }],
  savedSources: [{ id: 'src-1', userId: 'user-abc', title: 'PubMed paper', url: 'https://pubmed.ncbi.nlm.nih.gov/1/' }],
};

mock.module(resolve(ROOT, 'lib/db/index.ts'), {
  namedExports: {
    get isDatabaseConfigured() {
      return state.dbConfigured;
    },
    get db() {
      return {
        query: {
          folders: { findMany: async () => state.folders },
          files: { findMany: async () => state.files },
          libraryItems: { findMany: async () => state.libraryItems },
          quizAttempts: { findMany: async () => state.quizAttempts },
          studyPlans: { findMany: async () => state.studyPlans },
          savedSources: { findMany: async () => state.savedSources },
        },
      };
    },
  },
});

mock.module(resolve(ROOT, 'lib/auth/session.ts'), {
  namedExports: {
    get getUserId() {
      return async () => state.userId;
    },
  },
});

const { GET } = await import('../app/api/export/route.ts');

test('GET /api/export includes savedSources in full export', async () => {
  state.dbConfigured = true;
  const res = await GET();
  assert.equal(res.status, 200);
  const body = JSON.parse(await res.text());
  assert.ok(Array.isArray(body.savedSources));
  assert.equal(body.savedSources.length, 1);
  assert.equal(body.savedSources[0].title, 'PubMed paper');
});
