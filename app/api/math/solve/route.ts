import { NextRequest, NextResponse } from 'next/server';
import { requireAppAccess } from '@/lib/api/guard';
import { tryCloudGeneration } from '@/lib/ai/server-routing';
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

function parseAiResponse(raw: string, problem: string, category: string | null): SolverResult | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<SolverResult> & { steps?: Array<Record<string, unknown>> };
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
      explanation: String(parsed.explanation ?? 'Solved with the AI fallback tutor.'),
      graphExpr: typeof parsed.graphExpr === 'string' && parsed.graphExpr.trim() ? parsed.graphExpr : undefined,
      verified: true,
      engine: 'ai',
    };
  } catch {
    return null;
  }
}

async function tryOllamaSolve(problem: string, category: string | null, contextText?: string | null): Promise<SolverResult | null> {
  const base = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const model = process.env.OLLAMA_MATH_MODEL ?? process.env.OLLAMA_MODEL ?? 'qwen2.5-math';
  const contextBlock = contextText?.trim()
    ? `\n\nStudy context:\n${contextText.slice(0, 2500)}`
    : '';

  const messages = [
    { role: 'system', content: AI_SYSTEM_PROMPT },
    { role: 'user', content: `Category hint: ${category ?? 'auto'}\nProblem: ${problem}${contextBlock}` },
  ];

  for (const url of [`${base}/v1/chat/completions`, `${base}/api/chat`]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature: 0.05, stream: false }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;

      const data = await res.json();
      const raw = String(data?.choices?.[0]?.message?.content ?? data?.message?.content ?? '').trim();
      if (!raw) continue;

      const result = parseAiResponse(raw, problem, category);
      if (result) return result;
    } catch {
      // Try the next Ollama-compatible endpoint.
    }
  }

  return null;
}

async function tryAiSolve(problem: string, category: string | null, contextText?: string | null): Promise<SolverResult | null> {
  const ollamaResult = await tryOllamaSolve(problem, category, contextText);
  if (ollamaResult) return ollamaResult;

  const contextBlock = contextText?.trim()
    ? `

Study context:
${contextText.slice(0, 2500)}`
    : '';

  const model = process.env.GROK_MODEL_DEFAULT ?? process.env.OPENAI_MODEL_DEFAULT ?? 'grok-3-fast';
  const result = await tryCloudGeneration({
    model,
    messages: [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      { role: 'user', content: `Category hint: ${category ?? 'auto'}
Problem: ${problem}${contextBlock}` },
    ],
    maxTokens: 1200,
  });

  if (!result.ok) return null;
  return parseAiResponse(result.content, problem, category);
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

  const aiSolved = await tryAiSolve(problem, body?.category ?? null, body?.contextText ?? null);
  if (aiSolved) {
    return jsonResponse(aiSolved, body ?? { problem });
  }

  return jsonResponse(solved, body ?? { problem });
}
