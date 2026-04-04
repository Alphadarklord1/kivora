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

// ── PubMed / NCBI Entrez ──────────────────────────────────────────────────────

interface PubMedSearchResult {
  esearchresult: { idlist: string[] };
}

interface PubMedSummaryRecord {
  title: string;
  authors: { name: string }[];
  fulljournalname: string;
  pubdate: string;
  articleids: { idtype: string; value: string }[];
}

interface PubMedSummaryResult {
  result: Record<string, PubMedSummaryRecord>;
}

/**
 * Search PubMed (NCBI Entrez) for biomedical / scientific literature.
 * Free API — no key required (rate-limited to 3 req/s without key).
 */
export async function searchPubMed(query: string, limit = 3): Promise<ArticleSuggestion[]> {
  const searchParams = new URLSearchParams({
    db: 'pubmed', term: query, retmax: String(limit),
    retmode: 'json', usehistory: 'n',
    tool: 'Kivora', email: 'support@kivora.app',
  });
  const searchRes = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${searchParams}`,
    { headers: { 'User-Agent': 'Kivora/1.0 (https://kivora.app; study assistant)' }, signal: AbortSignal.timeout(10_000) },
  );
  if (!searchRes.ok) return [];
  const searchData = await searchRes.json() as PubMedSearchResult;
  const ids = (searchData?.esearchresult?.idlist ?? []).slice(0, limit);
  if (!ids.length) return [];

  const summaryParams = new URLSearchParams({
    db: 'pubmed', id: ids.join(','), retmode: 'json',
    tool: 'Kivora', email: 'support@kivora.app',
  });
  const summaryRes = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${summaryParams}`,
    { headers: { 'User-Agent': 'Kivora/1.0 (https://kivora.app; study assistant)' }, signal: AbortSignal.timeout(10_000) },
  );
  if (!summaryRes.ok) return [];
  const summaryData = await summaryRes.json() as PubMedSummaryResult;
  const result = summaryData?.result ?? {};

  return ids.flatMap((id): ArticleSuggestion[] => {
    const article = result[id];
    if (!article?.title) return [];
    const doi = article.articleids?.find(a => a.idtype === 'doi')?.value;
    const url = doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
    const authors = article.authors?.slice(0, 2).map(a => a.name).join(', ') ?? '';
    const year = article.pubdate?.match(/\d{4}/)?.[0] ?? '';
    const journal = article.fulljournalname || 'a peer-reviewed journal';
    return [{
      title: `${article.title}${year ? ` (${year})` : ''}${authors ? ` — ${authors}` : ''}`,
      url,
      source: 'PubMed',
      excerpt: `Published in ${journal}. Indexed by NCBI PubMed.`,
      readingMinutes: 8,
      type: 'academic',
    }];
  });
}

// ── arXiv ─────────────────────────────────────────────────────────────────────

/**
 * Search arXiv for preprint papers (physics, math, CS, biology, economics).
 * Free API — no key required.
 */
export async function searchArxiv(query: string, limit = 3): Promise<ArticleSuggestion[]> {
  const params = new URLSearchParams({
    search_query: `all:${query}`,
    max_results: String(limit),
    sortBy: 'relevance',
    sortOrder: 'descending',
  });
  const res = await fetch(`https://export.arxiv.org/api/query?${params}`, {
    headers: { 'User-Agent': 'Kivora/1.0 (https://kivora.app; study assistant)' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return [];
  const xml = await res.text();

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  return entries.slice(0, limit).flatMap(([, body]): ArticleSuggestion[] => {
    const title   = body.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
    const summary = body.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
    const absLink = body.match(/<id>([^<]+)<\/id>/)?.[1]?.trim() ?? '';
    const pdfLink = body.match(/<link[^>]+title="pdf"[^>]+href="([^"]+)"/)?.[1]
      ?? absLink.replace('/abs/', '/pdf/');
    const authorNames = [...body.matchAll(/<name>([^<]+)<\/name>/g)].slice(0, 2).map(m => m[1]).join(', ');
    const year = body.match(/<published>(\d{4})/)?.[1] ?? '';

    if (!title || !summary || !absLink) return [];
    const excerpt = summary.slice(0, 200) + (summary.length > 200 ? '…' : '');
    return [{
      title: `${title}${year ? ` (${year})` : ''}${authorNames ? ` — ${authorNames}` : ''}`,
      url: pdfLink || absLink,
      source: 'arXiv',
      excerpt,
      readingMinutes: Math.max(5, Math.ceil(summary.split(/\s+/).length / 220) + 10),
      type: 'academic',
    }];
  });
}

// ── Brave Web Search (optional — requires BRAVE_SEARCH_API_KEY) ───────────────

interface BraveWebResult { title: string; url: string; description: string; }
interface BraveSearchResponse { web?: { results: BraveWebResult[] } }

/**
 * Real web search via Brave Search API.
 * Pass apiKey = process.env.BRAVE_SEARCH_API_KEY.
 * Returns empty array when no key is configured.
 */
export async function searchBraveWeb(query: string, limit: number, apiKey: string): Promise<ArticleSuggestion[]> {
  if (!apiKey) return [];
  const params = new URLSearchParams({ q: query, count: String(limit), safesearch: 'moderate' });
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
      'User-Agent': 'Kivora/1.0 (https://kivora.app; study assistant)',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const data = await res.json() as BraveSearchResponse;
  return (data?.web?.results ?? []).slice(0, limit).map(r => ({
    title: r.title,
    url: r.url,
    source: 'Web',
    excerpt: (r.description ?? '').slice(0, 200) || 'A web result relevant to your topic.',
    readingMinutes: 3,
    type: 'educational' as const,
  }));
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
