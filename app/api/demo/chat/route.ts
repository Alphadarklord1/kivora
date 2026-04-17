import { NextRequest } from 'next/server';
import { fetchGrokStream } from '@/lib/ai/grok';

// ── Simple in-memory rate limiter (resets on server restart) ──────────────
// Max 8 requests per IP per minute for the public demo
const WINDOW_MS  = 60_000;
const MAX_HITS   = 8;
const ipHits     = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_HITS - 1 };
  }
  if (entry.count >= MAX_HITS) {
    return { allowed: false, remaining: 0 };
  }
  entry.count += 1;
  return { allowed: true, remaining: MAX_HITS - entry.count };
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

const SYSTEM_PROMPT = `You are Kivora's AI study assistant — a sharp, helpful tutor.
Answer the user's study question clearly and concisely in 3–5 sentences.
Use plain text (no markdown, no bullet points). Be direct and educational.
If the question is not study-related, redirect them to a relevant study topic.`;

export async function POST(req: NextRequest) {
  const ip = getIp(req);
  const { allowed, remaining } = checkRateLimit(ip);

  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit reached. Try again in a minute.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 400) : '';

  if (!question) {
    return new Response(
      JSON.stringify({ error: 'question is required.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const model = process.env.GROK_MODEL_DEFAULT || 'grok-3-fast';

  const stream = await fetchGrokStream({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: question },
    ],
    maxTokens: 320,
    temperature: 0.6,
  });

  if (!stream || !stream.body) {
    return new Response(
      JSON.stringify({ error: 'AI unavailable. Check back later.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Forward the SSE stream straight to the client, stripping only auth headers
  return new Response(stream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Demo-Remaining': String(remaining),
    },
  });
}
