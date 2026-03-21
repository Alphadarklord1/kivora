// Legacy fallback only:
// Quizlet frequently serves captcha and JS-protected pages, so this parser is
// intentionally kept out of the primary Scholar Hub UI. We keep it around for
// future fallback/import experiments, but paste/CSV/Anki/Kivora-link imports
// are the supported paths.
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

// ── Strategy 1: Parse __NEXT_DATA__ JSON blob (most reliable for current Quizlet) ──

type JsonNode = Record<string, unknown> | unknown[] | string | number | boolean | null;

function findStudiableItems(obj: JsonNode, depth = 0): unknown[] | null {
  if (depth > 15) return null;
  if (obj === null || obj === undefined) return null;

  // If it's a string that looks like JSON, try parsing it
  if (typeof obj === 'string') {
    if (obj.includes('studiableItems') && (obj.startsWith('{') || obj.startsWith('['))) {
      try {
        const parsed = JSON.parse(obj) as JsonNode;
        return findStudiableItems(parsed, depth + 1);
      } catch { /* not valid JSON */ }
    }
    return null;
  }

  if (typeof obj !== 'object') return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findStudiableItems(item as JsonNode, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = obj as Record<string, unknown>;
  if (Array.isArray(record['studiableItems'])) return record['studiableItems'] as unknown[];

  for (const val of Object.values(record)) {
    const found = findStudiableItems(val as JsonNode, depth + 1);
    if (found) return found;
  }
  return null;
}

function parseNextData(html: string): ParsedFlashcard[] {
  const scriptMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return [];

  try {
    const data = JSON.parse(scriptMatch[1] ?? '') as JsonNode;
    const items = findStudiableItems(data);
    if (!items || !items.length) return [];

    const cards: ParsedFlashcard[] = [];
    for (const item of items) {
      const typedItem = item as Record<string, unknown>;
      const sides = Array.isArray(typedItem['cardSides']) ? typedItem['cardSides'] as Record<string, unknown>[] : [];
      if (!sides.length) continue;

      // Find word/term side and definition side
      const wordSide = sides.find(s => s['side'] === 'word' || s['side'] === 'term') ?? sides[0];
      const defSide  = sides.find(s => s['side'] === 'definition' || s['side'] === 'back') ?? sides[1];
      if (!wordSide || !defSide) continue;

      // Extract text — new format uses media[].plainText, old format uses media[].text
      function extractText(side: Record<string, unknown>): string {
        const media = Array.isArray(side['media']) ? side['media'] as Record<string, unknown>[] : [];
        for (const m of media) {
          if (typeof m['plainText'] === 'string' && m['plainText'].trim()) return m['plainText'].trim();
          if (typeof m['text'] === 'string' && m['text'].trim()) return m['text'].trim();
        }
        // Fallback: direct text property
        if (typeof side['text'] === 'string') return side['text'].trim();
        return '';
      }

      const front = normalizeText(extractText(wordSide));
      const back  = normalizeText(extractText(defSide));
      if (front && back) cards.push({ front, back });
    }
    return uniqueCards(cards);
  } catch {
    return [];
  }
}

// ── Strategy 2: word/definition JSON key patterns ──

function parseWordDefinitionPairs(html: string) {
  const patterns = [
    /"word":"([^"]+)".{0,500}?"definition":"([^"]+)"/g,
    /"term":"([^"]+)".{0,500}?"definition":"([^"]+)"/g,
    /"front":"([^"]+)".{0,500}?"back":"([^"]+)"/g,
    /"side":"word".{0,500}?"text":"([^"]+)".{0,500}?"side":"definition".{0,500}?"text":"([^"]+)"/g,
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

// ── Strategy 3: JSON-LD schema.org ──

function parseJsonLd(html: string) {
  const cards: ParsedFlashcard[] = [];
  const scriptMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scriptMatches) {
    try {
      const data = JSON.parse(decodeEscapes(match[1] ?? '')) as Record<string, unknown>;
      const parts = Array.isArray(data['hasPart'])
        ? data['hasPart']
        : Array.isArray(data['mainEntity'])
          ? data['mainEntity']
          : [];
      for (const part of parts as Array<Record<string, unknown>>) {
        const front = typeof part['name'] === 'string' ? part['name']
          : typeof part['term'] === 'string' ? part['term'] : '';
        const back = typeof part['text'] === 'string' ? part['text']
          : typeof part['description'] === 'string' ? part['description']
          : typeof part['definition'] === 'string' ? part['definition'] : '';
        if (front && back) cards.push({ front, back });
      }
    } catch {
      continue;
    }
  }
  return uniqueCards(cards);
}

// ── Strategy 4: Embedded script patterns ──

function parseEmbeddedJson(html: string) {
  const cards: ParsedFlashcard[] = [];
  const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scriptMatches) {
    const script = match[1] ?? '';
    if (!/term|definition|word|plainText/i.test(script)) continue;

    // word/term → definition/text (original)
    for (const pair of script.matchAll(/(?:"word"|"term")\s*:\s*"([^"]+)"[\s\S]{0,500}?(?:"definition"|"text")\s*:\s*"([^"]+)"/g)) {
      cards.push({ front: pair[1] ?? '', back: pair[2] ?? '' });
    }

    // cardSides with plainText (modern Quizlet format)
    for (const pair of script.matchAll(/"cardSides"\s*:\s*\[[\s\S]{0,600}?"plainText"\s*:\s*"([^"]+)"[\s\S]{0,600}?"plainText"\s*:\s*"([^"]+)"/g)) {
      cards.push({ front: pair[1] ?? '', back: pair[2] ?? '' });
    }

    // cardSides with text key (legacy)
    for (const pair of script.matchAll(/"cardSides"\s*:\s*\[[\s\S]{0,500}?"text"\s*:\s*"([^"]+)"[\s\S]{0,500}?"text"\s*:\s*"([^"]+)"/g)) {
      cards.push({ front: pair[1] ?? '', back: pair[2] ?? '' });
    }
  }
  return uniqueCards(cards);
}

// ── Strategy 5: Visible DOM spans (last resort) ──

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

// ── Public API ───────────────────────────────────────────────────────────────

export function extractQuizletCards(html: string) {
  const strategies = [
    parseNextData,           // Most reliable — direct JSON parse of __NEXT_DATA__
    parseWordDefinitionPairs, // word/definition key patterns in JSON
    parseJsonLd,             // schema.org JSON-LD
    parseEmbeddedJson,       // Script tag patterns (plainText + text keys)
    parseVisibleTerms,       // DOM span fallback
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
