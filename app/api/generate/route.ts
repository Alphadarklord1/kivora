import { NextRequest, NextResponse } from 'next/server';
import { offlineGenerate, type ToolMode } from '@/lib/offline/generate';

const VALID_MODES: ToolMode[] = [
  'summarize', 'rephrase', 'notes', 'quiz',
  'mcq', 'flashcards', 'assignment',
];

/**
 * POST /api/generate
 * Body: { mode: ToolMode, text: string, options?: Record<string, unknown> }
 *
 * Architecture:
 *  1. Try local LLM (llama.cpp proxy) if LLAMA_PROXY_URL is set
 *  2. Fall back to deterministic offline logic
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const { mode, text, options } = body as {
    mode?: string;
    text?: string;
    options?: Record<string, unknown>;
  };

  if (!mode || !VALID_MODES.includes(mode as ToolMode)) {
    return NextResponse.json(
      { error: `Invalid mode. Must be one of: ${VALID_MODES.join(', ')}` },
      { status: 400 },
    );
  }

  if (!text || typeof text !== 'string' || text.trim().length < 20) {
    return NextResponse.json(
      { error: 'Text must be at least 20 characters.' },
      { status: 400 },
    );
  }

  const trimmedText = text.trim();

  // 1. Try local LLM proxy (desktop runtime)
  const llamaUrl = process.env.LLAMA_PROXY_URL;
  if (llamaUrl) {
    try {
      const prompt = buildPrompt(mode as ToolMode, trimmedText, options);
      const res = await fetch(`${llamaUrl}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          max_tokens: 1200,
          temperature: 0.7,
          stop: ['<|im_end|>', '</s>'],
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data?.content ?? data?.choices?.[0]?.text ?? '';
        if (content.trim()) {
          return NextResponse.json({ mode, content: content.trim(), source: 'local' });
        }
      }
    } catch {
      // Local model unavailable — fall through to offline
    }
  }

  // 2. Deterministic offline fallback
  const content = offlineGenerate(mode as ToolMode, trimmedText, options);
  return NextResponse.json({ mode, content, source: 'offline' });
}

function buildPrompt(mode: ToolMode, text: string, options?: Record<string, unknown>): string {
  const sys = 'You are a study assistant. Be concise, accurate, and helpful.';
  const count = (options?.count as number | undefined) ?? 5;

  const instructions: Record<ToolMode, string> = {
    summarize:  `Summarize the following study material clearly and concisely:\n\n${text}`,
    rephrase:   `Rephrase the following text in simpler, clearer language for a student:\n\n${text}`,
    notes:      `Extract key study notes as bullet points from:\n\n${text}`,
    quiz:       `Create ${count} short-answer quiz questions (with answers) from:\n\n${text}`,
    mcq:        `Create ${count} multiple-choice questions (4 options each, mark the correct one) from:\n\n${text}`,
    flashcards: `Create ${count} flashcard pairs (Front: concept | Back: explanation) from:\n\n${text}`,
    assignment: `Generate a structured assignment or problem set with ${count} questions based on:\n\n${text}`,
  };

  return `<|im_start|>system\n${sys}<|im_end|>\n<|im_start|>user\n${instructions[mode]}<|im_end|>\n<|im_start|>assistant\n`;
}
