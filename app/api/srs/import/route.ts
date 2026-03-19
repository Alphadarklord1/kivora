import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { libraryItems, shares } from '@/lib/db/schema';
import { cardsToDeckContent, inferDeckTitle, parseAnkiApkg, parseCsvFlashcards, parsePastedFlashcards, type ImportedCard } from '@/lib/srs/importers';
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

function importedResponse(
  source: string,
  title: string,
  description: string,
  cards: ImportedCard[],
) {
  return NextResponse.json({
    source,
    title,
    description,
    cardCount: cards.length,
    cards,
    content: cardsToDeckContent(cards),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    kind?: 'url' | 'csv' | 'paste' | 'anki';
    url?: string;
    text?: string;
    title?: string;
    base64?: string;
    fileName?: string;
  } | null;

  const kind = body?.kind ?? (body?.url ? 'url' : null);
  if (!kind) return NextResponse.json({ error: 'Import request is required' }, { status: 400 });

  try {
    if (kind === 'csv') {
      const text = body?.text?.trim() ?? '';
      if (!text) return NextResponse.json({ error: 'CSV text is required' }, { status: 400 });

      const cards = parseCsvFlashcards(text);
      if (cards.length === 0) {
        return NextResponse.json({ error: 'Could not parse any cards from this CSV' }, { status: 422 });
      }

      const title = inferDeckTitle(body?.title, 'Imported CSV deck');
      return importedResponse('csv', title, `Imported from CSV (${cards.length} cards)`, cards);
    }

    if (kind === 'paste') {
      const text = body?.text?.trim() ?? '';
      if (!text) return NextResponse.json({ error: 'Pasted deck text is required' }, { status: 400 });

      const cards = parsePastedFlashcards(text);
      if (cards.length === 0) {
        return NextResponse.json({ error: 'Could not parse flashcards from the pasted text' }, { status: 422 });
      }

      const title = inferDeckTitle(body?.title, 'Imported deck');
      return importedResponse('paste', title, `Imported from pasted cards (${cards.length} cards)`, cards);
    }

    if (kind === 'anki') {
      const base64 = body?.base64?.trim() ?? '';
      if (!base64) return NextResponse.json({ error: 'Anki file data is required' }, { status: 400 });

      const { title, cards } = await parseAnkiApkg(base64, body?.fileName);
      if (cards.length === 0) {
        return NextResponse.json({ error: 'Could not extract cards from this Anki package' }, { status: 422 });
      }

      return importedResponse('anki', inferDeckTitle(body?.title, title), `Imported from Anki (${cards.length} cards)`, cards);
    }

    const rawUrl = body?.url?.trim();
    if (!rawUrl) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const isKivoraShare = parsedUrl.pathname.includes('/shared/') || parsedUrl.pathname.includes('/share/');
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
      return NextResponse.json({
        source: 'quizlet',
        title,
        cardCount: cards.length,
        description: `Imported from Quizlet (${cards.length} cards)`,
        cards,
        content: cardsToDeckContent(cards),
      });
    }

    return NextResponse.json({ error: 'Unsupported import source' }, { status: 400 });
  } catch (error) {
    console.error('[srs/import][POST]', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
