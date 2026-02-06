import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { folders, topics } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json([]); // Return empty array instead of error
    }

    const userFolders = await db.query.folders.findMany({
      where: eq(folders.userId, userId),
      with: {
        topics: {
          orderBy: [topics.sortOrder, topics.createdAt],
        },
      },
      orderBy: [folders.sortOrder, desc(folders.createdAt)],
    });

    return NextResponse.json(userFolders);
  } catch (error) {
    console.error('Folders GET error:', error);
    return NextResponse.json([]); // Return empty on error
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/folders - starting');

    const userId = await getUserId(request);
    console.log('POST /api/folders - userId:', userId);

    if (!userId) {
      return NextResponse.json({ error: 'No user found' }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;
    console.log('POST /api/folders - name:', name);

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    console.log('POST /api/folders - inserting folder for user:', userId);

    const [newFolder] = await db.insert(folders).values({
      userId,
      name: name.trim(),
    }).returning();

    console.log('POST /api/folders - created folder:', newFolder?.id);
    return NextResponse.json(newFolder, { status: 201 });
  } catch (error) {
    console.error('Folders POST error:', error);
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return NextResponse.json({ error: 'Failed to create folder', details: String(error) }, { status: 500 });
  }
}
