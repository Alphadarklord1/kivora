import { NextRequest } from 'next/server';
import type { OpenAIMessage } from '@/lib/ai/openai';
import { buildRagContext, retrieveFromIndex, retrieveRelevantChunks } from '@/lib/rag/retrieve';
import { getPersistedRagIndexForRequest } from '@/lib/rag/server-index-store';
import { resolveAiRuntimeRequest, shouldTryCloud, shouldTryLocal, tryCloudGeneration } from '@/lib/ai/server-routing';
import { requireAppAccess } from '@/lib/api/guard';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';
import { redactForAi, resolveAiDataMode } from '@/lib/privacy/ai-data';

/**
 * POST /api/chat
 * Body: { messages: [{role, content}][], context?: string, model?: string }
 *
 * Streams an SSE response using the same token format as /api/generate/stream
 * Uses the document context as a system prompt so the AI answers about the file.
 */
export async function POST(req: NextRequest) {
  const guardResult = await requireAppAccess(req);
  if (guardResult) return guardResult;
  const rateLimitResponse = enforceAiRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  const {
    messages,
    fileId,
    context,
    sources: providedSources,
  } = body as {
    messages?: Array<{ role: string; content: string }>;
    fileId?: string;
    context?: string;
    sources?: Array<{ label: string; preview: string; text: string }>;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response('messages array required', { status: 400 });
  }
  // Bound the conversation history so a malicious client can't burn tokens
  // by sending 10k messages of 1MB each. Anything past the cap is dropped.
  if (messages.length > 50) {
    return new Response('Too many messages (max 50)', { status: 400 });
  }
  for (const m of messages) {
    if (typeof m?.content !== 'string') {
      return new Response('Each message must have string content', { status: 400 });
    }
    if (m.content.length > 16_000) {
      return new Response('Message too long (max 16,000 chars per turn)', { status: 400 });
    }
  }
  if (typeof context === 'string' && context.length > 60_000) {
    return new Response('Context too long (max 60,000 chars)', { status: 400 });
  }

  const { mode, localModel, cloudModel } = resolveAiRuntimeRequest(body);
  const privacyMode = resolveAiDataMode(body);
  const ollamaBase = process.env.OLLAMA_URL ?? 'http://localhost:11434';

  const encoder = new TextEncoder();
  function sseChunk(token: string, done: boolean, source?: string, sources?: Array<{ label: string; preview: string }>): Uint8Array {
    const payload = JSON.stringify({ token, done, ...(source ? { source } : {}), ...(sources ? { sources } : {}) });
    return encoder.encode(`data: ${payload}\n\n`);
  }

  const lastQ = messages[messages.length - 1]?.content ?? '';
  const persistedIndex = typeof fileId === 'string' && fileId.trim()
    ? await getPersistedRagIndexForRequest(req, fileId.trim()).catch(() => undefined)
    : undefined;
  const rawSources = Array.isArray(providedSources) && providedSources.length > 0
    ? providedSources.map((source, index) => ({
        id: `provided-${index + 1}`,
        start: 0,
        end: source.text.length,
        text: source.text,
        preview: source.preview,
        score: 0,
        label: source.label || `S${index + 1}`,
      }))
    : persistedIndex
      ? retrieveFromIndex(persistedIndex, lastQ, 5)
      : context?.trim()
      ? retrieveRelevantChunks(context, lastQ, 5)
      : [];
  const sources = privacyMode === 'full'
    ? rawSources
    : rawSources.map((source) => ({
        ...source,
        text: redactForAi(privacyMode, source.text, source.label),
        preview: redactForAi(privacyMode, source.preview, source.label),
      }));
  const ragContext = sources.length > 0 ? buildRagContext(sources) : '';
  const safeContext = context?.trim() ? redactForAi(privacyMode, context.trim(), 'study context') : '';

  const sysContent = safeContext
    ? `You are a helpful, accurate study assistant. The student has uploaded a document and will ask you questions about it.
Answer from the retrieved document sources first. If the sources are not enough, say that clearly instead of inventing details.
When you use a source, cite it inline like [S1] or [S2].

RETRIEVED DOCUMENT SOURCES:
${ragContext}`
    : 'You are a helpful study assistant. Be accurate, concise, and educational.';

  const ollamaMessages: OpenAIMessage[] = [
    { role: 'system', content: sysContent },
    ...messages
      .filter((message): message is { role: 'system' | 'user' | 'assistant'; content: string } =>
        message.role === 'system' || message.role === 'user' || message.role === 'assistant'
      )
      .map(message => ({ role: message.role, content: message.content })),
  ];

  const SSE_HEADERS = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  };

  if (shouldTryLocal(mode)) {
    try {
    const ollamaRes = await fetch(`${ollamaBase}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: localModel,
        messages: ollamaMessages,
        max_tokens: 2000,
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
                const t = line.trim();
                if (!t || t === 'data: [DONE]') continue;
                const jsonStr = t.startsWith('data: ') ? t.slice(6) : t;
                try {
                  const parsed = JSON.parse(jsonStr);
                  const token = parsed?.choices?.[0]?.delta?.content ?? '';
                  if (token) controller.enqueue(sseChunk(token, false));
                } catch { /* skip malformed */ }
              }
            }
          } finally {
            controller.enqueue(sseChunk('', true, 'local', sources.map(({ label, preview }) => ({ label, preview }))));
            controller.close();
          }
        },
      });
      return new Response(stream, { headers: SSE_HEADERS });
    }
    } catch {
      // Fall through to cloud/offline.
    }
  }

  if (privacyMode === 'offline') {
    const fallback = safeContext
      ? `Offline-only privacy mode is active. I can only show a local fallback summary right now.\n\nRelevant sources:\n${sources.map(({ label, preview }) => `${label}: ${preview}`).join('\n')}`
      : 'Offline-only privacy mode is active. Live chat models are disabled in this mode.';

    const stream = new ReadableStream({
      async start(controller) {
        const words = fallback.split(/(\s+)/);
        for (let i = 0; i < words.length; i += 4) {
          const chunk = words.slice(i, i + 4).join('');
          if (chunk) controller.enqueue(sseChunk(chunk, false));
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        controller.enqueue(sseChunk('', true, 'offline', sources.map(({ label, preview }) => ({ label, preview }))));
        controller.close();
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  }

  if (shouldTryCloud(mode)) {
    const cloudResult = await tryCloudGeneration({
      model: cloudModel,
      messages: ollamaMessages,
      maxTokens: 2000,
    });

    if (cloudResult.ok) {
      const stream = new ReadableStream({
        async start(controller) {
          const words = cloudResult.content.split(/(\s+)/);
          for (let i = 0; i < words.length; i += 4) {
            const chunk = words.slice(i, i + 4).join('');
            if (chunk) controller.enqueue(sseChunk(chunk, false));
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          controller.enqueue(sseChunk('', true, cloudResult.source, sources.map(({ label, preview }) => ({ label, preview }))));
          controller.close();
        },
      });

      return new Response(stream, { headers: SSE_HEADERS });
    }
  }

  // ── 2. Offline fallback ───────────────────────────────────────────────────
  const fallback = context?.trim()
    ? `I found the most relevant document sections for your question, but no live AI runtime is available right now.\n\nRelevant sources:\n${sources.map(({ label, preview }) => `${label}: ${preview}`).join('\n')}\n\nYou can install a local model from Models & Downloads or configure a cloud API key.`
    : `No live AI runtime is available right now. Install a local model from Models & Downloads or configure a cloud API key.`;

  const stream = new ReadableStream({
    async start(controller) {
      const words = fallback.split(/(\s+)/);
      for (let i = 0; i < words.length; i += 4) {
        const chunk = words.slice(i, i + 4).join('');
        if (chunk) controller.enqueue(sseChunk(chunk, false));
        await new Promise(r => setTimeout(r, 0));
      }
      controller.enqueue(sseChunk('', true, 'offline', sources.map(({ label, preview }) => ({ label, preview }))));
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
