import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/lib/db';
import { srsDecks } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth/get-user-id';
import type { SRSDeck } from '@/lib/srs/sm2';

type RouteContext = {
  params: Promise<{ deckId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });

  const { deckId } = await context.params;

  try {
    const row = await db.query.srsDecks.findFirst({
      where: and(eq(srsDecks.id, deckId), eq(srsDecks.userId, userId)),
    });
    if (!row) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
    return NextResponse.json(row.deckData);
  } catch (error) {
    console.error('[srs/[deckId]][GET]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });

  const { deckId } = await context.params;
  const body = await request.json().catch(() => null) as Partial<SRSDeck> & { deck?: SRSDeck } | null;

  try {
    const existing = await db.query.srsDecks.findFirst({
      where: and(eq(srsDecks.id, deckId), eq(srsDecks.userId, userId)),
    });
    if (!existing) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

    const nextDeck = body?.deck
      ? body.deck
      : {
          ...(existing.deckData as SRSDeck),
          ...(body ?? {}),
          id: deckId,
        };

    await db
      .update(srsDecks)
      .set({ deckData: nextDeck, updatedAt: new Date() })
      .where(and(eq(srsDecks.id, deckId), eq(srsDecks.userId, userId)));

    return NextResponse.json(nextDeck);
  } catch (error) {
    console.error('[srs/[deckId]][PATCH]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDatabaseConfigured) return NextResponse.json({ ok: true });

  const { deckId } = await context.params;

  try {
    await db
      .delete(srsDecks)
      .where(and(eq(srsDecks.id, deckId), eq(srsDecks.userId, userId)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[srs/[deckId]][DELETE]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
