import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { files, folders } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    });
    return (token?.id as string) || (token?.sub as string) || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get('folderId');
  const topicId = searchParams.get('topicId');
  const liked = searchParams.get('liked');
  const pinned = searchParams.get('pinned');

  const conditions = [eq(files.userId, userId)];

  if (folderId) {
    conditions.push(eq(files.folderId, folderId));
  }
  if (topicId) {
    conditions.push(eq(files.topicId, topicId));
  }
  if (liked === 'true') {
    conditions.push(eq(files.liked, true));
  }
  if (pinned === 'true') {
    conditions.push(eq(files.pinned, true));
  }

  const userFiles = await db.query.files.findMany({
    where: and(...conditions),
    orderBy: [desc(files.createdAt)],
  });

  return NextResponse.json(userFiles);
}

export async function POST(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, type, content, folderId, topicId, localBlobId, mimeType, fileSize } = body;

  if (!name || !type || !folderId) {
    return NextResponse.json({ error: 'Name, type, and folderId are required' }, { status: 400 });
  }

  // Verify folder belongs to user
  const folder = await db.query.folders.findFirst({
    where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
  });

  if (!folder) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  const [newFile] = await db.insert(files).values({
    userId,
    folderId,
    topicId: topicId || null,
    name,
    type,
    content: content || null,
    localBlobId: localBlobId || null,
    mimeType: mimeType || null,
    fileSize: fileSize || null,
  }).returning();

  return NextResponse.json(newFile, { status: 201 });
}
