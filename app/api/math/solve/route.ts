import { NextRequest, NextResponse } from 'next/server';
import { solveMathProblem } from '@/lib/math/symbolic-solver';
import type { MathSolveRequest } from '@/lib/math/types';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as MathSolveRequest | null;

  const problem = body?.problem?.trim();
  if (!problem) {
    return NextResponse.json({ error: 'problem is required' }, { status: 400 });
  }

  const solved = solveMathProblem(problem, body?.category ?? null);

  return NextResponse.json({
    category: solved.category,
    normalizedInput: solved.normalizedInput,
    previewLatex: solved.previewLatex,
    answer: solved.answer,
    answerLatex: solved.answerLatex,
    steps: solved.steps,
    explanation: solved.explanation,
    graphExpr: solved.graphExpr ?? null,
    verified: solved.verified,
    engine: solved.engine,
    error: solved.error ?? null,
    contextFileId: body?.contextFileId ?? null,
    contextUsed: Boolean(body?.contextText?.trim()),
  });
}
