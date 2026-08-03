// src/lib/backup/__tests__/google-callback.test.ts
// [CITED: 08-03-PLAN.md Task 2 <behavior> + <acceptance_criteria> — CSRF state + encrypted refresh-token store]
// [CITED: 08-VALIDATION.md Wave 0 row "google-callback.test.ts"]
// [CITED: 08-RESEARCH.md Pattern 3 step 2 (lines 305-312) — getToken → encrypt → upsert]
// [CITED: 08-RESEARCH.md Security Domain V3 — CSRF state verify before token exchange]
// [CITED: D-02 (OAuth callback), D-03 (encrypted refresh token), T-08-03 (CSRF state gate)]
//
// Wave-0 OAuth callback Route Handler tests. Asserts the handler:
//   - No `runtime` segment config (incompatible with cacheComponents; Node.js is the default).
//   - GET reads `code`/`state` QUERY params from request.url (Route Handlers don't receive
//     searchParams in the context — only dynamic-segment `params`).
//   - Valid state + code → exchangeCode called, encrypt called with the refresh_token,
//     upsertSetting("backup.gdrive_creds"), 302 redirect to the Backup Settings page.
//   - Mismatched/missing state → 400 + NO token exchange + NO upsert (CSRF defense, T-08-03).
//   - exchangeCode rejection → 302 redirect with ?gdrive_error=... (never a 500).
//
// Mock strategy: the Google exchange (exchangeCode), encryption (encrypt), settings write
// (upsertSetting), and the cookie jar (next/headers cookies) are all mocked so no real network,
// crypto, DB, or cookie-store runs. NextResponse is the real next/server helper so the Response
// (status + Location) is a true object under test.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { exchangeCodeMock, encryptMock, upsertSettingMock, cookiesMock } = vi.hoisted(() => ({
  exchangeCodeMock: vi.fn(),
  encryptMock: vi.fn(),
  upsertSettingMock: vi.fn(),
  cookiesMock: vi.fn(),
}));

vi.mock("@/lib/backup/destinations/google-drive", () => ({
  exchangeCode: (...a: unknown[]) => exchangeCodeMock(...a),
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: (...a: unknown[]) => encryptMock(...a),
}));

vi.mock("@/lib/backup/config", () => ({
  upsertSetting: (...a: unknown[]) => upsertSettingMock(...a),
  BACKUP_GDRIVE_CREDS_KEY: "backup.gdrive_creds",
}));

vi.mock("next/headers", () => ({
  cookies: (...a: unknown[]) => cookiesMock(...a),
}));

/** Build a fake ReadableCookieStore with a controllable gdrive_oauth_state value. */
function cookieJar(stateValue: string | undefined) {
  return {
    get: vi.fn(() => (stateValue ? { value: stateValue } : undefined)),
    delete: vi.fn(),
    set: vi.fn(),
  };
}

async function loadRoute() {
  return (await import("@/app/api/auth/google/callback/route")) as typeof import("@/app/api/auth/google/callback/route");
}

function callGet(state: string, code: string, requestUrl = "https://app.test/api/auth/google/callback") {
  // Next 16 Route Handlers: `code`/`state` are QUERY params, read from request.url — NOT a
  // `searchParams` context property (Route Handler context only carries dynamic-segment `params`).
  const url = new URL(requestUrl);
  url.searchParams.set("state", state);
  url.searchParams.set("code", code);
  return loadRoute().then((mod) => mod.GET(new Request(url.toString())));
}

describe("08-03 Task 2: Google OAuth callback Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    encryptMock.mockReturnValue("ENCRYPTED-BLOB");
    upsertSettingMock.mockResolvedValue(undefined);
  });

  it("does NOT export a `runtime` segment config (incompatible with cacheComponents)", async () => {
    const mod = await loadRoute();
    // `export const runtime = "nodejs"` breaks `next build` under cacheComponents:true.
    // Node.js is the default Route Handler runtime anyway (Edge is opt-in), so the export is
    // both forbidden and redundant — guard against it being re-added.
    expect((mod as { runtime?: unknown }).runtime).toBeUndefined();
  });

  it("valid state + code: exchangeCode → encrypt(refreshToken) → upsert backup.gdrive_creds → 302 redirect", async () => {
    cookiesMock.mockResolvedValue(cookieJar("STATE-GOOD"));
    exchangeCodeMock.mockResolvedValue({ refresh_token: "RT-1", access_token: "AT-1" });

    const res = await callGet("STATE-GOOD", "CODE-1");

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/dashboard/settings/backup");
    // No error flag on the happy path.
    expect(res.headers.get("Location") ?? "").not.toContain("gdrive_error");

    // exchangeCode received the code from the query.
    expect(exchangeCodeMock).toHaveBeenCalledTimes(1);
    expect(exchangeCodeMock.mock.calls[0][0]).toBe("CODE-1");

    // encrypt received the JSON envelope carrying the refresh_token.
    expect(encryptMock).toHaveBeenCalledTimes(1);
    expect(encryptMock.mock.calls[0][0]).toBe(JSON.stringify({ refreshToken: "RT-1" }));

    // upsertSetting wrote the encrypted blob under backup.gdrive_creds.
    expect(upsertSettingMock).toHaveBeenCalledTimes(1);
    expect(upsertSettingMock.mock.calls[0][0]).toBe("backup.gdrive_creds");
    expect(upsertSettingMock.mock.calls[0][1]).toBe("ENCRYPTED-BLOB");
  });

  it("mismatched state: returns 400 + exchangeCode NOT called + NO upsert (CSRF defense)", async () => {
    cookiesMock.mockResolvedValue(cookieJar("STATE-GOOD")); // cookie has the real state
    exchangeCodeMock.mockResolvedValue({ refresh_token: "RT-1" });

    const res = await callGet("ATTACKER-STATE", "CODE-1");

    expect(res.status).toBe(400);
    expect(exchangeCodeMock).not.toHaveBeenCalled();
    expect(encryptMock).not.toHaveBeenCalled();
    expect(upsertSettingMock).not.toHaveBeenCalled();
  });

  it("missing state cookie: returns 400 + exchangeCode NOT called (no cookie = no exchange)", async () => {
    cookiesMock.mockResolvedValue(cookieJar(undefined)); // no gdrive_oauth_state cookie at all
    exchangeCodeMock.mockResolvedValue({ refresh_token: "RT-1" });

    const res = await callGet("ANYTHING", "CODE-1");

    expect(res.status).toBe(400);
    expect(exchangeCodeMock).not.toHaveBeenCalled();
    expect(upsertSettingMock).not.toHaveBeenCalled();
  });

  it("exchangeCode rejection: 302 redirect with ?gdrive_error=... (never a 500)", async () => {
    cookiesMock.mockResolvedValue(cookieJar("STATE-GOOD"));
    exchangeCodeMock.mockRejectedValue(new Error("invalid_grant: bad code"));

    const res = await callGet("STATE-GOOD", "BAD-CODE");

    expect(res.status).toBe(302);
    const loc = res.headers.get("Location") ?? "";
    expect(loc).toContain("/dashboard/settings/backup");
    expect(loc).toContain("gdrive_error=");
    // The exchange was attempted (state was valid) but no upsert happened.
    expect(exchangeCodeMock).toHaveBeenCalledTimes(1);
    expect(upsertSettingMock).not.toHaveBeenCalled();
  });
});
