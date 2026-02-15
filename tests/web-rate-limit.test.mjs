import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryRateLimiter } from '../lib/ai/web-rate-limit.ts';

test('allows requests until limit then blocks with retry time', () => {
  const limiter = new InMemoryRateLimiter({ windowMs: 10_000, maxRequests: 3 });
  const now = 1_000;

  const first = limiter.check('127.0.0.1', now);
  const second = limiter.check('127.0.0.1', now + 100);
  const third = limiter.check('127.0.0.1', now + 200);
  const fourth = limiter.check('127.0.0.1', now + 300);

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 2);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 1);
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);

  assert.equal(fourth.allowed, false);
  assert.equal(fourth.remaining, 0);
  assert.equal(fourth.retryAfterSeconds, 10);
});

test('resets counts after window elapses', () => {
  const limiter = new InMemoryRateLimiter({ windowMs: 1_000, maxRequests: 2 });
  const start = 10_000;

  limiter.check('client-a', start);
  limiter.check('client-a', start + 100);
  const blocked = limiter.check('client-a', start + 200);
  const reset = limiter.check('client-a', start + 1_001);

  assert.equal(blocked.allowed, false);
  assert.equal(reset.allowed, true);
  assert.equal(reset.remaining, 1);
});

test('tracks separate clients independently', () => {
  const limiter = new InMemoryRateLimiter({ windowMs: 5_000, maxRequests: 1 });

  const a = limiter.check('ip-a', 1_000);
  const b = limiter.check('ip-b', 1_000);
  const aBlocked = limiter.check('ip-a', 1_100);

  assert.equal(a.allowed, true);
  assert.equal(b.allowed, true);
  assert.equal(aBlocked.allowed, false);
});
