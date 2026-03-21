import { requireAppAccess } from '@/lib/api/guard';
import { NextRequest, NextResponse } from 'next/server';
import { cloudAccessAllowed, resolveAiDataMode } from '@/lib/privacy/ai-data';
import {
  buildStaticSuggestions,
  fetchWikiSummary,
  searchWikipedia,
  type ArticleSuggestion,
} from '@/lib/coach/articles';

/**
 * POST /api/coach/articles
 * Body: { topic: string }
 * Returns: ArticleSuggestion[]
 *
 * Searches Wikipedia for the topic, fetches page summaries, and adds curated
 * static links (Khan Academy, Google Scholar) as further reading.
 */
export async function POST(req: NextRequest) {
  const guardResult = await requireAppAccess(req);
  if (guardResult) return guardResult;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (!topic) {
    return NextResponse.json({ error: 'A topic is required.' }, { status: 400 });
  }

  // Clamp the topic to a sensible search length
  const searchTopic = topic.slice(0, 120);
  const privacyMode = resolveAiDataMode(body);

  const articles: ArticleSuggestion[] = [];

  if (cloudAccessAllowed(privacyMode)) {
    try {
      // Search Wikipedia for up to 4 relevant page titles
      const titles = await searchWikipedia(searchTopic, 4);

      // Fetch summaries in parallel, keep the first 3 that return a valid result
      const summaries = await Promise.all(
        titles.slice(0, 4).map((title) => fetchWikiSummary(title).catch(() => null)),
      );

      for (const s of summaries) {
        if (s && articles.length < 3) articles.push(s);
      }
    } catch {
      // Wikipedia is best-effort — fall through to static suggestions
    }
  }

  // Always append curated static links (Khan Academy + Google Scholar)
  // so students always have somewhere to go even if Wikipedia is down
  const statics = buildStaticSuggestions(searchTopic);
  for (const s of statics) {
    articles.push(s);
  }

  return NextResponse.json(articles);
}
