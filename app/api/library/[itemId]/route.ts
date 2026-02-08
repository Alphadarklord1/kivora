import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { libraryItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

interface RouteParams {
  params: Promise<{ itemId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { itemId } = await params;

  const item = await db.query.libraryItems.findFirst({
    where: and(eq(libraryItems.id, itemId), eq(libraryItems.userId, userId)),
  });

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { itemId } = await params;

  const [deleted] = await db
    .delete(libraryItems)
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.userId, userId)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { itemId } = await params;
  const body = await request.json();
  const { content, metadata } = body;

  const [updated] = await db
    .update(libraryItems)
    .set({
      ...(content !== undefined && { content }),
      ...(metadata !== undefined && { metadata }),
    })
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.userId, userId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}
