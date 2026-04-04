import { NextRequest, NextResponse } from 'next/server';
import { eq, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getUserId } from '@/lib/auth/get-user-id';
import { db, isDatabaseConfigured } from '@/lib/db';
import { studyGroups, studyGroupMembers } from '@/lib/db/schema';

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude O,0,1,I for readability
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** GET /api/groups — list groups the current user owns or has joined */
export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured) return NextResponse.json([]);
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Find memberships
    const memberships = await db.query.studyGroupMembers.findMany({
      where: eq(studyGroupMembers.userId, userId),
    });
    const groupIds = memberships.map(m => m.groupId);
    if (!groupIds.length) return NextResponse.json([]);

    const groups = await db.query.studyGroups.findMany({
      where: or(...groupIds.map(id => eq(studyGroups.id, id))),
      with: { members: true, decks: { with: { addedByUser: true } } },
    });

    const result = groups.map(g => ({
      id: g.id,
      name: g.name,
      description: g.description,
      joinCode: g.joinCode,
      isOwner: g.ownerId === userId,
      memberCount: g.members.length,
      deckCount: g.decks.length,
      createdAt: g.createdAt,
      decks: g.decks.map(d => ({
        id: d.id, deckName: d.deckName, cardCount: d.cardCount,
        content: d.content, shareToken: d.shareToken, addedAt: d.addedAt,
        addedByName: d.addedByUser?.name ?? d.addedByUser?.email ?? 'Unknown',
        addedByMe: d.addedBy === userId,
      })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('[groups][GET]', error);
    return NextResponse.json({ error: 'Failed to load groups' }, { status: 500 });
  }
}

/** POST /api/groups — create a new study group */
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as { name?: string; description?: string } | null;
  if (!body?.name?.trim()) return NextResponse.json({ error: 'Group name is required.' }, { status: 400 });

  // Generate a unique join code (retry up to 5 times on collision)
  let joinCode = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateJoinCode();
    const existing = await db.query.studyGroups.findFirst({
      where: eq(studyGroups.joinCode, candidate),
    });
    if (!existing) { joinCode = candidate; break; }
  }
  if (!joinCode) return NextResponse.json({ error: 'Could not generate a unique join code. Try again.' }, { status: 500 });

  try {
    const [group] = await db.insert(studyGroups).values({
      id: uuidv4(),
      ownerId: userId,
      name: body.name.trim().slice(0, 80),
      description: body.description?.trim().slice(0, 240) ?? null,
      joinCode,
    }).returning();

    // Auto-add owner as a member with 'owner' role
    await db.insert(studyGroupMembers).values({
      id: uuidv4(), groupId: group.id, userId, role: 'owner',
    });

    return NextResponse.json({ ok: true, group });
  } catch (error) {
    console.error('[groups][POST]', error);
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 });
  }
}
