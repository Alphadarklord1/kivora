/**
 * lib/coach/doi.ts
 *
 * Resolves DOI → paper metadata via CrossRef (free, no key required).
 * Resolves arXiv IDs (e.g. "2301.07041" or "arxiv:2301.07041") via arXiv API.
 */

export interface ResolvedPaper {
  title: string;
  authors: string;   // "Surname, A., Surname, B."
  journal: string;
  year: number | null;
  doi: string | null;
  url: string;
  abstract: string;
  sourceType: 'doi' | 'arxiv';
}

// ── CrossRef ──────────────────────────────────────────────────────────────────

export async function resolveDoi(doi: string): Promise<ResolvedPaper> {
  const clean = doi.replace(/^https?:\/\/doi\.org\//i, '').trim();
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`, {
    headers: { 'User-Agent': 'Kivora/1.0 (mailto:support@kivora.app)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`DOI not found (${res.status})`);
  const data = await res.json() as { message: CrossRefWork };
  const w = data.message;

  const title = Array.isArray(w.title) ? w.title[0] : (w.title ?? 'Untitled');
  const authors = (w.author ?? [])
    .map(a => [a.family, a.given].filter(Boolean).join(', '))
    .join('; ');
  const journal = w['container-title']?.[0] ?? w.publisher ?? '';
  const year = w.published?.['date-parts']?.[0]?.[0] ?? null;
  const url = w.URL ?? `https://doi.org/${clean}`;
  const abstract = w.abstract
    ? w.abstract.replace(/<jats:[^>]+>/g, '').replace(/<\/jats:[^>]+>/g, '').trim()
    : '';

  return { title, authors, journal, year, doi: clean, url, abstract, sourceType: 'doi' };
}

interface CrossRefWork {
  title: string | string[];
  author?: { family?: string; given?: string }[];
  'container-title'?: string[];
  publisher?: string;
  published?: { 'date-parts'?: number[][] };
  URL?: string;
  abstract?: string;
}

// ── arXiv ─────────────────────────────────────────────────────────────────────

export function normalizeArxivId(input: string): string | null {
  // Accept: "2301.07041", "arxiv:2301.07041", "arXiv:2301.07041v2",
  //         "https://arxiv.org/abs/2301.07041"
  // Require arxiv prefix OR URL, OR the bare ID must appear at start/end of string
  // to avoid false-positive matches inside DOIs like "10.5555/3295222.3295349".
  const withPrefix = input.match(/(?:arxiv[:\s/]|arxiv\.org\/(?:abs|pdf)\/)([\d]{4}\.[\d]{4,5}(?:v\d+)?)/i);
  if (withPrefix) return withPrefix[1].replace(/v\d+$/, '');
  const bare = input.match(/^([\d]{4}\.[\d]{4,5}(?:v\d+)?)$/i);
  return bare ? bare[1].replace(/v\d+$/, '') : null;
}

export async function resolveArxiv(idOrUrl: string): Promise<ResolvedPaper> {
  const id = normalizeArxivId(idOrUrl);
  if (!id) throw new Error('Not a valid arXiv ID');

  const res = await fetch(`https://export.arxiv.org/api/query?id_list=${id}&max_results=1`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`arXiv fetch failed (${res.status})`);
  const xml = await res.text();

  const title = (xml.match(/<title>([^<]+)<\/title>/)?.[1] ?? 'Untitled').replace(/\s+/g, ' ').trim();
  const authorMatches = [...xml.matchAll(/<author>[^<]*<name>([^<]+)<\/name>/g)];
  const authors = authorMatches.map(m => m[1]).join('; ');
  const abstract = (xml.match(/<summary[^>]*>([^<]+)<\/summary>/)?.[1] ?? '').trim().replace(/\s+/g, ' ');
  const published = xml.match(/<published>(\d{4})/)?.[1] ?? null;
  const year = published ? parseInt(published, 10) : null;

  return {
    title,
    authors,
    journal: 'arXiv',
    year,
    doi: null,
    url: `https://arxiv.org/abs/${id}`,
    abstract,
    sourceType: 'arxiv',
  };
}

// ── Auto-detect and resolve ───────────────────────────────────────────────────

export async function resolveIdentifier(input: string): Promise<ResolvedPaper> {
  const trimmed = input.trim();

  // Check arXiv first (pattern or URL)
  const arxivId = normalizeArxivId(trimmed);
  if (arxivId) return resolveArxiv(trimmed);

  // Treat as DOI (strip URL prefix if present)
  return resolveDoi(trimmed);
}
