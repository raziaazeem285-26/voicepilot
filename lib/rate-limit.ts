// In-memory sliding-window rate limiter (per key).
// NOTE: single-process only. For multi-instance production use Redis.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  if (b.count >= limit) return { allowed: false, remaining: 0, resetAt: b.resetAt };
  b.count += 1;
  return { allowed: true, remaining: limit - b.count, resetAt: b.resetAt };
}

/** Periodic cleanup to avoid unbounded growth (call from a route or test). */
export function pruneRateLimitBuckets(): number {
  const now = Date.now();
  let removed = 0;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) {
      buckets.delete(k);
      removed += 1;
    }
  }
  return removed;
}
