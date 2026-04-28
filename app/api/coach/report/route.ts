/**
 * POST /api/coach/report
 * Body: {
 *   topic: string,
 *   type: string,
 *   wordCount: number,
 *   keyPoints?: string,
 *   context?: string,
 *   ai?: AiPrefs,
 *   step?: 'outline' | 'draft',   // default: 'draft'
 *   outline?: OutlineSection[],   // used when step === 'draft' with pre-approved outline
 * }
 *
 * step=outline → returns { outline: OutlineSection[] }
 * step=draft   → returns { result: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAppAccess } from '@/lib/api/guard';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';
import { callAi } from '@/lib/ai/call';
import { offlineGenerate } from '@/lib/offline/generate';
import { redactForAi, resolveAiDataMode } from '@/lib/privacy/ai-data';

export interface OutlineSection {
  heading: string;
  summary: string;
}

const TYPE_LABELS: Record<string, string> = {
  essay:             'argumentative academic essay',
  report:            'structured academic report',
  literature_review: 'literature review',
};

const DRAFT_SYSTEM = `You are an expert academic writing assistant. Write well-structured, formal academic content for students with clear headings, topic sentences, and smooth transitions between paragraphs.

Output PLAIN TEXT only. Do NOT use Markdown syntax — no leading hash marks (#, ##, ###, ####), no asterisks for bold, no underscores for italics, no bullet markers. Section headings should be written as a normal line of Title Case text on its own line, followed by a blank line and the body paragraphs. The student's editor renders raw text, so any markdown shows up literally and breaks the document.

Do not include placeholder brackets — write real, substantive content throughout.`;

const OUTLINE_SYSTEM = `You are an academic writing assistant. Return ONLY a valid JSON array with no surrounding text. Each element must be { "heading": string, "summary": string }. Do not include markdown fences or any explanation.`;

function buildDraftPrompt(
  topic: string,
  type: string,
  wordCount: number,
  keyPoints: string,
  context: string,
  outline: OutlineSection[] | null,
): string {
  const typeLabel   = TYPE_LABELS[type] ?? 'academic essay';
  const pointsBlock = keyPoints ? `\n\nKey points to cover:\n${keyPoints}` : '';
  const contextBlock = context ? `\n\nReference source context:\n${context}` : '';

  if (outline && outline.length > 0) {
    const outlineBlock = outline
      .map((s, i) => `${i + 1}. ${s.heading}: ${s.summary}`)
      .join('\n');
    return (
      `Write a ${wordCount}-word ${typeLabel} on: "${topic}"${pointsBlock}${contextBlock}\n\n` +
      `Use this approved outline — follow the section order and purpose exactly:\n${outlineBlock}\n\n` +
      `Write each section in full. Formal academic tone. Aim for ${wordCount} words total.`
    );
  }

  return (
    `Write a ${wordCount}-word ${typeLabel} on the following topic:\n\n` +
    `"${topic}"${pointsBlock}${contextBlock}\n\n` +
    `Structure it with a clear introduction, well-developed body sections with headings, and a conclusion. ` +
    `Write in a formal academic tone. Aim for approximately ${wordCount} words.`
  );
}

function buildOutlinePrompt(topic: string, type: string, wordCount: number, keyPoints: string): string {
  const typeLabel = TYPE_LABELS[type] ?? 'academic essay';
  const sectionCount = wordCount <= 750 ? 4 : wordCount <= 1500 ? 5 : 6;
  const points = keyPoints ? `\n\nKey points the outline must cover: ${keyPoints}` : '';
  return (
    `Create a ${sectionCount}-section outline for a ${wordCount}-word ${typeLabel} on: "${topic}".${points}\n\n` +
    `Return ONLY a JSON array like:\n` +
    `[{"heading":"Introduction","summary":"Set the scene and state the thesis"},{"heading":"...","summary":"..."},{"heading":"Conclusion","summary":"..."}]`
  );
}

function parseOutline(raw: string): OutlineSection[] {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is OutlineSection =>
        item !== null &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).heading === 'string' &&
        typeof (item as Record<string, unknown>).summary === 'string',
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAppAccess(req);
  if (guard) return guard;
  const rl = enforceAiRateLimit(req);
  if (rl) return rl;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (!topic) return NextResponse.json({ error: 'No topic provided.' }, { status: 400 });

  const step      = body.step === 'outline' ? 'outline' : 'draft';
  const type      = typeof body.type      === 'string' ? body.type : 'essay';
  const wordCount = typeof body.wordCount === 'number' ? Math.max(300, Math.min(5000, body.wordCount)) : 1000;
  const keyPoints = typeof body.keyPoints === 'string' ? body.keyPoints.trim() : '';
  const context   = typeof body.context   === 'string' ? body.context.trim().slice(0, 4_000) : '';
  const outline   = Array.isArray(body.outline) ? (body.outline as OutlineSection[]).slice(0, 8) : null;

  const privacyMode   = resolveAiDataMode(body);
  const safeTopic     = redactForAi(privacyMode, topic,     'report topic');
  const safeKeyPoints = redactForAi(privacyMode, keyPoints, 'report key points');
  const safeContext   = redactForAi(privacyMode, context,   'source context');

  // ── Outline step ─────────────────────────────────────────────────────────
  if (step === 'outline') {
    const messages = [
      { role: 'system' as const, content: OUTLINE_SYSTEM },
      { role: 'user'   as const, content: buildOutlinePrompt(safeTopic, type, wordCount, safeKeyPoints) },
    ];

    const { result } = await callAi({
      messages,
      maxTokens:   600,
      temperature: 0.4,
      aiPrefs:     body.ai,
      privacyMode,
      offlineFallback: () => JSON.stringify([
        { heading: 'Introduction',         summary: `Introduce the topic and state your argument about ${topic}.` },
        { heading: 'Background',           summary: `Provide relevant context and definitions.` },
        { heading: 'Main Analysis',        summary: keyPoints || 'Explore the key arguments and evidence.' },
        { heading: 'Counter-arguments',    summary: 'Acknowledge alternative perspectives and rebut them.' },
        { heading: 'Conclusion',           summary: `Summarise findings and restate the significance of ${topic}.` },
      ]),
    });

    const sections = parseOutline(result);
    if (sections.length === 0) {
      return NextResponse.json({
        outline: [
          { heading: 'Introduction',      summary: `Introduce the topic: ${topic}.` },
          { heading: 'Key Arguments',     summary: keyPoints || 'Present the main evidence.' },
          { heading: 'Analysis',          summary: 'Examine the implications.' },
          { heading: 'Conclusion',        summary: 'Synthesise the findings.' },
        ] satisfies OutlineSection[],
      });
    }
    return NextResponse.json({ outline: sections });
  }

  // ── Draft step ────────────────────────────────────────────────────────────
  const messages = [
    { role: 'system' as const, content: DRAFT_SYSTEM },
    { role: 'user'   as const, content: buildDraftPrompt(safeTopic, type, wordCount, safeKeyPoints, safeContext, outline) },
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
