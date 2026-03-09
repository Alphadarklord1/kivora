import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { folders, topics } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';

interface RouteParams {
  params: Promise<{ folderId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = createRequestId(request);
  try {
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
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return apiError(400, {
        errorCode: 'INVALID_TOPIC_NAME',
        reason: 'Name is required',
        requestId,
      });
    }

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

    const [newTopic] = await db.insert(topics).values({
      folderId,
      name: name.trim(),
    }).returning();

    return NextResponse.json(newTopic, { status: 201 });
  } catch (error) {
    console.error(`[Topics][${requestId}] POST failed`, error);
    return apiError(500, {
      errorCode: 'TOPIC_CREATE_FAILED',
      reason: 'Failed to create subfolder',
      requestId,
    });
  }
}
