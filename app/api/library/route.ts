import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { libraryItems } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

export async function GET(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');

  let items = await db.query.libraryItems.findMany({
    where: eq(libraryItems.userId, userId),
    orderBy: [desc(libraryItems.createdAt)],
  });

  if (search) {
    const searchLower = search.toLowerCase();
    items = items.filter(item =>
      item.content.toLowerCase().includes(searchLower) ||
      item.mode.toLowerCase().includes(searchLower)
    );
  }

  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { mode, content, metadata } = body;

  if (!mode || !content) {
    return NextResponse.json({ error: 'Mode and content are required' }, { status: 400 });
  }

  const [newItem] = await db.insert(libraryItems).values({
    userId,
    mode,
    content,
    metadata: metadata || null,
  }).returning();

  return NextResponse.json(newItem, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await db.delete(libraryItems).where(eq(libraryItems.userId, userId));

  return NextResponse.json({ success: true });
}
