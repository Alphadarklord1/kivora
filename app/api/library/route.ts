import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { libraryItems } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';
import { v4 as uuidv4 } from 'uuid';

// GET /api/library
export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured) return NextResponse.json([], { status: 200 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const limit = parseInt(new URL(req.url).searchParams.get('limit') ?? '0', 10) || undefined;

  try {
    const items = await db.query.libraryItems.findMany({
      where: eq(libraryItems.userId, userId),
      orderBy: [desc(libraryItems.createdAt)],
      limit,
    });
    return NextResponse.json(items);
  } catch (err) {
    console.error('[library] GET failed', err);
    return NextResponse.json({ error: 'Failed to load library.' }, { status: 500 });
  }
}

// POST /api/library
export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured. Item not saved.' }, { status: 503 });
  }
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { mode, content, metadata } = await req.json().catch(() => ({}));
  if (!mode || !content) {
    return NextResponse.json({ error: 'mode and content are required.' }, { status: 400 });
  }

  try {
    const [item] = await db.insert(libraryItems).values({
      id: uuidv4(),
      userId,
      mode: mode as string,
      content: content as string,
      metadata: metadata ?? null,
    }).returning();
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error('[library] POST failed', err);
    return NextResponse.json({ error: 'Failed to save item.' }, { status: 500 });
  }
}
