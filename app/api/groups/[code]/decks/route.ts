import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getUserId } from '@/lib/auth/get-user-id';
import { db, isDatabaseConfigured } from '@/lib/db';
import { studyGroups, studyGroupMembers, studyGroupDecks } from '@/lib/db/schema';

async function requireGroupMember(userId: string, code: string) {
  const group = await db.query.studyGroups.findFirst({
    where: eq(studyGroups.joinCode, code.toUpperCase()),
  });
  if (!group) return { error: 'Group not found.', status: 404 };
  const member = await db.query.studyGroupMembers.findFirst({
    where: and(eq(studyGroupMembers.groupId, group.id), eq(studyGroupMembers.userId, userId)),
  });
  if (!member) return { error: 'You are not a member of this group.', status: 403 };
  return { group, member };
}

/** POST /api/groups/[code]/decks — share a deck into the group */
export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { code } = await params;

  const body = await request.json().catch(() => null) as {
    deckName?: string; cardCount?: number; content?: string; shareToken?: string;
  } | null;

  if (!body?.deckName?.trim() || !body?.content?.trim()) {
    return NextResponse.json({ error: 'deckName and content are required.' }, { status: 400 });
  }

  const check = await requireGroupMember(userId, code);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const { group } = check;

  try {
    const [deck] = await db.insert(studyGroupDecks).values({
      id: uuidv4(),
      groupId: group.id,
      deckName: body.deckName.trim().slice(0, 120),
      cardCount: body.cardCount ?? 0,
      content: body.content.trim(),
      shareToken: body.shareToken ?? null,
      addedBy: userId,
    }).returning();

    return NextResponse.json({ ok: true, deck });
  } catch (error) {
    console.error('[groups/[code]/decks][POST]', error);
    return NextResponse.json({ error: 'Failed to share deck' }, { status: 500 });
  }
}

/** DELETE /api/groups/[code]/decks?deckId=... — remove a deck from the group */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { code } = await params;

  const deckId = new URL(request.url).searchParams.get('deckId');
  if (!deckId) return NextResponse.json({ error: 'deckId query param required.' }, { status: 400 });

  const check = await requireGroupMember(userId, code);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const { group, member } = check;

  const deck = await db.query.studyGroupDecks.findFirst({
    where: and(eq(studyGroupDecks.id, deckId), eq(studyGroupDecks.groupId, group.id)),
  });
  if (!deck) return NextResponse.json({ error: 'Deck not found.' }, { status: 404 });

  // Only the deck adder or group owner can remove it
  const isOwner = member.role === 'owner';
  if (deck.addedBy !== userId && !isOwner) {
    return NextResponse.json({ error: 'Only the person who shared the deck or the group owner can remove it.' }, { status: 403 });
  }

  await db.delete(studyGroupDecks).where(eq(studyGroupDecks.id, deckId));
  return NextResponse.json({ ok: true });
}
