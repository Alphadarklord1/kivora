import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shares, files, folders, topics, libraryItems, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

// GET /api/share/[token] - Get shared content by token (public endpoint)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  // Find the share by token
  const share = await db.query.shares.findFirst({
    where: eq(shares.shareToken, token),
  });

  if (!share) {
    return NextResponse.json({ error: 'Share not found or link is invalid' }, { status: 404 });
  }

  if (share.shareType === 'user') {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Sign in required to access this share' }, { status: 401 });
    }
    if (userId !== share.ownerId && userId !== share.sharedWithUserId) {
      return NextResponse.json({ error: 'You do not have access to this share' }, { status: 403 });
    }
  }

  // Check if expired
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
    return NextResponse.json({ error: 'This share link has expired' }, { status: 410 });
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
    return NextResponse.json({ error: 'Shared content no longer exists' }, { status: 404 });
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
}
