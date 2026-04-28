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
  // Same JWT-based fix the POST handler uses — the no-arg cookie path
  // could return null for valid Google sessions and serve up "no items"
  // even when the user had saved plenty.
  const userId = await getUserId(req);
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
  // Pass `req` so getUserId uses JWT-based extraction (matches the pattern
  // every other working API route uses; the no-arg `auth()` path was
  // intermittently returning null for valid Google sessions).
  const userId = await getUserId(req);
  if (!userId) {
    // No session — fall through to offline save on the client. Returning 503
    // (not 401) so the existing offline-save fallback in saveToLibrary triggers.
    return NextResponse.json(
      { error: 'No session — saving locally instead.' },
      { status: 503 },
    );
  }

  // Guests can technically POST, but GETs return [] for them (privacy
  // fallback). To avoid the "saved but invisible" trap, route guest items
  // to offline storage instead.
  if (isGuestModeEnabled() && isEphemeralGuest(userId)) {
    return NextResponse.json(
      { error: 'Guest mode — saving locally. Sign in to sync.' },
      { status: 503 },
    );
  }

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
    // Common cause: the user row doesn't exist (FK violation on userId).
    // Return 503 so the client persists offline — better than losing the
    // user's work to a 500.
    return NextResponse.json(
      { error: 'Could not save to cloud. Stored locally instead.' },
      { status: 503 },
    );
  }
}
