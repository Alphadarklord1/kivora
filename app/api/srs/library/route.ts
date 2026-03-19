import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getUserId } from '@/lib/auth/get-user-id';
import { db, isDatabaseConfigured } from '@/lib/db';
import { libraryItems, shares } from '@/lib/db/schema';

function buildDeckShareUrl(origin: string, shareToken: string) {
  return `${origin}/share/${shareToken}`;
}

function normalizeQuery(value: string | null) {
  return (value ?? '').trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured) return NextResponse.json([]);

  const query = normalizeQuery(new URL(request.url).searchParams.get('q'));

  try {
    const publicShares = await db.query.shares.findMany({
      where: and(eq(shares.shareType, 'link'), isNotNull(shares.libraryItemId)),
      orderBy: [desc(shares.createdAt)],
      limit: 60,
    });

    const results = [];
    for (const share of publicShares) {
      if (!share.libraryItemId || !share.shareToken) continue;

      const item = await db.query.libraryItems.findFirst({
        where: eq(libraryItems.id, share.libraryItemId),
      });

      if (!item || item.mode !== 'flashcards') continue;

      const metadata = (item.metadata ?? {}) as Record<string, unknown>;
      if (!metadata.publicDeck) continue;

      const title = String(metadata.title ?? 'Untitled deck');
      const description = String(metadata.description ?? '');
      const cardCount = Number(metadata.cardCount ?? 0);
      const haystack = `${title}\n${description}\n${item.content}`.toLowerCase();
      if (query && !haystack.includes(query)) continue;

      results.push({
        id: item.id,
        shareId: share.id,
        shareToken: share.shareToken,
        shareUrl: buildDeckShareUrl(request.nextUrl.origin, share.shareToken),
        title,
        description,
        cardCount,
        createdAt: item.createdAt,
        content: item.content,
      });
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('[srs/library][GET]', error);
    return NextResponse.json({ error: 'Failed to load public decks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    title?: string;
    description?: string;
    content?: string;
    cardCount?: number;
    sourceDeckId?: string;
  } | null;

  if (!body?.content || !body?.title) {
    return NextResponse.json({ error: 'title and content are required' }, { status: 400 });
  }

  try {
    const [item] = await db.insert(libraryItems).values({
      id: uuidv4(),
      userId,
      mode: 'flashcards',
      content: body.content,
      metadata: {
        publicDeck: true,
        title: body.title,
        description: body.description ?? '',
        cardCount: body.cardCount ?? 0,
        sourceDeckId: body.sourceDeckId ?? null,
        sourceDeckName: body.title,
        savedFrom: body.sourceDeckId ? `/study/${body.sourceDeckId}` : '/study',
      },
    }).returning();

    const shareToken = crypto.randomUUID().replace(/-/g, '');
    const [share] = await db.insert(shares).values({
      ownerId: userId,
      libraryItemId: item.id,
      shareType: 'link',
      shareToken,
      permission: 'view',
    }).returning();

    if (!share.shareToken) {
      throw new Error('Share token was not created');
    }

    return NextResponse.json({
      ok: true,
      itemId: item.id,
      shareId: share.id,
      shareToken: share.shareToken,
      shareUrl: buildDeckShareUrl(request.nextUrl.origin, share.shareToken),
    });
  } catch (error) {
    console.error('[srs/library][POST]', error);
    return NextResponse.json({ error: 'Failed to publish deck' }, { status: 500 });
  }
}
