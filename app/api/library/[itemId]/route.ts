import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { libraryItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { betaReadFallback, databaseUnavailable, unauthorized } from '@/lib/api/runtime-guards';

interface RouteParams {
  params: Promise<{ itemId: string }>;
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

  const { itemId } = await params;

  const item = await db.query.libraryItems.findFirst({
    where: and(eq(libraryItems.id, itemId), eq(libraryItems.userId, userId)),
  });

  if (!item) {
    return apiError(404, {
      errorCode: 'LIBRARY_ITEM_NOT_FOUND',
      reason: 'Item not found',
      requestId,
    });
  }

  return NextResponse.json(item);
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

  const { itemId } = await params;

  const [deleted] = await db
    .delete(libraryItems)
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.userId, userId)))
    .returning();

  if (!deleted) {
    return apiError(404, {
      errorCode: 'LIBRARY_ITEM_NOT_FOUND',
      reason: 'Item not found',
      requestId,
    });
  }

  return NextResponse.json({ success: true });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const requestId = createRequestId(request);
  if (!isDatabaseConfigured) {
    return databaseUnavailable(request, 'Library item updates require DATABASE_URL to be configured', undefined, requestId);
  }

  const userId = await getUserId(request);
  if (!userId) {
    return unauthorized(request, requestId);
  }

  const { itemId } = await params;
  const body = await request.json();
  const { content, metadata } = body;

  const [updated] = await db
    .update(libraryItems)
    .set({
      ...(content !== undefined && { content }),
      ...(metadata !== undefined && { metadata }),
    })
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.userId, userId)))
    .returning();

  if (!updated) {
    return apiError(404, {
      errorCode: 'LIBRARY_ITEM_NOT_FOUND',
      reason: 'Item not found',
      requestId,
    });
  }

  return NextResponse.json(updated);
}
