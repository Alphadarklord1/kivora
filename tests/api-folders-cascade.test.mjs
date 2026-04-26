/**
 * Tests for app/api/folders/[folderId]/route.ts DELETE handler.
 *
 * The DELETE used to drop the folder row and rely on the Postgres FK to
 * cascade child rows, but the IndexedDB blobs for files in the folder
 * were never reaped. The handler now reads file metadata BEFORE the
 * cascade fires and returns localBlobIds in the response body so the
 * client can sweep IndexedDB. These tests lock that contract down.
 */
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

const mockState = {
  userId: 'user-123',
  // Files reported by the SELECT before delete cascades.
  filesInFolder: [],
  // Track which Supabase deletes were attempted.
  storageDeletes: [],
};

mock.module(resolve(ROOT, 'lib/db/index.ts'), {
  namedExports: {
    isDatabaseConfigured: true,
    get db() {
      return {
        // The route does: db.select({...}).from(files).where(...)
        select: () => ({
          from: () => ({
            where: async () => mockState.filesInFolder,
          }),
        }),
        // Then: db.delete(folders).where(...)
        delete: () => ({
          where: async () => undefined,
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

mock.module(resolve(ROOT, 'lib/supabase/storage.ts'), {
  namedExports: {
    deleteFileFromSupabaseStorage: async (bucket, path) => {
      mockState.storageDeletes.push({ bucket, path });
    },
  },
});

const { DELETE } = await import('../app/api/folders/[folderId]/route.ts');

function deleteReq() {
  return new Request('http://localhost/api/folders/folder-1', { method: 'DELETE' });
}

function paramsFor(folderId) {
  return { params: Promise.resolve({ folderId }) };
}

// ── Auth ──────────────────────────────────────────────────────────────

test('DELETE returns 401 when user is not authenticated', async () => {
  mockState.userId = null;
  const res = await DELETE(deleteReq(), paramsFor('folder-1'));
  assert.equal(res.status, 401);
  mockState.userId = 'user-123';
});

// ── Empty folder ──────────────────────────────────────────────────────

test('DELETE on an empty folder returns ok with empty localBlobIds', async () => {
  mockState.filesInFolder = [];
  mockState.storageDeletes = [];
  const res = await DELETE(deleteReq(), paramsFor('folder-1'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.localBlobIds, []);
  assert.equal(body.fileCount, 0);
  assert.equal(mockState.storageDeletes.length, 0);
});

// ── Folder with files ─────────────────────────────────────────────────

test('DELETE returns localBlobIds for every file with one', async () => {
  mockState.filesInFolder = [
    { localBlobId: 'blob-a', storageBucket: null, storagePath: null },
    { localBlobId: 'blob-b', storageBucket: null, storagePath: null },
    { localBlobId: 'blob-c', storageBucket: null, storagePath: null },
  ];
  mockState.storageDeletes = [];
  const res = await DELETE(deleteReq(), paramsFor('folder-1'));
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.localBlobIds.sort(), ['blob-a', 'blob-b', 'blob-c']);
  assert.equal(body.fileCount, 3);
});

test('DELETE filters out files with no localBlobId', async () => {
  mockState.filesInFolder = [
    { localBlobId: 'blob-a', storageBucket: null, storagePath: null },
    { localBlobId: null,     storageBucket: null, storagePath: null },
    { localBlobId: 'blob-b', storageBucket: null, storagePath: null },
  ];
  mockState.storageDeletes = [];
  const res = await DELETE(deleteReq(), paramsFor('folder-1'));
  const body = await res.json();
  assert.deepEqual(body.localBlobIds.sort(), ['blob-a', 'blob-b']);
  assert.equal(body.fileCount, 3, 'fileCount counts all files including ones without local blobs');
});

// ── Supabase cleanup ──────────────────────────────────────────────────

test('DELETE attempts Supabase delete for every file with a storage path', async () => {
  mockState.filesInFolder = [
    { localBlobId: 'blob-a', storageBucket: 'kivora-files', storagePath: 'user/file-a.pdf' },
    { localBlobId: 'blob-b', storageBucket: 'kivora-files', storagePath: 'user/file-b.docx' },
    { localBlobId: 'blob-c', storageBucket: null,           storagePath: null },
  ];
  mockState.storageDeletes = [];
  const res = await DELETE(deleteReq(), paramsFor('folder-1'));
  const body = await res.json();
  assert.equal(body.ok, true);
  // Two files had storage paths — both should have been swept.
  assert.equal(mockState.storageDeletes.length, 2);
  const paths = mockState.storageDeletes.map((d) => d.path).sort();
  assert.deepEqual(paths, ['user/file-a.pdf', 'user/file-b.docx']);
});

test('DELETE skips Supabase delete when no files have storage paths', async () => {
  mockState.filesInFolder = [
    { localBlobId: 'blob-a', storageBucket: null, storagePath: null },
    { localBlobId: 'blob-b', storageBucket: null, storagePath: null },
  ];
  mockState.storageDeletes = [];
  const res = await DELETE(deleteReq(), paramsFor('folder-1'));
  await res.json();
  assert.equal(mockState.storageDeletes.length, 0);
});
