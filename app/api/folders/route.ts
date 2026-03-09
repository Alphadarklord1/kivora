import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { folders, topics } from '@/lib/db/schema';
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

    const userFolders = await db.query.folders.findMany({
      where: eq(folders.userId, userId),
      with: {
        topics: {
          orderBy: [topics.sortOrder, topics.createdAt],
        },
      },
      orderBy: [folders.sortOrder, desc(folders.createdAt)],
    });

    return NextResponse.json(userFolders);
  } catch (error) {
    console.error(`[Folders][${requestId}] GET failed`, error);
    return apiError(500, {
      errorCode: 'FOLDERS_FETCH_FAILED',
      reason: 'Failed to fetch folders',
      requestId,
    });
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId(request);
  try {
    if (!isDatabaseConfigured) {
      return databaseUnavailable(request, 'Folder creation requires DATABASE_URL to be configured', undefined, requestId);
    }

    const userId = await getUserId(request);
    if (!userId) {
      return unauthorized(request, requestId);
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return apiError(400, {
        errorCode: 'INVALID_FOLDER_NAME',
        reason: 'Folder name is required',
        requestId,
      });
    }

    const [newFolder] = await db.insert(folders).values({
      userId,
      name: name.trim(),
    }).returning();

    return NextResponse.json(newFolder, { status: 201 });
  } catch (error) {
    console.error(`[Folders][${requestId}] POST failed`, error);
    return apiError(500, {
      errorCode: 'FOLDER_CREATE_FAILED',
      reason: 'Failed to create folder',
      details: error instanceof Error ? error.message : String(error),
      requestId,
    });
  }
}
