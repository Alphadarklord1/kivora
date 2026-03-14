import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth/get-user-id';
import { db, isDatabaseConfigured } from '@/lib/db';
import { studySessions } from '@/lib/db/schema';
import { eq, and, gte } from 'drizzle-orm';

// POST /api/srs/session — upsert today's study session
export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDatabaseConfigured) return NextResponse.json({ ok: true });

  const body = await req.json().catch(() => null);
  const { cardsReviewed = 0, minutesStudied = 0 } = body ?? {};
  const today = new Date().toISOString().split('T')[0];

  try {
    const existing = await db.query.studySessions.findFirst({
      where: and(eq(studySessions.userId, userId), eq(studySessions.date, today)),
    });
    if (existing) {
      await db
        .update(studySessions)
        .set({ cardsReviewed: existing.cardsReviewed + cardsReviewed, minutesStudied: existing.minutesStudied + minutesStudied })
        .where(and(eq(studySessions.userId, userId), eq(studySessions.date, today)));
    } else {
      await db.insert(studySessions).values({ userId, date: today, cardsReviewed, minutesStudied });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[srs/session/POST]', e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// GET /api/srs/session — return last 365 days of session data + streak
export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDatabaseConfigured) return NextResponse.json({ sessions: [], streak: 0 });

  try {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 365);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const rows   = await db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.userId, userId), gte(studySessions.date, cutoffStr)));

    // Compute streak
    const dateSet    = new Set(rows.filter(r => r.cardsReviewed > 0).map(r => r.date));
    let streak = 0;
    const d = new Date();
    const todayStr = d.toISOString().split('T')[0];
    if (!dateSet.has(todayStr)) d.setDate(d.getDate() - 1);
    while (true) {
      const ds = d.toISOString().split('T')[0];
      if (!dateSet.has(ds)) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }

    return NextResponse.json({ sessions: rows.map(r => ({ date: r.date, cards: r.cardsReviewed })), streak });
  } catch (e) {
    console.error('[srs/session/GET]', e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
