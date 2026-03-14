import { NextRequest, NextResponse } from 'next/server';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2';

function buildConceptPrompt(concept: string, context?: string) {
  return `You are a clear, encouraging study tutor.

Explain this concept briefly in a way that helps a student revise it for an exam.
Keep the answer to 4-6 concise sentences.
Include 1 intuitive explanation and 1 practical takeaway.
Do not add fluff.

Concept: ${concept}
${context ? `Context from the student's material:\n${context}` : ''}`;
}

function buildAnswerFeedbackPrompt(question: string, userAnswer: string, correctAnswer: string, context?: string) {
  return `You are a helpful tutor. A student answered a question incorrectly.

Question: ${question}
Student's answer: ${userAnswer}
Correct answer: ${correctAnswer}
${context ? `Context: ${context}` : ''}

Explain in 2-3 sentences WHY the correct answer is right and where the student's thinking likely went wrong. Be encouraging and educational. Keep it concise.`;
}

async function runPrompt(prompt: string) {
  const res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 220,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (res.ok) {
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (content) return content;
  }

  const res2 = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res2.ok) return null;
  const data2 = await res2.json();
  return data2.response?.trim() || null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { concept, question, userAnswer, correctAnswer, context } = body as {
      concept?: string;
      question?: string;
      userAnswer?: string;
      correctAnswer?: string;
      context?: string;
    };

    if (concept?.trim()) {
      const explanation = await runPrompt(buildConceptPrompt(concept.trim(), context));
      return NextResponse.json({ explanation });
    }

    if (!question || !userAnswer || !correctAnswer) {
      return NextResponse.json({ explanation: null });
    }

    const explanation = await runPrompt(buildAnswerFeedbackPrompt(question, userAnswer, correctAnswer, context));
    return NextResponse.json({ explanation });
  } catch {
    return NextResponse.json({ explanation: null });
  }
}
