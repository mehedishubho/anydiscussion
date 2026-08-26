// src/lib/rate-limit/__tests__/client-ip.test.ts
// [CITED: 07-06-PLAN.md Task 1 <behavior> tests 1-4 — the pure-function contract
//  for the shared last-hop XFF extraction helper (CR-01 leg 2)]
// [CITED: 07-REVIEW.md CR-01 — the FIRST XFF hop is client-supplied under an
//  appending proxy and must never key a limiter; the LAST hop is the entry our
//  own appending proxy added]
//
// Pure-function tests for getClientIpFromXff — no mocks. The helper is a pure
// string transform (last comma-separated entry, trimmed, "unknown" fallback),
// and importing ../index is side-effect-free here: @/lib/redis constructs its
// singleton with lazyConnect:true (no TCP connection at module load). The
// action-level consumer behavior (contact.ts / newsletter.ts key their limiters
// through this one shared helper) is pinned in
// src/actions/__tests__/newsletter.test.ts (multi-hop + rejection tests).
import { describe, it, expect } from "vitest";
import { getClientIpFromXff } from "../index";

describe("Plan 07-06 / CR-01 leg 2: getClientIpFromXff — last-hop XFF extraction", () => {
  it("single value → returned unchanged (local dev + the existing single-value harness behave identically)", () => {
    expect(getClientIpFromXff("203.0.113.42")).toBe("203.0.113.42");
  });

  it("multi-value → the LAST hop wins; the client-injected first hop is ignored", () => {
    // Under an appending proxy, "1.2.3.4" is client-supplied (spoofable) and
    // "203.0.113.9" is the proxy-appended observation. Keying on the first hop
    // would give an attacker a fresh budget per fake IP (07-REVIEW CR-01).
    expect(getClientIpFromXff("1.2.3.4, 203.0.113.9")).toBe("203.0.113.9");
  });

  it("whitespace after the comma and at the end is trimmed", () => {
    expect(getClientIpFromXff("1.2.3.4 , 5.6.7.8 ")).toBe("5.6.7.8");
  });

  it("null / empty / blank → \"unknown\" (the shared limiter fallback)", () => {
    expect(getClientIpFromXff(null)).toBe("unknown");
    expect(getClientIpFromXff("")).toBe("unknown");
    expect(getClientIpFromXff("   ")).toBe("unknown");
  });
});
