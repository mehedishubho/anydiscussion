// __tests__/middleware.test.ts
// [CITED: VALIDATION.md AUTH-03 rows — proxy.ts redirect logic; RESEARCH.md Pattern 4]
// Unit tests for the Next 16 proxy.ts UX-only cookie gate.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Mock better-auth/cookies getSessionCookie — optimistic cookie-existence check.
// Tests control the return value per-case (Pitfall #4: proxy trusts cookie presence).
vi.mock("better-auth/cookies", () => ({
  getSessionCookie: vi.fn(),
}));

import { getSessionCookie } from "better-auth/cookies";

// Import the proxy AFTER the mock is registered so it picks up the mock.
// (src/proxy.ts — the file must sit in src/ for Next's functions-config-manifest
// discovery to see it.)
const { proxy, config } = await import("../src/proxy");

function makeReq(pathname: string) {
  return new NextRequest(new URL(pathname, "http://localhost:3000"));
}

describe("AUTH-03: proxy.ts UX-only cookie gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unauth redirect: GET /dashboard with NO session cookie → 302 to /signin?next=/dashboard", async () => {
    (getSessionCookie as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(
      undefined,
    );
    const req = makeReq("/dashboard");
    const res = await proxy(req);
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(307); // NextResponse.redirect default uses 307
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/signin");
    // The next param is URL-encoded (/ → %2F) — decode before asserting the deep-link value.
    const locUrl = new URL(location, "http://localhost:3000");
    expect(locUrl.searchParams.get("next")).toBe("/dashboard");
  });

  it("authed pass: GET /dashboard WITH session cookie → NextResponse.next() pass-through", async () => {
    (getSessionCookie as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(
      { value: "fake-session-cookie" },
    );
    const req = makeReq("/dashboard");
    const res = await proxy(req);
    // NextResponse.next() is not a redirect — status 200, no Location header.
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("no proxy-level reverse redirect: GET /signin WITH session cookie → pass-through (DB-validated redirect lives in the page)", async () => {
    (getSessionCookie as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(
      { value: "fake-session-cookie" },
    );
    const req = makeReq("/signin");
    const res = await proxy(req);
    // /signin is no longer in the matcher — it still matches the catch-all
    // negative-lookahead entry and falls through the proxy with x-incoming-path.
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("config.matcher gates dashboard + public-page catch-all (auth pages use page-level DB gates)", () => {
    expect(config.matcher).toContain("/dashboard/:path*");
    // Auth pages are DB-gated in their own Server Components — not in the proxy.
    expect(config.matcher).not.toContain("/signin");
    expect(config.matcher).not.toContain("/signup");
    expect(config.matcher).not.toContain("/forgot-password");
    expect(config.matcher.some((m: string) => m.includes("_next/static"))).toBe(true);
  });
});
