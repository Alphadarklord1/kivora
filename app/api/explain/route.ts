import { NextRequest, NextResponse } from 'next/server';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, userAnswer, correctAnswer, context } = body as {
      question: string;
      userAnswer: string;
      correctAnswer: string;
      context?: string;
    };

    const prompt = `You are a helpful tutor. A student answered a question incorrectly.

Question: ${question}
Student's answer: ${userAnswer}
Correct answer: ${correctAnswer}
${context ? `Context: ${context}` : ''}

Explain in 2-3 sentences WHY the correct answer is right and where the student's thinking likely went wrong. Be encouraging and educational. Keep it concise.`;

    // Try Ollama OpenAI-compat
    const res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.5,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (res.ok) {
      const data = await res.json();
      const explanation = data.choices?.[0]?.message?.content?.trim();
      if (explanation) return NextResponse.json({ explanation });
    }

    // Try native Ollama
    const res2 = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
      signal: AbortSignal.timeout(20_000),
    });

    if (res2.ok) {
      const data2 = await res2.json();
      const explanation = data2.response?.trim();
      if (explanation) return NextResponse.json({ explanation });
    }

    return NextResponse.json({ explanation: null });
  } catch {
    return NextResponse.json({ explanation: null });
  }
}
