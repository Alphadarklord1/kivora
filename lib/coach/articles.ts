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

// ── Semantic Scholar API ──────────────────────────────────────────────────────

interface SemanticScholarPaper {
  paperId: string;
  title:   string;
  abstract: string | null;
  year:    number | null;
  authors: { name: string }[];
  url:     string | null;
  openAccessPdf: { url: string } | null;
}

interface SemanticScholarResponse {
  data: SemanticScholarPaper[];
}

/**
 * Search Semantic Scholar for real academic papers on a topic.
 * Returns up to `limit` results. Free API — no key required.
 */
export async function searchSemanticScholar(query: string, limit = 3): Promise<ArticleSuggestion[]> {
  const params = new URLSearchParams({
    query,
    limit:  String(limit),
    fields: 'title,abstract,year,authors,url,openAccessPdf',
  });
  const res = await fetch(
    `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`,
    {
      headers: { 'User-Agent': 'Kivora/1.0 (study assistant)' },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) return [];

  const data = await res.json() as SemanticScholarResponse;
  const papers = data?.data ?? [];

  return papers
    .filter(p => p.title && p.abstract)
    .slice(0, limit)
    .map(p => {
      const paperUrl = p.openAccessPdf?.url ?? p.url ?? `https://www.semanticscholar.org/paper/${p.paperId}`;
      const authors  = p.authors.slice(0, 2).map(a => a.name).join(', ');
      const yearStr  = p.year ? ` (${p.year})` : '';
      const excerpt  = (p.abstract ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);

      return {
        title:          `${p.title}${yearStr}${authors ? ' — ' + authors : ''}`,
        url:            paperUrl,
        source:         'Semantic Scholar',
        excerpt:        excerpt.endsWith('.') ? excerpt : excerpt + '…',
        readingMinutes: Math.max(3, Math.ceil((p.abstract?.split(/\s+/).length ?? 100) / 220) + 10),
        type:           'academic' as const,
      };
    });
}

// ── OpenAlex API ─────────────────────────────────────────────────────────────

interface OpenAlexWork {
  id: string;
  title: string | null;
  abstract_inverted_index: Record<string, number[]> | null;
  authorships: Array<{ author: { display_name: string } }>;
  publication_year: number | null;
  primary_location: { landing_page_url: string | null; pdf_url: string | null } | null;
  open_access: { is_oa: boolean; oa_url: string | null } | null;
}

interface OpenAlexResponse {
  results: OpenAlexWork[];
}

function reconstructAbstract(inv: Record<string, number[]>): string {
  const words: string[] = [];
  for (const [word, positions] of Object.entries(inv)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.filter(Boolean).join(' ');
}

/**
 * Search OpenAlex for scholarly works on a topic.
 * Free, no API key, no strict rate limit, 250M+ works indexed.
 */
export async function searchOpenAlex(query: string, limit = 3): Promise<ArticleSuggestion[]> {
  const params = new URLSearchParams({
    search: query,
    'per-page': String(limit),
    sort: 'relevance_score:desc',
    select: 'id,title,abstract_inverted_index,authorships,publication_year,primary_location,open_access',
  });
  const res = await fetch(
    `https://api.openalex.org/works?${params.toString()}`,
    {
      headers: { 'User-Agent': 'Kivora/1.0 (mailto:support@kivora.app; study assistant)' },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) return [];

  const data = await res.json() as OpenAlexResponse;
  const works = data?.results ?? [];

  return works
    .filter(w => w.title && w.abstract_inverted_index)
    .slice(0, limit)
    .map(w => {
      const abstract = reconstructAbstract(w.abstract_inverted_index!);
      const url =
        w.open_access?.oa_url ??
        w.primary_location?.pdf_url ??
        w.primary_location?.landing_page_url ??
        `https://openalex.org/${w.id.split('/').pop()}`;
      const authors = w.authorships.slice(0, 2).map(a => a.author.display_name).join(', ');
      const yearStr = w.publication_year ? ` (${w.publication_year})` : '';
      const excerpt = abstract.replace(/\s+/g, ' ').trim().slice(0, 200);

      return {
        title: `${w.title!}${yearStr}${authors ? ' — ' + authors : ''}`,
        url,
        source: 'OpenAlex',
        excerpt: excerpt.endsWith('.') ? excerpt : excerpt + '…',
        readingMinutes: Math.max(3, Math.ceil(abstract.split(/\s+/).length / 220) + 10),
        type: 'academic' as const,
      };
    });
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
      title: `Britannica — ${topic}`,
      url: `https://www.britannica.com/search?query=${q}`,
      source: 'Britannica',
      excerpt: 'Peer-reviewed encyclopedia articles written by subject experts.',
      readingMinutes: 5,
      type: 'encyclopedia',
    },
    {
      title: `Google Scholar — ${topic}`,
      url: `https://scholar.google.com/scholar?q=${q}`,
      source: 'Google Scholar',
      excerpt: 'Academic papers, theses, and peer-reviewed research on this topic.',
      readingMinutes: 10,
      type: 'academic',
    },
    {
      title: `OpenStax — ${topic}`,
      url: `https://openstax.org/subjects`,
      source: 'OpenStax',
      excerpt: 'Free peer-reviewed textbooks used by universities worldwide.',
      readingMinutes: 15,
      type: 'educational',
    },
  ];
}
