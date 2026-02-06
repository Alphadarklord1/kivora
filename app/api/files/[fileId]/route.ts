import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { files } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

interface RouteParams {
  params: Promise<{ fileId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { fileId } = await params;

  const file = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.userId, userId)),
  });

  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  return NextResponse.json(file);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { fileId } = await params;
  const body = await request.json();
  const { name, liked, pinned, content } = body;

  const [updated] = await db
    .update(files)
    .set({
      ...(name !== undefined && { name }),
      ...(liked !== undefined && { liked }),
      ...(pinned !== undefined && { pinned }),
      ...(content !== undefined && { content }),
      updatedAt: new Date(),
    })
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { fileId } = await params;

  const [deleted] = await db
    .delete(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, localBlobId: deleted.localBlobId });
}
