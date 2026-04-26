import { NextRequest, NextResponse } from 'next/server';
import { requireAppAccess } from '@/lib/api/guard';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';
import { callAi } from '@/lib/ai/call';
import { resolveAiDataMode } from '@/lib/privacy/ai-data';

// Per-step clarification endpoint. Unlike /api/math/solve this never tries the
// deterministic symbolic solver — a clarification prompt is conversational,
// not an equation, so symbolic parsing would always fail. We go straight to
// the AI cascade (Groq → Grok → Ollama → offline) and return free-form text
// that the UI can drop into a MathText renderer (so $...$ and $$...$$ blocks
// render as LaTeX).

const SYSTEM_PROMPT = `You are a patient math tutor helping a student understand a single step in a problem they've already been shown the full solution to. Do not re-solve the whole problem. Focus only on the step they're confused about, and address their question directly.

Rules:
- Reply in plain prose, 2–6 sentences.
- When you write inline math, wrap it in single dollar signs: $x^2$.
- When you write a display equation on its own line, wrap it in double dollar signs: $$ax^2 + bx + c = 0$$.
- Do NOT return JSON, code blocks, headings, or bullet lists.
- If the student's question is unrelated to the step, gently redirect to the step.`;

interface ClarifyRequest {
  problem: string;
  stepIndex: number;
  stepDescription: string;
  stepExpression?: string;
  stepExplanation?: string;
  question: string;
  category?: string | null;
}

export async function POST(request: NextRequest) {
  const guardResult = await requireAppAccess(request);
  if (guardResult) return guardResult;
  const rateLimitResponse = enforceAiRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => null) as ClarifyRequest | null;
  const problem = body?.problem?.trim();
  const question = body?.question?.trim();
  const description = body?.stepDescription?.trim();
  if (!problem || !question || !description) {
    return NextResponse.json({ error: 'problem, stepDescription, and question are required' }, { status: 400 });
  }
  if (problem.length > 2000 || question.length > 1000 || description.length > 500) {
    return NextResponse.json({ error: 'Inputs are too long.' }, { status: 400 });
  }

  const stepNumber = Number.isFinite(body?.stepIndex) ? Math.max(1, (body!.stepIndex as number) + 1) : 1;
  const exprLine = body?.stepExpression?.trim() ? `\nExpression at this step: ${body.stepExpression.trim()}` : '';
  const existing = body?.stepExplanation?.trim() ? `\nExisting one-line explanation: ${body.stepExplanation.trim()}` : '';

  const userPrompt = `Original problem: ${problem}
Step ${stepNumber}: ${description}${exprLine}${existing}

The student asks: ${question}

Walk through the reasoning behind just this step in plain language, addressing their question directly.`;

  const bodyRecord = (body ?? {}) as unknown as Record<string, unknown>;
  const privacyMode = resolveAiDataMode(bodyRecord);

  const callResult = await callAi({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 600,
    temperature: 0.2,
    aiPrefs: bodyRecord.ai,
    privacyMode,
    offlineFallback: () => `I can't reach the AI right now to clarify this step in detail. Looking at "${description}" — try re-reading the existing explanation, or rephrase your question and try again once an AI provider is available.`,
  });

  // Models often emit math with \( ... \) and \[ ... \] delimiters even when
  // asked for $...$ / $$...$$. Normalize to the dollar-sign form so MathText
  // renders the LaTeX inline. The display form must come first so it doesn't
  // get partially eaten by the inline replacement.
  const normalized = callResult.result.trim()
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `$$${body.trim()}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, body: string) => `$${body.trim()}$`);

  return NextResponse.json({
    text: normalized,
    source: callResult.source,
  });
}
