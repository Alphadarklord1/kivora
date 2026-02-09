import { NextRequest, NextResponse } from 'next/server';
import type { ToolMode } from '@/lib/offline/generate';

type Provider = 'openai' | 'ollama';

const MODE_GUIDANCE: Record<string, string> = {
  assignment: 'Provide a structured plan, key requirements, and suggested approach.',
  summarize: 'Provide a clear academic summary with key points.',
  mcq: 'Create 6-10 multiple choice questions with 4 options each and correct answers.',
  quiz: 'Create 6-10 short questions with concise answers.',
  notes: 'Produce Cornell-style study notes.',
  math: 'Explain steps and final answer for the math problem.',
  flashcards: 'Create 8-12 flashcards with front/back pairs.',
  essay: 'Create an outline and thesis with key arguments.',
};

const SYSTEM_PROMPT = `You generate study materials. Output ONLY valid JSON.
The JSON MUST match this shape:
{
  "mode": string,
  "displayText": string,
  "questions": [{ "id": string, "question": string, "options": string[], "correctAnswer": string, "correctIndex": number, "sourceSentence": string, "keywords": string[], "difficulty": "introductory"|"intermediate"|"advanced"|"expert", "bloomLevel": "remember"|"understand"|"apply"|"analyze"|"evaluate"|"create", "topic": string }],
  "flashcards": [{ "id": string, "front": string, "back": string, "category": string, "difficulty": "introductory"|"intermediate"|"advanced"|"expert", "keywords": string[] }],
  "sourceText": string,
  "keyTopics": string[],
  "subjectArea": "science"|"humanities"|"social-science"|"business"|"technical"|"general",
  "learningObjectives": string[]
}`;

const extractJson = (text: string) => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  return candidate;
};

async function callOpenAI(model: string, prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 501 });
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text || 'OpenAI request failed' }, { status: res.status });
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return NextResponse.json({ raw: content });
}

async function callOllama(model: string, prompt: string, baseUrl?: string) {
  const base = baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    return NextResponse.json({ error: 'Invalid OLLAMA_BASE_URL' }, { status: 400 });
  }

  const host = parsed.hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    return NextResponse.json({ error: 'OLLAMA_BASE_URL must be localhost for security' }, { status: 400 });
  }

  const res = await fetch(`${parsed.origin}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text || 'Ollama request failed' }, { status: res.status });
  }

  const data = await res.json();
  const content = data?.message?.content || '';
  return NextResponse.json({ raw: content });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, model, text, mode, ollamaBaseUrl } = body as {
      provider: Provider;
      model: string;
      text: string;
      mode: ToolMode;
      ollamaBaseUrl?: string;
    };

    if (!provider || !model || !text || !mode) {
      return NextResponse.json({ error: 'Missing provider, model, text, or mode' }, { status: 400 });
    }

    const guidance = MODE_GUIDANCE[mode] || 'Generate helpful study material.';
    const prompt = `Mode: ${mode}\nGuidance: ${guidance}\n\nSource text:\n${text}`;

    const rawResponse =
      provider === 'openai'
        ? await callOpenAI(model, prompt)
        : await callOllama(model, prompt, ollamaBaseUrl);

    if (!rawResponse.ok) {
      const error = await rawResponse.json();
      return NextResponse.json(error, { status: rawResponse.status });
    }

    const { raw } = await rawResponse.json();
    const jsonText = extractJson(raw);
    if (!jsonText) {
      return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI JSON' }, { status: 502 });
    }

    return NextResponse.json({ content: parsed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI generation failed' },
      { status: 500 }
    );
  }
}
