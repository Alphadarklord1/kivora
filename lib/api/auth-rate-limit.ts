/**
 * Rate limiter for sensitive non-AI endpoints:
 * - Registration: 10 attempts per hour per IP
 * - Share token lookup: 30 attempts per minute per IP
 * - Password change: 5 attempts per 15 minutes per IP
 */
import { NextRequest } from 'next/server';
import { InMemoryRateLimiter } from '@/lib/ai/web-rate-limit';

type GlobalWithLimiters = typeof globalThis & {
  __kivoraRegisterLimiter?: InMemoryRateLimiter;
  __kivoraShareLimiter?: InMemoryRateLimiter;
  __kivoraPasswordLimiter?: InMemoryRateLimiter;
};

const g = globalThis as GlobalWithLimiters;

const registerLimiter = g.__kivoraRegisterLimiter ??= new InMemoryRateLimiter({ windowMs: 3_600_000, maxRequests: 10 });
const shareLimiter    = g.__kivoraShareLimiter    ??= new InMemoryRateLimiter({ windowMs: 60_000,    maxRequests: 30 });
const passwordLimiter = g.__kivoraPasswordLimiter ??= new InMemoryRateLimiter({ windowMs: 900_000,   maxRequests: 5  });

g.__kivoraRegisterLimiter = registerLimiter;
g.__kivoraShareLimiter    = shareLimiter;
g.__kivoraPasswordLimiter = passwordLimiter;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function tooManyResponse(retryAfterSeconds: number) {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.', retryAfterSeconds }),
    { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSeconds) } },
  );
}

export function checkRegisterLimit(req: NextRequest): Response | null {
  const r = registerLimiter.check(clientIp(req));
  return r.allowed ? null : tooManyResponse(r.retryAfterSeconds);
}

export function checkShareLimit(req: NextRequest): Response | null {
  const r = shareLimiter.check(clientIp(req));
  return r.allowed ? null : tooManyResponse(r.retryAfterSeconds);
}

export function checkPasswordLimit(req: NextRequest): Response | null {
  const r = passwordLimiter.check(clientIp(req));
  return r.allowed ? null : tooManyResponse(r.retryAfterSeconds);
}
