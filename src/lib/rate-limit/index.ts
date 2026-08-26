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
 * X-Forwarded-For header value (Plan 07-06 / CR-01 leg 2; Plan 07-07 / WR-06).
 *
 * Returns the entry at position (entry count − TRUSTED_XFF_HOP_COUNT), trimmed,
 * falling back to "unknown" for null / empty / blank results.
 *
 * Why count-from-the-RIGHT and never the first hop (07-REVIEW CR-01): the
 * tail entries are the ones our OWN appending proxies added — each proxy's
 * observation of the connection it served, not client-controllable. With the
 * default hop count 1 (a single appending proxy — this project's basic
 * deployment shape), the selection IS the last entry, i.e. the real client IP;
 * this is byte-identical to the pre-WR-06 last-hop behavior. The first hop,
 * by contrast, is client-supplied: a bot rotating fake X-Forwarded-For values
 * gets a fresh rate-limit budget per fake IP, so it must NEVER key a limiter.
 *
 * TRUSTED_XFF_HOP_COUNT = the number of trusted appending proxies whose
 * appended entries sit at the tail of the chain. Under the documented
 * Cloudflare + Coolify topology (ADR 0001) the app sees
 *   [client-spoofed prefix..., realClientIP (appended by Cloudflare),
 *    cfEdgeIP (appended by the Coolify proxy)]
 * — set the count to 2 so the selection lands on the Cloudflare-appended
 * client IP instead of the shared edge IP (which would collapse every visitor
 * into a handful of site-wide form buckets — WR-06).
 *
 * SEMANTICS CORRECTION vs the 07-REVIEW WR-06 sample formula: the review's
 * `hops[hops.length - 1 - n]` indexes one position further left than intended —
 * applied with its stated default (n=1) it would select the client-spoofable
 * FIRST hop on two-entry chains, regressing exactly the anti-spoofing property
 * CR-01 leg 2 established and breaking the pinned multi-hop test. The shipped
 * selection is hops[len − n] with a last-entry fallback for negative indices.
 *
 * Misconfiguration failure modes (both directions):
 *   - count set BELOW the real proxy count ⇒ the selection lands on an
 *     intermediate/adjacent proxy IP — callers share one bucket (forms
 *     over-limited site-wide; fail-closed, not weaponizable into a bypass).
 *   - count set ABOVE the real proxy count ⇒ the selection moves LEFT into
 *     the client-supplied prefix (spoofable — treat as misconfiguration).
 * Residual limitation, honestly: without CIDR validation of the appending
 * hops (the Better Auth `trustedProxies` mechanism — deliberately NOT
 * duplicated here per the review's minimal fix) a hop count higher than the
 * real chain is trusted on faith; the deploy runbook's two-client post-deploy
 * verification is the operational backstop for exactly this.
 *
 * Robustness rules: a chain SHORTER than the count falls back to the LAST
 * entry (over-limit/shared-bucket direction — never the spoofable prefix);
 * non-numeric, NaN, or sub-1 values coerce to 1 (invalid configuration never
 * widens trust toward the prefix).
 *
 * This is the single extraction style for the public-form limiters —
 * consumers must not invent a second one (the newsletter.ts docblock
 * contract). Better Auth's own auth-endpoint limiter uses a separate,
 * CIDR-based mechanism (`advanced.ipAddress.trustedProxies` in
 * src/lib/auth/index.ts) because it can strip the whole chain from the right;
 * Server Actions reading the raw header count from the right instead.
 */
export function getClientIpFromXff(forwardedFor: string | null): string {
  const hops = (forwardedFor ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (hops.length === 0) {
    return "unknown";
  }
  const parsed = Number(process.env.TRUSTED_XFF_HOP_COUNT ?? "1");
  const hopCount = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
  const clientIndex = hops.length - hopCount;
  // Negative index (chain shorter than the count) → LAST entry: fail toward
  // over-limiting (shared bucket), never toward the spoofable first hop.
  const selected =
    clientIndex >= 0 ? hops[clientIndex] : hops[hops.length - 1];
  return selected || "unknown";
}
