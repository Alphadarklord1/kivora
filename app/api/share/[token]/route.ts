import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { shares, libraryItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
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

    // If it points to a library item, fetch the content
    if (share.libraryItemId) {
      const item = await db.query.libraryItems.findFirst({
        where: eq(libraryItems.id, share.libraryItemId),
      });
      if (item) {
        content = item.content;
        resourceName = `${item.mode} — ${new Date(item.createdAt).toLocaleDateString()}`;
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
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
    });
  } catch (err) {
    console.error('[share/token]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
