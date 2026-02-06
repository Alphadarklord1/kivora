import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { folders, topics } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

interface RouteParams {
  params: Promise<{ folderId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { folderId } = await params;

  const folder = await db.query.folders.findFirst({
    where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
    with: {
      topics: {
        orderBy: [topics.sortOrder, topics.createdAt],
      },
    },
  });

  if (!folder) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  return NextResponse.json(folder);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { folderId } = await params;
  const body = await request.json();
  const { name, expanded, sortOrder } = body;

  const [updated] = await db
    .update(folders)
    .set({
      ...(name !== undefined && { name }),
      ...(expanded !== undefined && { expanded }),
      ...(sortOrder !== undefined && { sortOrder }),
      updatedAt: new Date(),
    })
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { folderId } = await params;

  const [deleted] = await db
    .delete(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
