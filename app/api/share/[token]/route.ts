import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { shares, libraryItems, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { checkShareLimit } from '@/lib/api/auth-rate-limit';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
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
