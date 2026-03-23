/**
 * Wraps fetch and parses 429 RATE_LIMITED responses into a structured error.
 * Consumers can catch RateLimitedError to show a user-facing retry countdown.
 */

export function emitRateLimitEvent(err: RateLimitedError) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('kivora:rate-limited', {
      detail: { retryAfterSeconds: err.retryAfterSeconds, reason: err.reason },
    }),
  );
}

export class RateLimitedError extends Error {
  constructor(public retryAfterSeconds: number, public reason: string) {
    super(`Rate limited. Retry in ${retryAfterSeconds}s.`);
    this.name = 'RateLimitedError';
  }
}

export async function fetchWithRateLimit(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status === 429) {
    let retryAfter = 60;
    let reason = 'Too many requests. Please wait a moment.';
    try {
      const body = await res.clone().json();
      if (body.errorCode === 'RATE_LIMITED') {
        retryAfter = body.retryAfterSeconds ?? retryAfter;
        reason = body.reason ?? reason;
      }
    } catch { /* not JSON */ }
    throw new RateLimitedError(retryAfter, reason);
  }

  return res;
}
