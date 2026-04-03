/**
 * POST /api/coach/check
 * Body: { text: string, context?: string, ai?: AiPrefs }
 *
 * Returns a structured Grammarly-style response:
 *   { score, summary, suggestions[], result }
 *
 * `suggestions` are individual, actionable edits with type/original/suggestion/reason.
 * `result` is a markdown fallback for backward compat.
 * `score` is 0-100.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAppAccess } from '@/lib/api/guard';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';
import { callAi } from '@/lib/ai/call';
import { redactForAi, resolveAiDataMode } from '@/lib/privacy/ai-data';
import { analyseText, generateOfflineSuggestions, scoreTextOffline } from '@/lib/coach/writing';

export interface WritingSuggestion {
  id: string;
  type: 'grammar' | 'style' | 'clarity' | 'tone';
  original: string;
  suggestion: string;
  reason: string;
}

export interface CheckResult {
  score: number;
  summary: string;
  suggestions: WritingSuggestion[];
  result: string; // full markdown for fallback display
}

const SYSTEM_PROMPT = `You are an academic writing assistant similar to Grammarly. Analyse the student's text and return ONLY valid JSON — no markdown fences, no extra text.

Return this exact structure:
{
  "score": <integer 0-100>,
  "summary": "<2-3 sentence overall verdict covering main strengths and weaknesses>",
  "suggestions": [
    {
      "id": "<unique short id like 's1', 's2', ...>",
      "type": "<grammar|style|clarity|tone>",
      "original": "<exact verbatim phrase from the student text, max 15 words>",
      "suggestion": "<replacement text>",
      "reason": "<concise explanation, 1 sentence>"
    }
  ]
}

Scoring:
- 90-100: Excellent — minimal issues
- 75-89: Good — minor improvements needed
- 60-74: Fair — several issues to address
- 0-59: Needs work — significant problems

Suggestion types:
- grammar: spelling errors, wrong homophones, subject-verb disagreement, tense inconsistency, punctuation
- style: informal language, contractions, slang, weak or vague vocabulary, repetition
- clarity: unclear or ambiguous sentences, run-on sentences, overly complex structure
- tone: inappropriate register, overly casual, passive voice overuse, lacks academic authority

Rules:
- Provide 3-8 suggestions (fewer if the text is very clean)
- "original" MUST be text that appears verbatim in the input — do not paraphrase it
- Keep "reason" to one short sentence
- If the text is clean in a category, simply omit suggestions of that type
- Focus on the most impactful improvements first`;

export async function POST(req: NextRequest) {
  const guard = await requireAppAccess(req);
  if (guard) return guard;
  const rl = enforceAiRateLimit(req);
  if (rl) return rl;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'No text provided.' }, { status: 400 });
  if (text.length > 12_000) return NextResponse.json({ error: 'Text too long (max ~12 000 characters).' }, { status: 400 });

  const context = typeof body.context === 'string' ? body.context.trim().slice(0, 4_000) : '';
  const privacyMode = resolveAiDataMode(body);
  const safeText = redactForAi(privacyMode, text, 'writing sample');
  const safeContext = context ? redactForAi(privacyMode, context, 'source context') : '';

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: [
        safeContext ? `Optional reference context:\n${safeContext}` : '',
        `Analyse this student text:\n\n${safeText}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];

  const { result: raw } = await callAi({
    messages,
    maxTokens: 1400,
    temperature: 0.2,
    aiPrefs: body.ai,
    privacyMode,
    offlineFallback: () => {
      const offlineSuggs = generateOfflineSuggestions(text);
      const offlineScore = scoreTextOffline(text);
      const offlineStats = analyseText(text);
      const issueCount   = offlineSuggs.length;
      let offlineSummary: string;
      if (issueCount === 0) {
        offlineSummary = `No obvious issues found. Readability score: ${offlineScore}/100 · average ${offlineStats.avgWordsPerSentence} words per sentence. Connect AI for comprehensive grammar and style analysis.`;
      } else {
        const found: string[] = [];
        if (offlineStats.passiveCount > 0) found.push(`${offlineStats.passiveCount} passive voice instance${offlineStats.passiveCount !== 1 ? 's' : ''}`);
        if (offlineStats.longSentenceCount > 0) found.push(`${offlineStats.longSentenceCount} long sentence${offlineStats.longSentenceCount !== 1 ? 's' : ''}`);
        if (offlineStats.informalWordCount > 0) found.push(`${offlineStats.informalWordCount} informal word${offlineStats.informalWordCount !== 1 ? 's' : ''}`);
        offlineSummary = `Found ${found.length > 0 ? found.join(', ') : `${issueCount} issue${issueCount !== 1 ? 's' : ''}`}. Readability score: ${offlineScore}/100 — connect AI for comprehensive grammar and style analysis.`;
      }
      return JSON.stringify({
        score: offlineScore,
        summary: offlineSummary,
        suggestions: offlineSuggs,
        result: '',
      });
    },
  });

  // Try to parse as structured JSON; fall back to text-only mode
  let parsed: CheckResult | null = null;
  try {
    // Strip any accidental markdown fences the model may have wrapped
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const obj = JSON.parse(cleaned) as Partial<CheckResult>;
    if (typeof obj.score === 'number' && Array.isArray(obj.suggestions)) {
      parsed = {
        score: Math.min(100, Math.max(0, Math.round(obj.score))),
        summary: typeof obj.summary === 'string' ? obj.summary : '',
        suggestions: (obj.suggestions as WritingSuggestion[]).filter(
          s => s && typeof s.original === 'string' && typeof s.suggestion === 'string'
        ),
        result: raw,
      };
    }
  } catch {
    // JSON parse failed — return legacy text-only mode
  }

  if (parsed) {
    return NextResponse.json(parsed);
  }

  // Fallback: return the raw text as `result` with no structured data
  return NextResponse.json({ score: null, summary: '', suggestions: [], result: raw });
}
