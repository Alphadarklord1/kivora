/**
 * Groq API client.
 *
 * Groq exposes an OpenAI-compatible REST API at https://api.groq.com/openai/v1,
 * so the same message format and response shape work — we just swap the base
 * URL and auth header. Groq hosts open-weight models (Llama, Mixtral, Gemma,
 * DeepSeek-R1 distillations) on LPU hardware for very low latency.
 *
 * Environment variables:
 *   GROQ_API_KEY=gsk_...
 *
 * Optional:
 *   GROQ_MODEL_DEFAULT=llama-3.3-70b-versatile   (used as a fallback model name)
 */

import type { OpenAIMessage } from '@/lib/ai/openai';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export function getGroqApiKey(): string | undefined {
  return process.env.GROQ_API_KEY;
}

export function isGroqConfigured(): boolean {
  return Boolean(getGroqApiKey());
}

// ── Non-streaming call ────────────────────────────────────────────────────────

export async function callGroqChat(args: {
  model: string;
  messages: OpenAIMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<{ ok: true; content: string } | { ok: false; message: string; status?: number }> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    return { ok: false, message: 'GROQ_API_KEY is not configured.', status: 503 };
  }

  try {
    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        max_tokens: args.maxTokens ?? 1600,
        temperature: args.temperature ?? 0.7,
        stream: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const details = await response.text();
      return { ok: false, message: details || 'Groq request failed.', status: response.status };
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { ok: false, message: 'Groq returned an empty response.', status: 502 };
    }

    return { ok: true, content: content.trim() };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Groq request failed.',
      status: 502,
    };
  }
}

// ── Streaming call — returns raw fetch Response for SSE passthrough ──────────

export async function fetchGroqStream(args: {
  model: string;
  messages: OpenAIMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<Response | null> {
  const apiKey = getGroqApiKey();
  if (!apiKey) return null;

  try {
    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        max_tokens: args.maxTokens ?? 1600,
        temperature: args.temperature ?? 0.7,
        stream: true,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    return response.ok ? response : null;
  } catch {
    return null;
  }
}
