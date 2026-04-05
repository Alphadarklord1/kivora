import { NextRequest, NextResponse } from 'next/server';
import { and, eq, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getUserId } from '@/lib/auth/get-user-id';
import { db, isDatabaseConfigured } from '@/lib/db';
import { studyGroups, studyGroupMembers, studyGroupNotes, users } from '@/lib/db/schema';

async function requireMember(userId: string, code: string) {
  const group = await db.query.studyGroups.findFirst({
    where: eq(studyGroups.joinCode, code.toUpperCase()),
  });
  if (!group) return { error: 'Group not found.', status: 404 as const };
  const member = await db.query.studyGroupMembers.findFirst({
    where: and(eq(studyGroupMembers.groupId, group.id), eq(studyGroupMembers.userId, userId)),
  });
  if (!member) return { error: 'Not a member of this group.', status: 403 as const };
  return { group, member };
}

/** GET /api/groups/[code]/notes */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json([]);
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { code } = await params;

  const check = await requireMember(userId, code);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  try {
    const notes = await db
      .select({
        id: studyGroupNotes.id,
        content: studyGroupNotes.content,
        postedAt: studyGroupNotes.postedAt,
        userId: studyGroupNotes.userId,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(studyGroupNotes)
      .leftJoin(users, eq(studyGroupNotes.userId, users.id))
      .where(eq(studyGroupNotes.groupId, check.group.id))
      .orderBy(desc(studyGroupNotes.postedAt))
      .limit(50);

    return NextResponse.json(notes.map(n => ({
      ...n,
      authorName: n.authorName ?? n.authorEmail ?? 'Unknown',
      isOwn: n.userId === userId,
      isGroupOwner: check.group.ownerId === userId,
    })));
  } catch (err) {
    console.error('[groups/notes][GET]', err);
    return NextResponse.json({ error: 'Failed to load notes' }, { status: 500 });
  }
}

/** POST /api/groups/[code]/notes */
export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { code } = await params;

  const body = await request.json().catch(() => null) as { content?: string } | null;
  const content = body?.content?.trim();
  if (!content) return NextResponse.json({ error: 'content is required.' }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: 'Note too long (max 2000 chars).' }, { status: 400 });

  const check = await requireMember(userId, code);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  try {
    const [note] = await db.insert(studyGroupNotes).values({
      id: uuidv4(),
      groupId: check.group.id,
      userId,
      content,
    }).returning();
    return NextResponse.json({ ok: true, note });
  } catch (err) {
    console.error('[groups/notes][POST]', err);
    return NextResponse.json({ error: 'Failed to post note' }, { status: 500 });
  }
}

/** DELETE /api/groups/[code]/notes?noteId=... */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { code } = await params;

  const noteId = new URL(request.url).searchParams.get('noteId');
  if (!noteId) return NextResponse.json({ error: 'noteId required.' }, { status: 400 });

  const check = await requireMember(userId, code);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const note = await db.query.studyGroupNotes.findFirst({
    where: and(eq(studyGroupNotes.id, noteId), eq(studyGroupNotes.groupId, check.group.id)),
  });
  if (!note) return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
  if (note.userId !== userId && check.group.ownerId !== userId) {
    return NextResponse.json({ error: 'Only the author or group owner can delete this note.' }, { status: 403 });
  }

  await db.delete(studyGroupNotes).where(eq(studyGroupNotes.id, noteId));
  return NextResponse.json({ ok: true });
}
