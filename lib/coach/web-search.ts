/**
 * Web search adapter for Scholar Hub research.
 *
 * Today's research module pulls only from Wikipedia + Semantic Scholar +
 * OpenAlex — strong for academic/encyclopedia coverage, weak for current
 * events, news, blogs, and broad web content. This adapter wires Tavily
 * (https://tavily.com) as a general-purpose search backend that's
 * specifically designed for LLM-grounded retrieval.
 *
 * Why Tavily: cleaner JSON than Brave/Bing/Serper for this use case,
 * generous free tier (1000 searches/month), and it returns short
 * extracts pre-trimmed for prompt context.
 *
 * Configuration:
 *   TAVILY_API_KEY=tvly-...    (optional; module no-ops when missing)
 *
 * Returns ArticleSuggestion[] in the same shape as searchWikipedia so the
 * caller can mix web hits into the same ranking pipeline.
 */

import type { ArticleSuggestion } from '@/lib/coach/articles';

const TAVILY_API_URL = 'https://api.tavily.com/search';

export function isWebSearchConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
  answer?: string;
}

/**
 * Search the open web via Tavily. Returns up to `limit` results in the
 * shared ArticleSuggestion shape so the existing ranking can fold them
 * into the source mix.
 *
 * No-ops gracefully when TAVILY_API_KEY is missing — returns []. Callers
 * should treat an empty result as "web search not available" rather than
 * "nothing found" (use isWebSearchConfigured() to disambiguate if it matters).
 */
export async function searchWeb(query: string, limit = 5): Promise<ArticleSuggestion[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: trimmed,
        search_depth: 'basic',
        max_results: Math.max(1, Math.min(10, limit)),
        include_answer: false,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return [];

    const payload = (await response.json()) as TavilyResponse;
    if (!Array.isArray(payload.results)) return [];

    return payload.results
      .filter((r): r is Required<Pick<TavilyResult, 'title' | 'url'>> & TavilyResult => Boolean(r.title && r.url))
      .slice(0, limit)
      .map<ArticleSuggestion>((r) => {
        const excerpt = (r.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
        const wordCount = excerpt ? excerpt.split(/\s+/).length : 0;
        // Rough reading-minute estimate for the excerpt; full pages would
        // need a HEAD request to estimate, which isn't worth the latency.
        const readingMinutes = Math.max(1, Math.round(wordCount / 200));
        const host = (() => {
          try {
            return new URL(r.url).hostname.replace(/^www\./, '');
          } catch {
            return 'web';
          }
        })();
        return {
          title: r.title,
          url: r.url,
          source: host,
          excerpt,
          readingMinutes,
          // Heuristic: well-known news domains get 'news', everything else
          // is treated as 'educational' for ranking weight.
          type: /\b(news|times|guardian|bbc|reuters|cnn|nyt|bloomberg)\b/i.test(host)
            ? 'news'
            : 'educational',
        };
      });
  } catch {
    return [];
  }
}
