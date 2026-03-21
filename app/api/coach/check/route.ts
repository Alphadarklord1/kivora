/**
 * POST /api/coach/check
 * Body: { text: string, context?: string, ai?: AiPrefs }
 *
 * Returns Grammarly-style feedback on grammar, academic tone, clarity and flow.
 * AI routing: Grok -> OpenAI -> Ollama -> offline summary fallback.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAppAccess } from '@/lib/api/guard';
import { callAi } from '@/lib/ai/call';
import { offlineGenerate } from '@/lib/offline/generate';
import { redactForAi, resolveAiDataMode } from '@/lib/privacy/ai-data';

const SYSTEM_PROMPT = `You are an academic writing assistant. Analyse the student's text and give structured feedback covering:

1. **Grammar & Spelling** — list specific errors found (or confirm it is clean)
2. **Academic Tone** — flag informal words, slang, or contractions; suggest formal alternatives
3. **Sentence Clarity** — identify sentences that are too long, unclear, or badly structured
4. **Logical Flow** — note any jumps in argument, missing transitions, or paragraphs that don't connect
5. **Overall Verdict** — a short paragraph summarising main areas to improve and what is already strong

Be specific, reference the actual text where possible, and keep feedback constructive.`;

export async function POST(req: NextRequest) {
  const guard = await requireAppAccess(req);
  if (guard) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text)              return NextResponse.json({ error: 'No text provided.' }, { status: 400 });
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
        context ? `Optional reference context:\n${safeContext}` : '',
        `Please check the following student text:\n\n${safeText}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];

  const { result } = await callAi({
    messages,
    maxTokens: 1200,
    temperature: 0.3,
    aiPrefs: body.ai,
    privacyMode,
    offlineFallback: () => `Offline feedback (AI unavailable):\n\n${offlineGenerate('summarize', text)}`,
  });

  return NextResponse.json({ result });
}
