import { callOpenAIChat, type OpenAIMessage } from '@/lib/ai/openai';
import { resolveAiRuntimeRequest, type AiMode } from '@/lib/ai/runtime';

export { resolveAiRuntimeRequest };

export async function tryLocalGeneration(args: {
  baseUrl: string;
  model: string;
  userPrompt: string;
  prompt: string;
  maxTokens?: number;
}) {
  try {
    const chatResponse = await fetch(`${args.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: args.model,
        messages: [
          { role: 'system', content: 'You are a study assistant. Be concise, accurate, and helpful.' },
          { role: 'user', content: args.userPrompt },
        ],
        max_tokens: args.maxTokens ?? 1600,
        temperature: 0.7,
        stream: false,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (chatResponse.ok) {
      const payload = await chatResponse.json();
      const content = payload?.choices?.[0]?.message?.content ?? '';
      if (typeof content === 'string' && content.trim()) {
        return { ok: true as const, content: content.trim(), source: 'local' as const };
      }
    }
  } catch {
    // Try native Ollama generate below.
  }

  try {
    const nativeResponse = await fetch(`${args.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: args.model,
        prompt: args.prompt,
        stream: false,
        options: { num_predict: args.maxTokens ?? 1600, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (nativeResponse.ok) {
      const payload = await nativeResponse.json();
      const content = payload?.response ?? '';
      if (typeof content === 'string' && content.trim()) {
        return { ok: true as const, content: content.trim(), source: 'local' as const };
      }
    }
  } catch {
    // Fall through.
  }

  return { ok: false as const };
}

export async function tryCloudGeneration(args: {
  model: string;
  messages: OpenAIMessage[];
  maxTokens?: number;
}) {
  const result = await callOpenAIChat({
    model: args.model,
    messages: args.messages,
    maxTokens: args.maxTokens ?? 1600,
    temperature: 0.7,
  });

  if (!result.ok) return { ok: false as const, message: result.message };
  return { ok: true as const, content: result.content, source: 'openai' as const };
}

export function shouldTryLocal(mode: AiMode) {
  return mode === 'auto' || mode === 'local';
}

export function shouldTryCloud(mode: AiMode) {
  return mode === 'auto' || mode === 'cloud';
}

export function chunkTextForSse(text: string) {
  return text.split(/(\s+)/);
}
