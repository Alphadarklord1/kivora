import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { folders, topics } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getUserId, GUEST_USER_ID } from '@/lib/auth/session';
import { v4 as uuidv4 } from 'uuid';

function notReady() {
  return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
}
function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
}

// GET /api/folders — list all folders (with topics) for the current user
export async function GET() {
  if (!isDatabaseConfigured) return notReady();
  const userId = await getUserId();
  if (!userId) return unauthorized();

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

  const [folder] = await db.insert(folders).values({
    id: uuidv4(),
    userId,
    name: name.trim(),
    expanded: true,
    sortOrder: 0,
  }).returning();

  return NextResponse.json(folder, { status: 201 });
}
