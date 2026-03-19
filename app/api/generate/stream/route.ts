import { NextRequest } from 'next/server';
import { offlineGenerate, type ToolMode } from '@/lib/offline/generate';
import { callOpenAIChat } from '@/lib/ai/openai';
import { fetchGrokStream, callGrokChat, isGrokConfigured } from '@/lib/ai/grok';
import { cloudProviderForModel } from '@/lib/ai/runtime';
import { resolveAiRuntimeRequest, shouldTryCloud, shouldTryLocal } from '@/lib/ai/server-routing';
import { buildGenerationContext } from '@/lib/rag/generation-context';
import { getPersistedRagIndexForRequest } from '@/lib/rag/server-index-store';

const OFFLINE_MODES: ToolMode[] = [
  'summarize', 'rephrase', 'notes', 'quiz',
  'mcq', 'flashcards', 'assignment',
];

const VALID_MODES = [...OFFLINE_MODES, 'outline', 'exam', 'practice'] as const;
type AllModes = typeof VALID_MODES[number];

/**
 * POST /api/generate/stream
 * Body: { mode, text, options?, model? }
 *
 * Returns a Server-Sent Events (SSE) stream.
 * Each event is:
 *   data: {"token": "...", "done": false}  — for token chunks
 *   data: {"token": "", "done": true, "source": "ollama"}  — final event
 *
 * Falls back to chunked offline output if Ollama is unavailable.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  const { mode, text, options, fileId, deckTitle, deckContent } = body as {
    mode?: string;
    text?: string;
    options?: Record<string, unknown>;
    retrievalContext?: string;
    fileId?: string | null;
    deckTitle?: string;
    deckContent?: string | null;
  };

  if (!mode || !VALID_MODES.includes(mode as AllModes)) {
    return new Response(`Invalid mode`, { status: 400 });
  }

  if (!text || typeof text !== 'string' || text.trim().length < 20) {
    return new Response('Text must be at least 20 characters', { status: 400 });
  }

  const trimmedText = text.trim();
  const baseSourceText = typeof deckContent === 'string' && deckContent.trim().length > 0
    ? `Deck title: ${deckTitle?.trim() || 'Untitled deck'}\n\n${deckContent.trim()}`
    : trimmedText;
  const currentMode = mode as AllModes;
  const persistedIndex = typeof fileId === 'string' && fileId.trim()
    ? await getPersistedRagIndexForRequest(req, fileId.trim()).catch(() => undefined)
    : undefined;
  const preparedContext = typeof body.retrievalContext === 'string' && body.retrievalContext.trim()
    ? body.retrievalContext.trim()
    : buildGenerationContext(currentMode, baseSourceText, options, persistedIndex);
  const { mode: aiMode, localModel, cloudModel } = resolveAiRuntimeRequest(body);

  const encoder = new TextEncoder();

  function sseChunk(token: string, done: boolean, source?: string): Uint8Array {
    const payload = JSON.stringify({ token, done, ...(source ? { source } : {}) });
    return encoder.encode(`data: ${payload}\n\n`);
  }

  const ollamaBase = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const userPrompt = buildUserPrompt(currentMode, preparedContext, options);

  if (shouldTryLocal(aiMode)) {
    try {
    // Try OpenAI-compatible streaming endpoint first
    const ollamaRes = await fetch(`${ollamaBase}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: localModel,
        messages: [
          { role: 'system', content: 'You are a study assistant. Be concise, accurate, and helpful.' },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1600,
        temperature: 0.7,
        stream: true,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (ollamaRes.ok && ollamaRes.body) {
      const stream = new ReadableStream({
        async start(controller) {
          const reader = ollamaRes.body!.getReader();
          const dec = new TextDecoder();
          let buf = '';
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop() ?? '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
                try {
                  const parsed = JSON.parse(jsonStr);
                  const token = parsed?.choices?.[0]?.delta?.content ?? '';
                  if (token) controller.enqueue(sseChunk(token, false));
                } catch { /* skip malformed */ }
              }
            }
          } finally {
            controller.enqueue(sseChunk('', true, 'local'));
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // Fallback: try Ollama native /api/generate streaming
    const nativeRes = await fetch(`${ollamaBase}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: localModel,
        prompt: buildPrompt(currentMode, preparedContext, options),
        stream: true,
        options: { num_predict: 1600, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (nativeRes.ok && nativeRes.body) {
      const stream = new ReadableStream({
        async start(controller) {
          const reader = nativeRes.body!.getReader();
          const dec = new TextDecoder();
          let buf = '';
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop() ?? '';
              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const parsed = JSON.parse(line);
                  const token = parsed?.response ?? '';
                  if (token) controller.enqueue(sseChunk(token, false));
                  if (parsed?.done) {
                    controller.enqueue(sseChunk('', true, 'local'));
                    controller.close();
                    return;
                  }
                } catch { /* skip */ }
              }
            }
          } finally {
            controller.enqueue(sseChunk('', true, 'local'));
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }
    } catch {
      // Local runtime unavailable — fall through.
    }
  }

  if (shouldTryCloud(aiMode)) {
    const cloudMessages = [
      { role: 'system' as const, content: 'You are a study assistant. Be concise, accurate, and helpful.' },
      { role: 'user'   as const, content: userPrompt },
    ];

    // ── 1. Grok streaming (primary cloud — real token-by-token SSE) ──────────
    if (isGrokConfigured()) {
      const grokModel = cloudProviderForModel(cloudModel) === 'grok' ? cloudModel : 'grok-3-fast';
      const grokRes = await fetchGrokStream({ model: grokModel, messages: cloudMessages, maxTokens: 1600, temperature: 0.7 });

      if (grokRes?.body) {
        const stream = new ReadableStream({
          async start(controller) {
            const reader = grokRes.body!.getReader();
            const dec = new TextDecoder();
            let buf = '';
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop() ?? '';
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed === 'data: [DONE]') continue;
                  const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
                  try {
                    const parsed = JSON.parse(jsonStr);
                    const token = parsed?.choices?.[0]?.delta?.content ?? '';
                    if (token) controller.enqueue(sseChunk(token, false));
                  } catch { /* skip malformed */ }
                }
              }
            } finally {
              controller.enqueue(sseChunk('', true, 'grok'));
              controller.close();
            }
          },
        });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
      }
    }

    // ── 2. OpenAI (secondary cloud — simulated streaming from full response) ──
    const openaiModel = cloudProviderForModel(cloudModel) === 'openai' ? cloudModel : 'gpt-4o-mini';
    const openaiResult = await callOpenAIChat({ model: openaiModel, messages: cloudMessages, maxTokens: 1600, temperature: 0.7 });

    if (openaiResult.ok) {
      const stream = new ReadableStream({
        async start(controller) {
          const words = openaiResult.content.split(/(\s+)/);
          const CHUNK = 4;
          for (let i = 0; i < words.length; i += CHUNK) {
            const chunk = words.slice(i, i + CHUNK).join('');
            if (chunk) controller.enqueue(sseChunk(chunk, false));
            await new Promise(resolve => setTimeout(resolve, 0));
          }
          controller.enqueue(sseChunk('', true, 'openai'));
          controller.close();
        },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
    }
  }

  // ── 2. Offline fallback: chunk the text into ~word-sized pieces ──────────
  let offlineContent: string;
  if (OFFLINE_MODES.includes(currentMode as ToolMode)) {
    offlineContent = offlineGenerate(currentMode as ToolMode, baseSourceText, options);
  } else {
    offlineContent = buildOfflineFallback(currentMode, baseSourceText, options);
  }

  // Stream offline content word-by-word with small delays (simulated streaming)
  const stream = new ReadableStream({
    async start(controller) {
      // Split into ~4-word chunks for a realistic feel
      const words = offlineContent.split(/(\s+)/);
      const CHUNK = 4;
      for (let i = 0; i < words.length; i += CHUNK) {
        const chunk = words.slice(i, i + CHUNK).join('');
        if (chunk) controller.enqueue(sseChunk(chunk, false));
        // tiny yield to allow backpressure
        await new Promise(r => setTimeout(r, 0));
      }
      controller.enqueue(sseChunk('', true, 'offline'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

function buildPrompt(mode: AllModes, text: string, options?: Record<string, unknown>): string {
  const sys = 'You are a study assistant. Be concise, accurate, and helpful.';
  const user = buildUserPrompt(mode, text, options);
  return `<|im_start|>system\n${sys}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n`;
}


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
    practice:   `Create a practice problem based on this content. Use EXACTLY this format:\n\n## Problem\n[Write a clear, challenging practice question here]\n\n## Hint 1\n[A gentle nudge in the right direction, no direct answer]\n\n## Hint 2\n[More specific guidance, pointing to the key concept]\n\n## Hint 3\n[Almost there — tell them what approach to use]\n\n## Solution\n[Complete step-by-step worked solution with explanation]\n\nContent:\n\n${text}`,
  };
  return instructions[mode];
}

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

  if (mode === 'practice') {
    const topic = sentences[0]?.slice(0, 80) ?? 'the provided content';
    return `## Problem\nBased on the text, explain the concept: "${topic}…"\n\n## Hint 1\nThink about the definition and context provided in the source material.\n\n## Hint 2\nConsider the key terms and how they relate to each other.\n\n## Hint 3\nLook at the examples or evidence given — how do they support the main idea?\n\n## Solution\nThe concept refers to the ideas described in "${topic}…". A complete answer would reference the key terms from the text and explain how they connect. (Install Ollama for AI-generated practice problems.)`;
  }

  return `(No AI model available — install Ollama from https://ollama.com and run: ollama pull mistral)`;
}
