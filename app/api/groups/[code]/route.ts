import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { db, isDatabaseConfigured } from '@/lib/db';
import { studyGroups, studyGroupMembers } from '@/lib/db/schema';

/** GET /api/groups/[code] — get group details (members + decks) */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;

  try {
    const group = await db.query.studyGroups.findFirst({
      where: eq(studyGroups.joinCode, code.toUpperCase()),
      with: { members: { with: { user: true } }, decks: true },
    });
    if (!group) return NextResponse.json({ error: 'Group not found.' }, { status: 404 });

    // Must be a member to view
    const isMember = group.members.some(m => m.userId === userId);
    if (!isMember) return NextResponse.json({ error: 'You are not a member of this group.' }, { status: 403 });

    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      joinCode: group.joinCode,
      isOwner: group.ownerId === userId,
      members: group.members.map(m => ({
        userId: m.userId,
        role: m.role,
        name: m.user?.name ?? null,
        email: m.user?.email ?? null,
        joinedAt: m.joinedAt,
      })),
      decks: group.decks.map(d => ({
        id: d.id, deckName: d.deckName, cardCount: d.cardCount,
        content: d.content, shareToken: d.shareToken, addedAt: d.addedAt,
      })),
    });
  } catch (error) {
    console.error('[groups/[code]][GET]', error);
    return NextResponse.json({ error: 'Failed to load group' }, { status: 500 });
  }
}

/** DELETE /api/groups/[code] — leave or delete the group */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;

  try {
    const group = await db.query.studyGroups.findFirst({
      where: eq(studyGroups.joinCode, code.toUpperCase()),
    });
    if (!group) return NextResponse.json({ error: 'Group not found.' }, { status: 404 });

    if (group.ownerId === userId) {
      // Owner deletes the whole group (cascades to members + decks)
      await db.delete(studyGroups).where(eq(studyGroups.id, group.id));
      return NextResponse.json({ ok: true, action: 'deleted' });
    }

    // Member leaves the group
    await db.delete(studyGroupMembers).where(
      and(eq(studyGroupMembers.groupId, group.id), eq(studyGroupMembers.userId, userId)),
    );
    return NextResponse.json({ ok: true, action: 'left' });
  } catch (error) {
    console.error('[groups/[code]][DELETE]', error);
    return NextResponse.json({ error: 'Failed to leave/delete group' }, { status: 500 });
  }
}
