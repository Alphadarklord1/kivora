import { NextRequest } from 'next/server';
import { InMemoryRateLimiter } from '@/lib/ai/web-rate-limit';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

const RATE_LIMIT_WINDOW_MS = parsePositiveInt(process.env.WEB_AI_RATE_LIMIT_WINDOW_MS, 600_000);
const RATE_LIMIT_MAX = parsePositiveInt(process.env.WEB_AI_RATE_LIMIT_MAX, 20);

type GlobalWithRateLimiter = typeof globalThis & {
  __kivoraAiRouteLimiter?: InMemoryRateLimiter;
};

const globalForRateLimiter = globalThis as GlobalWithRateLimiter;
const rateLimiter = globalForRateLimiter.__kivoraAiRouteLimiter || new InMemoryRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: RATE_LIMIT_MAX,
});
globalForRateLimiter.__kivoraAiRouteLimiter = rateLimiter;

function resolveClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function enforceAiRateLimit(request: NextRequest): Response | null {
  const rateDecision = rateLimiter.check(resolveClientIp(request));
  if (rateDecision.allowed) return null;

  return new Response(
    JSON.stringify({
      errorCode: 'RATE_LIMITED',
      reason: 'Too many AI requests. Please retry shortly.',
      retryAfterSeconds: rateDecision.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(rateDecision.retryAfterSeconds),
      },
    },
  );
}
