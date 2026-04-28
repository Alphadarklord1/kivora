import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { folders, topics } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';

// DELETE /api/folders/[folderId]/topics/[topicId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ folderId: string; topicId: string }> },
) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { folderId, topicId } = await params;

  // Ownership: verify folder belongs to user
  const folder = await db.query.folders.findFirst({
    where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
  });
  if (!folder) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await db.delete(topics).where(
    and(eq(topics.id, topicId), eq(topics.folderId, folderId)),
  );

  return NextResponse.json({ ok: true });
}

// PATCH /api/folders/[folderId]/topics/[topicId] — rename
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ folderId: string; topicId: string }> },
) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { folderId, topicId } = await params;

  const folder = await db.query.folders.findFirst({
    where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
  });
  if (!folder) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const { name } = await req.json().catch(() => ({}));
  if (!name?.trim()) return NextResponse.json({ error: 'Name required.' }, { status: 400 });

  const [updated] = await db
    .update(topics)
    .set({ name: name.trim() })
    .where(and(eq(topics.id, topicId), eq(topics.folderId, folderId)))
    .returning();

  return NextResponse.json(updated);
}
