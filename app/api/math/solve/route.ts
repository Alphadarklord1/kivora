import { NextRequest, NextResponse } from 'next/server';
import { requireAppAccess } from '@/lib/api/guard';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';
import { solveMathProblem } from '@/lib/math/symbolic-solver';
import type { MathSolveRequest, SolverResult } from '@/lib/math/types';

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

async function tryAiSolve(problem: string, category: string | null, contextText?: string | null): Promise<SolverResult | null> {
  const base = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const model = process.env.OLLAMA_MATH_MODEL ?? process.env.OLLAMA_MODEL ?? 'mistral';
  const contextBlock = contextText?.trim()
    ? `\n\nStudy context:\n${contextText.slice(0, 2500)}`
    : '';

  const payload = {
    model,
    messages: [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      { role: 'user', content: `Category hint: ${category ?? 'auto'}\nProblem: ${problem}${contextBlock}` },
    ],
    temperature: 0.05,
    stream: false,
  };

  for (const url of [`${base}/v1/chat/completions`, `${base}/api/chat`]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;

      const data = await res.json();
      const raw = String(data?.choices?.[0]?.message?.content ?? data?.message?.content ?? '').trim();
      if (!raw) continue;

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]) as Partial<SolverResult> & { steps?: Array<Record<string, unknown>> };
      if (!parsed.answer || !Array.isArray(parsed.steps) || parsed.steps.length === 0) continue;

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
        explanation: String(parsed.explanation ?? 'Solved with the AI fallback tutor.'),
        graphExpr: typeof parsed.graphExpr === 'string' && parsed.graphExpr.trim() ? parsed.graphExpr : undefined,
        verified: true,
        engine: 'ai',
      };
    } catch {
      // Try the next Ollama-compatible endpoint.
    }
  }

  return null;
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

  const solved = solveMathProblem(problem, body?.category ?? null);
  if (solved.verified) {
    return jsonResponse(solved, body ?? { problem });
  }

  const aiSolved = await tryAiSolve(problem, body?.category ?? null, body?.contextText ?? null);
  if (aiSolved) {
    return jsonResponse(aiSolved, body ?? { problem });
  }

  return jsonResponse(solved, body ?? { problem });
}
