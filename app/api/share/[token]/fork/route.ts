/**
 * POST /api/share/[token]/fork
 * Copies a shared library item into the authenticated user's own library.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { shares, libraryItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { v4 as uuidv4 } from 'uuid';

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const requestId = createRequestId(req);
  if (!isDatabaseConfigured) return apiError(503, { errorCode: 'DB_NOT_CONFIGURED', reason: 'Database not configured', requestId });

  const { token } = await params;
  if (!token) return apiError(400, { errorCode: 'MISSING_TOKEN', reason: 'Missing token', requestId });

  const userId = await getUserId(req);
  if (!userId) return apiError(401, { errorCode: 'UNAUTHORIZED', reason: 'Authentication required to fork', requestId });

  try {
    const share = await db.query.shares.findFirst({ where: eq(shares.shareToken, token) });
    if (!share) return apiError(404, { errorCode: 'SHARE_NOT_FOUND', reason: 'Share not found', requestId });
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return apiError(410, { errorCode: 'SHARE_EXPIRED', reason: 'Share has expired', requestId });
    }
    // View-only shares cannot be forked — copying produces an editable
    // duplicate which exceeds the read-only contract the owner chose.
    // The owner of the share can always fork their own content elsewhere.
    if (share.permission === 'view' && share.ownerId !== userId) {
      return apiError(403, {
        errorCode: 'SHARE_VIEW_ONLY',
        reason: 'This share is view-only and cannot be copied to your library.',
        requestId,
      });
    }
    if (!share.libraryItemId) {
      return apiError(400, { errorCode: 'NO_LIBRARY_ITEM', reason: 'This share has no forkable content', requestId });
    }

    const source = await db.query.libraryItems.findFirst({ where: eq(libraryItems.id, share.libraryItemId) });
    if (!source) return apiError(404, { errorCode: 'SOURCE_NOT_FOUND', reason: 'Source library item not found', requestId });

    // Build metadata preserving title but noting it is a fork
    const sourceMeta = (source.metadata ?? {}) as Record<string, unknown>;
    const title = sourceMeta.title
      ? `${String(sourceMeta.title)} (forked)`
      : `${source.mode} (forked)`;

    const [forked] = await db.insert(libraryItems).values({
      id: uuidv4(),
      userId,
      mode: source.mode,
      content: source.content,
      metadata: { ...sourceMeta, title, forkedFrom: share.id },
    }).returning();

    return NextResponse.json({ id: forked.id, mode: forked.mode }, { status: 201 });
  } catch (err) {
    console.error(`[share/fork][${requestId}]`, err);
    return apiError(500, { errorCode: 'FORK_FAILED', reason: 'Failed to fork share', requestId });
  }
}
