import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { libraryItems, shares, users } from '@/lib/db/schema';
import { and, count, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { apiError, createRequestId } from '@/lib/api/error-response';

// GET public user profile by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const requestId = createRequestId(request);
  try {
    const { userId } = await params;

    if (!userId) {
      return apiError(400, {
        errorCode: 'USER_ID_REQUIRED',
        reason: 'User ID required',
        requestId,
      });
    }

    // Get the requested user's public info
    const user = await db
      .select({
        id: users.id,
        name: users.name,
        image: users.image,
        bio: users.bio,
        studyInterests: users.studyInterests,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      return apiError(404, {
        errorCode: 'USER_NOT_FOUND',
        reason: 'User not found',
        requestId,
      });
    }

    const [publicShareCount] = await db
      .select({ total: count() })
      .from(shares)
      .where(and(
        eq(shares.ownerId, userId),
        eq(shares.shareType, 'link'),
        or(isNull(shares.expiresAt), gt(shares.expiresAt, new Date())),
      ));

    const [libraryCount] = await db
      .select({ total: count() })
      .from(libraryItems)
      .where(eq(libraryItems.userId, userId));

    const allItems = await db.query.libraryItems.findMany({
      where: eq(libraryItems.userId, userId),
      orderBy: [desc(libraryItems.createdAt)],
    });

    const activeShares = await db.query.shares.findMany({
      where: and(
        eq(shares.ownerId, userId),
        eq(shares.shareType, 'link'),
        or(isNull(shares.expiresAt), gt(shares.expiresAt, new Date())),
      ),
    });

    const shareByLibraryItemId = new Map(
      activeShares
        .filter((share) => Boolean(share.libraryItemId))
        .map((share) => [share.libraryItemId as string, share]),
    );

    const publishedItems = allItems
      .filter((item) => {
        const metadata = (item.metadata ?? {}) as Record<string, unknown>;
        return Boolean(metadata.publicProfile);
      })
      .slice(0, 8)
      .map((item) => {
        const metadata = (item.metadata ?? {}) as Record<string, unknown>;
        const relatedShare = shareByLibraryItemId.get(item.id);
        return {
          id: item.id,
          mode: item.mode,
          title: String(metadata.title ?? `${item.mode} item`),
          preview: String(item.content).replace(/\s+/g, ' ').trim().slice(0, 200),
          shareUrl: relatedShare?.shareToken ? `/share/${relatedShare.shareToken}` : null,
          createdAt: item.createdAt,
        };
      });

    return NextResponse.json({
      id: user[0].id,
      name: user[0].name,
      image: user[0].image,
      bio: user[0].bio,
      studyInterests: user[0].studyInterests,
      joinedAt: user[0].createdAt,
      stats: {
        publicShares: publicShareCount?.total ?? 0,
        studyItems: libraryCount?.total ?? 0,
        publishedItems: publishedItems.length,
      },
      publishedItems,
    });
  } catch (error) {
    console.error(`[UserProfile][${requestId}] GET failed`, error);
    return apiError(500, {
      errorCode: 'USER_PROFILE_FETCH_FAILED',
      reason: 'Failed to get user profile',
      requestId,
    });
  }
}
