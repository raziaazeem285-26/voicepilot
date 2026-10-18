// Login brute-force protection: per-account failed-attempt tracking with
// progressive lockout. In-memory (single-process); for multi-instance move to Redis.
// This complements the per-IP rate limit on the signin route (advisor fix).
type Entry = { failures: number; lockedUntil: number; firstFailureAt: number };

const attempts = new Map<string, Entry>();

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

export function isLocked(email: string, now = Date.now()): boolean {
  const e = attempts.get(email.toLowerCase());
  if (!e) return false;
  if (e.lockedUntil > now) return true;
  if (now - e.firstFailureAt > WINDOW_MS) attempts.delete(email.toLowerCase());
  return false;
}

export function lockoutRemainingSec(email: string, now = Date.now()): number {
  const e = attempts.get(email.toLowerCase());
  if (!e || e.lockedUntil <= now) return 0;
  return Math.ceil((e.lockedUntil - now) / 1000);
}

/** Record a failed login. Returns true when this failure triggered a lockout. */
export function recordFailure(email: string, now = Date.now()): boolean {
  const key = email.toLowerCase();
  let e = attempts.get(key);
  if (!e || now - e.firstFailureAt > WINDOW_MS) {
    e = { failures: 0, lockedUntil: 0, firstFailureAt: now };
  }
  e.failures += 1;
  if (e.failures >= MAX_FAILURES) {
    e.lockedUntil = now + LOCK_MS;
    attempts.set(key, e);
    return true;
  }
  attempts.set(key, e);
  return false;
}

/** Clear on successful login. */
export function clearFailures(email: string): void {
  attempts.delete(email.toLowerCase());
}

/** Test-only: reset all state. */
export function _resetLockouts(): void {
  attempts.clear();
}
