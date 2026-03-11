import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { folders, topics } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { databaseUnavailable } from '@/lib/api/runtime-guards';

interface RouteParams {
  params: Promise<{ folderId: string; topicId: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const requestId = createRequestId(request);
  if (!isDatabaseConfigured) {
    return databaseUnavailable(request, 'Subfolder updates require DATABASE_URL to be configured', undefined, requestId);
  }

  const userId = await getUserId(request);
  if (!userId) {
    return apiError(401, {
      errorCode: 'UNAUTHORIZED',
      reason: 'Authentication required',
      requestId,
    });
  }

  const { folderId, topicId } = await params;
  const body = await request.json();
  const { name, sortOrder } = body;

  // Verify folder belongs to user
  const folder = await db.query.folders.findFirst({
    where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
  });

  if (!folder) {
    return apiError(404, {
      errorCode: 'FOLDER_NOT_FOUND',
      reason: 'Folder not found',
      requestId,
    });
  }

  const [updated] = await db
    .update(topics)
    .set({
      ...(name !== undefined && { name }),
      ...(sortOrder !== undefined && { sortOrder }),
      updatedAt: new Date(),
    })
    .where(and(eq(topics.id, topicId), eq(topics.folderId, folderId)))
    .returning();

  if (!updated) {
    return apiError(404, {
      errorCode: 'TOPIC_NOT_FOUND',
      reason: 'Topic not found',
      requestId,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = createRequestId(request);
  if (!isDatabaseConfigured) {
    return databaseUnavailable(request, 'Subfolder deletion requires DATABASE_URL to be configured', undefined, requestId);
  }

  const userId = await getUserId(request);
  if (!userId) {
    return apiError(401, {
      errorCode: 'UNAUTHORIZED',
      reason: 'Authentication required',
      requestId,
    });
  }

  const { folderId, topicId } = await params;

  // Verify folder belongs to user
  const folder = await db.query.folders.findFirst({
    where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
  });

  if (!folder) {
    return apiError(404, {
      errorCode: 'FOLDER_NOT_FOUND',
      reason: 'Folder not found',
      requestId,
    });
  }

  const [deleted] = await db
    .delete(topics)
    .where(and(eq(topics.id, topicId), eq(topics.folderId, folderId)))
    .returning();

  if (!deleted) {
    return apiError(404, {
      errorCode: 'TOPIC_NOT_FOUND',
      reason: 'Topic not found',
      requestId,
    });
  }

  return NextResponse.json({ success: true });
}
