import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { folders, topics } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { betaReadFallback } from '@/lib/api/runtime-guards';

export async function GET(request: NextRequest) {
  try {
    if (!isDatabaseConfigured) {
      return betaReadFallback([]);
    }

    const userId = await getUserId(request);
    if (!userId) {
      return betaReadFallback([]);
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');

    if (folderId) {
      // Verify the folder belongs to the authenticated user before returning its topics (IDOR fix)
      const folder = await db.query.folders.findFirst({
        where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
        columns: { id: true },
      });
      if (!folder) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const data = await db.query.topics.findMany({
        where: eq(topics.folderId, folderId),
        orderBy: [topics.sortOrder, topics.createdAt],
      });
      return NextResponse.json(data);
    }

    const userFolders = await db.query.folders.findMany({
      where: eq(folders.userId, userId),
      columns: { id: true },
    });
    const folderIds = userFolders.map(f => f.id);
    if (folderIds.length === 0) return NextResponse.json([]);

    const data = await db.query.topics.findMany({
      where: inArray(topics.folderId, folderIds),
      orderBy: [topics.sortOrder, topics.createdAt],
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('Topics GET error:', error);
    return betaReadFallback([]);
  }
}
