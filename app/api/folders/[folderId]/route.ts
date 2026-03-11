import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { folders, topics } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { databaseUnavailable } from '@/lib/api/runtime-guards';

interface RouteParams {
  params: Promise<{ folderId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = createRequestId(request);
  try {
    if (!isDatabaseConfigured) {
      return databaseUnavailable(request, 'Folder lookup requires DATABASE_URL to be configured', undefined, requestId);
    }

    const userId = await getUserId(request);
    if (!userId) {
      return apiError(401, {
        errorCode: 'UNAUTHORIZED',
        reason: 'Authentication required',
        requestId,
      });
    }

    const { folderId } = await params;

    const folder = await db.query.folders.findFirst({
      where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
      with: {
        topics: {
          orderBy: [topics.sortOrder, topics.createdAt],
        },
      },
    });

    if (!folder) {
      return apiError(404, {
        errorCode: 'FOLDER_NOT_FOUND',
        reason: 'Folder not found',
        requestId,
      });
    }

    return NextResponse.json(folder);
  } catch (error) {
    console.error(`[Folder][${requestId}] GET failed`, error);
    return apiError(500, {
      errorCode: 'FOLDER_FETCH_FAILED',
      reason: 'Failed to fetch folder',
      requestId,
    });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const requestId = createRequestId(request);
  try {
    if (!isDatabaseConfigured) {
      return databaseUnavailable(request, 'Folder updates require DATABASE_URL to be configured', undefined, requestId);
    }

    const userId = await getUserId(request);
    if (!userId) {
      return apiError(401, {
        errorCode: 'UNAUTHORIZED',
        reason: 'Authentication required',
        requestId,
      });
    }

    const { folderId } = await params;
    const body = await request.json();
    const { name, expanded, sortOrder } = body;

    const [updated] = await db
      .update(folders)
      .set({
        ...(name !== undefined && { name }),
        ...(expanded !== undefined && { expanded }),
        ...(sortOrder !== undefined && { sortOrder }),
        updatedAt: new Date(),
      })
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .returning();

    if (!updated) {
      return apiError(404, {
        errorCode: 'FOLDER_NOT_FOUND',
        reason: 'Folder not found',
        requestId,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error(`[Folder][${requestId}] PUT failed`, error);
    return apiError(500, {
      errorCode: 'FOLDER_UPDATE_FAILED',
      reason: 'Failed to update folder',
      requestId,
    });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = createRequestId(request);
  try {
    if (!isDatabaseConfigured) {
      return databaseUnavailable(request, 'Folder deletion requires DATABASE_URL to be configured', undefined, requestId);
    }

    const userId = await getUserId(request);
    if (!userId) {
      return apiError(401, {
        errorCode: 'UNAUTHORIZED',
        reason: 'Authentication required',
        requestId,
      });
    }

    const { folderId } = await params;

    const [deleted] = await db
      .delete(folders)
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .returning();

    if (!deleted) {
      return apiError(404, {
        errorCode: 'FOLDER_NOT_FOUND',
        reason: 'Folder not found',
        requestId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[Folder][${requestId}] DELETE failed`, error);
    return apiError(500, {
      errorCode: 'FOLDER_DELETE_FAILED',
      reason: 'Failed to delete folder',
      requestId,
    });
  }
}
