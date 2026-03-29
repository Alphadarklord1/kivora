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
  return `[${suggestion.type.toUpperCase()}] "${suggestion.original}" -> "${suggestion.suggestion}" - ${suggestion.reason}`;
}
