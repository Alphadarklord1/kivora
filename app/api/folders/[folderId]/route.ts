import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { folders } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';

// PATCH /api/folders/[folderId] — rename or update a folder
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { folderId } = await params;
  const { name, expanded } = await req.json().catch(() => ({}));
  const updates: Partial<typeof folders.$inferInsert> = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (typeof expanded === 'boolean') updates.expanded = expanded;
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const [updated] = await db
    .update(folders)
    .set(updates)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Folder not found.' }, { status: 404 });
  return NextResponse.json(updated);
}

// DELETE /api/folders/[folderId] — delete a folder (cascades to topics + files)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { folderId } = await params;
  await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.userId, userId)));
  return NextResponse.json({ ok: true });
}
