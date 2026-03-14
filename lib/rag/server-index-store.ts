import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getUserId } from '@/lib/auth/get-user-id';
import { isGuestEmail } from '@/lib/auth/guest-session';
import { db, isDatabaseConfigured } from '@/lib/db';
import { files, ragFileIndexes, users } from '@/lib/db/schema';
import {
  buildRagIndex,
  getDocumentSignature,
  isCompatibleRagIndex,
  type RAGIndex,
} from './retrieve';

export async function canPersistRagIndexesForUser(userId: string) {
  if (!isDatabaseConfigured) return false;
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, email: true, isGuest: true },
  });
  return Boolean(user && !user.isGuest && !isGuestEmail(user.email));
}

export async function ensureOwnedFile(userId: string, fileId: string) {
  if (!isDatabaseConfigured) return false;
  const file = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.userId, userId)),
    columns: { id: true },
  });
  return Boolean(file);
}

export async function getPersistedRagIndex(userId: string, fileId: string): Promise<RAGIndex | undefined> {
  if (!isDatabaseConfigured) return undefined;
  const row = await db.query.ragFileIndexes.findFirst({
    where: and(eq(ragFileIndexes.userId, userId), eq(ragFileIndexes.fileId, fileId)),
    columns: { indexData: true, updatedAt: true },
  });
  if (!row?.indexData) return undefined;
  return {
    ...row.indexData,
    persistedAt: row.updatedAt.toISOString(),
  };
}

export async function upsertPersistedRagIndex(userId: string, fileId: string, text: string): Promise<RAGIndex> {
  const signature = getDocumentSignature(text);
  const existing = await db.query.ragFileIndexes.findFirst({
    where: and(eq(ragFileIndexes.userId, userId), eq(ragFileIndexes.fileId, fileId)),
    columns: {
      id: true,
      signature: true,
      embeddingVersion: true,
      indexData: true,
    },
  });

  if (existing && isCompatibleRagIndex(existing.indexData, signature)) {
    return existing.indexData;
  }

  const persistedAt = new Date().toISOString();
  const nextIndex = {
    ...buildRagIndex(fileId, text),
    persistedAt,
  } satisfies RAGIndex;
  await db
    .insert(ragFileIndexes)
    .values({
      userId,
      fileId,
      signature: nextIndex.signature,
      embeddingVersion: nextIndex.embeddingVersion,
      chunkCount: nextIndex.chunkCount,
      indexData: nextIndex,
      updatedAt: new Date(persistedAt),
    })
    .onConflictDoUpdate({
      target: [ragFileIndexes.userId, ragFileIndexes.fileId],
      set: {
        signature: nextIndex.signature,
        embeddingVersion: nextIndex.embeddingVersion,
        chunkCount: nextIndex.chunkCount,
        indexData: nextIndex,
        updatedAt: new Date(persistedAt),
      },
    });

  return nextIndex;
}

export async function deletePersistedRagIndex(userId: string, fileId: string) {
  if (!isDatabaseConfigured) return;
  await db.delete(ragFileIndexes).where(
    and(eq(ragFileIndexes.userId, userId), eq(ragFileIndexes.fileId, fileId)),
  );
}

export async function getPersistedRagIndexForRequest(request: NextRequest, fileId: string) {
  if (!isDatabaseConfigured || !fileId) return undefined;
  const userId = await getUserId(request);
  if (!userId) return undefined;
  if (!(await canPersistRagIndexesForUser(userId))) return undefined;
  if (!(await ensureOwnedFile(userId, fileId))) return undefined;
  return getPersistedRagIndex(userId, fileId);
}
