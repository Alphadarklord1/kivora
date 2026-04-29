import { NextRequest } from 'next/server';
import { offlineGenerate, type ToolMode } from '@/lib/offline/generate';
import { callOpenAIChat } from '@/lib/ai/openai';
import { fetchGrokStream, isGrokConfigured } from '@/lib/ai/grok';
import { fetchGroqStream, isGroqConfigured } from '@/lib/ai/groq';
import { cloudProviderForModel } from '@/lib/ai/runtime';

const DEFAULT_GROQ_STREAM_MODEL = process.env.GROQ_MODEL_DEFAULT || 'llama-3.3-70b-versatile';
import { resolveAiRuntimeRequest, shouldTryCloud, shouldTryLocal } from '@/lib/ai/server-routing';
import { buildGenerationContext } from '@/lib/rag/generation-context';
import { getPersistedRagIndexForRequest } from '@/lib/rag/server-index-store';
import { requireAppAccess } from '@/lib/api/guard';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';
import { redactForAi, resolveAiDataMode } from '@/lib/privacy/ai-data';

const OFFLINE_MODES: ToolMode[] = [
  'summarize', 'rephrase', 'explain', 'notes', 'quiz',
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
  const guardResult = await requireAppAccess(req);
  if (guardResult) return guardResult;
  const rateLimitResponse = enforceAiRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

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

  // Match the cap on the non-streaming sibling so a 1MB paste doesn't burn
  // tokens silently. The non-stream route enforces 40k chars at /api/generate.
  if (text.length > 40_000) {
    return new Response('Text too long (max 40,000 characters)', { status: 400 });
  }

  const trimmedText = text.trim();
  const baseSourceText = typeof deckContent === 'string' && deckContent.trim().length > 0
    ? `Deck title: ${deckTitle?.trim() || 'Untitled deck'}\n\n${deckContent.trim()}`
    : trimmedText;
  const currentMode = mode as AllModes;
  const privacyMode = resolveAiDataMode(body);
  const persistedIndex = typeof fileId === 'string' && fileId.trim()
    ? await getPersistedRagIndexForRequest(req, fileId.trim()).catch(() => undefined)
    : undefined;
  const safeSourceText = redactForAi(privacyMode, baseSourceText, deckTitle?.trim() || 'study material');
  const preparedContext = typeof body.retrievalContext === 'string' && body.retrievalContext.trim()
    ? redactForAi(privacyMode, body.retrievalContext.trim(), deckTitle?.trim() || 'study material')
    : buildGenerationContext(currentMode, safeSourceText, options, privacyMode === 'full' ? persistedIndex : undefined);
  const { mode: aiMode, localModel, cloudModel } = resolveAiRuntimeRequest(body);

  const encoder = new TextEncoder();

  function sseChunk(token: string, done: boolean, source?: string): Uint8Array {
    const payload = JSON.stringify({ token, done, ...(source ? { source } : {}) });
    return encoder.encode(`data: ${payload}\n\n`);
  }

  const ollamaBase = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const userPrompt = buildUserPrompt(currentMode, preparedContext, options);

  if (privacyMode === 'offline') {
    const offlineText = OFFLINE_MODES.includes(currentMode as ToolMode)
      ? offlineGenerate(currentMode as ToolMode, baseSourceText, options)
      : buildOfflineFallback(currentMode, baseSourceText, options);

    const stream = new ReadableStream({
      async start(controller) {
        const words = offlineText.split(/(\s+)/);
        for (let i = 0; i < words.length; i += 4) {
          const chunk = words.slice(i, i + 4).join('');
          if (chunk) controller.enqueue(sseChunk(chunk, false));
          await new Promise((resolve) => setTimeout(resolve, 0));
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

    // ── 1. Groq streaming (primary cloud — OpenAI-compatible SSE on LPU) ────
    if (isGroqConfigured()) {
      const groqModel = cloudProviderForModel(cloudModel) === 'groq' ? cloudModel : DEFAULT_GROQ_STREAM_MODEL;
      const groqRes = await fetchGroqStream({ model: groqModel, messages: cloudMessages, maxTokens: 1600, temperature: 0.7 });

      if (groqRes?.body) {
        const stream = new ReadableStream({
          async start(controller) {
            const reader = groqRes.body!.getReader();
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
              controller.enqueue(sseChunk('', true, 'groq'));
              controller.close();
            }
          },
        });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
      }
    }

    // ── 2. Grok streaming (secondary cloud — real token-by-token SSE) ───────
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

    // ── 3. OpenAI (secondary cloud — simulated streaming from full response) ──
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
  const rawStyle = typeof options?.style === 'string' ? options.style : 'mixed';
  // Allowlisted to keep prompt-injection vectors closed.
  const style: 'mixed' | 'recall' | 'application' | 'extended' =
    rawStyle === 'recall' || rawStyle === 'application' || rawStyle === 'extended' ? rawStyle : 'mixed';

  // "Topic:" mode — the user wants to drill a named concept (e.g.
  // "Topic: technological determinism") without a source PDF. Detect
  // the prefix and rewrite the source-block hint so the AI generates
  // from its own knowledge rather than searching for slide facts.
  const topicMatch = text.match(/^\s*Topic:\s*(.+?)(?:\n|$)/i);
  const isTopicMode = !!topicMatch && text.replace(/^\s*Topic:\s*.+?(?:\n|$)/i, '').trim().length < 200;
  const topicName = topicMatch?.[1]?.trim();
  const sourceDirective = isTopicMode && topicName
    ? `Generate from your general knowledge about the topic. Stay accurate, use textbook-standard definitions, and explicitly name the concept in each question. Do not invent statistics or quotations.\n\nTopic: ${topicName}`
    : `Material:\n\n${text}`;

  // Per-style guidance injected into the MCQ / Quiz / Exam prompts.
  // The default "mixed" set was the original behaviour; the others bias
  // the question type so a humanities student practising "technological
  // determinism" can drill scenario MCQs or 200-word essay answers
  // instead of just slide-recall fact questions.
  const mcqStyleGuidance =
    style === 'recall'
      ? `Focus EVERY question on RECALL: facts, definitions, named theories, and key claims explicitly stated in the source. No scenarios, no application — purely "did the student catch this from the material".`
      : style === 'application'
      ? `Focus EVERY question on APPLICATION: present a short scenario, an example case, or a real-world situation that is NOT literally in the source, and ask which option BEST illustrates / applies / is explained by a concept from the source. Each question stem should read like a mini case study (1–3 sentences).`
      : style === 'extended'
      ? `Focus on conceptually rich questions where each stem is a short scenario or claim and the four options represent four interpretations / theoretical lenses. Stems should be 1–3 sentences. (This style is best suited to Quiz extended-response, but for MCQ it produces the strongest concept-level questions.)`
      : `Mix all three types across the set:
1. RECALL — facts, definitions, and steps explicitly stated in the source.
2. APPLICATION — apply the source's concepts to a new scenario, calculation, example, or short worked problem that is not literally in the text.
3. CONNECTION — closely related ideas a student studying this exact topic is expected to know (a prerequisite definition, a typical consequence, a standard textbook variant). Only include these when they sit unambiguously inside the topic — never drift to adjacent subjects, never invent facts, never contradict the source.`;

  const quizStyleGuidance =
    style === 'recall'
      ? `Focus EVERY question on RECALL: facts and definitions explicitly stated in the source. Expected answers should be 1–2 sentences, specific enough to grade.`
      : style === 'application'
      ? `Focus EVERY question on APPLICATION: pose a short real-world scenario or example that is NOT literally in the source, and ask the student to apply / interpret / predict using a concept from the source. Expected answers should be 2–3 sentences naming the concept and explaining the link.`
      : style === 'extended'
      ? `EXTENDED-RESPONSE MODE — write fewer, harder questions that demand a multi-paragraph answer (~200 words each). Each question must:
- Pose a concept-driven, theoretical, or situational prompt grounded in the source (e.g. "Using technological determinism, explain how the rise of social media has reshaped X. Refer to at least two specific claims from the source material.").
- After the question, include a short rubric on a single line starting with "Rubric:" listing 3–4 criteria the answer should hit (key concept naming, accurate explanation, evidence from source, evaluation / counter-point).
- Provide a model "Answer:" of about 180–220 words written like a strong undergraduate paragraph — formal register, no bullet points, integrating evidence from the source.`
      : `Mix all three types across the set:
1. RECALL — facts, definitions, and steps explicitly stated in the source.
2. APPLICATION — apply the source's concepts to a new scenario, calculation, example, or short worked problem that is not literally in the text.
3. CONNECTION — closely related ideas a student studying this exact topic is expected to know (a prerequisite definition, a typical consequence, a standard textbook variant). Only include these when they sit unambiguously inside the topic — never drift to adjacent subjects, never invent facts, never contradict the source.`;

  // For extended mode we deliberately ask for fewer, deeper questions —
  // 200-word answers x 10 questions blows past the model's context budget.
  const quizCount = style === 'extended' ? Math.max(3, Math.min(5, Math.ceil(count / 2))) : count;

  const instructions: Record<AllModes, string> = {
    summarize:  `Summarize the following study material clearly and concisely:\n\n${text}`,
    explain:    `Explain the following concept or text clearly for a student, with a plain-language explanation and one practical example:\n\n${text}`,
    rephrase:   `Rephrase the following text in simpler, clearer language for a student:\n\n${text}`,
    notes:      `Extract key study notes as bullet points from:\n\n${text}`,
    quiz:       `You are a teacher writing a quiz from the source material below. Goal: test whether the student understands the topic, not whether they can copy lines from the slides.

Write ${quizCount} questions.

${quizStyleGuidance}

If you're not sure whether something is in scope, leave it out.

Use this exact format for each question — the "Q" prefix and the "Answer:" line are required${style === 'extended' ? ' (and the "Rubric:" line is required when given in the guidance)' : ''}:

Q1. <question text>${style === 'extended' ? '\nRubric: <criterion 1> | <criterion 2> | <criterion 3>' : ''}
Answer: <expected answer${style === 'extended' ? ' — model paragraph of ~200 words' : ' in 1-2 sentences'}>

Q2. <question text>
${style === 'extended' ? 'Rubric: ...\n' : ''}Answer: <expected answer>

Repeat for ${quizCount} questions. ${sourceDirective}`,
    mcq:        `You are a teacher writing a multiple-choice quiz from the source material below — exactly the way you would build a quiz from a PowerPoint deck. The goal is to test whether a student actually UNDERSTANDS the topic, not whether they can quote the slides word-for-word.

Write ${count} questions.

${mcqStyleGuidance}

If you're not sure whether something is in scope, leave it out. Distractors must be plausible — common student errors, almost-right answers, swapped variables — not obvious nonsense.

Use this exact format for each question — the "Q" prefix and the "Answer:" line are required:

Q1. <question text>
A) <option>
B) <option>
C) <option>
D) <option>
Answer: <single letter A/B/C/D>

Q2. <question text>
...

Mark the correct option with the letter on the Answer line. Do not add commentary. ${sourceDirective}`,
    flashcards: `Create ${count} flashcard pairs formatted as "Front: <concept> | Back: <explanation>" from:\n\n${text}`,
    assignment: `Generate a structured assignment with ${count} questions based on:\n\n${text}`,
    outline:    `Create a detailed hierarchical outline with main topics and subtopics from:\n\n${text}`,
    exam:       `Create a realistic final-exam paper with ${count} questions worth 100 marks total, structured exactly like a course final. Use a MIX of question types — a real exam has more than just MCQs.

REQUIRED MIX (vary the types across the paper, don't ship all of one kind):
- ~25% MCQ (single best answer, 2 marks each)
- ~10% True / False (1–2 marks each)
- ~10% Fill in the blank (1–2 marks each)
- ~10% Multi-select (select all that apply, 3–4 marks each)
- ~10% Matching (4 pairs, 4 marks each)
- ~20% Short-answer (3–6 marks each, 1–2 sentence expected response)
- ~15% Extended / essay / worked-problem (8–15 marks, multi-paragraph or step-by-step)

Each question must have a "Q" prefix, a "[N marks]" tag, a TYPE tag in parentheses, and an "Answer:" line. Use the EXACT formats below — the parser depends on these markers.

────────── MCQ ──────────
Q1. [2 marks] (MCQ) <question text>
A) <option>
B) <option>
C) <option>
D) <option>
Answer: B

────────── True / False ──────────
Q2. [2 marks] (T/F) <statement to evaluate>
Answer: True

────────── Fill in the blank ──────────
Q3. [2 marks] (FIB) The capital of France is _____.
Answer: Paris

────────── Multi-select ──────────
Q4. [4 marks] (Select all) <prompt>
A) <option>
B) <option>
C) <option>
D) <option>
E) <option>
Answer: A, C, D

────────── Matching ──────────
Q5. [4 marks] (Match) <prompt — e.g. "Match each scientist to their discovery">
1. <left item 1>
2. <left item 2>
3. <left item 3>
4. <left item 4>
A. <right item 1>
B. <right item 2>
C. <right item 3>
D. <right item 4>
Answer: 1=B, 2=C, 3=A, 4=D

────────── Short answer ──────────
Q6. [5 marks] (Short) <prompt>
Answer: <expected answer in 1–2 sentences>

────────── Extended / essay / worked ──────────
Q7. [10 marks] (Essay) <prompt requiring a paragraph or step-by-step solution>
Answer: <model answer — 80–150 words OR numbered solution steps>

The total of all [N marks] tags MUST sum to 100 (or as close as the count allows). Number questions sequentially Q1, Q2, etc. ${sourceDirective}`,
    practice:   `Create a practice problem based on this content. ALL FIVE sections below are MANDATORY — do not skip any, do not stop early, the Solution section must contain a real worked solution (never empty, never "[omitted]").\n\n${
      style === 'application'
        ? 'STYLE: APPLICATION / SCENARIO — frame the Problem as a short real-world case study (1–3 sentences) the student must analyse using a concept from the source. Do NOT just ask them to recall a definition.'
        : style === 'recall'
          ? 'STYLE: RECALL — base the Problem directly on a definition, fact, or named concept stated in the source. The Solution should walk through the literal answer.'
          : style === 'extended'
            ? 'STYLE: EXTENDED — pose a conceptually rich, multi-paragraph prompt (e.g. compare/contrast, apply a theory, evaluate a claim). The Solution should be a 200-word model paragraph rather than steps.'
            : 'STYLE: MIXED — pick whichever framing best teaches the most exam-relevant concept in the source.'
    }\n\nUse EXACTLY this format:\n\n## Problem\n[Write a clear, challenging practice question here]\n\n## Hint 1\n[A gentle nudge in the right direction, no direct answer]\n\n## Hint 2\n[More specific guidance, pointing to the key concept]\n\n## Hint 3\n[Almost there — tell them what approach to use]\n\n## Solution\n[Complete step-by-step worked solution with explanation — required, never empty]\n\n${isTopicMode ? sourceDirective : `Content:\n\n${text}`}`,
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
