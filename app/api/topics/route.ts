import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { folders, topics } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json([]);
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');

    if (folderId) {
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
    return NextResponse.json([]);
  }
}
