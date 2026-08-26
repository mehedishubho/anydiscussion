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
import { describe, it, expect, afterEach, vi } from "vitest";
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

// ============================================================
// Plan 07-07 / WR-06 — configurable trusted-hop count. The documented
// Cloudflare + Coolify topology (ADR 0001) has TWO appending proxies in front
// of the app: the chain seen by the app is
//   [client-spoofed prefix..., realClientIP (appended by Cloudflare),
//    cfEdgeIP (appended by the Coolify proxy)]
// so last-hop keying collapses every visitor into buckets keyed on the shared
// Cloudflare edge IP (forms effectively disabled site-wide). TRUSTED_XFF_HOP_
// COUNT selects the entry at position (entry count minus hop count) — the
// client IP as observed by the outermost trusted proxy.
//
// SEMANTICS CORRECTION vs the 07-REVIEW sample formula (recorded in the source
// docblock + 07-07-SUMMARY): the review's `hops[hops.length - 1 - n]` indexes
// one position further left than intended — applied with its stated default
// (n=1) it would select the client-spoofable FIRST hop on two-entry chains,
// regressing exactly the anti-spoofing property CR-01 leg 2 established and
// breaking the pinned multi-hop test above. The shipped shape instead selects
// hops[len - n] with a last-entry fallback for negative indices.
//
// The four default-env tests above MUST keep passing unchanged at the default
// (hop count 1 === today's last-hop behavior, byte-identical).
// ============================================================
describe("Plan 07-07 / WR-06: getClientIpFromXff — TRUSTED_XFF_HOP_COUNT selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hop count 2 on a three-hop chain → the CLIENT IP appended by the outermost trusted proxy (Cloudflare+Coolify topology)", () => {
    vi.stubEnv("TRUSTED_XFF_HOP_COUNT", "2");
    // "9.9.9.9" = client-spoofed prefix, "198.51.100.7" = real client IP
    // (appended by Cloudflare), "10.0.0.5" = the shared Coolify-proxy-appended
    // edge IP (what last-hop keying would wrongly select).
    expect(getClientIpFromXff("9.9.9.9, 198.51.100.7, 10.0.0.5")).toBe(
      "198.51.100.7",
    );
  });

  it("hop count 2 on a single-value header → still the value itself (chain shorter than the count falls back to the LAST hop — graceful, fail-closed direction)", () => {
    vi.stubEnv("TRUSTED_XFF_HOP_COUNT", "2");
    expect(getClientIpFromXff("203.0.113.42")).toBe("203.0.113.42");
  });

  it("hop count 2 on a chain shorter than the count (two entries) → falls back to the LAST entry, never the spoofable first hop", () => {
    vi.stubEnv("TRUSTED_XFF_HOP_COUNT", "3");
    // len 2 < count 3 → fallback must be the last entry (over-limit/shared-
    // bucket direction), NOT "1.2.3.4" (the client-supplied prefix).
    expect(getClientIpFromXff("1.2.3.4, 203.0.113.9")).toBe("203.0.113.9");
  });

  it("hop count \"0\" behaves identically to unset (treated as 1) — invalid configuration never widens trust toward the spoofable prefix", () => {
    vi.stubEnv("TRUSTED_XFF_HOP_COUNT", "0");
    expect(getClientIpFromXff("1.2.3.4, 203.0.113.9")).toBe("203.0.113.9");
  });

  it("negative hop count behaves identically to unset (treated as 1)", () => {
    vi.stubEnv("TRUSTED_XFF_HOP_COUNT", "-3");
    expect(getClientIpFromXff("1.2.3.4, 203.0.113.9")).toBe("203.0.113.9");
  });

  it("non-numeric hop count behaves identically to unset (NaN coerces to 1)", () => {
    vi.stubEnv("TRUSTED_XFF_HOP_COUNT", "banana");
    expect(getClientIpFromXff("1.2.3.4, 203.0.113.9")).toBe("203.0.113.9");
  });
});
