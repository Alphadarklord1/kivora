import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getUserId } from '@/lib/auth/get-user-id';
import { db, isDatabaseConfigured } from '@/lib/db';
import { studyGroups, studyGroupMembers } from '@/lib/db/schema';

/** POST /api/groups/join — join a group by its 6-character code */
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as { code?: string } | null;
  const code = body?.code?.trim().toUpperCase();
  if (!code || code.length !== 6) {
    return NextResponse.json({ error: 'Enter a valid 6-character group code.' }, { status: 400 });
  }

  try {
    const group = await db.query.studyGroups.findFirst({
      where: eq(studyGroups.joinCode, code),
    });
    if (!group) return NextResponse.json({ error: 'No group found with that code.' }, { status: 404 });

    // Already a member?
    const existing = await db.query.studyGroupMembers.findFirst({
      where: and(eq(studyGroupMembers.groupId, group.id), eq(studyGroupMembers.userId, userId)),
    });
    if (existing) {
      return NextResponse.json({ ok: true, group, alreadyMember: true });
    }

    await db.insert(studyGroupMembers).values({
      id: uuidv4(), groupId: group.id, userId, role: 'member',
    });

    return NextResponse.json({ ok: true, group });
  } catch (error) {
    console.error('[groups/join][POST]', error);
    return NextResponse.json({ error: 'Failed to join group' }, { status: 500 });
  }
}
