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
  const orig = suggestion.original;
  let start = -1;
  let end   = -1;

  // 1. Exact match
  const exact = text.indexOf(orig);
  if (exact !== -1) {
    start = exact;
    end   = exact + orig.length;
  }

  // 2. Case-insensitive match
  if (start === -1) {
    const ci = text.toLowerCase().indexOf(orig.toLowerCase());
    if (ci !== -1) {
      start = ci;
      end   = ci + orig.length;
    }
  }

  // 3. Whitespace-tolerant regex (handles extra spaces / line-breaks introduced by editing)
  if (start === -1) {
    const pattern = orig
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    const m = new RegExp(pattern, 'i').exec(text);
    if (m) {
      start = m.index;
      end   = m.index + m[0].length;
    }
  }

  if (start === -1) return { applied: false, text };

  return {
    applied: true,
    text: text.slice(0, start) + suggestion.suggestion + text.slice(end),
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
  return `[${suggestion.type.toUpperCase()}] "${suggestion.original}" -> "${suggestion.suggestion}" - ${suggestion.reason}`;
}
