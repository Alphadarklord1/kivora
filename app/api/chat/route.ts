import { NextRequest } from 'next/server';

/**
 * POST /api/chat
 * Body: { messages: [{role, content}][], context?: string, model?: string }
 *
 * Streams an SSE response using the same token format as /api/generate/stream
 * Uses the document context as a system prompt so the AI answers about the file.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  const {
    messages,
    context,
    model: clientModel,
  } = body as {
    messages?: Array<{ role: string; content: string }>;
    context?: string;
    model?: string;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response('messages array required', { status: 400 });
  }

  const ollamaBase  = process.env.OLLAMA_URL   ?? 'http://localhost:11434';
  const ollamaModel = (typeof clientModel === 'string' && clientModel.trim())
    ? clientModel.trim()
    : (process.env.OLLAMA_MODEL ?? 'mistral');

  const encoder = new TextEncoder();
  function sseChunk(token: string, done: boolean, source?: string): Uint8Array {
    const payload = JSON.stringify({ token, done, ...(source ? { source } : {}) });
    return encoder.encode(`data: ${payload}\n\n`);
  }

  const sysContent = context?.trim()
    ? `You are a helpful, accurate study assistant. The student has uploaded a document and will ask you questions about it. \
Answer ONLY from the document context unless the student explicitly asks for outside knowledge. Be concise and educational.\n\n\
DOCUMENT CONTEXT (first 8000 chars):\n${context.slice(0, 8000)}`
    : 'You are a helpful study assistant. Be accurate, concise, and educational.';

  const ollamaMessages = [
    { role: 'system', content: sysContent },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  const SSE_HEADERS = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  };

  // ── 1. Try Ollama OpenAI-compat streaming ────────────────────────────────
  try {
    const ollamaRes = await fetch(`${ollamaBase}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
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
            controller.enqueue(sseChunk('', true, 'ollama'));
            controller.close();
          }
        },
      });
      return new Response(stream, { headers: SSE_HEADERS });
    }
  } catch { /* fall through */ }

  // ── 2. Offline fallback ───────────────────────────────────────────────────
  const lastQ = messages[messages.length - 1]?.content ?? '';
  const fallback = context?.trim()
    ? `I can see your document, but the AI model isn't available to answer questions right now.\n\nTo enable AI chat, install Ollama from https://ollama.com and run:\n\`ollama pull mistral\`\n\nYour question: "${lastQ.slice(0, 120)}"`
    : `No AI model is available. Install Ollama from https://ollama.com and run: \`ollama pull mistral\``;

  const stream = new ReadableStream({
    async start(controller) {
      const words = fallback.split(/(\s+)/);
      for (let i = 0; i < words.length; i += 4) {
        const chunk = words.slice(i, i + 4).join('');
        if (chunk) controller.enqueue(sseChunk(chunk, false));
        await new Promise(r => setTimeout(r, 0));
      }
      controller.enqueue(sseChunk('', true, 'offline'));
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
