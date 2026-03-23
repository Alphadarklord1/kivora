import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { shares, libraryItems, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { checkShareLimit } from '@/lib/api/auth-rate-limit';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const rateLimitRes = checkShareLimit(req);
  if (rateLimitRes) return rateLimitRes;

  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  if (!isDatabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const share = await db.query.shares.findFirst({
      where: eq(shares.shareToken, token),
    });

    if (!share) return NextResponse.json({ error: 'Share not found' }, { status: 404 });

    // Check expiry
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
    }

    let content: string | undefined;
    let resourceName = 'Shared Content';
    let resourceType = 'content';
    const owner = await db.query.users.findFirst({
      where: eq(users.id, share.ownerId),
      columns: { name: true, email: true },
    });
    const ownerName = owner?.name || owner?.email || undefined;

    // If it points to a library item, fetch the content
    if (share.libraryItemId) {
      const item = await db.query.libraryItems.findFirst({
        where: eq(libraryItems.id, share.libraryItemId),
      });
      if (item) {
        content = item.content;
        const metadata = (item.metadata ?? {}) as Record<string, unknown>;
        resourceName = String(metadata.title ?? `${item.mode} — ${new Date(item.createdAt).toLocaleDateString()}`);
        resourceType = item.mode;
      }
    }

    return NextResponse.json({
      id: share.id,
      shareToken: share.shareToken,
      shareType: share.shareType,
      permission: share.permission,
      resourceName,
      resourceType,
      content,
      ownerName,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
    });
  } catch (err) {
    console.error('[share/token]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** PATCH /api/share/[token] — update content when permission is 'edit' */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const requestId = createRequestId(req);
  if (!isDatabaseConfigured) return apiError(503, { errorCode: 'DB_NOT_CONFIGURED', reason: 'Database not configured', requestId });

  const { token } = await params;
  if (!token) return apiError(400, { errorCode: 'MISSING_TOKEN', reason: 'Missing token', requestId });

  const userId = await getUserId(req);
  if (!userId) return apiError(401, { errorCode: 'UNAUTHORIZED', reason: 'Authentication required', requestId });

  try {
    const share = await db.query.shares.findFirst({ where: eq(shares.shareToken, token) });
    if (!share) return apiError(404, { errorCode: 'SHARE_NOT_FOUND', reason: 'Share not found', requestId });
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return apiError(410, { errorCode: 'SHARE_EXPIRED', reason: 'Share has expired', requestId });
    }
    if (share.permission !== 'edit') {
      return apiError(403, { errorCode: 'SHARE_READ_ONLY', reason: 'This share is view-only', requestId });
    }
    // Must be the owner OR the explicitly shared-with user
    const isOwner = share.ownerId === userId;
    const isRecipient = share.sharedWithUserId === userId;
    const isLinkShare = share.shareType === 'link'; // link shares: any authenticated user may edit
    if (!isOwner && !isRecipient && !isLinkShare) {
      return apiError(403, { errorCode: 'FORBIDDEN', reason: 'You do not have edit access', requestId });
    }

    if (!share.libraryItemId) {
      return apiError(400, { errorCode: 'NO_LIBRARY_ITEM', reason: 'This share does not link to editable content', requestId });
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const content = typeof body.content === 'string' ? body.content : null;
    if (content === null) return apiError(400, { errorCode: 'MISSING_CONTENT', reason: 'content is required', requestId });

    await db.update(libraryItems)
      .set({ content })
      .where(eq(libraryItems.id, share.libraryItemId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[share/token PATCH][${requestId}]`, err);
    return apiError(500, { errorCode: 'SHARE_UPDATE_FAILED', reason: 'Failed to update content', requestId });
  }
}
