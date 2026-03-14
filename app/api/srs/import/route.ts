import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { libraryItems, shares } from '@/lib/db/schema';
import { buildQuizletCandidateUrls, extractQuizletCards, extractQuizletTitle, looksLikeQuizletBlocked } from '@/lib/srs/quizlet-import';
import { eq } from 'drizzle-orm';

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
      const candidateUrls = buildQuizletCandidateUrls(parsedUrl);
      let bestHtml = '';
      let cards: Array<{ front: string; back: string }> = [];

      for (const candidate of candidateUrls) {
        const response = await fetch(candidate, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: 'https://quizlet.com/',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(20_000),
        }).catch(() => null);

        if (!response?.ok) continue;
        const html = await response.text();
        bestHtml = html;
        cards = extractQuizletCards(html);
        if (cards.length > 0) break;
      }

      if (cards.length === 0) {
        if (bestHtml && looksLikeQuizletBlocked(bestHtml)) {
          return NextResponse.json({ error: 'Quizlet blocked automated access for this set. Try a public set URL or import the cards from a copied deck page.' }, { status: 422 });
        }
        return NextResponse.json({ error: 'Could not extract cards from this Quizlet set' }, { status: 422 });
      }

      const title = extractQuizletTitle(bestHtml);
      const content = cards.map((card) => `Front: ${card.front} | Back: ${card.back}`).join('\n');

      return NextResponse.json({
        source: 'quizlet',
        title,
        cardCount: cards.length,
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
