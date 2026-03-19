import { callOpenAIChat, type OpenAIMessage } from '@/lib/ai/openai';
import { callGrokChat, isGrokConfigured } from '@/lib/ai/grok';
import { resolveAiRuntimeRequest, cloudProviderForModel, type AiMode } from '@/lib/ai/runtime';

export { resolveAiRuntimeRequest };

// ── Local (Ollama) ────────────────────────────────────────────────────────────

export async function tryLocalGeneration(args: {
  baseUrl: string;
  model: string;
  userPrompt: string;
  prompt: string;
  maxTokens?: number;
}) {
  // 1. OpenAI-compatible endpoint (Ollama >= 0.1.24 exposes this)
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

  // 2. Native Ollama /api/generate endpoint
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

// ── Cloud: Grok (primary) → OpenAI (secondary) ───────────────────────────────

/**
 * Try Grok first; if not configured or fails, fall back to OpenAI.
 * Source tag lets the UI show users which provider was actually used.
 */
export async function tryCloudGeneration(args: {
  model: string;
  messages: OpenAIMessage[];
  maxTokens?: number;
}) {
  const provider = cloudProviderForModel(args.model);

  // ── 1. Grok (primary) ────────────────────────────────────────────────────
  if (provider === 'grok' || isGrokConfigured()) {
    const grokModel = provider === 'grok' ? args.model : 'grok-3-fast';
    const grokResult = await callGrokChat({
      model: grokModel,
      messages: args.messages,
      maxTokens: args.maxTokens ?? 1600,
      temperature: 0.7,
    });
    if (grokResult.ok) {
      return { ok: true as const, content: grokResult.content, source: 'grok' as const };
    }
  }

  // ── 2. OpenAI (secondary / fallback) ─────────────────────────────────────
  const openaiModel = provider === 'openai' ? args.model : 'gpt-4o-mini';
  const openaiResult = await callOpenAIChat({
    model: openaiModel,
    messages: args.messages,
    maxTokens: args.maxTokens ?? 1600,
    temperature: 0.7,
  });
  if (openaiResult.ok) {
    return { ok: true as const, content: openaiResult.content, source: 'openai' as const };
  }

  return { ok: false as const, message: openaiResult.message };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function shouldTryLocal(mode: AiMode) {
  return mode === 'auto' || mode === 'local';
}

export function shouldTryCloud(mode: AiMode) {
  return mode === 'auto' || mode === 'cloud';
}

export function chunkTextForSse(text: string) {
  return text.split(/(\s+)/);
}
