export type ParsedFlashcard = { front: string; back: string };

function decodeEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function decodeEscapes(value: string) {
  return value
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\n/gi, '\n')
    .replace(/\\t/gi, '\t')
    .replace(/\\r/gi, '')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

function normalizeText(value: string) {
  return decodeEntities(decodeEscapes(value))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueCards(cards: ParsedFlashcard[]) {
  const unique = new Map<string, ParsedFlashcard>();
  for (const card of cards) {
    const front = normalizeText(card.front);
    const back = normalizeText(card.back);
    if (!front || !back) continue;
    unique.set(`${front}:::${back}`, { front, back });
  }
  return Array.from(unique.values()).slice(0, 500);
}

function parseWordDefinitionPairs(html: string) {
  const patterns = [
    /"word":"([^\"]+)".{0,500}?"definition":"([^\"]+)"/g,
    /"term":"([^\"]+)".{0,500}?"definition":"([^\"]+)"/g,
    /"front":"([^\"]+)".{0,500}?"back":"([^\"]+)"/g,
    /"side":"word".{0,500}?"text":"([^\"]+)".{0,500}?"side":"definition".{0,500}?"text":"([^\"]+)"/g,
  ];

  const cards: ParsedFlashcard[] = [];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      cards.push({ front: match[1] ?? '', back: match[2] ?? '' });
    }
    if (cards.length > 0) break;
  }
  return uniqueCards(cards);
}

function parseJsonLd(html: string) {
  const cards: ParsedFlashcard[] = [];
  const scriptMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scriptMatches) {
    try {
      const data = JSON.parse(decodeEscapes(match[1] ?? '')) as Record<string, unknown>;
      const parts = Array.isArray(data.hasPart) ? data.hasPart : Array.isArray(data.mainEntity) ? data.mainEntity : [];
      for (const part of parts as Array<Record<string, unknown>>) {
        const front = typeof part.name === 'string' ? part.name : typeof part.term === 'string' ? part.term : '';
        const back = typeof part.text === 'string' ? part.text : typeof part.description === 'string' ? part.description : typeof part.definition === 'string' ? part.definition : '';
        if (front && back) cards.push({ front, back });
      }
    } catch {
      continue;
    }
  }
  return uniqueCards(cards);
}

function parseEmbeddedJson(html: string) {
  const cards: ParsedFlashcard[] = [];
  const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scriptMatches) {
    const script = match[1] ?? '';
    if (!/term|definition|word/i.test(script)) continue;

    for (const pair of script.matchAll(/(?:"word"|"term")\s*:\s*"([^\"]+)"[\s\S]{0,500}?(?:"definition"|"text")\s*:\s*"([^\"]+)"/g)) {
      cards.push({ front: pair[1] ?? '', back: pair[2] ?? '' });
    }

    for (const pair of script.matchAll(/"cardSides"\s*:\s*\[(?:.|\n){0,500}?"text"\s*:\s*"([^\"]+)"(?:.|\n){0,500}?"text"\s*:\s*"([^\"]+)"/g)) {
      cards.push({ front: pair[1] ?? '', back: pair[2] ?? '' });
    }
  }
  return uniqueCards(cards);
}

function parseVisibleTerms(html: string) {
  const cards: ParsedFlashcard[] = [];
  const termMatches = html.matchAll(/<span[^>]*>([^<]{1,240})<\/span>[\s\S]{0,300}?<span[^>]*>([^<]{1,400})<\/span>/gi);
  for (const match of termMatches) {
    const front = normalizeText(match[1] ?? '');
    const back = normalizeText(match[2] ?? '');
    if (front && back && front !== back) cards.push({ front, back });
  }
  return uniqueCards(cards);
}

export function extractQuizletCards(html: string) {
  const strategies = [
    parseWordDefinitionPairs,
    parseJsonLd,
    parseEmbeddedJson,
    parseVisibleTerms,
  ];

  for (const strategy of strategies) {
    const cards = strategy(html);
    if (cards.length > 0) return cards;
  }
  return [];
}

export function extractQuizletTitle(html: string) {
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const titleTag = html.match(/<title>(.*?)<\/title>/i)?.[1];
  return normalizeText((ogTitle ?? titleTag ?? 'Imported Quizlet set').replace(/\s*\|\s*Quizlet.*$/i, '')) || 'Imported Quizlet set';
}

export function looksLikeQuizletBlocked(html: string) {
  return /verify you are human|captcha|access denied|unusual traffic|enable javascript/i.test(html);
}

export function buildQuizletCandidateUrls(rawUrl: URL) {
  const candidates = new Set<string>();
  const sanitized = new URL(rawUrl.toString());
  sanitized.hash = '';
  sanitized.search = '';
  candidates.add(sanitized.toString());

  const idMatch = sanitized.pathname.match(/\/(\d+)(?:\/|$)/);
  const slugParts = sanitized.pathname.split('/').filter(Boolean);
  if (idMatch) {
    const id = idMatch[1];
    const slug = slugParts[1] ?? '';
    candidates.add(`https://quizlet.com/${id}/${slug}`.replace(/\/$/, ''));
    candidates.add(`https://quizlet.com/${id}/flash-cards/`);
    candidates.add(`https://quizlet.com/${id}`);
  }

  return Array.from(candidates);
}
