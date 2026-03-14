import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { libraryItems, shares } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseQuizletTerms(html: string) {
  const matches = Array.from(
    html.matchAll(/"word":"([^"]+)".{0,220}?"definition":"([^"]+)"/g),
  );

  const cards = matches
    .map((match) => ({
      front: decodeHtml(match[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>')),
      back: decodeHtml(match[2].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>')),
    }))
    .filter((card) => card.front && card.back);

  const unique = new Map<string, { front: string; back: string }>();
  for (const card of cards) {
    unique.set(`${card.front}:::${card.back}`, card);
  }
  return Array.from(unique.values()).slice(0, 500);
}

async function importKivoraShare(url: URL) {
  if (!isDatabaseConfigured) throw new Error('Database not configured');

  const token = url.pathname.split('/').filter(Boolean).pop();
  if (!token) throw new Error('Invalid shared deck URL');

  const share = await db.query.shares.findFirst({
    where: eq(shares.shareToken, token),
  });
  if (!share?.libraryItemId) throw new Error('Shared deck not found');

  const item = await db.query.libraryItems.findFirst({
    where: eq(libraryItems.id, share.libraryItemId),
  });
  if (!item) throw new Error('Deck content not found');

  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  return {
    title: String(metadata.title ?? 'Imported deck'),
    description: String(metadata.description ?? ''),
    content: item.content,
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { url?: string } | null;
  const rawUrl = body?.url?.trim();
  if (!rawUrl) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    const hostname = parsedUrl.hostname.toLowerCase();
    const isKivoraShare = parsedUrl.pathname.includes('/shared/');
    if (isKivoraShare) {
      const result = await importKivoraShare(parsedUrl);
      return NextResponse.json({ source: 'kivora-share', ...result });
    }

    if (hostname.includes('quizlet.com')) {
      const response = await fetch(parsedUrl.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 Kivora Deck Importer' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        return NextResponse.json({ error: 'Could not fetch Quizlet set' }, { status: 502 });
      }

      const html = await response.text();
      const cards = parseQuizletTerms(html);
      if (cards.length === 0) {
        return NextResponse.json({ error: 'Could not extract cards from this Quizlet set' }, { status: 422 });
      }

      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      const title = decodeHtml(titleMatch?.[1]?.replace(/\s*\|\s*Quizlet.*$/i, '') ?? 'Imported Quizlet set');
      const content = cards.map((card) => `Front: ${card.front} | Back: ${card.back}`).join('\n');

      return NextResponse.json({
        source: 'quizlet',
        title,
        description: `Imported from Quizlet (${cards.length} cards)`,
        content,
      });
    }

    return NextResponse.json({ error: 'Unsupported import source' }, { status: 400 });
  } catch (error) {
    console.error('[srs/import][POST]', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
