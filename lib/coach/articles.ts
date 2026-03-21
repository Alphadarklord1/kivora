// ── Article suggestion types ───────────────────────────────────────────────

export type ArticleSourceType = 'encyclopedia' | 'educational' | 'academic' | 'news';

export interface ArticleSuggestion {
  title: string;
  url: string;
  source: string;
  excerpt: string;
  readingMinutes: number;
  type: ArticleSourceType;
}

// ── Wikipedia API helpers ─────────────────────────────────────────────────────

interface WikiSearchResult {
  ns: number;
  title: string;
  pageid: number;
  snippet: string;
}

interface WikiSearchResponse {
  query: {
    search: WikiSearchResult[];
  };
}

interface WikiSummaryResponse {
  title: string;
  extract: string;
  content_urls?: {
    desktop?: { page?: string };
  };
}

/** Search Wikipedia for pages matching a query and return up to `limit` titles. */
export async function searchWikipedia(query: string, limit = 4): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: String(limit),
    format: 'json',
    origin: '*',
  });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
    headers: { 'User-Agent': 'Kivora/1.0 (https://kivora.app; study assistant)' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return [];
  const data = await res.json() as WikiSearchResponse;
  return (data?.query?.search ?? []).map((r) => r.title);
}

/** Fetch a Wikipedia page summary by exact title. */
export async function fetchWikiSummary(title: string): Promise<ArticleSuggestion | null> {
  const encodedTitle = encodeURIComponent(title.replace(/ /g, '_'));
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`,
    {
      headers: { 'User-Agent': 'Kivora/1.0 (https://kivora.app; study assistant)' },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!res.ok) return null;
  const data = await res.json() as WikiSummaryResponse;
  if (!data?.extract?.trim()) return null;

  const excerpt = data.extract.replace(/\s+/g, ' ').trim().slice(0, 200);
  const url = data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodedTitle}`;
  const wordCount = data.extract.split(/\s+/).length;

  return {
    title: data.title,
    url,
    source: 'Wikipedia',
    excerpt: excerpt.endsWith('.') ? excerpt : excerpt + '…',
    readingMinutes: Math.max(1, Math.ceil(wordCount / 220)),
    type: 'encyclopedia',
  };
}

/**
 * Build static "further reading" suggestions for a topic — links to curated
 * educational platforms that don't require scraping.
 */
export function buildStaticSuggestions(topic: string): ArticleSuggestion[] {
  const q = encodeURIComponent(topic);
  return [
    {
      title: `Search Khan Academy — ${topic}`,
      url: `https://www.khanacademy.org/search?page_search_query=${q}`,
      source: 'Khan Academy',
      excerpt: 'Free courses, exercises, and videos covering this topic at every level.',
      readingMinutes: 5,
      type: 'educational',
    },
    {
      title: `Google Scholar — ${topic}`,
      url: `https://scholar.google.com/scholar?q=${q}`,
      source: 'Google Scholar',
      excerpt: 'Academic papers, theses, and peer-reviewed research on this topic.',
      readingMinutes: 10,
      type: 'academic',
    },
  ];
}
