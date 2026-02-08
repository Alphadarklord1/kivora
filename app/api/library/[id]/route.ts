import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { libraryItems } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { content, metadata } = body;

  const [updated] = await db.update(libraryItems)
    .set({
      ...(content !== undefined && { content }),
      ...(metadata !== undefined && { metadata }),
    })
    .where(and(eq(libraryItems.id, params.id), eq(libraryItems.userId, userId)))
    .returning();

  return NextResponse.json(updated || { error: 'Not found' }, { status: updated ? 200 : 404 });
}
