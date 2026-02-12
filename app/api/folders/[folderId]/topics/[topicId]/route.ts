import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { folders, topics } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

interface RouteParams {
  params: Promise<{ folderId: string; topicId: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { folderId, topicId } = await params;
  const body = await request.json();
  const { name, sortOrder } = body;

  // Verify folder belongs to user
  const folder = await db.query.folders.findFirst({
    where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
  });

  if (!folder) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  const [updated] = await db
    .update(topics)
    .set({
      ...(name !== undefined && { name }),
      ...(sortOrder !== undefined && { sortOrder }),
      updatedAt: new Date(),
    })
    .where(and(eq(topics.id, topicId), eq(topics.folderId, folderId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { folderId, topicId } = await params;

  // Verify folder belongs to user
  const folder = await db.query.folders.findFirst({
    where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
  });

  if (!folder) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  const [deleted] = await db
    .delete(topics)
    .where(and(eq(topics.id, topicId), eq(topics.folderId, folderId)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
