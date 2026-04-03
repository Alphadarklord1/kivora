import type { WritingSuggestion } from '@/app/api/coach/check/route';

export function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function buildWritingFeedback(
  summary: string,
  suggestions: WritingSuggestion[],
  legacyResult: string,
) {
  if (legacyResult) return legacyResult;

  return [summary, ...suggestions.map(formatWritingSuggestion)]
    .filter(Boolean)
    .join('\n\n');
}

export function buildWriterLibraryContent(params: {
  draft: string;
  score: number | null;
  summary: string;
  suggestions: WritingSuggestion[];
  legacyResult: string;
}) {
  const feedback = buildWritingFeedback(
    params.summary,
    params.suggestions,
    params.legacyResult,
  );

  return `Draft:\n\n${params.draft}\n\n---\n\nWriting Feedback (Score: ${params.score ?? 'N/A'}):\n\n${feedback}`;
}

export function applyWritingSuggestionToText(
  text: string,
  suggestion: WritingSuggestion,
) {
  const index = text.indexOf(suggestion.original);
  if (index === -1) return { applied: false, text };

  return {
    applied: true,
    text:
      text.slice(0, index) +
      suggestion.suggestion +
      text.slice(index + suggestion.original.length),
  };
}

export function applyWritingSuggestionsToText(
  text: string,
  suggestions: WritingSuggestion[],
) {
  let nextText = text;
  let applied = 0;

  for (const suggestion of suggestions) {
    const result = applyWritingSuggestionToText(nextText, suggestion);
    if (!result.applied) continue;
    nextText = result.text;
    applied += 1;
  }

  return { applied, text: nextText };
}

function formatWritingSuggestion(suggestion: WritingSuggestion) {
  return `[${suggestion.type.toUpperCase()}] "${suggestion.original}" → "${suggestion.suggestion}" — ${suggestion.reason}`;
}

// ── Client-side text analysis (runs without AI) ───────────────────────────────

function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Approximate Flesch Reading Ease (0–100, higher = easier). */
function fleschScore(text: string): number {
  const sents = splitSentences(text);
  if (!sents.length) return 0;
  const totalWords = wordCount(text);
  const totalSyllables = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .reduce((n, w) => {
      const syllables = w
        .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
        .replace(/^y/, '')
        .match(/[aeiouy]{1,2}/g);
      return n + (syllables?.length ?? 1);
    }, 0);
  const asl  = totalWords / sents.length;           // avg sentence length
  const asw  = totalSyllables / Math.max(totalWords, 1); // avg syllables/word
  return Math.max(0, Math.min(100, 206.835 - 1.015 * asl - 84.6 * asw));
}

// Informal / colloquial words unlikely in academic writing
const INFORMAL_WORDS = new Set([
  'gonna', 'wanna', 'gotta', 'kinda', 'sorta', 'yeah', 'yep', 'nope',
  'lots', 'stuff', 'things', 'thing', 'basically', 'literally', 'totally',
  'really', 'very', 'quite', 'pretty', 'just', 'so', 'like', 'a lot',
  'big', 'huge', 'awesome', 'amazing', 'interesting', 'nice', 'good',
  'bad', 'get', 'got', 'getting', 'bit', 'kind of', 'sort of',
]);

// Weak verbs that reduce academic authority
const WEAK_VERBS = new Set([
  'seem', 'seems', 'seemed', 'appear', 'appears', 'appeared',
  'feel', 'feels', 'felt', 'think', 'thought', 'believe', 'believed',
  'guess', 'suppose', 'maybe', 'perhaps', 'might', 'could be',
]);

// Passive voice: "is/are/was/were/been/being + past participle" pattern
const PASSIVE_PATTERN = /\b(is|are|was|were|been|being)\s+\w+ed\b/gi;

export interface TextStats {
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  longSentenceCount: number;     // sentences > 35 words
  passiveCount: number;
  informalWordCount: number;
  fleschScore: number;
  readingTimeMinutes: number;
  paragraphCount: number;
}

/** Returns surface-level readability stats without AI. */
export function analyseText(text: string): TextStats {
  const sents   = splitSentences(text);
  const wc      = wordCount(text);
  const paras   = text.split(/\n{2,}/).filter(p => p.trim().length > 0).length;
  const passives = (text.match(PASSIVE_PATTERN) ?? []).length;

  const longSents = sents.filter(s => wordCount(s) > 35).length;

  const lowerWords = text.toLowerCase().split(/\s+/);
  const informalCount = lowerWords.filter(w => INFORMAL_WORDS.has(w)).length;

  return {
    wordCount:            wc,
    sentenceCount:        sents.length,
    avgWordsPerSentence:  sents.length ? Math.round(wc / sents.length) : 0,
    longSentenceCount:    longSents,
    passiveCount:         passives,
    informalWordCount:    informalCount,
    fleschScore:          Math.round(fleschScore(text)),
    readingTimeMinutes:   Math.ceil(wc / 200),
    paragraphCount:       paras,
  };
}

/**
 * Pattern-based writing suggestions that work without AI.
 * Returns up to 6 actionable suggestions with verbatim originals.
 */
export function generateOfflineSuggestions(text: string): WritingSuggestion[] {
  const suggestions: WritingSuggestion[] = [];
  const sents  = splitSentences(text);
  let id = 0;

  // 1. Long sentences
  for (const s of sents) {
    if (suggestions.length >= 6) break;
    if (wordCount(s) > 40) {
      const snippet = s.slice(0, 80);
      if (text.includes(snippet)) {
        suggestions.push({
          id: `offline-${id++}`,
          type: 'clarity',
          original: snippet,
          suggestion: snippet + ' [consider splitting into two sentences]',
          reason: `This sentence is ${wordCount(s)} words — aim for under 35 for clarity.`,
        });
      }
    }
  }

  // 2. Passive voice instances
  const passiveMatches = [...text.matchAll(PASSIVE_PATTERN)];
  for (const m of passiveMatches.slice(0, 2)) {
    if (suggestions.length >= 6) break;
    const phrase = m[0];
    suggestions.push({
      id: `offline-${id++}`,
      type: 'style',
      original: phrase,
      suggestion: '[rewrite in active voice]',
      reason: 'Passive voice reduces directness and academic authority.',
    });
  }

  // 3. Informal words
  const lowerText = text.toLowerCase();
  for (const w of INFORMAL_WORDS) {
    if (suggestions.length >= 6) break;
    const idx = lowerText.indexOf(w);
    if (idx === -1) continue;
    const original = text.slice(idx, idx + w.length);
    if (!text.includes(original)) continue;
    const replacements: Record<string, string> = {
      'basically': 'fundamentally',
      'literally': 'in fact',
      'totally':   'entirely',
      'really':    'significantly',
      'very':      '[intensifier — consider stronger word]',
      'just':      '[remove or rephrase]',
      'stuff':     'material / content',
      'things':    'aspects / factors',
      'big':       'substantial / significant',
      'good':      'effective / strong',
      'nice':      'effective / appropriate',
      'awesome':   'impressive / excellent',
      'get':       'obtain / achieve',
      'got':       'obtained / achieved',
    };
    suggestions.push({
      id: `offline-${id++}`,
      type: 'style',
      original,
      suggestion: replacements[w] ?? '[more formal alternative]',
      reason: `"${w}" is informal — academic writing prefers more precise vocabulary.`,
    });
  }

  // 4. Weak verbs
  for (const v of WEAK_VERBS) {
    if (suggestions.length >= 6) break;
    const idx = lowerText.indexOf(v);
    if (idx === -1) continue;
    const original = text.slice(idx, idx + v.length);
    if (!text.includes(original)) continue;
    suggestions.push({
      id: `offline-${id++}`,
      type: 'tone',
      original,
      suggestion: '[stronger, more assertive verb]',
      reason: `"${v}" hedges your argument — use evidence-based assertions instead.`,
    });
  }

  return suggestions.slice(0, 6);
}

/** Score text offline: 60 base + readability bonus − penalties. */
export function scoreTextOffline(text: string): number {
  const stats = analyseText(text);
  let score = 60;
  // Flesch bonus: 100 = easy read, 30 = dense academic
  const flesch = stats.fleschScore;
  if (flesch >= 60 && flesch <= 70) score += 15;       // ideal range
  else if (flesch >= 50 && flesch <= 80) score += 8;
  else if (flesch < 30) score -= 10;                   // too dense
  // Penalties
  score -= Math.min(15, stats.longSentenceCount * 4);
  score -= Math.min(10, stats.passiveCount * 3);
  score -= Math.min(10, stats.informalWordCount * 3);
  if (stats.avgWordsPerSentence > 30) score -= 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}
