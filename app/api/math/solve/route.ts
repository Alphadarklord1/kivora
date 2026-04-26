import { NextRequest, NextResponse } from 'next/server';
import { requireAppAccess } from '@/lib/api/guard';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';
import { solveMathProblem } from '@/lib/math/symbolic-solver';
import type { MathSolveRequest, SolverResult } from '@/lib/math/types';
import { callAi } from '@/lib/ai/call';
import { resolveAiDataMode, type AiDataMode } from '@/lib/privacy/ai-data';

const AI_SYSTEM_PROMPT = `You are a careful math tutor for high-school and undergraduate students.
Return ONLY valid JSON in this shape:
{
  "answer": "plain text answer",
  "answerLatex": "latex answer",
  "steps": [{ "step": 1, "description": "", "expression": "", "explanation": "" }],
  "explanation": "short explanation",
  "graphExpr": "optional graph expression or null",
  "category": "algebra|geometry|calculus|trigonometry|sequences-series|linear-algebra|statistics|vectors|matrices",
  "verified": true,
  "engine": "ai"
}
Keep the steps concise, accurate, and exam-friendly.`;

function jsonResponse(result: SolverResult, body: MathSolveRequest) {
  return NextResponse.json({
    category: result.category,
    normalizedInput: result.normalizedInput,
    previewLatex: result.previewLatex,
    answer: result.answer,
    answerLatex: result.answerLatex,
    steps: result.steps,
    explanation: result.explanation,
    graphExpr: result.graphExpr ?? null,
    verified: result.verified,
    engine: result.engine,
    error: result.error ?? null,
    contextFileId: body.contextFileId ?? null,
    contextUsed: Boolean(body.contextText?.trim()),
  });
}

async function tryAiSolve(
  problem: string,
  category: string | null,
  contextText?: string | null,
  aiPrefs?: unknown,
  privacyMode: AiDataMode = 'full',
): Promise<SolverResult | null> {
  const contextBlock = contextText?.trim()
    ? `\n\nStudy context:\n${contextText.slice(0, 2500)}`
    : '';

  // Use the unified AI cascade (Groq → Grok → Ollama → offline).
  // The math route used to call Ollama directly; now it benefits from the
  // primary cloud provider whenever it's configured, falling back through
  // Grok and the local runtime exactly like every other AI surface.
  const callResult = await callAi({
    messages: [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      { role: 'user', content: `Category hint: ${category ?? 'auto'}\nProblem: ${problem}${contextBlock}` },
    ],
    maxTokens: 1200,
    temperature: 0.05,
    aiPrefs,
    privacyMode,
    // The math route never wants the deterministic offline summarizer here —
    // its job is to attempt a real AI solve, and let the caller decide what
    // to do if no provider is configured. Returning an empty string makes
    // the parser below treat this as a miss.
    offlineFallback: () => '',
  });

  const raw = callResult.result.trim();
  if (!raw || callResult.source === 'offline') return null;

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let parsed: Partial<SolverResult> & { steps?: Array<Record<string, unknown>> };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
  if (!parsed.answer || !Array.isArray(parsed.steps) || parsed.steps.length === 0) return null;

  return {
    category: (parsed.category as SolverResult['category']) ?? (category as SolverResult['category']) ?? 'algebra',
    normalizedInput: problem,
    previewLatex: problem,
    answer: String(parsed.answer),
    answerLatex: String(parsed.answerLatex ?? parsed.answer),
    steps: parsed.steps.map((step, index) => ({
      step: Number(step.step ?? index + 1),
      description: String(step.description ?? ''),
      expression: String(step.expression ?? ''),
      explanation: String(step.explanation ?? ''),
    })),
    explanation: String(parsed.explanation ?? `Solved via ${callResult.source} cloud fallback.`),
    graphExpr: typeof parsed.graphExpr === 'string' && parsed.graphExpr.trim() ? parsed.graphExpr : undefined,
    verified: true,
    engine: 'ai',
  };
}

export async function POST(request: NextRequest) {
  const guardResult = await requireAppAccess(request);
  if (guardResult) return guardResult;
  const rateLimitResponse = enforceAiRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => null) as MathSolveRequest | null;
  const problem = body?.problem?.trim();
  if (!problem) {
    return NextResponse.json({ error: 'problem is required' }, { status: 400 });
  }
  if (problem.length > 5000) {
    return NextResponse.json({ error: 'Problem is too long. Maximum 5000 characters.' }, { status: 400 });
  }

  const solved = solveMathProblem(problem, body?.category ?? null);
  if (solved.verified) {
    return jsonResponse(solved, body ?? { problem });
  }

  const bodyRecord = (body ?? {}) as Record<string, unknown>;
  const privacyMode = resolveAiDataMode(bodyRecord);
  const aiSolved = await tryAiSolve(
    problem,
    body?.category ?? null,
    body?.contextText ?? null,
    bodyRecord.ai,
    privacyMode,
  );
  if (aiSolved) {
    return jsonResponse(aiSolved, body ?? { problem });
  }

  return jsonResponse(solved, body ?? { problem });
}
