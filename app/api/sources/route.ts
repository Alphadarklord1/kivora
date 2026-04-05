import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getUserId } from '@/lib/auth/get-user-id';
import { db, isDatabaseConfigured } from '@/lib/db';
import { savedSources } from '@/lib/db/schema';

export interface SavedSourcePayload {
  title: string;
  url: string;
  authors?: string;
  journal?: string;
  year?: number | null;
  doi?: string | null;
  abstract?: string;
  sourceType?: string;
  notes?: string;
}

/** GET /api/sources — list the user's saved sources */
export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured) return NextResponse.json([]);
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const rows = await db
      .select()
      .from(savedSources)
      .where(eq(savedSources.userId, userId))
      .orderBy(desc(savedSources.savedAt));
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[sources][GET]', err);
    return NextResponse.json({ error: 'Failed to load sources' }, { status: 500 });
  }
}

/** POST /api/sources — save a new source */
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as SavedSourcePayload | null;
  if (!body?.title?.trim() || !body?.url?.trim()) {
    return NextResponse.json({ error: 'title and url are required.' }, { status: 400 });
  }

  try {
    const [row] = await db.insert(savedSources).values({
      id: uuidv4(),
      userId,
      title: body.title.trim().slice(0, 300),
      url: body.url.trim().slice(0, 1000),
      authors: body.authors?.trim().slice(0, 500) ?? null,
      journal: body.journal?.trim().slice(0, 200) ?? null,
      year: body.year ?? null,
      doi: body.doi?.trim().slice(0, 200) ?? null,
      abstract: body.abstract?.trim().slice(0, 2000) ?? null,
      sourceType: body.sourceType ?? 'web',
      notes: body.notes?.trim().slice(0, 1000) ?? null,
    }).returning();
    return NextResponse.json({ ok: true, source: row });
  } catch (err) {
    console.error('[sources][POST]', err);
    return NextResponse.json({ error: 'Failed to save source' }, { status: 500 });
  }
}

/** DELETE /api/sources?id=... — remove a saved source */
export async function DELETE(request: NextRequest) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id query param required.' }, { status: 400 });

  try {
    const existing = await db.query.savedSources.findFirst({
      where: eq(savedSources.id, id),
    });
    if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    if (existing.userId !== userId) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    await db.delete(savedSources).where(eq(savedSources.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[sources][DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete source' }, { status: 500 });
  }
}
