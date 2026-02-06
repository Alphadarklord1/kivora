import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recentFiles, files } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

// GET /api/recent - Get recent files for the user
export async function GET(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  // Get recent files with file details
  const recentEntries = await db
    .select({
      id: recentFiles.id,
      fileId: recentFiles.fileId,
      accessedAt: recentFiles.accessedAt,
      file: {
        id: files.id,
        name: files.name,
        type: files.type,
        folderId: files.folderId,
        topicId: files.topicId,
        liked: files.liked,
        pinned: files.pinned,
        createdAt: files.createdAt,
      },
    })
    .from(recentFiles)
    .innerJoin(files, eq(recentFiles.fileId, files.id))
    .where(eq(recentFiles.userId, userId))
    .orderBy(desc(recentFiles.accessedAt))
    .limit(Math.min(limit, 50));

  return NextResponse.json(recentEntries);
}

// POST /api/recent - Record a file access
export async function POST(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { fileId } = body;

  if (!fileId) {
    return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
  }

  // Verify the file exists and belongs to the user
  const file = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.userId, userId)),
  });

  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Check if there's an existing recent entry for this file
  const existing = await db.query.recentFiles.findFirst({
    where: and(
      eq(recentFiles.userId, userId),
      eq(recentFiles.fileId, fileId)
    ),
  });

  if (existing) {
    // Update the existing entry's timestamp
    const [updated] = await db
      .update(recentFiles)
      .set({ accessedAt: new Date() })
      .where(eq(recentFiles.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  }

  // Create new recent entry
  const [newEntry] = await db
    .insert(recentFiles)
    .values({
      userId,
      fileId,
    })
    .returning();

  // Keep only the most recent 50 entries per user
  const allRecent = await db.query.recentFiles.findMany({
    where: eq(recentFiles.userId, userId),
    orderBy: [desc(recentFiles.accessedAt)],
  });

  if (allRecent.length > 50) {
    const toDelete = allRecent.slice(50).map(r => r.id);
    for (const id of toDelete) {
      await db.delete(recentFiles).where(eq(recentFiles.id, id));
    }
  }

  return NextResponse.json(newEntry, { status: 201 });
}

// DELETE /api/recent - Clear recent files history
export async function DELETE(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await db.delete(recentFiles).where(eq(recentFiles.userId, userId));

  return NextResponse.json({ success: true });
}
