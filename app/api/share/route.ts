import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { shares, files, folders, topics, libraryItems, users } from '@/lib/db/schema';
import { eq, and, or, desc } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { betaReadFallback } from '@/lib/api/runtime-guards';
import { isGuestModeEnabled } from '@/lib/runtime/mode';

function isEphemeralGuest(userId: string) {
  return userId === 'guest' || userId === 'local-demo-user' || userId.startsWith('guest:');
}

function generateShareToken(): string {
  return randomBytes(16).toString('hex');
}

function buildShareUrl(origin: string, shareToken: string) {
  return `${origin}/share/${shareToken}`;
}

// GET /api/share - List all shares for the current user
export async function GET(request: NextRequest) {
  const requestId = createRequestId(request);
  try {
    const userId = await getUserId(request);
    // Guest / unauthenticated — return empty list gracefully (not an error)
    if (!userId) {
      return NextResponse.json([]);
    }
    // Without a DB the share queries below crash with "db is null". In
    // guest / no-DB mode we have no shares to show anyway.
    if (!isDatabaseConfigured) {
      return NextResponse.json([]);
    }
    // Note: previously we used betaReadFallback([]) for ephemeral guests
    // here, which made the Sharing page LIST always-empty for guests
    // even after they successfully created a share. The token they hold
    // works fine; the list query just hid their own work. Guests now see
    // their own shares (filtered by their guest userId, same as authed
    // users) — that's not a privacy leak; the user is the owner.

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'owned' | 'shared' | null (all)
    const origin = request.nextUrl.origin;

    let userShares;

    if (type === 'owned') {
      userShares = await db.query.shares.findMany({
        where: eq(shares.ownerId, userId),
        orderBy: [desc(shares.createdAt)],
      });
    } else if (type === 'shared') {
      userShares = await db.query.shares.findMany({
        where: eq(shares.sharedWithUserId, userId),
        orderBy: [desc(shares.createdAt)],
      });
    } else {
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
          shareUrl: share.shareToken ? buildShareUrl(origin, share.shareToken) : null,
        };
      })
    );

    return NextResponse.json(enrichedShares);
  } catch (error) {
    console.error(`[Share][${requestId}] GET failed`, error);
    if (isGuestModeEnabled()) return betaReadFallback([]);
    return apiError(500, {
      errorCode: 'SHARES_FETCH_FAILED',
      reason: 'Failed to fetch shares',
      requestId,
    });
  }
}

// POST /api/share - Create a new share
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
    // Need a DB to insert a share row. Without one the call to db.insert
    // crashes; surface a clean 503 so the UI can degrade gracefully.
    if (!isDatabaseConfigured) {
      return apiError(503, {
        errorCode: 'DB_UNAVAILABLE',
        reason: 'Sharing is not available in this environment.',
        requestId,
      });
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

    if (!fileId && !folderId && !topicId && !libraryItemId) {
      return apiError(400, {
        errorCode: 'INVALID_SHARE_REQUEST',
        reason: 'Must specify fileId, folderId, topicId, or libraryItemId',
        requestId,
      });
    }

  // Verify ownership of the resource
  if (fileId) {
    const file = await db.query.files.findFirst({
      where: and(eq(files.id, fileId), eq(files.userId, userId)),
    });
    if (!file) {
      return apiError(404, {
        errorCode: 'SHARE_FILE_NOT_FOUND',
        reason: 'File not found or not owned by you',
        requestId,
      });
    }
  }

  if (folderId) {
    const folder = await db.query.folders.findFirst({
      where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
    });
    if (!folder) {
      return apiError(404, {
        errorCode: 'SHARE_FOLDER_NOT_FOUND',
        reason: 'Folder not found or not owned by you',
        requestId,
      });
    }
  }

  if (topicId) {
    const topic = await db.query.topics.findFirst({
      where: eq(topics.id, topicId),
    });
    if (!topic) {
      return apiError(404, {
        errorCode: 'SHARE_TOPIC_NOT_FOUND',
        reason: 'Subfolder not found',
        requestId,
      });
    }
    // Verify the folder belongs to the user
    const folder = await db.query.folders.findFirst({
      where: and(eq(folders.id, topic.folderId), eq(folders.userId, userId)),
    });
    if (!folder) {
      return apiError(404, {
        errorCode: 'SHARE_TOPIC_NOT_OWNED',
        reason: 'Subfolder not owned by you',
        requestId,
      });
    }
  }

  if (libraryItemId) {
    const item = await db.query.libraryItems.findFirst({
      where: and(eq(libraryItems.id, libraryItemId), eq(libraryItems.userId, userId)),
    });
    if (!item) {
      return apiError(404, {
        errorCode: 'SHARE_LIBRARY_NOT_FOUND',
        reason: 'Library item not found or not owned by you',
        requestId,
      });
    }
  }

  // Handle user share
  let sharedWithUserId = null;
  if (shareType === 'user' && sharedWithEmail) {
    const sharedUser = await db.query.users.findFirst({
      where: eq(users.email, String(sharedWithEmail).toLowerCase().trim()),
    });
    if (!sharedUser) {
      return apiError(404, {
        errorCode: 'SHARE_USER_NOT_FOUND',
        reason: 'User not found with that email',
        requestId,
      });
    }
    if (sharedUser.id === userId) {
      return apiError(400, {
        errorCode: 'SHARE_SELF_FORBIDDEN',
        reason: 'Cannot share with yourself',
        requestId,
      });
    }
    sharedWithUserId = sharedUser.id;
  }

  // Generate share token for both link and user shares (user shares require auth in the shared view)
  const shareToken = generateShareToken();

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

  const shareUrl = shareToken ? buildShareUrl(request.nextUrl.origin, shareToken) : null;

    return NextResponse.json({
      ...newShare,
      shareUrl,
    }, { status: 201 });
  } catch (error) {
    console.error(`[Share][${requestId}] POST failed`, error);
    return apiError(500, {
      errorCode: 'SHARE_CREATE_FAILED',
      reason: 'Failed to create share',
      requestId,
    });
  }
}

// DELETE /api/share - Delete a share
export async function DELETE(request: NextRequest) {
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
    if (!isDatabaseConfigured) {
      return apiError(503, {
        errorCode: 'DB_UNAVAILABLE',
        reason: 'Sharing is not available in this environment.',
        requestId,
      });
    }

    const { searchParams } = new URL(request.url);
    const shareId = searchParams.get('id');

    if (!shareId) {
      return apiError(400, {
        errorCode: 'SHARE_ID_REQUIRED',
        reason: 'Share ID is required',
        requestId,
      });
    }

  // Verify ownership
  const share = await db.query.shares.findFirst({
    where: and(eq(shares.id, shareId), eq(shares.ownerId, userId)),
  });

    if (!share) {
      return apiError(404, {
        errorCode: 'SHARE_NOT_FOUND',
        reason: 'Share not found or not owned by you',
        requestId,
      });
    }

    await db.delete(shares).where(eq(shares.id, shareId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[Share][${requestId}] DELETE failed`, error);
    return apiError(500, {
      errorCode: 'SHARE_DELETE_FAILED',
      reason: 'Failed to delete share',
      requestId,
    });
  }
}
