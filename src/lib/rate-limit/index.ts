// src/lib/rate-limit/index.ts
// [CITED: 06-01-PLAN.md Task 3 <action> — D-07 in-memory per-IP rate limiting]
// [CITED: 06-PATTERNS.md L366-370 — NO ANALOG: new pattern (Map-based cache)]
// [CITED: 06-RESEARCH.md D-07 — single-instance v1; v2 swaps for Redis (SCALE-01)]
//
// Simple in-memory rate limiter. A module-level Map<ip, { count, resetAt }>
// tracks per-IP request counts within a sliding window. Single-instance only
// (v1 — the Coolify deploy is a single replica). v2 swaps for Redis (SCALE-01).
//
// The ONLY consumer this phase is src/actions/contact.ts (the Contact form).
//
// Server-only — NO "use client" directive.

/** Per-IP rate-limit entry. */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/** Module-level store — single-instance (v1). */
const store = new Map<string, RateLimitEntry>();

/**
 * Try to consume one unit from the rate-limit allowance for the given IP.
 *
 * @param ip        The client IP (from x-forwarded-for or "unknown").
 * @param limit     Maximum requests allowed within the window.
 * @param windowMs  Window duration in milliseconds.
 * @returns         true if the request is allowed (under limit), false if exceeded.
 */
export function tryConsume(
  ip: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = store.get(ip);

  // No entry OR window expired → start a fresh window with count = 1.
  if (!entry || now >= entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  // Under the limit → increment and allow.
  if (entry.count < limit) {
    entry.count++;
    return true;
  }

  // Over the limit within the window → deny.
  return false;
}

/**
 * Clear all rate-limit entries. Exported for testing (so each test starts clean).
 */
export function resetRateLimit(): void {
  store.clear();
}
