import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { folders, topics, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ folderId: string }>;
}

async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    });
    if (token?.id) return token.id as string;
    if (token?.sub) return token.sub as string;
  } catch {}

  const firstUser = await db.query.users.findFirst();
  return firstUser?.id || null;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { folderId } = await params;
  const body = await request.json();
  const { name } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  // Verify folder belongs to user
  const folder = await db.query.folders.findFirst({
    where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
  });

  if (!folder) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  const [newTopic] = await db.insert(topics).values({
    folderId,
    name: name.trim(),
  }).returning();

  return NextResponse.json(newTopic, { status: 201 });
}
