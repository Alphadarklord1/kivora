import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { files } from '@/lib/db/schema';
import { eq, and, asc, desc } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';
import { v4 as uuidv4 } from 'uuid';

// GET /api/files?folderId=&topicId=  (topicId optional)
export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get('folderId');
  const topicId  = searchParams.get('topicId');

  if (!folderId) return NextResponse.json({ error: 'folderId is required.' }, { status: 400 });

  const conditions = [
    eq(files.userId,   userId),
    eq(files.folderId, folderId),
    ...(topicId ? [eq(files.topicId!, topicId)] : []),
  ];

  const rows = await db.query.files.findMany({
    where: and(...conditions),
    orderBy: [desc(files.createdAt)],
  });

  return NextResponse.json(rows);
}

// POST /api/files — create a file record (blob stored in IndexedDB by client)
export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    folderId, topicId, name, type, content,
    localBlobId, mimeType, fileSize,
  } = body as Record<string, string | number | undefined>;

  if (!folderId || !name || !type) {
    return NextResponse.json({ error: 'folderId, name, and type are required.' }, { status: 400 });
  }

  const [file] = await db.insert(files).values({
    id: uuidv4(),
    userId,
    folderId: folderId as string,
    topicId: (topicId as string | undefined) ?? null,
    name: (name as string).trim(),
    type: type as string,
    content: (content as string | undefined) ?? null,
    localBlobId: (localBlobId as string | undefined) ?? null,
    mimeType: (mimeType as string | undefined) ?? null,
    fileSize: (fileSize as number | undefined) ?? null,
  }).returning();

  return NextResponse.json(file, { status: 201 });
}
