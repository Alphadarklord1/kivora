import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { db, isDatabaseConfigured } from '@/lib/db';
import { srsReviewHistory } from '@/lib/db/schema';

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDatabaseConfigured) return NextResponse.json([]);

  const url = new URL(req.url);
  const deckId = url.searchParams.get('deckId');
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') ?? 120)));

  try {
    const rows = await db
      .select()
      .from(srsReviewHistory)
      .where(
        deckId
          ? and(eq(srsReviewHistory.userId, userId), eq(srsReviewHistory.deckId, deckId))
          : eq(srsReviewHistory.userId, userId),
      )
      .orderBy(desc(srsReviewHistory.reviewedAt))
      .limit(limit);

    return NextResponse.json(rows.map((row) => ({
      id: row.id,
      deckId: row.deckId,
      cardId: row.cardId,
      grade: row.grade,
      correct: row.correct,
      reviewedAt: row.reviewedAt,
      nextReview: row.nextReview,
      interval: row.interval,
      elapsedDays: row.elapsedDays,
      stability: typeof row.stability === 'number' ? row.stability : null,
      difficulty: typeof row.difficulty === 'number' ? row.difficulty : null,
    })));
  } catch (error) {
    console.error('[srs/review-history][GET]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    deckId?: string;
    cardId?: string;
    grade?: number;
    correct?: boolean;
    reviewedAt?: string;
    nextReview?: string;
    interval?: number;
    elapsedDays?: number;
    stability?: number | null;
    difficulty?: number | null;
  } | null;

  if (!body?.deckId || !body.cardId || typeof body.grade !== 'number' || !body.nextReview) {
    return NextResponse.json({ error: 'deckId, cardId, grade, and nextReview are required' }, { status: 400 });
  }

  if (!isDatabaseConfigured) return NextResponse.json({ ok: true, fallback: true });

  try {
    await db.insert(srsReviewHistory).values({
      userId,
      deckId: body.deckId,
      cardId: body.cardId,
      grade: Math.max(0, Math.min(3, Math.round(body.grade))),
      correct: Boolean(body.correct),
      reviewedAt: body.reviewedAt ? new Date(body.reviewedAt) : new Date(),
      nextReview: body.nextReview,
      interval: Math.max(1, Math.round(Number(body.interval ?? 1))),
      elapsedDays: Math.max(0, Math.round(Number(body.elapsedDays ?? 0))),
      stability: typeof body.stability === 'number' ? body.stability : null,
      difficulty: typeof body.difficulty === 'number' ? body.difficulty : null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[srs/review-history][POST]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
