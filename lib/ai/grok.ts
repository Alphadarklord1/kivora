/**
 * Grok (xAI) API client.
 *
 * Grok uses an OpenAI-compatible REST API at https://api.x.ai/v1, so the
 * same message format and response shape work — we just swap the base URL
 * and auth header.
 *
 * Environment variables (add ONE of these to .env.local):
 *   GROK_API_KEY=xai-...
 *   XAI_API_KEY=xai-...   (alias — whichever you prefer)
 */

import type { OpenAIMessage } from '@/lib/ai/openai';

export const GROK_BASE_URL = 'https://api.x.ai/v1';

export function getGrokApiKey(): string | undefined {
  return process.env.GROK_API_KEY ?? process.env.XAI_API_KEY;
}

export function isGrokConfigured(): boolean {
  return Boolean(getGrokApiKey());
}

// ── Non-streaming call ────────────────────────────────────────────────────────

export async function callGrokChat(args: {
  model: string;
  messages: OpenAIMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<{ ok: true; content: string } | { ok: false; message: string; status?: number }> {
  const apiKey = getGrokApiKey();
  if (!apiKey) {
    return { ok: false, message: 'GROK_API_KEY is not configured.', status: 503 };
  }

  try {
    const response = await fetch(`${GROK_BASE_URL}/chat/completions`, {
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
      return { ok: false, message: details || 'Grok request failed.', status: response.status };
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { ok: false, message: 'Grok returned an empty response.', status: 502 };
    }

    return { ok: true, content: content.trim() };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Grok request failed.',
      status: 502,
    };
  }
}

// ── Streaming call — returns raw fetch Response for SSE passthrough ──────────

export async function fetchGrokStream(args: {
  model: string;
  messages: OpenAIMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<Response | null> {
  const apiKey = getGrokApiKey();
  if (!apiKey) return null;

  try {
    const response = await fetch(`${GROK_BASE_URL}/chat/completions`, {
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
