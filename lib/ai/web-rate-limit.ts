export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateBucket {
  count: number;
  windowStart: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

export class InMemoryRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly buckets = new Map<string, RateBucket>();

  constructor(config: RateLimitConfig) {
    this.windowMs = Math.max(1000, Number(config.windowMs) || 600_000);
    this.maxRequests = Math.max(1, Number(config.maxRequests) || 20);
  }

  check(key: string, now = Date.now()): RateLimitResult {
    this.prune(now);
    const bucketKey = key?.trim() || 'unknown';
    const bucket = this.buckets.get(bucketKey);

    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      this.buckets.set(bucketKey, { count: 1, windowStart: now });
      return {
        allowed: true,
        retryAfterSeconds: 0,
        remaining: this.maxRequests - 1,
      };
    }

    if (bucket.count >= this.maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((this.windowMs - (now - bucket.windowStart)) / 1000)
      );
      return {
        allowed: false,
        retryAfterSeconds,
        remaining: 0,
      };
    }

    bucket.count += 1;
    this.buckets.set(bucketKey, bucket);

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: this.maxRequests - bucket.count,
    };
  }

  private prune(now: number) {
    if (this.buckets.size < 512) return;
    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.windowStart >= this.windowMs) {
        this.buckets.delete(key);
      }
    }
  }
}
