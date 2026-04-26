/**
 * Citation formatters for Scholar Hub research sources.
 *
 * Today's `ResearchSource` shape carries title, url, source (site/publisher
 * name), and type — but not authors, year, journal, or DOI. The formatters
 * below take a richer `CitationInput` that allows optional structured
 * fields, so callers that *do* have author/year (Semantic Scholar's API
 * returns these, OpenAlex too) can pass them through. Sources without
 * structured metadata get sensible best-effort fallbacks.
 *
 * Style references:
 *   APA 7th — https://apastyle.apa.org
 *   MLA 9th — https://style.mla.org
 *   Chicago 17th (notes-bibliography) — https://www.chicagomanualofstyle.org
 */

import type { ArticleSourceType } from '@/lib/coach/articles';
import type { ResearchSource } from '@/lib/coach/research';

export interface CitationInput {
  title: string;
  url: string;
  /** Publisher / site / journal name (e.g. "Wikipedia", "Nature", "Khan Academy"). */
  source: string;
  /** Type from the search step — informs which template to apply. */
  type: ArticleSourceType;
  /** One or more author names; pass [] if unknown. */
  authors?: string[];
  /** 4-digit year, optional. */
  year?: number;
  /** Journal name when distinct from `source` (e.g. "Nature" vs publisher "Springer"). */
  journal?: string;
  /** Volume / issue / page numbers for journal articles. */
  volume?: string;
  issue?: string;
  pages?: string;
  /** Digital Object Identifier — preferred over URL when present. */
  doi?: string;
  /** Override accessed date (ISO yyyy-mm-dd); defaults to today. */
  accessedDate?: string;
}

export interface CitationSet {
  apa: string;
  mla: string;
  chicago: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isoDate(date = new Date()): string {
  return date.toISOString().slice(0, 10); // yyyy-mm-dd
}

function longDate(iso: string): string {
  // "2026-04-25" → "25 Apr. 2026"
  const [y, m, d] = iso.split('-');
  const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
  if (!y || !m || !d) return iso;
  const monthIdx = Math.max(0, Math.min(11, Number(m) - 1));
  return `${Number(d)} ${months[monthIdx]} ${y}`;
}

function chicagoDate(iso: string): string {
  // "2026-04-25" → "April 25, 2026"
  const [y, m, d] = iso.split('-');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  if (!y || !m || !d) return iso;
  const monthIdx = Math.max(0, Math.min(11, Number(m) - 1));
  return `${months[monthIdx]} ${Number(d)}, ${y}`;
}

function ensurePeriod(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * "Smith, John" → "Smith, J." (APA initials)
 * "John Smith"  → "Smith, J."
 */
function apaName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  if (trimmed.includes(',')) {
    // Already "Last, First Middle" — initialise the given names.
    const [last, rest] = trimmed.split(',', 2).map((s) => s.trim());
    const initials = rest
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => `${part[0].toUpperCase()}.`)
      .join(' ');
    return initials ? `${last}, ${initials}` : last;
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(' ');
  return `${last}, ${initials}`;
}

/**
 * "John Smith" → "Smith, John" (MLA / Chicago surname-first for the FIRST author only).
 * "Smith, John" passes through.
 */
function surnameFirst(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes(',')) return trimmed;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1).join(' ');
  return `${last}, ${rest}`;
}

function joinAuthors(
  authors: string[] | undefined,
  format: (n: string) => string,
  conjunction = '&',
): string {
  if (!authors || authors.length === 0) return '';
  const formatted = authors.map(format).filter(Boolean);
  if (formatted.length === 0) return '';
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} ${conjunction} ${formatted[1]}`;
  // APA / MLA / Chicago all collapse 3+ authors with commas + final conjunction.
  // For very long lists APA uses "et al." after the first author for in-text
  // citations only — full reference list still spells them out (or up to 20).
  const head = formatted.slice(0, -1).join(', ');
  const tail = formatted[formatted.length - 1];
  return `${head}, ${conjunction} ${tail}`;
}

// ── APA 7th ─────────────────────────────────────────────────────────────────

export function formatApa(input: CitationInput): string {
  const accessed = input.accessedDate ?? isoDate();
  const yearPart = input.year ? `(${input.year})` : '(n.d.)';
  const authorPart = joinAuthors(input.authors, apaName, '&');
  const titleItalic = `*${ensurePeriod(input.title).replace(/\.$/, '')}*`;
  const linkPart = input.doi
    ? `https://doi.org/${input.doi}`
    : input.url;

  // Journal article when we have a journal name + (volume or pages).
  if (input.journal && (input.volume || input.pages)) {
    const journalPart = `*${input.journal}*`;
    const volIssue = input.volume
      ? input.issue
        ? `, ${input.volume}(${input.issue})`
        : `, ${input.volume}`
      : '';
    const pages = input.pages ? `, ${input.pages}` : '';
    const head = authorPart ? `${authorPart} ${yearPart}.` : `${yearPart}.`;
    return `${head} ${ensurePeriod(input.title)} ${journalPart}${volIssue}${pages}. ${linkPart}`;
  }

  // Web / encyclopedia / news fallback.
  const head = authorPart
    ? `${authorPart} ${yearPart}.`
    : `${input.source}. ${yearPart}.`;
  const sourceLabel = authorPart ? ensurePeriod(input.source) : '';
  return [head, titleItalic + '.', sourceLabel, linkPart].filter(Boolean).join(' ').trim();
}

// ── MLA 9th ─────────────────────────────────────────────────────────────────

export function formatMla(input: CitationInput): string {
  const accessed = input.accessedDate ?? isoDate();
  const accessedLong = longDate(accessed);
  const authorList = input.authors && input.authors.length > 0
    ? joinAuthors(
        input.authors.map((name, idx) => (idx === 0 ? surnameFirst(name) : name)),
        (n) => n,
        'and',
      )
    : '';

  const titlePart = `"${ensurePeriod(input.title).replace(/\.$/, '')}."`;
  const containerItalic = `*${input.source}*`;
  const yearPart = input.year ? `, ${input.year}` : '';
  const linkPart = input.doi ? `doi:${input.doi}` : input.url;

  // Journal article: container is the journal, includes volume/issue/year/pages.
  if (input.journal) {
    const containerJournal = `*${input.journal}*`;
    const vol = input.volume ? `, vol. ${input.volume}` : '';
    const iss = input.issue ? `, no. ${input.issue}` : '';
    const pages = input.pages ? `, pp. ${input.pages}` : '';
    const head = authorList ? `${ensurePeriod(authorList)}` : '';
    return `${head} ${titlePart} ${containerJournal}${vol}${iss}${yearPart}${pages}. ${linkPart}. Accessed ${accessedLong}.`.trim();
  }

  const head = authorList ? `${ensurePeriod(authorList)} ` : '';
  return `${head}${titlePart} ${containerItalic}${yearPart}, ${linkPart}. Accessed ${accessedLong}.`.trim();
}

// ── Chicago 17th (notes-bibliography style) ─────────────────────────────────

export function formatChicago(input: CitationInput): string {
  const accessed = input.accessedDate ?? isoDate();
  const accessedLong = chicagoDate(accessed);
  const authorList = input.authors && input.authors.length > 0
    ? joinAuthors(
        input.authors.map((name, idx) => (idx === 0 ? surnameFirst(name) : name)),
        (n) => n,
        'and',
      )
    : '';

  const linkPart = input.doi ? `https://doi.org/${input.doi}` : input.url;

  if (input.journal) {
    const vol = input.volume ? ` ${input.volume}` : '';
    const iss = input.issue ? `, no. ${input.issue}` : '';
    const yr = input.year ? ` (${input.year})` : '';
    const pages = input.pages ? `: ${input.pages}` : '';
    const head = authorList ? `${ensurePeriod(authorList)} ` : '';
    return `${head}"${ensurePeriod(input.title).replace(/\.$/, '')}." *${input.journal}*${vol}${iss}${yr}${pages}. ${linkPart}.`.trim();
  }

  const head = authorList ? `${ensurePeriod(authorList)} ` : '';
  const yearPart = input.year ? ` ${input.year}.` : '';
  return `${head}"${ensurePeriod(input.title).replace(/\.$/, '')}." *${input.source}*.${yearPart} Accessed ${accessedLong}. ${linkPart}.`.trim();
}

// ── Convenience: build all three at once ────────────────────────────────────

export function formatAll(input: CitationInput): CitationSet {
  return {
    apa: formatApa(input),
    mla: formatMla(input),
    chicago: formatChicago(input),
  };
}

// ── Adapter from ResearchSource → CitationInput ─────────────────────────────

/**
 * Promote a ResearchSource to a CitationInput. ResearchSource doesn't carry
 * structured author/year today, so callers that have those (the search
 * adapters in lib/coach/articles.ts could parse them out of Semantic Scholar
 * / OpenAlex responses) should attach them via the optional `extras` arg.
 */
export function toCitationInput(
  source: ResearchSource,
  extras?: Partial<Omit<CitationInput, 'title' | 'url' | 'source' | 'type'>>,
): CitationInput {
  return {
    title: source.title,
    url: source.url,
    source: source.source,
    type: source.type,
    ...(extras ?? {}),
  };
}
