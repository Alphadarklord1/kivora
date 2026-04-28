import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { calendarEvents } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';
import { isGuestModeEnabled } from '@/lib/runtime/mode';

function isEphemeralGuest(userId: string) {
  return userId === 'guest' || userId === 'local-demo-user' || userId.startsWith('guest:');
}

// PATCH /api/planner/events/[id] — update an event
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ ok: false, local: true });
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (isGuestModeEnabled() && isEphemeralGuest(userId)) return NextResponse.json({ ok: false, local: true });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const patch: Partial<typeof calendarEvents.$inferInsert> = { updatedAt: new Date() };
  if ('title'       in body) patch.title       = body.title as string;
  if ('type'        in body) patch.type        = body.type as string;
  if ('date'        in body) patch.date        = body.date as string;
  if ('startTime'   in body) patch.startTime   = body.startTime as string;
  if ('endTime'     in body) patch.endTime     = body.endTime as string;
  if ('description' in body) patch.description = body.description as string;
  if ('completed'   in body) patch.completed   = Boolean(body.completed);
  if ('color'       in body) patch.color       = body.color as string;

  try {
    const [row] = await db
      .update(calendarEvents)
      .set(patch)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
      .returning();
    if (!row) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    console.error('[planner/events] PATCH failed', err);
    return NextResponse.json({ ok: false, local: true });
  }
}

// DELETE /api/planner/events/[id] — delete an event
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ ok: true });
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (isGuestModeEnabled() && isEphemeralGuest(userId)) return NextResponse.json({ ok: true });

  const { id } = await params;

  try {
    await db
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[planner/events] DELETE failed', err);
    return NextResponse.json({ ok: true }); // client already updated localStorage
  }
}
