/**
 * lib/ai/call.ts
 *
 * Centralised AI caller.  Every server-side route that needs an AI response
 * should use callAi() instead of repeating the Grok → Ollama → OpenAI →
 * offline routing block.
 *
 * Usage:
 *   const { result } = await callAi({
 *     messages,
 *     maxTokens: 1200,
 *     temperature: 0.3,
 *     aiPrefs: body.ai,
 *     offlineFallback: () => offlineGenerate('summarize', text),
 *   });
 */

import { resolveAiRuntimeRequest, shouldTryCloud, shouldTryLocal, tryCloudGeneration } from '@/lib/ai/server-routing';
import type { AiDataMode } from '@/lib/privacy/ai-data';

type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string };

interface CallAiOptions {
  messages: AiMessage[];
  maxTokens: number;
  temperature: number;
  /** Raw ai prefs from req body — passed straight to resolveAiRuntimeRequest */
  aiPrefs?: unknown;
  /** Privacy mode from the client settings */
  privacyMode?: AiDataMode;
  /** Always-available fallback — called when all AI providers fail */
  offlineFallback: () => string;
}

interface CallAiResult {
  result: string;
  source: 'groq' | 'grok' | 'openai' | 'local' | 'offline';
}

/**
 * Try AI providers in order: cloud router → Ollama → offline fallback.
 * Never throws — always returns a usable result.
 */
export async function callAi(opts: CallAiOptions): Promise<CallAiResult> {
  const { messages, maxTokens, temperature, aiPrefs, privacyMode = 'full', offlineFallback } = opts;
  const { mode, localModel, cloudModel } = resolveAiRuntimeRequest({ ai: aiPrefs });

  if (privacyMode === 'offline') {
    return { result: offlineFallback(), source: 'offline' };
  }

  // 1. Cloud providers
  if (shouldTryCloud(mode)) {
    const r = await tryCloudGeneration({
      model: cloudModel,
      messages,
      maxTokens,
    });
    if (r.ok && r.content.trim()) return { result: r.content.trim(), source: r.source };
  }

  // 2. Ollama (local open-source)
  if (shouldTryLocal(mode)) {
    const ollamaBase = process.env.OLLAMA_URL ?? 'http://localhost:11434';
    try {
      const res = await fetch(`${ollamaBase}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: localModel ?? 'llama3.2',
          messages,
          max_tokens: maxTokens,
          temperature,
          stream: false,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (res.ok) {
        const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content?.trim() ?? '';
        if (content) return { result: content, source: 'local' };
      }
    } catch { /* fall through to offline */ }
  }

  // 3. Offline deterministic fallback — always works, no network needed
  return { result: offlineFallback(), source: 'offline' };
}
