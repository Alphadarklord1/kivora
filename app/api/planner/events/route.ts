import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { calendarEvents } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';
import { isGuestModeEnabled } from '@/lib/runtime/mode';

function isEphemeralGuest(userId: string) {
  return userId === 'guest' || userId === 'local-demo-user' || userId.startsWith('guest:');
}

// GET /api/planner/events — return all user-created events
export async function GET() {
  if (!isDatabaseConfigured) return NextResponse.json([], { status: 200 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  // Guests use localStorage — nothing to fetch from DB
  if (isGuestModeEnabled() && isEphemeralGuest(userId)) return NextResponse.json([]);

  try {
    const rows = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.userId, userId))
      .orderBy(desc(calendarEvents.date));
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[planner/events] GET failed', err);
    // Return empty so the client falls back to localStorage gracefully
    return NextResponse.json([]);
  }
}

// POST /api/planner/events — create a new event
export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured) return NextResponse.json({ ok: false, local: true });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (isGuestModeEnabled() && isEphemeralGuest(userId)) return NextResponse.json({ ok: false, local: true });

  const body = await req.json().catch(() => ({}));
  const { id, title, type, date, startTime, endTime, description, planId, completed, color } = body;

  if (!id || !title || !type || !date || !startTime || !endTime) {
    return NextResponse.json({ error: 'id, title, type, date, startTime, endTime are required.' }, { status: 400 });
  }

  try {
    const [row] = await db.insert(calendarEvents).values({
      id: id as string,
      userId,
      title: title as string,
      type: type as string,
      date: date as string,
      startTime: startTime as string,
      endTime: endTime as string,
      description: (description as string) ?? null,
      planId: (planId as string) ?? null,
      completed: Boolean(completed),
      color: (color as string) ?? null,
    }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error('[planner/events] POST failed', err);
    return NextResponse.json({ ok: false, local: true });
  }
}
