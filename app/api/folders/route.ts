import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { folders, topics } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getUserId, GUEST_USER_ID } from '@/lib/auth/session';
import { v4 as uuidv4 } from 'uuid';
import { betaReadFallback } from '@/lib/api/runtime-guards';

function notReady() {
  return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
}
function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
}

function isEphemeralGuest(userId: string | null | undefined) {
  return userId === GUEST_USER_ID || userId === 'local-demo-user' || Boolean(userId?.startsWith('guest:'));
}

// GET /api/folders — list all folders (with topics) for the current user
export async function GET() {
  if (!isDatabaseConfigured) return betaReadFallback([]);
  const userId = await getUserId();
  if (!userId) return betaReadFallback([]);
  if (isEphemeralGuest(userId)) return betaReadFallback([]);

  try {
    const rows = await db.query.folders.findMany({
      where: eq(folders.userId, userId),
      orderBy: [asc(folders.sortOrder), asc(folders.createdAt)],
      with: {
        topics: {
          orderBy: [asc(topics.sortOrder), asc(topics.createdAt)],
        },
      },
    });

    return NextResponse.json(rows);
  } catch (error) {
    console.error('[folders] GET failed', error);
    return betaReadFallback([]);
  }
}

// POST /api/folders — create a new folder
export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured) return notReady();
  const userId = await getUserId();
  if (!userId) return unauthorized();

  const { name } = await req.json().catch(() => ({}));
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Folder name is required.' }, { status: 400 });
  }

  const fallbackFolder = {
    id: uuidv4(),
    userId,
    name: name.trim(),
    expanded: true,
    sortOrder: 0,
    topics: [],
    localOnly: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (isEphemeralGuest(userId)) {
    return NextResponse.json(fallbackFolder, { status: 201 });
  }

  try {
    const [folder] = await db.insert(folders).values({
      id: fallbackFolder.id,
      userId,
      name: name.trim(),
      expanded: true,
      sortOrder: 0,
    }).returning();

    return NextResponse.json(folder, { status: 201 });
  } catch (error) {
    console.error('[folders] POST failed, falling back to local-only folder', error);
    return NextResponse.json(fallbackFolder, { status: 201 });
  }
}
