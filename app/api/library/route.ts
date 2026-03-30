import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { libraryItems } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';
import { v4 as uuidv4 } from 'uuid';
import { isGuestModeEnabled } from '@/lib/runtime/mode';
import { betaReadFallback } from '@/lib/api/runtime-guards';

function isEphemeralGuest(userId: string) {
  return userId === 'guest' || userId === 'local-demo-user' || userId.startsWith('guest:');
}

// GET /api/library
export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured) return NextResponse.json([], { status: 200 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (isGuestModeEnabled() && isEphemeralGuest(userId)) return betaReadFallback([]);

  const searchParams = new URL(req.url).searchParams;
  const limit = parseInt(searchParams.get('limit') ?? '0', 10) || undefined;
  const summary = searchParams.get('summary') === '1';

  try {
    const items = await db.query.libraryItems.findMany({
      where: eq(libraryItems.userId, userId),
      orderBy: [desc(libraryItems.createdAt)],
      limit,
    });
    if (!summary) return NextResponse.json(items);

    return NextResponse.json(items.map((item) => ({
      ...item,
      contentPreview: typeof item.content === 'string' ? item.content.slice(0, 260) : '',
      contentLength: typeof item.content === 'string' ? item.content.length : 0,
      content: undefined,
    })));
  } catch (err) {
    console.error('[library] GET failed', err);
    if (isGuestModeEnabled()) return betaReadFallback([]);
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
