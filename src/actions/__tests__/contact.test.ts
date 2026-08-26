// src/actions/__tests__/contact.test.ts
// [CITED: 07-07-PLAN.md Task 1 <behavior> — the submitContact returned-state
//  contract suite (CR-02 / 07-VERIFICATION gap #6)]
// [CITED: src/actions/__tests__/newsletter.test.ts — the mock scaffold this file
//  mirrors (vi.hoisted + vi.mock of @/lib/rate-limit, next/headers, settings,
//  email); subscribeNewsletter is the reference returned-state shape]
// [CITED: 07-REVIEW.md CR-02 — React's production flight serializer emits
//  digest-only error chunks (emitErrorChunk stringifies {digest} only), so a
//  THROWN Error("RATE_LIMITED") never reaches the client as err.message in
//  production builds. The contract must be RETURNED, mirroring
//  subscribeNewsletter (newsletter.ts:198-205).]
//
// Plan 07-07 / CR-02: submitContact returns the discriminated union
//   { ok: true } | { ok: false; error: "RATE_LIMITED" | "INVALID_INPUT" }
// and NEVER throws on its defined public paths. These tests pin:
//   - schema-invalid input → INVALID_INPUT (parse via safeParse, limiter
//     + sendEmail never reached)
//   - honeypot filled → silent { ok: true } (limiter + sendEmail never reached)
//   - limiter success:false → RATE_LIMITED (sendEmail never reached)
//   - limiter REJECTION (Redis outage) → RATE_LIMITED — fail-closed, the
//     action itself never throws
//   - happy path → { ok: true }, sendEmail fired once at the configured
//     recipient
//   - empty configured recipient → FALLBACK_RECIPIENT (admin@anydiscussion.com)
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  headersMock,
  contactLimiterMock,
  clientIpHelperMock,
  getSettingMock,
  sendEmailMock,
} = vi.hoisted(() => ({
  headersMock: vi.fn(),
  contactLimiterMock: vi.fn(),
  // The shared getClientIpFromXff helper as a spy (same shape as
  // newsletter.test.ts). The action must route the raw header THROUGH the one
  // shared helper — the "do not invent a second style" contract.
  clientIpHelperMock: vi.fn(),
  getSettingMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: (...a: unknown[]) => headersMock(...a),
}));

// @/lib/rate-limit — controllable contactFormLimiter mock + the shared
// getClientIpFromXff helper as a spy. The helper's real contract is unit-tested
// in src/lib/rate-limit/__tests__/client-ip.test.ts; here the spy's default
// implementation (installed in beforeEach) reproduces it faithfully.
vi.mock("@/lib/rate-limit", () => ({
  contactFormLimiter: { limit: (...a: unknown[]) => contactLimiterMock(...a) },
  getClientIpFromXff: (...a: unknown[]) => clientIpHelperMock(...a),
}));

vi.mock("@/actions/settings", () => ({
  getSetting: (...a: unknown[]) => getSettingMock(...a),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...a: unknown[]) => sendEmailMock(...a),
}));

import { submitContact } from "../contact";

const validInput = () => ({
  name: "Jane Doe",
  email: "jane@example.com",
  subject: "Hello",
  message: "A real message",
  website: "", // honeypot — empty for a real user
});

describe("Plan 07-07 / CR-02 (gap #6): submitContact — returned-state contract (never thrown)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default happy-path surroundings: forwarded IP present, limiter allows,
    // recipient configured, email send resolves.
    headersMock.mockResolvedValue({
      get: (k: string) => (k === "x-forwarded-for" ? "203.0.113.7" : null),
    });
    contactLimiterMock.mockResolvedValue({ success: true });
    getSettingMock.mockResolvedValue("inbox@example.com");
    sendEmailMock.mockResolvedValue(undefined);
    // Faithful default implementation of the shared last-hop helper (the real
    // module's contract is pinned in client-ip.test.ts).
    clientIpHelperMock.mockImplementation(
      (forwardedFor: string | null) =>
        forwardedFor?.split(",").pop()?.trim() || "unknown",
    );
  });

  it("schema-invalid input (missing message) → { ok: false, error: 'INVALID_INPUT' }; limiter + sendEmail NEVER called", async () => {
    const { message: _message, ...withoutMessage } = validInput();
    void _message; // discarded on purpose — building the schema-invalid variant

    const result = await submitContact(withoutMessage);

    expect(result).toEqual({ ok: false, error: "INVALID_INPUT" });
    expect(contactLimiterMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("honeypot filled → silent { ok: true }; limiter + sendEmail NEVER called (bot thinks it worked)", async () => {
    const result = await submitContact({
      ...validInput(),
      website: "http://spam.example",
    });

    expect(result).toEqual({ ok: true });
    expect(contactLimiterMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("limiter success:false → { ok: false, error: 'RATE_LIMITED' }; sendEmail NEVER called", async () => {
    contactLimiterMock.mockResolvedValue({ success: false });

    const result = await submitContact(validInput());

    expect(result).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  // The production-critical case (07-REVIEW CR-02): the Redis-outage path must
  // surface as a RETURNED error state. The action catches the limiter rejection
  // internally — a raw internal error never crosses to the public form, and the
  // action itself never throws.
  it("limiter REJECTION (Redis outage) → { ok: false, error: 'RATE_LIMITED' } — fail-closed, the action never throws", async () => {
    contactLimiterMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await submitContact(validInput());

    expect(result).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("limiter success + configured recipient → { ok: true }; sendEmail called once with to 'inbox@example.com'", async () => {
    const result = await submitContact(validInput());

    expect(result).toEqual({ ok: true });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "inbox@example.com" }),
    );
  });

  it("empty configured recipient → falls back to the FALLBACK_RECIPIENT (admin@anydiscussion.com)", async () => {
    getSettingMock.mockResolvedValue("");

    const result = await submitContact(validInput());

    expect(result).toEqual({ ok: true });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admin@anydiscussion.com" }),
    );
  });
});
