import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { libraryItems } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { betaReadFallback, databaseUnavailable, unauthorized } from '@/lib/api/runtime-guards';

export async function GET(request: NextRequest) {
  const requestId = createRequestId(request);
  try {
    if (!isDatabaseConfigured) {
      return betaReadFallback([]);
    }

    const userId = await getUserId(request);
    if (!userId) {
      return unauthorized(request, requestId);
    }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');

    let items = await db.query.libraryItems.findMany({
      where: eq(libraryItems.userId, userId),
      orderBy: [desc(libraryItems.createdAt)],
    });

    if (search) {
      const searchLower = search.toLowerCase();
      items = items.filter(item =>
        item.content.toLowerCase().includes(searchLower) ||
        item.mode.toLowerCase().includes(searchLower)
      );
    }

    return NextResponse.json(items);
  } catch (error) {
    console.error(`[Library][${requestId}] GET failed`, error);
    return apiError(500, {
      errorCode: 'LIBRARY_FETCH_FAILED',
      reason: 'Failed to fetch library items',
      requestId,
    });
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId(request);
  try {
    if (!isDatabaseConfigured) {
      return databaseUnavailable(request, 'Library saving requires DATABASE_URL to be configured', undefined, requestId);
    }

    const userId = await getUserId(request);
    if (!userId) {
      return unauthorized(request, requestId);
    }

    const body = await request.json();
    const { mode, content, metadata } = body;

    if (!mode || !content) {
      return apiError(400, {
        errorCode: 'INVALID_LIBRARY_REQUEST',
        reason: 'Mode and content are required',
        requestId,
      });
    }

    const [newItem] = await db.insert(libraryItems).values({
      userId,
      mode,
      content,
      metadata: metadata || null,
    }).returning();

    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    console.error(`[Library][${requestId}] POST failed`, error);
    return apiError(500, {
      errorCode: 'LIBRARY_CREATE_FAILED',
      reason: 'Failed to save library item',
      requestId,
    });
  }
}

export async function DELETE(request: NextRequest) {
  const requestId = createRequestId(request);
  try {
    if (!isDatabaseConfigured) {
      return betaReadFallback({ success: true });
    }

    const userId = await getUserId(request);
    if (!userId) {
      return unauthorized(request, requestId);
    }

    await db.delete(libraryItems).where(eq(libraryItems.userId, userId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[Library][${requestId}] DELETE failed`, error);
    return apiError(500, {
      errorCode: 'LIBRARY_CLEAR_FAILED',
      reason: 'Failed to clear library',
      requestId,
    });
  }
}
