import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { files } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { betaReadFallback, databaseUnavailable, unauthorized } from '@/lib/api/runtime-guards';

interface RouteParams {
  params: Promise<{ fileId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = createRequestId(request);
  if (!isDatabaseConfigured) {
    return betaReadFallback(null);
  }

  const userId = await getUserId(request);
  if (!userId) {
    return unauthorized(request, requestId);
  }

  const { fileId } = await params;

  const file = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.userId, userId)),
  });

  if (!file) {
    return apiError(404, {
      errorCode: 'FILE_NOT_FOUND',
      reason: 'File not found',
      requestId,
    });
  }

  return NextResponse.json(file);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const requestId = createRequestId(request);
  if (!isDatabaseConfigured) {
    return databaseUnavailable(request, 'File updates require DATABASE_URL to be configured', undefined, requestId);
  }

  const userId = await getUserId(request);
  if (!userId) {
    return unauthorized(request, requestId);
  }

  const { fileId } = await params;
  const body = await request.json();
  const { name, liked, pinned, content } = body;

  const [updated] = await db
    .update(files)
    .set({
      ...(name !== undefined && { name }),
      ...(liked !== undefined && { liked }),
      ...(pinned !== undefined && { pinned }),
      ...(content !== undefined && { content }),
      updatedAt: new Date(),
    })
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .returning();

  if (!updated) {
    return apiError(404, {
      errorCode: 'FILE_NOT_FOUND',
      reason: 'File not found',
      requestId,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = createRequestId(request);
  if (!isDatabaseConfigured) {
    return betaReadFallback({ success: true, localOnly: true });
  }

  const userId = await getUserId(request);
  if (!userId) {
    return unauthorized(request, requestId);
  }

  const { fileId } = await params;

  const [deleted] = await db
    .delete(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .returning();

  if (!deleted) {
    return apiError(404, {
      errorCode: 'FILE_NOT_FOUND',
      reason: 'File not found',
      requestId,
    });
  }

  return NextResponse.json({ success: true, localBlobId: deleted.localBlobId });
}
