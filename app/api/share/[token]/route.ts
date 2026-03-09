import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shares, files, folders, topics, libraryItems, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';

// GET /api/share/[token] - Get shared content by token (public endpoint)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const requestId = createRequestId(request);
  try {
    const { token } = await params;

    if (!token) {
      return apiError(400, {
        errorCode: 'SHARE_TOKEN_REQUIRED',
        reason: 'Token is required',
        requestId,
      });
    }

  // Find the share by token
  const share = await db.query.shares.findFirst({
    where: eq(shares.shareToken, token),
  });

    if (!share) {
      return apiError(404, {
        errorCode: 'SHARE_NOT_FOUND',
        reason: 'Share not found or link is invalid',
        requestId,
      });
    }

  if (share.shareType === 'user') {
    const userId = await getUserId(request);
      if (!userId) {
        return apiError(401, {
          errorCode: 'SHARE_SIGNIN_REQUIRED',
          reason: 'Sign in required to access this share',
          requestId,
        });
      }
      if (userId !== share.ownerId && userId !== share.sharedWithUserId) {
        return apiError(403, {
          errorCode: 'SHARE_ACCESS_DENIED',
          reason: 'You do not have access to this share',
          requestId,
        });
      }
    }

    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return apiError(410, {
        errorCode: 'SHARE_EXPIRED',
        reason: 'This share link has expired',
        requestId,
      });
    }

  // Get owner info
  const owner = await db.query.users.findFirst({
    where: eq(users.id, share.ownerId),
  });

  // Get the shared content
  let content = null;
  let contentType = 'unknown';
  let contentName = 'Unknown';

  if (share.fileId) {
    const file = await db.query.files.findFirst({
      where: eq(files.id, share.fileId),
    });
    if (file) {
      content = {
        id: file.id,
        name: file.name,
        type: file.type,
        content: file.content,
        mimeType: file.mimeType,
        createdAt: file.createdAt,
        // Note: localBlobId is intentionally not included as blobs are device-local
        hasBlob: !!file.localBlobId,
      };
      contentType = 'file';
      contentName = file.name;
    }
  } else if (share.folderId) {
    const folder = await db.query.folders.findFirst({
      where: eq(folders.id, share.folderId),
    });
    if (folder) {
      // Get folder's topics and files
      const folderTopics = await db.query.topics.findMany({
        where: eq(topics.folderId, folder.id),
      });
      const folderFiles = await db.query.files.findMany({
        where: eq(files.folderId, folder.id),
      });

      content = {
        id: folder.id,
        name: folder.name,
        topics: folderTopics.map(t => ({ id: t.id, name: t.name })),
        files: folderFiles.map(f => ({
          id: f.id,
          name: f.name,
          type: f.type,
          content: share.permission === 'view' ? f.content : null,
          createdAt: f.createdAt,
        })),
        createdAt: folder.createdAt,
      };
      contentType = 'folder';
      contentName = folder.name;
    }
  } else if (share.topicId) {
    const topic = await db.query.topics.findFirst({
      where: eq(topics.id, share.topicId),
    });
    if (topic) {
      // Get topic's files
      const topicFiles = await db.query.files.findMany({
        where: eq(files.topicId, topic.id),
      });

      content = {
        id: topic.id,
        name: topic.name,
        files: topicFiles.map(f => ({
          id: f.id,
          name: f.name,
          type: f.type,
          content: share.permission === 'view' ? f.content : null,
          createdAt: f.createdAt,
        })),
        createdAt: topic.createdAt,
      };
      contentType = 'topic';
      contentName = topic.name;
    }
  } else if (share.libraryItemId) {
    const item = await db.query.libraryItems.findFirst({
      where: eq(libraryItems.id, share.libraryItemId),
    });
    if (item) {
      content = {
        id: item.id,
        mode: item.mode,
        content: item.content,
        metadata: item.metadata,
        createdAt: item.createdAt,
      };
      contentType = 'library';
      contentName = `${item.mode} item`;
    }
  }

    if (!content) {
      return apiError(404, {
        errorCode: 'SHARED_CONTENT_MISSING',
        reason: 'Shared content no longer exists',
        requestId,
      });
    }

    return NextResponse.json({
      share: {
        id: share.id,
        shareType: share.shareType,
        permission: share.permission,
        createdAt: share.createdAt,
        expiresAt: share.expiresAt,
      },
      owner: {
        name: owner?.name || 'Anonymous',
        image: owner?.image || null,
      },
      contentType,
      contentName,
      content,
    });
  } catch (error) {
    console.error(`[ShareToken][${requestId}] GET failed`, error);
    return apiError(500, {
      errorCode: 'SHARE_FETCH_FAILED',
      reason: 'Failed to load shared content',
      requestId,
    });
  }
}
