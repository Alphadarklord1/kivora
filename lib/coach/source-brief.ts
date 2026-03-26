export type ExtractedMeta = {
  title: string;
  siteName?: string;
  description?: string;
  extractedText: string;
  wordCount: number;
};

const BLOCK_TAG_BREAKS = /<\/?(article|section|main|header|footer|aside|nav|div|p|h1|h2|h3|h4|h5|h6|li|ul|ol|blockquote|pre|table|tr|td|th|br)[^>]*>/gi;
const HTML_TAGS = /<[^>]+>/g;
const SCRIPT_STYLE_TAGS = /<(script|style|noscript|svg|canvas|iframe)[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENT_TAGS = /<!--[\s\S]*?-->/g;

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '-',
  mdash: '-',
  hellip: '...',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  copy: '(c)',
  reg: '(r)',
  trade: 'TM',
};

export type SourceBrief = ExtractedMeta & {
  url: string;
  sourceType: 'url' | 'manual-text' | 'file';
  sourceLabel: string;
  summary: string;
  keyPoints: string[];
};

function decodeHtmlEntities(input: string) {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith('#x')) {
      const value = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    if (normalized.startsWith('#')) {
      const value = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    return ENTITY_MAP[normalized] ?? match;
  });
}

function collapseWhitespace(input: string) {
  return input
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripTagsPreservingBreaks(html: string) {
  return collapseWhitespace(
    decodeHtmlEntities(
      html
        .replace(COMMENT_TAGS, ' ')
        .replace(SCRIPT_STYLE_TAGS, ' ')
        .replace(BLOCK_TAG_BREAKS, '\n')
        .replace(HTML_TAGS, ' '),
    ),
  );
}

function getMetaContent(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      return collapseWhitespace(decodeHtmlEntities(match[1]));
    }
  }
  return undefined;
}

function extractTitle(html: string, url: URL) {
  const metaTitle = getMetaContent(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"]+)["']/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"]+)["']/i,
  ]);
  if (metaTitle) return metaTitle;

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    return collapseWhitespace(decodeHtmlEntities(titleMatch[1]));
  }

  return url.hostname.replace(/^www\./, '');
}

export function estimateReadingMinutes(wordCount: number) {
  return Math.max(1, Math.ceil(wordCount / 220));
}

function pickMeaningfulParagraphs(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 80);

  return paragraphs.slice(0, 8);
}

function makeFallbackSummary(meta: ExtractedMeta) {
  const paragraphs = pickMeaningfulParagraphs(meta.extractedText);
  const lead = paragraphs[0] ?? meta.description ?? `${meta.title} appears to cover the main topic introduced on the page.`;
  const second = paragraphs[1] ?? paragraphs[0] ?? '';
  const sentenceA = lead.split(/(?<=[.!?])\s+/)[0] ?? lead;
  const sentenceB = second.split(/(?<=[.!?])\s+/)[0] ?? second;
  return collapseWhitespace([sentenceA, sentenceB].filter(Boolean).join(' '));
}

function makeFallbackKeyPoints(meta: ExtractedMeta) {
  const paragraphs = pickMeaningfulParagraphs(meta.extractedText);
  const candidates = [
    meta.description,
    ...paragraphs.slice(0, 3).map((paragraph) => paragraph.split(/(?<=[.!?])\s+/)[0] ?? paragraph),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => collapseWhitespace(value))
    .filter((value) => value.length >= 30);

  return Array.from(new Set(candidates)).slice(0, 4);
}

function isPrivateIpv4(hostname: string) {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function normalizeSourceBriefUrl(rawUrl: string) {
  const value = rawUrl.trim();
  if (!value) throw new Error('Paste a source URL first.');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid URL that starts with http:// or https://');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http:// and https:// URLs are supported.');
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error('Private or local network URLs are not supported here.');
  }

  return url;
}

export function extractSourceMetaFromHtml(html: string, url: URL): ExtractedMeta {
  const cleanedText = stripTagsPreservingBreaks(html);
  const paragraphs = pickMeaningfulParagraphs(cleanedText);
  const extractedText = collapseWhitespace(
    (paragraphs.length ? paragraphs : cleanedText.split(/\n+/).filter(Boolean).slice(0, 20)).join('\n\n'),
  );

  const title = extractTitle(html, url);
  const siteName = getMetaContent(html, [
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"]+)["']/i,
    /<meta[^>]+name=["']application-name["'][^>]+content=["']([^"]+)["']/i,
  ]) ?? url.hostname.replace(/^www\./, '');
  const description = getMetaContent(html, [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"]+)["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"]+)["']/i,
    /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"]+)["']/i,
  ]);

  const wordCount = extractedText ? extractedText.split(/\s+/).length : 0;
  if (!extractedText || wordCount < 40) {
    throw new Error('This source did not provide enough readable text to summarize.');
  }

  return { title, siteName, description, extractedText, wordCount };
}

export function extractSourceMetaFromText(rawText: string, rawTitle?: string): ExtractedMeta {
  const extractedText = collapseWhitespace(rawText);
  const wordCount = extractedText ? extractedText.split(/\s+/).length : 0;
  if (!extractedText || wordCount < 40) {
    throw new Error('Paste at least a short article or study passage before analyzing.');
  }

  const paragraphs = pickMeaningfulParagraphs(extractedText);
  // Try to find a short heading-like first line (< 80 chars, no sentence-ending punctuation mid-line)
  const lines = extractedText.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const headingLine = lines.find(l => l.length >= 4 && l.length <= 80 && !/[.!?]$/.test(l) && l === lines[0]);
  // Derive a topic title from the first few meaningful words if no explicit title/heading
  const leadWords = paragraphs[0]?.split(/\s+/).slice(0, 6).join(' ').replace(/[.!?,;:]+$/, '') ?? '';
  const title = collapseWhitespace(rawTitle ?? '') || headingLine || (leadWords.length >= 4 ? leadWords : 'Manual text');
  const description = paragraphs[0]?.slice(0, 220) || undefined;

  return {
    title,
    siteName: 'Manual text',
    description,
    extractedText,
    wordCount,
  };
}

export function buildFallbackSourceBrief(
  meta: ExtractedMeta,
  url: string,
  sourceType: SourceBrief['sourceType'] = 'url',
  sourceLabel?: string,
): SourceBrief {
  return {
    url,
    sourceType,
    sourceLabel:
      sourceLabel ??
      (sourceType === 'manual-text'
        ? 'Manual text'
        : sourceType === 'file'
          ? 'Uploaded file'
          : meta.siteName ?? 'Web source'),
    ...meta,
    summary: makeFallbackSummary(meta),
    keyPoints: makeFallbackKeyPoints(meta),
  };
}

export function describeSourceMeta(meta: ExtractedMeta) {
  return `${meta.title} from ${meta.siteName ?? 'the source'} is about ${Math.max(1, estimateReadingMinutes(meta.wordCount))} minute${estimateReadingMinutes(meta.wordCount) === 1 ? '' : 's'} of reading.`;
}
