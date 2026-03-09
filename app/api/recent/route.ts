import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { recentFiles, files } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';

// GET /api/recent - Get recent files for the user
export async function GET(request: NextRequest) {
  const requestId = createRequestId(request);
  try {
    if (!isDatabaseConfigured) {
      return NextResponse.json([]);
    }

    const userId = await getUserId(request);
    if (!userId) {
      return apiError(401, {
        errorCode: 'UNAUTHORIZED',
        reason: 'Authentication required',
        requestId,
      });
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
  } catch (error) {
    console.error(`[Recent][${requestId}] GET failed`, error);
    return apiError(500, {
      errorCode: 'RECENT_FETCH_FAILED',
      reason: 'Failed to fetch recent files',
      requestId,
    });
  }
}

// POST /api/recent - Record a file access
export async function POST(request: NextRequest) {
  const requestId = createRequestId(request);
  try {
    if (!isDatabaseConfigured) {
      return NextResponse.json({ success: true, localOnly: true });
    }

    const userId = await getUserId(request);
    if (!userId) {
      return apiError(401, {
        errorCode: 'UNAUTHORIZED',
        reason: 'Authentication required',
        requestId,
      });
    }

    const body = await request.json();
    const { fileId } = body;

    if (!fileId) {
      return apiError(400, {
        errorCode: 'FILE_ID_REQUIRED',
        reason: 'File ID is required',
        requestId,
      });
    }

  // Verify the file exists and belongs to the user
  const file = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.userId, userId)),
  });

    if (!file) {
      return apiError(404, {
        errorCode: 'FILE_NOT_FOUND',
        reason: 'File not found',
        requestId,
      });
    }

  // Check if there's an existing recent entry for this file
    const existing = await db.query.recentFiles.findFirst({
      where: and(
        eq(recentFiles.userId, userId),
        eq(recentFiles.fileId, fileId)
      ),
    });

    if (existing) {
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
  } catch (error) {
    console.error(`[Recent][${requestId}] POST failed`, error);
    return apiError(500, {
      errorCode: 'RECENT_UPDATE_FAILED',
      reason: 'Failed to update recent files',
      requestId,
    });
  }
}

// DELETE /api/recent - Clear recent files history
export async function DELETE(request: NextRequest) {
  const requestId = createRequestId(request);
  try {
    if (!isDatabaseConfigured) {
      return NextResponse.json({ success: true });
    }

    const userId = await getUserId(request);
    if (!userId) {
      return apiError(401, {
        errorCode: 'UNAUTHORIZED',
        reason: 'Authentication required',
        requestId,
      });
    }

    await db.delete(recentFiles).where(eq(recentFiles.userId, userId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[Recent][${requestId}] DELETE failed`, error);
    return apiError(500, {
      errorCode: 'RECENT_CLEAR_FAILED',
      reason: 'Failed to clear recent files',
      requestId,
    });
  }
}
