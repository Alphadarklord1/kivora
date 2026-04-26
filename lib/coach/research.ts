import { callAi } from '@/lib/ai/call';
import { cloudAccessAllowed, type AiDataMode } from '@/lib/privacy/ai-data';
import { formatAll, toCitationInput, type CitationSet } from '@/lib/coach/citations';
import { isWebSearchConfigured, searchWeb } from '@/lib/coach/web-search';
import {
  buildStaticSuggestions,
  fetchWikiSummary,
  searchOpenAlex,
  searchSemanticScholar,
  searchWikipedia,
  type ArticleSuggestion,
  type ArticleSourceType,
} from '@/lib/coach/articles';
import {
  buildFallbackSourceBrief,
  estimateReadingMinutes,
  extractSourceMetaFromHtml,
  normalizeSourceBriefUrl,
} from '@/lib/coach/source-brief';

export type ResearchMode = 'automatic' | 'manual' | 'hybrid';
export type ResearchRanking = 'academic-first' | 'balanced' | 'broad-web';

export interface ResearchCitation {
  id: string;
  label: string;
  url: string;
  source: string;
  title: string;
  type: ArticleSourceType;
  confidenceLabel: ResearchSource['confidenceLabel'];
  confidenceScore: number;
  excerpt: string;
  origin: ResearchSource['origin'];
  readingMinutes: number;
  /** Pre-formatted citations (APA, MLA, Chicago) the UI can copy. */
  formatted: CitationSet;
}

export interface ResearchSource {
  id: string;
  title: string;
  url: string;
  source: string;
  type: ArticleSourceType;
  excerpt: string;
  readingMinutes: number;
  origin: 'automatic' | 'manual';
  keyPoints: string[];
  wordCount?: number;
  confidenceLabel: 'High' | 'Medium' | 'Baseline';
  confidenceScore: number;
  citationLabel: string;
}

export interface TopicResearchResult {
  topic: string;
  mode: ResearchMode;
  ranking: ResearchRanking;
  includeWeb: boolean;
  overview: string;
  keyIdeas: string[];
  sources: ResearchSource[];
  citations: ResearchCitation[];
  relatedLinks: ArticleSuggestion[];
  followUpPrompts: string[];
  rankingSummary: string;
  provider: 'groq' | 'grok' | 'openai' | 'local' | 'offline';
}

function dedupe<T>(items: T[]) {
  return Array.from(new Set(items));
}

function clampText(value: string, max = 260) {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function privateUrlError() {
  return new Error('Private or local network URLs are not supported here.');
}

function assertNotPrivateUrl(url: URL): void {
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    throw privateUrlError();
  }
  const ipv4Private = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.)/;
  if (ipv4Private.test(host)) {
    throw privateUrlError();
  }
  if (host === '169.254.169.254' || host === 'metadata.google.internal') {
    throw privateUrlError();
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are supported.');
  }
}

export function parseManualUrls(raw: string): string[] {
  const values = raw
    .split(/\r?\n|,/) 
    .map((value) => value.trim())
    .filter(Boolean);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique.slice(0, 5);
}

export function buildResearchFallback(sources: ResearchSource[]): Pick<TopicResearchResult, 'overview' | 'keyIdeas'> {
  const keyIdeas = dedupe(
    sources.flatMap((source) => source.keyPoints.map((point) => clampText(point, 180))).filter((point) => point.length >= 24),
  ).slice(0, 5);

  const overview = sources.length
    ? `I compared ${sources.length} source${sources.length === 1 ? '' : 's'} and pulled together the most repeated ideas so you can start researching quickly.`
    : 'No research sources were available.';

  return { overview, keyIdeas };
}

function parseOverview(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const explicit = lines.find((line) => /^overview:/i.test(line));
  if (explicit) return explicit.replace(/^overview:\s*/i, '').trim();
  return lines.find((line) => !/^key ideas?:?$/i.test(line) && !/^[-*•]/.test(line)) ?? text.trim();
}

function parseKeyIdeas(text: string) {
  return dedupe(
    text
      .split(/\n+/)
      .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter((line) => line.length >= 20 && !/^overview:/i.test(line) && !/^key ideas?:?$/i.test(line)),
  ).slice(0, 5);
}

async function fetchManualSource(urlValue: string): Promise<ResearchSource> {
  const url = normalizeSourceBriefUrl(urlValue);
  assertNotPrivateUrl(url);

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; KivoraBot/1.0; +https://kivora.app)',
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error('One of the manual sources redirects and cannot be fetched.');
  }

  if (!response.ok) {
    throw new Error(`Could not fetch this source (${response.status}).`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new Error('One of the manual links is not a readable web page.');
  }

  const html = await response.text();
  const brief = buildFallbackSourceBrief(extractSourceMetaFromHtml(html, url), url.toString(), 'url');

  return {
    id: brief.url,
    title: brief.title,
    url: brief.url,
    source: brief.sourceLabel,
    type: 'educational',
    excerpt: clampText(brief.summary, 220),
    readingMinutes: estimateReadingMinutes(brief.wordCount),
    origin: 'manual',
    keyPoints: brief.keyPoints.slice(0, 4),
    wordCount: brief.wordCount,
    confidenceLabel: 'Medium',
    confidenceScore: 72,
    citationLabel: '',
  };
}

async function fetchAutomaticSources(
  topic: string,
  options: { includeWeb: boolean; ranking: ResearchRanking },
): Promise<ResearchSource[]> {
  const wantAcademic = options.ranking === 'academic-first' ? 4 : 2;

  // Run Semantic Scholar and OpenAlex in parallel — if S2 rate-limits, OpenAlex fills in
  const [s2Results, openAlexResults] = await Promise.all([
    searchSemanticScholar(topic, wantAcademic).catch((): ArticleSuggestion[] => []),
    searchOpenAlex(topic, wantAcademic).catch((): ArticleSuggestion[] => []),
  ]);

  // Merge academic results: prefer S2 when both return results, use OpenAlex to fill gaps
  const seenTitles = new Set<string>();
  const academic: ArticleSuggestion[] = [];
  for (const item of [...s2Results, ...openAlexResults]) {
    const key = item.title.slice(0, 60).toLowerCase();
    if (!seenTitles.has(key) && academic.length < wantAcademic) {
      seenTitles.add(key);
      academic.push(item);
    }
  }

  const wikiTitles = options.includeWeb || academic.length === 0
    ? await searchWikipedia(topic, options.ranking === 'broad-web' ? 5 : 3).catch(() => [])
    : [];
  const wikiSummaries = await Promise.all(
    wikiTitles.slice(0, options.ranking === 'broad-web' ? 4 : 2).map((title) => fetchWikiSummary(title).catch(() => null)),
  );

  const encyclopedia = wikiSummaries
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  // Broad web hits via Tavily — only requested when ranking is 'broad-web'
  // and the API key is set. Empty array otherwise so the existing flow is
  // unaffected for users without Tavily configured.
  const webHits = options.ranking === 'broad-web' && isWebSearchConfigured()
    ? await searchWeb(topic, 5).catch((): ArticleSuggestion[] => [])
    : [];

  const all = [
    ...academic.map((item) => ({
      id: item.url,
      title: item.title,
      url: item.url,
      source: item.source,
      type: item.type,
      excerpt: item.excerpt,
      readingMinutes: item.readingMinutes,
      origin: 'automatic' as const,
      keyPoints: [item.excerpt],
      confidenceLabel: 'High' as const,
      confidenceScore: item.source === 'Semantic Scholar' ? 90 : 87,
      citationLabel: '',
    })),
    ...encyclopedia.map((item) => ({
      id: item.url,
      title: item.title,
      url: item.url,
      source: item.source,
      type: item.type,
      excerpt: item.excerpt,
      readingMinutes: item.readingMinutes,
      origin: 'automatic' as const,
      keyPoints: [item.excerpt],
      confidenceLabel: options.ranking === 'broad-web' ? 'Baseline' as const : 'Medium' as const,
      confidenceScore: options.ranking === 'broad-web' ? 58 : 70,
      citationLabel: '',
    })),
    ...webHits.map((item) => ({
      id: item.url,
      title: item.title,
      url: item.url,
      source: item.source,
      type: item.type,
      excerpt: item.excerpt,
      readingMinutes: item.readingMinutes,
      origin: 'automatic' as const,
      keyPoints: item.excerpt ? [item.excerpt] : [],
      // Web hits are baseline confidence — they're current and broad but
      // not peer-reviewed. The ranker will weight them below academic
      // sources unless ranking is 'broad-web'.
      confidenceLabel: 'Baseline' as const,
      confidenceScore: 55,
      citationLabel: '',
    })),
  ];

  return rankSources(all, options.ranking).slice(0, options.ranking === 'broad-web' ? 5 : 4);
}

function rankSources(sources: ResearchSource[], ranking: ResearchRanking) {
  const weights: Record<ArticleSourceType, number> =
    ranking === 'academic-first'
      ? { academic: 100, educational: 75, encyclopedia: 68, news: 50 }
      : ranking === 'broad-web'
        ? { academic: 86, educational: 82, encyclopedia: 74, news: 70 }
        : { academic: 92, educational: 80, encyclopedia: 76, news: 58 };

  return [...sources].sort((a, b) => {
    const scoreA = weights[a.type] + a.confidenceScore;
    const scoreB = weights[b.type] + b.confidenceScore;
    return scoreB - scoreA;
  });
}

function attachCitationLabels(sources: ResearchSource[]) {
  return sources.map((source, index) => ({
    ...source,
    citationLabel: `S${index + 1}`,
  }));
}


function buildFollowUpPrompts(topic: string, keyIdeas: string[]) {
  const prompts = [
    `What do the sources agree on most about ${topic}?`,
    `What is the biggest misconception people have about ${topic}?`,
    `Explain ${topic} in simpler terms for a student.`,
  ];

  for (const idea of keyIdeas.slice(0, 2)) {
    prompts.push(`Why does this matter: ${idea}?`);
  }

  return dedupe(prompts.map((prompt) => clampText(prompt, 110))).slice(0, 5);
}

function buildRankingSummary(sources: ResearchSource[], ranking: ResearchRanking, includeWeb: boolean) {
  const counts = sources.reduce<Record<string, number>>((acc, source) => {
    acc[source.type] = (acc[source.type] ?? 0) + 1;
    return acc;
  }, {});
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${count} ${type}`);
  const rankingLabel = ranking === 'academic-first'
    ? 'Academic-first ranking pushes research papers and educational material higher.'
    : ranking === 'broad-web'
      ? 'Broad-web ranking keeps a wider spread of source types in play.'
      : 'Balanced ranking mixes authority with readability.';
  const webLabel = includeWeb
    ? 'Wikipedia and encyclopedic sources are included alongside academic databases.'
    : 'Only peer-reviewed academic databases (Semantic Scholar, OpenAlex) were searched.';
  return `${rankingLabel} ${webLabel} Source mix: ${parts.join(', ')}.`;
}

export async function researchTopic(args: {
  topic: string;
  mode: ResearchMode;
  ranking: ResearchRanking;
  includeWeb: boolean;
  manualUrls: string[];
  aiPrefs?: unknown;
  privacyMode: AiDataMode;
}): Promise<TopicResearchResult> {
  const topic = args.topic.trim().slice(0, 140);
  if (!topic) throw new Error('Enter a topic to research.');

  if (args.mode === 'manual' && args.manualUrls.length === 0) {
    throw new Error('Add at least one manual source URL.');
  }

  if (!cloudAccessAllowed(args.privacyMode)) {
    throw new Error('Topic research needs internet. Use the Writing Studio with uploaded files for fully local work.');
  }

  const manualSources = args.manualUrls.length
    ? (await Promise.allSettled(args.manualUrls.map((url) => fetchManualSource(url))))
        .filter((r): r is PromiseFulfilledResult<ResearchSource> => r.status === 'fulfilled')
        .map((r) => r.value)
    : [];
  const automaticSources = args.mode === 'manual'
    ? []
    : await fetchAutomaticSources(topic, { includeWeb: args.includeWeb, ranking: args.ranking });
  const sources = attachCitationLabels(rankSources([...manualSources, ...automaticSources], args.ranking).slice(0, 6));

  if (sources.length === 0) {
    throw new Error('No readable sources were found for this topic yet.');
  }

  const prompt = [
    `Research topic: ${topic}`,
    'Compare the following sources for a student.',
    'Return plain text in exactly this structure:',
    'Overview: <2-3 sentence synthesis>',
    'Key ideas:',
    '- <idea 1>',
    '- <idea 2>',
    '- <idea 3>',
    '- <idea 4>',
    '',
    ...sources.map((source, index) => [
      `[S${index + 1}] ${source.title} (${source.source})`,
      `URL: ${source.url}`,
      `Excerpt: ${source.excerpt}`,
      source.keyPoints.length ? `Signals:\n${source.keyPoints.map((point) => `- ${point}`).join('\n')}` : '',
    ].filter(Boolean).join('\n')),
  ].join('\n\n');

  const fallback = buildResearchFallback(sources);
  const rankingSummary = buildRankingSummary(sources, args.ranking, args.includeWeb);
  const { result, source } = await callAi({
    messages: [
      { role: 'system', content: 'You are a study research assistant. Compare multiple sources and extract the clearest shared ideas for a student.' },
      { role: 'user', content: prompt },
    ],
    maxTokens: 900,
    temperature: 0.3,
    aiPrefs: args.aiPrefs,
    privacyMode: args.privacyMode,
    offlineFallback: () => `Overview: ${fallback.overview}\n\nKey ideas:\n${fallback.keyIdeas.map((idea) => `- ${idea}`).join('\n')}`,
  });

  const relatedLinks = buildStaticSuggestions(topic);
  return {
    topic,
    mode: args.mode,
    ranking: args.ranking,
    includeWeb: args.includeWeb,
    overview: parseOverview(result) || fallback.overview,
    keyIdeas: parseKeyIdeas(result).length ? parseKeyIdeas(result) : fallback.keyIdeas,
    sources,
    citations: sources.map((source) => ({
      id: source.id,
      label: source.citationLabel,
      url: source.url,
      source: `${source.title} — ${source.source}`,
      title: source.title,
      type: source.type,
      confidenceLabel: source.confidenceLabel,
      confidenceScore: source.confidenceScore,
      excerpt: source.excerpt,
      origin: source.origin,
      readingMinutes: source.readingMinutes,
      // Pre-formatted citations in the three styles students commonly need.
      // The current ResearchSource doesn't carry structured author/year, so
      // these are best-effort web-style citations; the formatters degrade
      // cleanly when fields are missing.
      formatted: formatAll(toCitationInput(source)),
    })),
    relatedLinks,
    followUpPrompts: buildFollowUpPrompts(topic, parseKeyIdeas(result).length ? parseKeyIdeas(result) : fallback.keyIdeas),
    rankingSummary,
    provider: source,
  };
}
