import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { libraryItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';

// PATCH /api/library/[itemId]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { itemId } = await params;
  const existing = await db.query.libraryItems.findFirst({
    where: and(eq(libraryItems.id, itemId), eq(libraryItems.userId, userId)),
  });

  if (!existing) {
    return NextResponse.json({ error: 'Library item not found.' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const nextMetadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : null;

  if (!nextMetadata) {
    return NextResponse.json({ error: 'metadata is required.' }, { status: 400 });
  }

  const [updated] = await db
    .update(libraryItems)
    .set({
      metadata: {
        ...((existing.metadata ?? {}) as Record<string, unknown>),
        ...(nextMetadata as Record<string, unknown>),
      },
    })
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.userId, userId)))
    .returning();

  return NextResponse.json(updated);
}

// DELETE /api/library/[itemId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { itemId } = await params;
  await db.delete(libraryItems).where(
    and(eq(libraryItems.id, itemId), eq(libraryItems.userId, userId)),
  );

  return NextResponse.json({ ok: true });
}
