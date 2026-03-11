import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { files } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';

// GET /api/files/[fileId]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { fileId } = await params;
  const file = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.userId, userId)),
  });
  if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  return NextResponse.json(file);
}

// PATCH /api/files/[fileId] — update content/name
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { fileId } = await params;
  const body = await req.json().catch(() => ({}));
  const updates: Partial<typeof files.$inferInsert> = {};
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.content === 'string') updates.content = body.content;
  if (typeof body.liked === 'boolean') updates.liked = body.liked;
  if (typeof body.pinned === 'boolean') updates.pinned = body.pinned;

  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const [updated] = await db
    .update(files)
    .set(updates)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  return NextResponse.json(updated);
}

// DELETE /api/files/[fileId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { fileId } = await params;
  await db.delete(files).where(and(eq(files.id, fileId), eq(files.userId, userId)));
  return NextResponse.json({ ok: true });
}
