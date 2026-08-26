// src/lib/rate-limit/index.ts
// [CITED: 06-01-PLAN.md Task 3 <action> — original D-07 in-memory per-IP rate limiting]
// [CITED: 07-02-PLAN.md Task 3 — migrated to Redis-backed @upstash/ratelimit via adapter]
// [CITED: 07-RESEARCH.md Pattern 3 lines 414-447 — adapter sketch + Pitfall 1]
//
// Contact form rate limiter. Originally (Plan 06-01) an in-memory Map; migrated
// (Plan 07-02 / PERF-04 / D-01) to a Redis-backed `@upstash/ratelimit` instance
// via the ioredis adapter in `./upstash-ioredis-adapter`. The in-memory Map is
// GONE — Coolify redeploy would have reset it silently, defeating the limiter.
//
// Policy unchanged from Plan 06-01: 5 submissions per IP per 1 hour. The
// migration is policy-neutral (only the storage substrate changed).
//
// The old `tryConsume(ip, limit, windowMs)` synchronous signature is REMOVED;
// the new `contactFormLimiter.limit(ip)` is async. The single consumer
// (`src/actions/contact.ts`) is migrated in the same plan.
//
// 260824-3l2 adds `newsletterLimiter` (D-05) — the same sliding-window policy
// over its own adapter instance + `ratelimit:newsletter` prefix, consumed by
// `src/actions/newsletter.ts` subscribeNewsletter.
//
// Plan 07-06 (CR-01 leg 2) adds `getClientIpFromXff` — the ONE shared client-IP
// extraction for the public-form limiters (contact + newsletter). It replaces
// the per-action first-hop `split(",")[0]` extraction, which keyed the limiters
// on a client-spoofable value under an appending proxy (07-REVIEW CR-01:
// header rotation = unlimited fresh 5/h budgets).
//
// Server-only — NO "use client" directive.

export {
  contactFormLimiter,
  newsletterLimiter,
} from "./upstash-ioredis-adapter";

/**
 * getClientIpFromXff — extract the rate-limit client IP from an
 * X-Forwarded-For header value (Plan 07-06 / CR-01 leg 2).
 *
 * Returns the LAST comma-separated entry of the chain, trimmed, falling back
 * to "unknown" for null / empty / blank results.
 *
 * Why the LAST hop and not the first (07-REVIEW CR-01): the last hop is the
 * entry our OWN appending proxy added — the proxy's observation of the
 * connection it served, not client-controllable. Under a single-proxy topology
 * (this project's deployment shape) it IS the real client IP. The first hop,
 * by contrast, is client-supplied: a bot rotating fake X-Forwarded-For values
 * gets a fresh rate-limit budget per fake IP, so it must NEVER key a limiter.
 *
 * Multi-proxy topologies (chain longer than proxy + client): the last hop is
 * the ADJACENT proxy, not the client — adjacent callers then share one bucket.
 * That over-limits (fail-closed), never under-limits: it cannot be weaponized
 * into a bypass, which is the correct failure direction for abuse controls.
 *
 * This is the single extraction style for the public-form limiters —
 * consumers must not invent a second one (the newsletter.ts docblock
 * contract). Better Auth's own auth-endpoint limiter uses a separate,
 * CIDR-based mechanism (`advanced.ipAddress.trustedProxies` in
 * src/lib/auth/index.ts) because it can strip the whole chain from the right;
 * Server Actions reading the raw header cannot, hence last-hop here.
 */
export function getClientIpFromXff(forwardedFor: string | null): string {
  const lastHop = forwardedFor?.split(",").pop()?.trim();
  return lastHop || "unknown";
}
