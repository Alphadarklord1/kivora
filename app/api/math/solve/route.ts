import { NextRequest, NextResponse } from 'next/server';
import { solveMathProblem } from '@/lib/math/symbolic-solver';
import type { MathSolveRequest } from '@/lib/math/types';

// ── AI solve via Ollama ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert math tutor. Solve math problems step-by-step and respond ONLY with a valid JSON object in this EXACT schema — no markdown, no preamble:

{
  "answer": "final answer as plain text",
  "answerLatex": "final answer in LaTeX",
  "steps": [
    {
      "step": 1,
      "description": "Short title for this step",
      "latex": "LaTeX expression for the work done in this step",
      "explanation": "One sentence explaining why"
    }
  ],
  "graphExpr": "y=expression to graph (omit y= prefix for implicit; null if not applicable)",
  "category": "algebra|calculus|statistics|trigonometry|geometry|linear-algebra|differential-equations|discrete|physics"
}

Rules:
- LaTeX must be valid KaTeX. Use \\frac, \\sqrt, \\int, \\sum, \\pm etc.
- steps array must have 2–8 items.
- graphExpr should be a single expression of x, or null.
- answer must be a human-readable string.`;

async function tryAiSolve(problem: string, category: string | null) {
  const base  = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const model = process.env.OLLAMA_MATH_MODEL ?? process.env.OLLAMA_MODEL ?? 'mistral';

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: `Category hint: ${category ?? 'auto'}\n\nProblem: ${problem}` },
    ],
    temperature: 0.05,
    stream: false,
  });

  // Try OpenAI-compatible endpoint first (all recent Ollama versions)
  for (const url of [`${base}/v1/chat/completions`, `${base}/api/chat`]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) continue;

      const data = await res.json();
      const raw: string =
        data?.choices?.[0]?.message?.content ??
        data?.message?.content ??
        '';
      if (!raw.trim()) continue;

      // Extract JSON from response (model may add preamble despite instructions)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      // Validate minimal shape
      if (!parsed.answer || !Array.isArray(parsed.steps)) continue;

      return {
        answer:          String(parsed.answer ?? ''),
        answerLatex:     String(parsed.answerLatex ?? parsed.answer ?? ''),
        steps:           (parsed.steps as Array<Record<string, unknown>>).map((s, i) => ({
          step:        Number(s.step ?? i + 1),
          description: String(s.description ?? ''),
          latex:       String(s.latex ?? ''),
          explanation: String(s.explanation ?? ''),
        })),
        graphExpr:       typeof parsed.graphExpr === 'string' && parsed.graphExpr !== 'null'
          ? parsed.graphExpr : null,
        category:        String(parsed.category ?? category ?? 'algebra'),
        engine:          'ai' as const,
        verified:        true,
        normalizedInput: problem,
        previewLatex:    problem,
        error:           null,
      };
    } catch {
      // try next URL or fall through
    }
  }
  return null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as MathSolveRequest | null;

  const problem = body?.problem?.trim();
  if (!problem) {
    return NextResponse.json({ error: 'problem is required' }, { status: 400 });
  }

  const category = body?.category ?? null;

  // 1. Try AI solver
  const aiResult = await tryAiSolve(problem, category);
  if (aiResult) return NextResponse.json(aiResult);

  // 2. Fall back to symbolic CAS solver
  const solved = solveMathProblem(problem, category);
  return NextResponse.json({
    category:        solved.category,
    normalizedInput: solved.normalizedInput,
    previewLatex:    solved.previewLatex,
    answer:          solved.answer,
    answerLatex:     solved.answerLatex,
    steps:           solved.steps,
    explanation:     solved.explanation,
    graphExpr:       solved.graphExpr ?? null,
    verified:        solved.verified,
    engine:          solved.engine,
    error:           solved.error ?? null,
    contextFileId:   body?.contextFileId ?? null,
    contextUsed:     Boolean(body?.contextText?.trim()),
  });
}
