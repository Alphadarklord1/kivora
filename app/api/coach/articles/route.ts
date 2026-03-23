import { requireAppAccess } from '@/lib/api/guard';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { cloudAccessAllowed, resolveAiDataMode } from '@/lib/privacy/ai-data';
import {
  buildStaticSuggestions,
  fetchWikiSummary,
  searchSemanticScholar,
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
  const rl = enforceAiRateLimit(req);
  if (rl) return rl;

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
    // Run Wikipedia + Semantic Scholar searches in parallel
    const [wikiTitles, scholarResults] = await Promise.all([
      searchWikipedia(searchTopic, 4).catch(() => [] as string[]),
      searchSemanticScholar(searchTopic, 3).catch(() => [] as ArticleSuggestion[]),
    ]);

    // Fetch Wikipedia summaries in parallel
    const wikiSummaries = await Promise.all(
      wikiTitles.slice(0, 4).map((title) => fetchWikiSummary(title).catch(() => null)),
    );
    for (const s of wikiSummaries) {
      if (s && articles.length < 3) articles.push(s);
    }

    // Prepend academic papers — most credible sources go first
    articles.unshift(...scholarResults);
  }

  // Always append curated static links (Khan Academy + Google Scholar)
  // so students always have somewhere to go even if Wikipedia is down
  const statics = buildStaticSuggestions(searchTopic);
  for (const s of statics) {
    articles.push(s);
  }

  return NextResponse.json(articles);
}
