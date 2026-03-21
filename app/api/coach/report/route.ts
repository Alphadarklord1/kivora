/**
 * POST /api/coach/report
 * Body: { topic: string, type: string, wordCount: number, keyPoints?: string, ai?: AiPrefs }
 *
 * Generates a full essay / report / literature review draft.
 * AI routing: Grok -> OpenAI -> Ollama -> offline outline fallback.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAppAccess } from '@/lib/api/guard';
import { callAi } from '@/lib/ai/call';
import { offlineGenerate } from '@/lib/offline/generate';
import { redactForAi, resolveAiDataMode } from '@/lib/privacy/ai-data';

const TYPE_LABELS: Record<string, string> = {
  essay:             'argumentative academic essay',
  report:            'structured academic report',
  literature_review: 'literature review',
};

const SYSTEM_PROMPT = `You are an expert academic writing assistant. Write well-structured, formal academic content for students. Use clear headings, topic sentences, and smooth transitions between paragraphs. Do not include placeholder brackets — write real, substantive content throughout.`;

function buildPrompt(topic: string, type: string, wordCount: number, keyPoints: string): string {
  const typeLabel   = TYPE_LABELS[type] ?? 'academic essay';
  const pointsBlock = keyPoints ? `\n\nKey points to cover:\n${keyPoints}` : '';
  return (
    `Write a ${wordCount}-word ${typeLabel} on the following topic:\n\n` +
    `"${topic}"${pointsBlock}\n\n` +
    `Structure it with a clear introduction, well-developed body sections with headings, and a conclusion. ` +
    `Write in a formal academic tone. Aim for approximately ${wordCount} words.`
  );
}

export async function POST(req: NextRequest) {
  const guard = await requireAppAccess(req);
  if (guard) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const topic      = typeof body.topic     === 'string' ? body.topic.trim() : '';
  if (!topic) return NextResponse.json({ error: 'No topic provided.' }, { status: 400 });

  const type       = typeof body.type      === 'string' ? body.type : 'essay';
  const wordCount  = typeof body.wordCount === 'number' ? Math.max(300, Math.min(5000, body.wordCount)) : 1000;
  const keyPoints  = typeof body.keyPoints === 'string' ? body.keyPoints.trim() : '';
  const privacyMode = resolveAiDataMode(body);
  const safeTopic = redactForAi(privacyMode, topic, 'report topic');
  const safeKeyPoints = redactForAi(privacyMode, keyPoints, 'report key points');

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user'   as const, content: buildPrompt(safeTopic, type, wordCount, safeKeyPoints) },
  ];

  const fallbackText = `${topic}\n\nKey points: ${keyPoints || 'introduction, main arguments, conclusion'}`;

  const { result } = await callAi({
    messages,
    maxTokens:   Math.min(4000, wordCount * 2),
    temperature: 0.7,
    aiPrefs:     body.ai,
    privacyMode,
    offlineFallback: () =>
      `Draft outline (AI unavailable — configure an AI provider for full drafts):\n\n${offlineGenerate('notes', fallbackText)}`,
  });

  return NextResponse.json({ result });
}
