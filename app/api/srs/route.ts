import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth/get-user-id';
import { db, isDatabaseConfigured } from '@/lib/db';
import { srsDecks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { GUEST_SESSION_HEADER, isGuestSessionId } from '@/lib/auth/guest-session';

// GET  /api/srs   — return all decks for the current user
export async function GET(req: NextRequest) {
  const guestSessionId = req.headers.get(GUEST_SESSION_HEADER)?.trim() ?? null;
  const hasGuestSession = isGuestSessionId(guestSessionId);
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDatabaseConfigured) return NextResponse.json([]);
  if (hasGuestSession || userId === 'local-demo-user' || userId.startsWith('guest:')) {
    return NextResponse.json([]);
  }

  try {
    const rows = await db.select().from(srsDecks).where(eq(srsDecks.userId, userId));
    return NextResponse.json(rows.map(r => r.deckData));
  } catch (e) {
    console.error('[srs/GET]', e);
    if (hasGuestSession) return NextResponse.json([]);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// PUT  /api/srs   — upsert a deck (body: { deck: SRSDeck })
export async function PUT(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDatabaseConfigured) return NextResponse.json({ ok: true });

  const body = await req.json().catch(() => null);
  if (!body?.deck?.id) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  try {
    await db
      .insert(srsDecks)
      .values({ id: body.deck.id, userId, deckData: body.deck, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: srsDecks.id,
        set:    { deckData: body.deck, updatedAt: new Date() },
        where:  eq(srsDecks.userId, userId),
      });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[srs/PUT]', e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
