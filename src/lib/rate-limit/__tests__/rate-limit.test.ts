// src/lib/rate-limit/__tests__/rate-limit.test.ts
// [CITED: 06-VALIDATION.md Wave 0 row "rate-limit — per-IP windowed limit"]
// [CITED: 06-01-PLAN.md Task 3 <behavior> — D-07 in-memory rate limiting]
//
// Wave-0 tests for tryConsume. These tests verify:
//   - D-07: tryConsume returns true for the first N requests from the same IP.
//   - tryConsume returns false for request N+1 within the same window.
//   - tryConsume resets after the window elapses (returns true again).
//   - Different IPs have independent counters.
//
// Uses vi.useFakeTimers to simulate window elapse without real waiting.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tryConsume, resetRateLimit } from "../index";

describe("D-07 / tryConsume — in-memory per-IP rate limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRateLimit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for the first N requests from the same IP", () => {
    const windowMs = 60_000;
    const limit = 5;
    for (let i = 0; i < limit; i++) {
      expect(tryConsume("1.2.3.4", limit, windowMs)).toBe(true);
    }
  });

  it("returns false for request N+1 from the same IP within the window", () => {
    const windowMs = 60_000;
    const limit = 3;
    tryConsume("1.2.3.4", limit, windowMs);
    tryConsume("1.2.3.4", limit, windowMs);
    tryConsume("1.2.3.4", limit, windowMs);
    expect(tryConsume("1.2.3.4", limit, windowMs)).toBe(false);
  });

  it("resets after the window elapses (returns true again)", () => {
    const windowMs = 60_000;
    const limit = 2;
    tryConsume("1.2.3.4", limit, windowMs);
    tryConsume("1.2.3.4", limit, windowMs);
    expect(tryConsume("1.2.3.4", limit, windowMs)).toBe(false);

    // Advance past the window.
    vi.advanceTimersByTime(windowMs + 1);
    expect(tryConsume("1.2.3.4", limit, windowMs)).toBe(true);
  });

  it("tracks different IPs independently", () => {
    const windowMs = 60_000;
    const limit = 1;
    expect(tryConsume("1.1.1.1", limit, windowMs)).toBe(true);
    expect(tryConsume("1.1.1.1", limit, windowMs)).toBe(false);
    // Different IP — should get its own allowance.
    expect(tryConsume("2.2.2.2", limit, windowMs)).toBe(true);
  });

  it("handles unknown IP gracefully", () => {
    expect(tryConsume("unknown", 1, 60_000)).toBe(true);
    expect(tryConsume("unknown", 1, 60_000)).toBe(false);
  });
});
