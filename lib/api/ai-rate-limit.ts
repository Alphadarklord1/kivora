import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
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
const rateLimiter = globalForRateLimiter.__kivoraAiRouteLimiter ?? new InMemoryRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: RATE_LIMIT_MAX,
});
globalForRateLimiter.__kivoraAiRouteLimiter = rateLimiter;

/**
 * Derive a rate-limit key resistant to x-forwarded-for spoofing.
 *
 * Priority:
 *  1. NextAuth session token cookie — tied to a real authenticated session
 *  2. CF-Connecting-IP / x-real-ip — set by edge/proxy, not the client
 *  3. x-forwarded-for first hop — least trusted, used as last resort
 *
 * The key is hashed so we never store raw session tokens or IPs in memory.
 */
function resolveRateLimitKey(request: NextRequest): string {
  const sessionToken =
    request.cookies.get('next-auth.session-token')?.value ||
    request.cookies.get('__Secure-next-auth.session-token')?.value;

  const raw =
    sessionToken ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';

  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export function enforceAiRateLimit(request: NextRequest): Response | null {
  const rateDecision = rateLimiter.check(resolveRateLimitKey(request));
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
