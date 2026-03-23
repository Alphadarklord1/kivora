import { callAi } from '@/lib/ai/call';
import { cloudAccessAllowed, type AiDataMode } from '@/lib/privacy/ai-data';
import {
  buildStaticSuggestions,
  fetchWikiSummary,
  searchWikipedia,
  type ArticleSuggestion,
} from '@/lib/coach/articles';
import {
  buildFallbackSourceBrief,
  estimateReadingMinutes,
  extractSourceMetaFromHtml,
  normalizeSourceBriefUrl,
} from '@/lib/coach/source-brief';

export type ResearchMode = 'automatic' | 'manual' | 'hybrid';

export interface ResearchSource {
  id: string;
  title: string;
  url: string;
  source: string;
  excerpt: string;
  readingMinutes: number;
  origin: 'automatic' | 'manual';
  keyPoints: string[];
  wordCount?: number;
}

export interface TopicResearchResult {
  topic: string;
  mode: ResearchMode;
  overview: string;
  keyIdeas: string[];
  sources: ResearchSource[];
  relatedLinks: ArticleSuggestion[];
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
    excerpt: clampText(brief.summary, 220),
    readingMinutes: estimateReadingMinutes(brief.wordCount),
    origin: 'manual',
    keyPoints: brief.keyPoints.slice(0, 4),
    wordCount: brief.wordCount,
  };
}

async function fetchAutomaticSources(topic: string): Promise<ResearchSource[]> {
  const titles = await searchWikipedia(topic, 4);
  const summaries = await Promise.all(titles.slice(0, 4).map((title) => fetchWikiSummary(title).catch(() => null)));

  return summaries
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 3)
    .map((item) => ({
      id: item.url,
      title: item.title,
      url: item.url,
      source: item.source,
      excerpt: item.excerpt,
      readingMinutes: item.readingMinutes,
      origin: 'automatic' as const,
      keyPoints: [item.excerpt],
    }));
}

export async function researchTopic(args: {
  topic: string;
  mode: ResearchMode;
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
    throw new Error('Topic research needs internet. Use Source Brief with pasted text or uploaded files when you want to stay fully local.');
  }

  const manualSources = args.manualUrls.length
    ? await Promise.all(args.manualUrls.map((url) => fetchManualSource(url)))
    : [];
  const automaticSources = args.mode === 'manual' ? [] : await fetchAutomaticSources(topic);
  const sources = [...manualSources, ...automaticSources].slice(0, 6);

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
    overview: parseOverview(result) || fallback.overview,
    keyIdeas: parseKeyIdeas(result).length ? parseKeyIdeas(result) : fallback.keyIdeas,
    sources,
    relatedLinks,
    provider: source,
  };
}
