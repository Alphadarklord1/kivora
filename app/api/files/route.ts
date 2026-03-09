import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { files, folders } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get('folderId');
  const topicId = searchParams.get('topicId');
  const liked = searchParams.get('liked');
  const pinned = searchParams.get('pinned');

  const conditions = [eq(files.userId, userId)];

  if (folderId) {
    conditions.push(eq(files.folderId, folderId));
  }
  if (topicId) {
    conditions.push(eq(files.topicId, topicId));
  }
  if (liked === 'true') {
    conditions.push(eq(files.liked, true));
  }
  if (pinned === 'true') {
    conditions.push(eq(files.pinned, true));
  }

    const userFiles = await db.query.files.findMany({
      where: and(...conditions),
      orderBy: [desc(files.createdAt)],
    });

    return NextResponse.json(userFiles);
  } catch (error) {
    console.error(`[Files][${requestId}] GET failed`, error);
    return apiError(500, {
      errorCode: 'FILES_FETCH_FAILED',
      reason: 'Failed to fetch files',
      requestId,
    });
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { name, type, content, folderId, topicId, localBlobId, mimeType, fileSize } = body;

    if (!name || !type || !folderId) {
      return apiError(400, {
        errorCode: 'INVALID_FILE_REQUEST',
        reason: 'Name, type, and folderId are required',
        requestId,
      });
    }

  // Verify folder belongs to user
  const folder = await db.query.folders.findFirst({
    where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
  });

    if (!folder) {
      return apiError(404, {
        errorCode: 'FILE_FOLDER_NOT_FOUND',
        reason: 'Folder not found',
        requestId,
      });
    }

    const [newFile] = await db.insert(files).values({
      userId,
      folderId,
      topicId: topicId || null,
      name,
      type,
      content: content || null,
      localBlobId: localBlobId || null,
      mimeType: mimeType || null,
      fileSize: fileSize || null,
    }).returning();

    return NextResponse.json(newFile, { status: 201 });
  } catch (error) {
    console.error(`[Files][${requestId}] POST failed`, error);
    return apiError(500, {
      errorCode: 'FILE_CREATE_FAILED',
      reason: 'Failed to create file',
      requestId,
    });
  }
}
