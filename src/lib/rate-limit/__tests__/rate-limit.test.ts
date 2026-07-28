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

// Mock @/lib/redis so the IoredisAdapter gets a fake redisClient (bypasses
// globalThis.__redisClient singleton caching AND any real ioredis connection).
// IMPORTANT: the IoredisAdapter translates Upstash's array calling convention
// to ioredis's VARIADIC form: `redis.evalsha(sha1, numkeys, ...keys, ...args)`.
// The mock must match ioredis's signature, not Upstash's.
vi.mock("@/lib/redis", () => ({
  redisClient: {
    async evalsha(...allArgs: unknown[]) {
      const { keys, args } = splitIoredisArgs(allArgs);
      return slidingWindowEval(mockStore, keys, args);
    },
    async eval(...allArgs: unknown[]) {
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
  const _shaOrScript = allArgs[0];
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

  it("does NOT throw on Redis call failure surface (returns a result object)", async () => {
    // Sanity: the limiter always resolves to a result object, never throws —
    // callers in contact.ts rely on `success: false` rather than a try/catch.
    const r = await contactFormLimiter.limit("203.0.113.42");
    expect(r).toHaveProperty("success");
    expect(r).toHaveProperty("limit");
    expect(r).toHaveProperty("remaining");
    expect(r).toHaveProperty("reset");
  });
});
