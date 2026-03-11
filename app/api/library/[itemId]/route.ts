import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { libraryItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';

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
