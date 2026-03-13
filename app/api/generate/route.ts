import { NextRequest, NextResponse } from 'next/server';
import { offlineGenerate, type ToolMode } from '@/lib/offline/generate';

// Core modes supported by offline fallback
const OFFLINE_MODES: ToolMode[] = [
  'summarize', 'rephrase', 'notes', 'quiz',
  'mcq', 'flashcards', 'assignment',
];

// All modes including AI-only extras
const VALID_MODES = [...OFFLINE_MODES, 'outline', 'exam'] as const;
type AllModes = typeof VALID_MODES[number];

/**
 * POST /api/generate
 * Body: { mode: AllModes, text: string, options?: Record<string, unknown> }
 *
 * AI Provider Priority:
 *  1. Ollama  (OLLAMA_URL — open-source local LLM, e.g. http://localhost:11434)
 *  2. llama.cpp proxy  (LLAMA_PROXY_URL)
 *  3. Deterministic offline fallback
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

  if (!mode || !VALID_MODES.includes(mode as AllModes)) {
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
  const currentMode = mode as AllModes;

  // ── 1. Ollama (open-source local LLM) ────────────────────────────────────
  const ollamaBase = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  try {
    const ollamaModel = process.env.OLLAMA_MODEL ?? 'mistral';
    const prompt = buildPrompt(currentMode, trimmedText, options);

    // Try Ollama OpenAI-compatible endpoint first (works with most versions)
    const res = await fetch(`${ollamaBase}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [
          { role: 'system', content: 'You are a study assistant. Be concise, accurate, and helpful.' },
          { role: 'user', content: buildUserPrompt(currentMode, trimmedText, options) },
        ],
        max_tokens: 1600,
        temperature: 0.7,
        stream: false,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      if (content.trim()) {
        return NextResponse.json({ mode, content: content.trim(), source: 'ollama' });
      }
    }

    // Fallback: try Ollama native /api/generate endpoint
    const res2 = await fetch(`${ollamaBase}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        prompt,
        stream: false,
        options: { num_predict: 1600, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (res2.ok) {
      const data2 = await res2.json();
      const content2 = data2?.response ?? '';
      if (content2.trim()) {
        return NextResponse.json({ mode, content: content2.trim(), source: 'ollama' });
      }
    }
  } catch {
    // Ollama unavailable — fall through
  }

  // ── 2. llama.cpp proxy (alternative local runner) ─────────────────────────
  const llamaUrl = process.env.LLAMA_PROXY_URL;
  if (llamaUrl) {
    try {
      const prompt = buildPrompt(currentMode, trimmedText, options);
      const res = await fetch(`${llamaUrl}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          max_tokens: 1600,
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
      // llama.cpp unavailable — fall through
    }
  }

  // ── 3. Deterministic offline fallback ─────────────────────────────────────
  if (OFFLINE_MODES.includes(currentMode as ToolMode)) {
    const content = offlineGenerate(currentMode as ToolMode, trimmedText, options);
    return NextResponse.json({ mode, content, source: 'offline' });
  }

  // AI-only modes (outline, exam) with no offline fallback — generate basic structure
  const fallback = buildOfflineFallback(currentMode, trimmedText, options);
  return NextResponse.json({ mode, content: fallback, source: 'offline' });
}

/** Full chat prompt for llama.cpp (Mistral/Llama instruct format) */
function buildPrompt(mode: AllModes, text: string, options?: Record<string, unknown>): string {
  const sys = 'You are a study assistant. Be concise, accurate, and helpful.';
  const user = buildUserPrompt(mode, text, options);
  return `<|im_start|>system\n${sys}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n`;
}

/** Just the user instruction (used for Ollama chat messages) */
function buildUserPrompt(mode: AllModes, text: string, options?: Record<string, unknown>): string {
  const count = (options?.count as number | undefined) ?? 5;

  const instructions: Record<AllModes, string> = {
    summarize:  `Summarize the following study material clearly and concisely:\n\n${text}`,
    rephrase:   `Rephrase the following text in simpler, clearer language for a student:\n\n${text}`,
    notes:      `Extract key study notes as bullet points from:\n\n${text}`,
    quiz:       `Create ${count} short-answer quiz questions (with answers) from:\n\n${text}`,
    mcq:        `Create ${count} multiple-choice questions (4 options each, mark the correct one with ✓) from:\n\n${text}`,
    flashcards: `Create ${count} flashcard pairs formatted as "Front: <concept> | Back: <explanation>" from:\n\n${text}`,
    assignment: `Generate a structured assignment with ${count} questions based on:\n\n${text}`,
    outline:    `Create a detailed hierarchical outline with main topics and subtopics from:\n\n${text}`,
    exam:       `Create a realistic exam paper with ${count} mixed questions (MCQ, short answer, essay) worth 100 marks total. Include a marking scheme. Based on:\n\n${text}`,
  };

  return instructions[mode];
}

/** Basic offline fallback for AI-only modes */
function buildOfflineFallback(mode: AllModes, text: string, options?: Record<string, unknown>): string {
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.length > 20)
    .slice(0, 20);

  const count = (options?.count as number | undefined) ?? 5;

  if (mode === 'outline') {
    const topics = sentences.slice(0, 8).map((s, i) => {
      const words = s.trim().split(/\s+/).slice(0, 6).join(' ');
      return `${i + 1}. ${words}...\n   a. Key concept\n   b. Supporting detail`;
    });
    return `# Study Outline\n\n${topics.join('\n\n')}`;
  }

  if (mode === 'exam') {
    const parts: string[] = ['# Exam Paper\n\n**Total: 100 marks | Time: 60 minutes**\n'];
    parts.push('## Section A — Multiple Choice (40 marks)\n');
    for (let i = 0; i < Math.min(count, sentences.length); i++) {
      const s = sentences[i].trim();
      parts.push(`${i + 1}. Which of the following best describes: "${s.slice(0, 60)}..."\n   A) First option\n   B) Second option\n   C) Third option ✓\n   D) Fourth option\n`);
    }
    parts.push('\n## Section B — Short Answer (30 marks)\n');
    for (let i = 0; i < 3; i++) {
      parts.push(`${i + 1}. Explain the concept mentioned in: "${sentences[i]?.slice(0, 60) ?? 'the text'}..." (10 marks)\n`);
    }
    parts.push('\n## Section C — Essay (30 marks)\n');
    parts.push(`1. Discuss the main themes covered in the provided material, supporting your answer with specific examples. (30 marks)\n`);
    return parts.join('\n');
  }

  return `(No AI model available — install Ollama from https://ollama.com and run: ollama pull mistral)`;
}
