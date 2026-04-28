import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { folders, topics } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';
import { v4 as uuidv4 } from 'uuid';

// POST /api/folders/[folderId]/topics — create a topic (subfolder)
export async function POST(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { folderId } = await params;

  // Verify the folder belongs to this user
  const folder = await db.query.folders.findFirst({
    where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
  });
  if (!folder) return NextResponse.json({ error: 'Folder not found.' }, { status: 404 });

  const { name } = await req.json().catch(() => ({}));
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Topic name is required.' }, { status: 400 });
  }

  const [topic] = await db.insert(topics).values({
    id: uuidv4(),
    folderId,
    name: name.trim(),
    sortOrder: 0,
  }).returning();

  return NextResponse.json(topic, { status: 201 });
}
