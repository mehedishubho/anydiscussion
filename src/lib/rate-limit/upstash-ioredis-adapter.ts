// src/lib/rate-limit/upstash-ioredis-adapter.ts
// [CITED: github.com/upstash/ratelimit-js#106 — community adapter pattern;
//  RESEARCH.md Pattern 3 lines 414-447; Pitfall 1 lines 500-505]
//
// Adapter that exposes the ioredis singleton (`redisClient`) with the method
// shapes @upstash/ratelimit v2.x expects. The library's `RegionRatelimit`
// config type is `Pick<Redis, "evalsha" | "get" | "set">` (verified against
// @upstash/ratelimit@2.0.8 dist/index.d.ts line 573). At runtime, the
// singleRegion slidingWindow algorithm calls ONLY `evalsha(sha1, keys, args)`
// (with `eval(script, keys, args)` as the NOSCRIPT fallback — see
// @upstash/ratelimit dist/index.mjs line 147-156 `safeEval`).
//
// DEVIATION FROM PLAN (Rule 1 — bug fix): Plan 07-02 Task 3 <action> specified
// the adapter should expose `pipeline()` + `eval()` because Issue #115 (the
// community pattern) targets @upstash/ratelimit v1.x. Verified v2.0.8 no longer
// uses `pipeline()` for the slidingWindow algorithm — it calls `evalsha`
// directly. We implement BOTH the v2 contract (`evalsha`/`eval`/`get`/`set`)
// AND `pipeline()` (passthrough to ioredis's native chainable pipeline) so the
// adapter works against the installed version AND remains forward-compatible
// if a future minor reintroduces pipeline-based algorithms.
//
// NO @upstash/redis import (Pitfall 1 — that's the cloud REST client; the
// transitive dep stays in node_modules via @upstash/core-analytics but is
// never imported from our application code). `analytics: false` on the
// Ratelimit instance ensures @upstash/core-analytics is inert at runtime.
//
// Server-only — NO "use client" directive.
import { Ratelimit } from "@upstash/ratelimit";
import { redisClient } from "@/lib/redis";

/**
 * Minimal structural shape @upstash/ratelimit v2.x expects from a Redis client
 * (verified against @upstash/ratelimit@2.0.8 dist/index.d.ts line 573:
 * `type Redis = Pick<Redis$1, "evalsha" | "get" | "set">`). Defined locally
 * instead of imported from @upstash/redis to keep the cloud-REST SDK out of
 * our source graph (Pitfall 1).
 */
type UpstashRatelimitRedis = {
  evalsha(sha1: string, keys: string[], args: unknown[]): Promise<unknown>;
  eval(script: string, keys: string[], args: unknown[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: unknown): Promise<unknown>;
};

/**
 * Wraps the ioredis singleton so it matches @upstash/ratelimit's Redis
 * interface. ioredis's native signatures are variadic
 * (`evalsha(sha1, numkeys, ...keysAndArgs)`); the Upstash calling convention
 * passes `(sha1, keys[], args[])`. The adapter translates between the two.
 */
class IoredisAdapter implements UpstashRatelimitRedis {
  private redis = redisClient;

  async evalsha(sha1: string, keys: string[], args: unknown[]): Promise<unknown> {
    // ioredis: evalsha(sha1, numkeys, ...keys, ...args).
    // @ts-expect-error -- ioredis evalsha expects RedisValue[] variadic; @upstash/ratelimit's Store interface types args as unknown[] (cross-library type boundary).
    return this.redis.evalsha(sha1, keys.length, ...keys, ...args);
  }

  async eval(script: string, keys: string[], args: unknown[]): Promise<unknown> {
    // NOSCRIPT fallback path (see @upstash/ratelimit safeEval). Same variadic
    // translation as evalsha.
    // @ts-expect-error -- ioredis eval expects RedisValue[] variadic; @upstash/ratelimit's Store interface types args as unknown[] (cross-library type boundary).
    return this.redis.eval(script, keys.length, ...keys, ...args);
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: unknown): Promise<unknown> {
    return this.redis.set(key, value as string);
  }

  /**
   * Defense-in-depth — passthrough to ioredis's native chainable pipeline.
   * NOT called by @upstash/ratelimit v2.0.8's slidingWindow algorithm (which
   * uses `evalsha` directly), but kept for the plan's verification contract
   * and to remain compatible with any future algorithm that reintroduces
   * pipeline-based commands (the v1 pattern from Issue #115).
   */
  pipeline() {
    return this.redis.pipeline();
  }
}

/**
 * Contact form rate limiter (D-01 — Contact form path).
 *
 * Policy: 5 submissions per IP per 1 hour. Matches the previous in-memory
 * limiter's RATE_LIMIT_MAX/RATE_LIMIT_WINDOW_MS (Plan 06-01) so the migration
 * is policy-neutral. Backed by the self-hosted Redis via the IoredisAdapter
 * (NOT @upstash/redis cloud REST — Pitfall 1).
 *
 * `analytics: false` ensures the transitive @upstash/core-analytics module
 * (which depends on @upstash/redis) is never invoked at runtime.
 */
export const contactFormLimiter = new Ratelimit({
  // @ts-expect-error -- @upstash/ratelimit's Ratelimit config.redis expects a generic Redis<TData>; IoredisAdapter implements the structural shape (evalsha/eval/get/set per @upstash/ratelimit@2.0.8 dist/index.d.ts line 573) but TS cannot reconcile the TData generic. Runtime-correct: the slidingWindow algorithm calls only evalsha/eval/get/set, all of which are implemented.
  redis: new IoredisAdapter(),
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  prefix: "ratelimit:contact",
  analytics: false,
});

/**
 * Newsletter subscribe rate limiter (260824-3l2 D-05).
 *
 * Policy: 5 subscribes per IP per 1 hour — the same policy as the contact
 * form (260824-3l2 research A2; independently tunable since the instance is
 * separate). Second Ratelimit over a NEW IoredisAdapter instance with its own
 * prefix so the newsletter counters never collide with contact counters.
 * Backed by the self-hosted Redis via the same structural adapter (NOT the
 * in-memory fallback — that was deliberately removed in 07-02 and is NOT
 * reintroduced). `analytics: false` keeps @upstash/core-analytics inert.
 */
export const newsletterLimiter = new Ratelimit({
  // @ts-expect-error -- same structural-adapter note as contactFormLimiter above: IoredisAdapter implements the evalsha/eval/get/set shape @upstash/ratelimit@2.0.8's slidingWindow algorithm calls; TS cannot reconcile the TData generic across the cross-library type boundary.
  redis: new IoredisAdapter(),
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  prefix: "ratelimit:newsletter",
  analytics: false,
});
