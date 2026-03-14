import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { db, isDatabaseConfigured } from '@/lib/db';
import { srsPreferences } from '@/lib/db/schema';

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDatabaseConfigured) return NextResponse.json({ dailyGoal: 20, fallback: true });

  try {
    const [prefs] = await db.select().from(srsPreferences).where(eq(srsPreferences.userId, userId)).limit(1);
    return NextResponse.json({
      dailyGoal: prefs?.dailyGoal ?? 20,
    });
  } catch (error) {
    console.error('[srs/preferences][GET]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as { dailyGoal?: number } | null;
  const dailyGoal = Math.max(1, Math.min(500, Math.round(Number(body?.dailyGoal ?? 20))));

  if (!isDatabaseConfigured) return NextResponse.json({ ok: true, dailyGoal, fallback: true });

  try {
    await db
      .insert(srsPreferences)
      .values({ userId, dailyGoal, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: srsPreferences.userId,
        set: { dailyGoal, updatedAt: new Date() },
      });

    return NextResponse.json({ ok: true, dailyGoal });
  } catch (error) {
    console.error('[srs/preferences][PUT]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
