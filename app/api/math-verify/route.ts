import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/math-verify
 * Uses Ollama (or llama.cpp) to verify and explain a math solution.
 * Falls back gracefully if no AI model is available.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ feedback: null }, { status: 400 }); }

  const { problem, answer } = body as { problem?: string; answer?: string };
  if (!problem || !answer) return NextResponse.json({ feedback: null });

  const prompt = buildMathPrompt(problem.trim(), answer.trim());

  // 1. Try Ollama
  const ollamaBase = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL ?? 'mistral';
  try {
    const res = await fetch(`${ollamaBase}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [
          { role: 'system', content: 'You are a precise math tutor. Be concise and helpful.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 300,
        temperature: 0.3,
        stream: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      const data = await res.json();
      const feedback = data?.choices?.[0]?.message?.content?.trim();
      if (feedback) return NextResponse.json({ feedback, source: 'ollama' });
    }
  } catch { /* fall through */ }

  // 2. Try llama.cpp
  const llamaUrl = process.env.LLAMA_PROXY_URL;
  if (llamaUrl) {
    try {
      const res = await fetch(`${llamaUrl}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `<|im_start|>system\nYou are a math tutor.<|im_end|>\n<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`, max_tokens: 300, temperature: 0.3 }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        const data = await res.json();
        const feedback = (data?.content ?? '').trim();
        if (feedback) return NextResponse.json({ feedback, source: 'local' });
      }
    } catch { /* fall through */ }
  }

  // 3. No AI available
  return NextResponse.json({ feedback: null, source: 'none' });
}

function buildMathPrompt(problem: string, answer: string): string {
  return `A student solved this math problem:

Problem: ${problem}
Computed answer: ${answer}

Please verify if the answer is correct and provide a brief (2-3 sentence) explanation of the solution approach. If incorrect, point out the error. Be specific.`;
}
