// __tests__/middleware.test.ts
// [CITED: VALIDATION.md AUTH-03 rows — middleware.ts redirect logic; RESEARCH.md Pattern 4]
// Unit tests for the Next 16 middleware.ts UX-only cookie gate.
// NOTE: proxy.ts was renamed to middleware.ts because Turbopack 16.2.9 does not
// register proxy.ts in the middleware manifest (Plan 02-05 Task 2, Branch A).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Mock better-auth/cookies getSessionCookie — optimistic cookie-existence check.
// Tests control the return value per-case (Pitfall #4: middleware trusts cookie presence).
vi.mock("better-auth/cookies", () => ({
  getSessionCookie: vi.fn(),
}));

import { getSessionCookie } from "better-auth/cookies";

// Import the middleware AFTER the mock is registered so it picks up the mock.
const { middleware, config } = await import("../middleware");

function makeReq(pathname: string) {
  return new NextRequest(new URL(pathname, "http://localhost:3000"));
}

describe("AUTH-03: middleware.ts UX-only cookie gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unauth redirect: GET /dashboard with NO session cookie → 302 to /signin?next=/dashboard", async () => {
    (getSessionCookie as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(
      undefined,
    );
    const req = makeReq("/dashboard");
    const res = await middleware(req);
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
    const res = await middleware(req);
    // NextResponse.next() is not a redirect — status 200, no Location header.
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("reverse redirect: GET /signin WITH session cookie → 302 to /dashboard", async () => {
    (getSessionCookie as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(
      { value: "fake-session-cookie" },
    );
    const req = makeReq("/signin");
    const res = await middleware(req);
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/dashboard");
  });

  it("config.matcher gates dashboard + auth pages only", () => {
    expect(config.matcher).toContain("/dashboard/:path*");
    expect(config.matcher).toContain("/signin");
    expect(config.matcher).toContain("/signup");
  });
});
