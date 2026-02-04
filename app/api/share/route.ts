import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { shares, files, folders, topics, libraryItems, users } from '@/lib/db/schema';
import { eq, and, or, desc } from 'drizzle-orm';
import { randomBytes } from 'crypto';

async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    });
    return (token?.id as string) || (token?.sub as string) || null;
  } catch {
    return null;
  }
}

function generateShareToken(): string {
  return randomBytes(16).toString('hex');
}

// GET /api/share - List all shares for the current user
export async function GET(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'owned' | 'shared' | null (all)

  let userShares;

  if (type === 'owned') {
    // Shares created by the user
    userShares = await db.query.shares.findMany({
      where: eq(shares.ownerId, userId),
      orderBy: [desc(shares.createdAt)],
    });
  } else if (type === 'shared') {
    // Shares shared with the user
    userShares = await db.query.shares.findMany({
      where: eq(shares.sharedWithUserId, userId),
      orderBy: [desc(shares.createdAt)],
    });
  } else {
    // All shares (owned or shared with user)
    userShares = await db.query.shares.findMany({
      where: or(
        eq(shares.ownerId, userId),
        eq(shares.sharedWithUserId, userId)
      ),
      orderBy: [desc(shares.createdAt)],
    });
  }

  // Enrich shares with resource names
  const enrichedShares = await Promise.all(
    userShares.map(async (share) => {
      let resourceName = 'Unknown';
      let resourceType = 'unknown';

      if (share.fileId) {
        const file = await db.query.files.findFirst({
          where: eq(files.id, share.fileId),
        });
        resourceName = file?.name || 'Deleted File';
        resourceType = 'file';
      } else if (share.folderId) {
        const folder = await db.query.folders.findFirst({
          where: eq(folders.id, share.folderId),
        });
        resourceName = folder?.name || 'Deleted Folder';
        resourceType = 'folder';
      } else if (share.topicId) {
        const topic = await db.query.topics.findFirst({
          where: eq(topics.id, share.topicId),
        });
        resourceName = topic?.name || 'Deleted Subfolder';
        resourceType = 'topic';
      } else if (share.libraryItemId) {
        const item = await db.query.libraryItems.findFirst({
          where: eq(libraryItems.id, share.libraryItemId),
        });
        resourceName = item?.mode ? `${item.mode} item` : 'Deleted Item';
        resourceType = 'library';
      }

      // Get shared with user email if user share
      let sharedWithEmail = null;
      if (share.sharedWithUserId) {
        const sharedUser = await db.query.users.findFirst({
          where: eq(users.id, share.sharedWithUserId),
        });
        sharedWithEmail = sharedUser?.email || null;
      }

      return {
        ...share,
        resourceName,
        resourceType,
        sharedWithEmail,
        shareUrl: share.shareToken ? `${process.env.NEXT_PUBLIC_APP_URL || ''}/shared/${share.shareToken}` : null,
      };
    })
  );

  return NextResponse.json(enrichedShares);
}

// POST /api/share - Create a new share
export async function POST(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const {
    fileId,
    folderId,
    topicId,
    libraryItemId,
    shareType = 'link',
    sharedWithEmail,
    permission = 'view',
    expiresInDays
  } = body;

  // Validate that at least one resource is specified
  if (!fileId && !folderId && !topicId && !libraryItemId) {
    return NextResponse.json(
      { error: 'Must specify fileId, folderId, topicId, or libraryItemId' },
      { status: 400 }
    );
  }

  // Verify ownership of the resource
  if (fileId) {
    const file = await db.query.files.findFirst({
      where: and(eq(files.id, fileId), eq(files.userId, userId)),
    });
    if (!file) {
      return NextResponse.json({ error: 'File not found or not owned by you' }, { status: 404 });
    }
  }

  if (folderId) {
    const folder = await db.query.folders.findFirst({
      where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
    });
    if (!folder) {
      return NextResponse.json({ error: 'Folder not found or not owned by you' }, { status: 404 });
    }
  }

  if (topicId) {
    const topic = await db.query.topics.findFirst({
      where: eq(topics.id, topicId),
    });
    if (!topic) {
      return NextResponse.json({ error: 'Subfolder not found' }, { status: 404 });
    }
    // Verify the folder belongs to the user
    const folder = await db.query.folders.findFirst({
      where: and(eq(folders.id, topic.folderId), eq(folders.userId, userId)),
    });
    if (!folder) {
      return NextResponse.json({ error: 'Subfolder not owned by you' }, { status: 404 });
    }
  }

  if (libraryItemId) {
    const item = await db.query.libraryItems.findFirst({
      where: and(eq(libraryItems.id, libraryItemId), eq(libraryItems.userId, userId)),
    });
    if (!item) {
      return NextResponse.json({ error: 'Library item not found or not owned by you' }, { status: 404 });
    }
  }

  // Handle user share
  let sharedWithUserId = null;
  if (shareType === 'user' && sharedWithEmail) {
    const sharedUser = await db.query.users.findFirst({
      where: eq(users.email, sharedWithEmail.toLowerCase()),
    });
    if (!sharedUser) {
      return NextResponse.json({ error: 'User not found with that email' }, { status: 404 });
    }
    if (sharedUser.id === userId) {
      return NextResponse.json({ error: 'Cannot share with yourself' }, { status: 400 });
    }
    sharedWithUserId = sharedUser.id;
  }

  // Generate share token for link shares
  const shareToken = shareType === 'link' ? generateShareToken() : null;

  // Calculate expiration
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  // Create the share
  const [newShare] = await db.insert(shares).values({
    ownerId: userId,
    fileId: fileId || null,
    folderId: folderId || null,
    topicId: topicId || null,
    libraryItemId: libraryItemId || null,
    shareType,
    shareToken,
    sharedWithUserId,
    permission,
    expiresAt,
  }).returning();

  const shareUrl = shareToken
    ? `${process.env.NEXT_PUBLIC_APP_URL || ''}/shared/${shareToken}`
    : null;

  return NextResponse.json({
    ...newShare,
    shareUrl,
  }, { status: 201 });
}

// DELETE /api/share - Delete a share
export async function DELETE(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const shareId = searchParams.get('id');

  if (!shareId) {
    return NextResponse.json({ error: 'Share ID is required' }, { status: 400 });
  }

  // Verify ownership
  const share = await db.query.shares.findFirst({
    where: and(eq(shares.id, shareId), eq(shares.ownerId, userId)),
  });

  if (!share) {
    return NextResponse.json({ error: 'Share not found or not owned by you' }, { status: 404 });
  }

  await db.delete(shares).where(eq(shares.id, shareId));

  return NextResponse.json({ success: true });
}
