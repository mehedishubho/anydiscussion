// src/lib/rate-limit/__tests__/rate-limit.test.ts
// [CITED: 06-VALIDATION.md Wave 0 row "rate-limit — per-IP windowed limit"]
// [CITED: 07-02-PLAN.md Task 3 <behavior> — Redis-backed sliding window via @upstash/ratelimit]
// [CITED: 07-RESEARCH.md Pattern 3 lines 414-447 — adapter sketch + Validation Architecture]
//
// Wave-0 tests for contactFormLimiter (Plan 07-02 Task 3). These verify the
// migrated Redis-backed limiter preserves the original Phase-6 policy:
//   - First 5 submissions from the same IP within 1h return { success: true }.
//   - The 6th submission within the same 1h window returns { success: false }.
//
// `@/lib/redis` is mocked at the singleton boundary (one level above ioredis
// itself) so the test exercises our real IoredisAdapter + Ratelimit wiring
// without depending on globalThis singleton state leaked from other test
// files. The mock implements the @upstash/ratelimit slidingWindow semantics
// in JS (faithful port of the Lua script at @upstash/ratelimit@2.0.8
// dist/index.mjs line 206-249). The previous in-memory `tryConsume` Map +
// `vi.useFakeTimers` + `resetRateLimit` machinery is GONE — the new limiter is
// async and delegates to the (mocked) Redis adapter.
//
// IMPORTANT: `@upstash/ratelimit`'s `ephemeralCache` (default `Map`) memoizes
// blocked identifiers until their reset time. Without resetting, a block from
// one test would short-circuit Redis in the next. We reach into the limiter
// via `l["cache"]` to clear it before each test (the field is private in the
// type but extant at runtime — the library sets `ctx.cache = config.ephemeralCache ?? new Map()`).

import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory backing store for the mock Redis. Reset before each test.
let mockStore: Map<string, number>;

// WR-03 (Plan 07-06): hoisted mutable failure state wired into the mocked
// evalsha/eval below. Set `.current` to an Error to make every mocked Redis
// script call REJECT with it — a real Redis-outage simulation (the previous
// "does NOT throw" test never exercised this surface). Reset to null in
// beforeEach.
const { redisFailure } = vi.hoisted(() => ({
  redisFailure: { current: null as Error | null },
}));

// Mock @/lib/redis so the IoredisAdapter gets a fake redisClient (bypasses
// globalThis.__redisClient singleton caching AND any real ioredis connection).
// IMPORTANT: the IoredisAdapter translates Upstash's array calling convention
// to ioredis's VARIADIC form: `redis.evalsha(sha1, numkeys, ...keys, ...args)`.
// The mock must match ioredis's signature, not Upstash's.
vi.mock("@/lib/redis", () => ({
  redisClient: {
    async evalsha(...allArgs: unknown[]) {
      if (redisFailure.current) return Promise.reject(redisFailure.current);
      const { keys, args } = splitIoredisArgs(allArgs);
      return slidingWindowEval(mockStore, keys, args);
    },
    async eval(...allArgs: unknown[]) {
      if (redisFailure.current) return Promise.reject(redisFailure.current);
      const { keys, args } = splitIoredisArgs(allArgs);
      return slidingWindowEval(mockStore, keys, args);
    },
    async get(key: string) {
      const v = mockStore.get(key);
      return v === undefined ? null : String(v);
    },
    async set(key: string, value: unknown) {
      mockStore.set(key, Number(value));
      return "OK";
    },
    pipeline() {
      // v2.0.8 slidingWindow does not call pipeline; throw if invoked so we
      // notice if a future library version changes the call shape.
      throw new Error("pipeline() not expected in mock — slidingWindow uses evalsha");
    },
  },
}));

// Split ioredis's variadic signature `evalsha(sha1, numkeys, k1, k2, ..., a1, a2, ...)`
// back into the { keys, args } shape the slidingWindow algorithm expects.
function splitIoredisArgs(allArgs: unknown[]): { keys: string[]; args: unknown[] } {
  // allArgs[0] is sha1/script; allArgs[1] is numkeys; then numkeys keys; then args.
  const numkeys = Number(allArgs[1]);
  const keys = allArgs.slice(2, 2 + numkeys).map(String);
  const args = allArgs.slice(2 + numkeys);
  return { keys, args };
}

// Pure-JS sliding window — faithful port of @upstash/ratelimit@2.0.8
// slidingWindowLimitScript (Lua). The library checks `success = remaining >= 0`
// (dist/index.mjs line 1578) so returning -1 for the remaining slot signals
// "rate limited".
function slidingWindowEval(
  store: Map<string, number>,
  keys: string[],
  args: unknown[],
): [number, number] {
  const currentKey = keys[0];
  const previousKey = keys[1];
  // keys[2] is the dynamicLimitKey — empty string when dynamicLimits is off
  // (our config), so the optional dynamic-limit branch is skipped.
  const tokens = Number(args[0]);
  const now = Number(args[1]);
  const window = Number(args[2]);
  const incrementBy = Number(args[3] ?? 1);

  const current = store.get(currentKey) ?? 0;
  const previous = store.get(previousKey) ?? 0;
  const percentageInCurrent = (now % window) / window;
  const weightedPrevious = Math.floor(
    (1 - percentageInCurrent) * previous,
  );

  if (incrementBy > 0 && weightedPrevious + current >= tokens) {
    return [-1, tokens];
  }
  const newValue = current + incrementBy;
  store.set(currentKey, newValue);
  return [tokens - (newValue + weightedPrevious), tokens];
}

// Import AFTER vi.mock above is hoisted. vitest hoists vi.mock calls to the
// top of the file automatically, so this ordering is safe.
import { contactFormLimiter } from "../index";

// Reset the @upstash/ratelimit ephemeralCache (a Map<string, number>) between
// tests so a cached block from one test does not short-circuit Redis in the
// next. The cache field is private at the TYPE level but exists at runtime
// (RegionRatelimit constructor sets it from config.ephemeralCache ?? new Map()).
function resetEphemeralCache() {
  const cache = (contactFormLimiter as unknown as { cache?: Map<string, number> }).cache;
  if (cache instanceof Map) {
    cache.clear();
  }
}

describe("Plan 07-02 / contactFormLimiter — Redis-backed sliding window (5 per 1h)", () => {
  beforeEach(() => {
    mockStore = new Map();
    redisFailure.current = null;
    resetEphemeralCache();
  });

  it("returns success=true for the first 5 submissions from the same IP", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await contactFormLimiter.limit("1.2.3.4");
      expect(r.success, `attempt ${i + 1} should succeed`).toBe(true);
    }
  });

  it("returns success=false on the 6th submission within the same hour", async () => {
    // Exhaust the 5-request budget.
    for (let i = 0; i < 5; i++) {
      await contactFormLimiter.limit("1.2.3.4");
    }
    // 6th attempt — over the budget.
    const r = await contactFormLimiter.limit("1.2.3.4");
    expect(r.success).toBe(false);
    expect(r.limit).toBe(5);
    expect(r.remaining).toBe(0);
  });

  it("tracks different IPs independently", async () => {
    // IP A uses its full budget.
    for (let i = 0; i < 5; i++) {
      const r = await contactFormLimiter.limit("10.0.0.1");
      expect(r.success).toBe(true);
    }
    // IP B should still get its own fresh budget.
    const r = await contactFormLimiter.limit("10.0.0.2");
    expect(r.success).toBe(true);
  });

  // WR-03 (Plan 07-06) — REPLACES the former "does NOT throw on Redis call
  // failure surface" test, which never actually simulated a failure and
  // certified the exact opposite of the truth: @upstash/ratelimit 2.0.8's
  // slidingWindow limit() has NO catch around safeEval, and safeEval RETHROWS
  // non-NOSCRIPT errors (dist index.mjs:147-156), so Redis failures PROPAGATE
  // to the caller. This is precisely why contact.ts wraps its
  // contactFormLimiter.limit() await in a try/catch mapping rejections to
  // Error("RATE_LIMITED") (WR-01, Plan 07-06 Task 1).
  it("propagates a Redis failure to the caller — documenting contact.ts's required catch (WR-03)", async () => {
    redisFailure.current = new Error("ECONNREFUSED");
    // FRESH IP (198.51.100.77 — RFC 5737 TEST-NET-2, unused by the other
    // tests): a cached blocked identifier would short-circuit BEFORE the Redis
    // call and never see the failure.
    await expect(contactFormLimiter.limit("198.51.100.77")).rejects.toThrow(
      "ECONNREFUSED",
    );
  });

  // WR-02 (Plan 07-06) — resetEphemeralCache must clear the REAL ephemeral
  // cache. The previous implementation read `limiter.cache`, which does not
  // exist (the cache lives at `ctx.cache`, wrapped in a Cache instance —
  // dist index.mjs:757-761), so it was a silent no-op: a block memoized by
  // one test would short-circuit Redis in a later test re-using the IP.
  it("resetEphemeralCache clears the memoized block (WR-02): after block + reset + FRESH store, the same IP hits Redis again", async () => {
    // Exhaust the budget: 5 succeed, 6th → success:false. The library
    // memoizes the block in the ephemeral cache until the window reset
    // (blockUntil — up to 1h for the "1 h" window).
    for (let i = 0; i < 5; i++) {
      await contactFormLimiter.limit("192.0.2.10");
    }
    const blocked = await contactFormLimiter.limit("192.0.2.10");
    expect(blocked.success).toBe(false);

    // Fresh Redis backing store + the reset helper under test.
    mockStore = new Map();
    resetEphemeralCache();

    // If the reset actually cleared the ephemeral cache, the SAME IP consults
    // the fresh store and succeeds again. With a no-op reset the stale block
    // short-circuits (reason "cacheBlock") and success stays false.
    const after = await contactFormLimiter.limit("192.0.2.10");
    expect(after.success).toBe(true);
  });
});
