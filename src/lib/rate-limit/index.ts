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
// Server-only — NO "use client" directive.

export { contactFormLimiter } from "./upstash-ioredis-adapter";
