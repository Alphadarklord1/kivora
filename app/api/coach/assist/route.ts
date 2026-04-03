/**
 * POST /api/coach/assist
 * Body: { text, action, context?, wordCount?, ai?, privacyMode? }
 *
 * action: 'rephrase' | 'simplify' | 'expand' | 'formal' | 'continue' | 'shorten' | 'bullets'
 *
 * Returns: { result: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAppAccess } from '@/lib/api/guard';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';
import { callAi } from '@/lib/ai/call';
import { redactForAi, resolveAiDataMode } from '@/lib/privacy/ai-data';

export type AssistAction = 'rephrase' | 'simplify' | 'expand' | 'formal' | 'continue' | 'shorten' | 'bullets';

const ACTION_PROMPTS: Record<AssistAction, (text: string, ctx: string) => string> = {
  rephrase:  (t, c) => `Rephrase the following text to express the same idea more clearly and academically. Return ONLY the rewritten text, no preamble.\n${c ? `Context: ${c}\n` : ''}Text:\n${t}`,
  simplify:  (t, c) => `Simplify the following text so it is easier to read while keeping the meaning. Return ONLY the simplified text.\n${c ? `Context: ${c}\n` : ''}Text:\n${t}`,
  expand:    (t, c) => `Expand the following text with additional relevant detail, examples, or explanation. Return ONLY the expanded text.\n${c ? `Context: ${c}\n` : ''}Text:\n${t}`,
  formal:    (t, c) => `Rewrite the following text in a formal, academic tone suitable for a university essay. Return ONLY the rewritten text.\n${c ? `Context: ${c}\n` : ''}Text:\n${t}`,
  shorten:   (t, c) => `Make the following text more concise without losing the core meaning. Return ONLY the shortened text.\n${c ? `Context: ${c}\n` : ''}Text:\n${t}`,
  bullets:   (t, c) => `Convert the following text into a clear bullet-point list of key points. Return ONLY the bullet list.\n${c ? `Context: ${c}\n` : ''}Text:\n${t}`,
  continue:  (t, c) => `You are an academic writing assistant. Continue the following essay/report naturally, adding the next paragraph. Match the existing style and tone. Return ONLY the new paragraph to append.\n${c ? `Context: ${c}\n` : ''}Text so far:\n${t}`,
};

const ACTION_OFFLINE: Record<AssistAction, string> = {
  rephrase: 'Rephrasing requires an internet connection.',
  simplify: 'Simplify requires an internet connection.',
  expand:   'Expand requires an internet connection.',
  formal:   'Formal rewrite requires an internet connection.',
  shorten:  'Shortening requires an internet connection.',
  bullets:  'Bullet conversion requires an internet connection.',
  continue: 'Continue writing requires an internet connection.',
};

export async function POST(req: NextRequest) {
  const guard = await requireAppAccess(req);
  if (guard) return guard;
  const rl = enforceAiRateLimit(req);
  if (rl) return rl;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const text   = typeof body.text   === 'string' ? body.text.trim()   : '';
  const action = typeof body.action === 'string' ? body.action        : '';
  const ctx    = typeof body.context === 'string' ? body.context.trim().slice(0, 3_000) : '';

  if (!text)   return NextResponse.json({ error: 'No text provided.'    }, { status: 400 });
  if (!action || !(action in ACTION_PROMPTS))
               return NextResponse.json({ error: 'Invalid action.'      }, { status: 400 });
  if (text.length > 8_000)
               return NextResponse.json({ error: 'Text too long (max ~8 000 chars).' }, { status: 400 });

  const privacyMode = resolveAiDataMode(body);
  const safeText = redactForAi(privacyMode, text, 'writing content');
  const safeCtx  = ctx ? redactForAi(privacyMode, ctx, 'context') : '';

  const prompt = ACTION_PROMPTS[action as AssistAction](safeText, safeCtx);

  const { result } = await callAi({
    messages:   [{ role: 'user', content: prompt }],
    maxTokens:  900,
    temperature: 0.45,
    aiPrefs:    body.ai,
    privacyMode,
    offlineFallback: () => ACTION_OFFLINE[action as AssistAction],
  });

  return NextResponse.json({ result: result.trim() });
}
