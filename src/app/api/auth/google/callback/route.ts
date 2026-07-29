// src/app/api/auth/google/callback/route.ts
// [CITED: 08-03-PLAN.md Task 2 <behavior> + <acceptance_criteria> — CSRF state + encrypted refresh-token store]
// [CITED: 08-RESEARCH.md Pattern 3 step 2 (lines 305-312) — getToken → encrypt → upsert → redirect]
// [CITED: 08-RESEARCH.md Security Domain V3 — verify CSRF state BEFORE any token exchange]
// [CITED: 08-PATTERNS.md row callback/route.ts — Next 16 async searchParams shape (media route) + sibling of [...all]]
// [CITED: src/app/api/media/[...path]/route.ts:72-80 — Next 16 async-params Route Handler signature]
// [CITED: D-02 (OAuth callback), D-03 (encrypted refresh token), T-08-03 (CSRF state gate)]
//
// THE GOOGLE OAuth CALLBACK Route Handler. This is a STANDALONE GET handler — NOT mounted via
// Better Auth's toNextJsHandler (that mount lives at /api/auth/[...all]). Google redirects the
// admin's browser here after the consent screen; this handler:
//   1. Verifies the CSRF `state` against the signed httpOnly `gdrive_oauth_state` cookie that the
//      08-04 getGoogleConsentUrl() action set when the admin clicked "Connect Drive".
//   2. On valid state: exchanges the code for tokens (exchangeCode), encrypts the refresh_token
//      (lib/crypto AES-256-GCM), upserts it under backup.gdrive_creds, clears the one-shot cookie,
//      and redirects to the Backup Settings page.
//   3. On ANY failure (mismatched state, missing refresh_token, exchange rejection): redirects to
//      the Backup Settings page with a ?gdrive_error= flag — never a 500 (the admin sees the error
//      inline). Mismatched state is the ONLY path that returns a bare 400 (no redirect) — because a
//      mismatched state is an attack signal, not a user-visible flow.
//
// runtime = "nodejs": googleapis MUST NOT land in the Edge bundle. The 08-01 lazy registry already
// keeps googleapis bundle-excluded unless Drive is enabled; this route runs server-side only.
//
// Server-only Route Handler — NO "use client" directive.
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/lib/backup/destinations/google-drive";
import { encrypt } from "@/lib/crypto";
import { upsertSetting, BACKUP_GDRIVE_CREDS_KEY } from "@/lib/backup/config";
import { log } from "@/lib/log";

/** The settings page the admin lands on after the OAuth round-trip (success or error). */
const BACKUP_SETTINGS_PATH = "/dashboard/settings/backup";
/** The CSRF cookie name set by the 08-04 getGoogleConsentUrl() action (signed, httpOnly, short-TTL). */
const GDRIVE_OAUTH_STATE_COOKIE = "gdrive_oauth_state";

/**
 * GET /api/auth/google/callback — Google OAuth consent redirect target.
 *
 * Next.js 16: `searchParams` is a Promise and MUST be awaited (mirrors the media route's async
 * params signature). Google passes `?code=...&state=...`; the state is the CSRF token we generated
 * + cookie-bound at consent-URL build time.
 */
export async function GET(
  request: Request,
  {
    searchParams,
  }: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  },
): Promise<Response> {
  const params = await searchParams;
  const state = typeof params.state === "string" ? params.state : undefined;
  const code = typeof params.code === "string" ? params.code : undefined;

  // 1. CSRF state verification (T-08-03) BEFORE any token exchange. The signed httpOnly cookie was
  //    set by getGoogleConsentUrl(); Next verifies the signature on read. A mismatched or missing
  //    state is an attack signal → 400 + NO exchange + NO upsert. (RESEARCH Security Domain V3.)
  const cookieJar = await cookies();
  const expectedState = cookieJar.get(GDRIVE_OAUTH_STATE_COOKIE)?.value;
  if (!state || !expectedState || state !== expectedState) {
    log.error("gdrive oauth state mismatch", {
      hasState: !!state,
      hasCookie: !!expectedState,
    });
    return new Response("Invalid OAuth state", { status: 400 });
  }

  // 2. Valid state — exchange the code, encrypt the refresh_token, persist. Any failure redirects
  //    to the settings page with a ?gdrive_error= flag (never a 500 — the admin sees the message).
  try {
    if (!code) {
      return NextResponse.redirect(
        new URL(`${BACKUP_SETTINGS_PATH}?gdrive_error=missing_code`, request.url),
        302,
      );
    }

    const tokens = await exchangeCode(code);
    const refreshToken = tokens.refresh_token;
    // access_type:"offline" + prompt:"consent" guarantee a refresh_token on every consent; if it is
    // somehow absent, surface a clear error instead of persisting a useless (access-only) token.
    if (!refreshToken) {
      return NextResponse.redirect(
        new URL(`${BACKUP_SETTINGS_PATH}?gdrive_error=no_refresh_token`, request.url),
        302,
      );
    }

    // D-03: encrypt the refresh_token (AES-256-GCM via lib/crypto) BEFORE persisting to settings.
    const blob = encrypt(JSON.stringify({ refreshToken }));
    await upsertSetting(BACKUP_GDRIVE_CREDS_KEY, blob);

    // One-shot cookie: clear the consumed CSRF state so it cannot be replayed.
    cookieJar.delete(GDRIVE_OAUTH_STATE_COOKIE);

    return NextResponse.redirect(new URL(BACKUP_SETTINGS_PATH, request.url), 302);
  } catch (e) {
    const message = encodeURIComponent(e instanceof Error ? e.message : String(e));
    log.error("gdrive oauth callback exchange failed", {
      error: decodeURIComponent(message),
    });
    return NextResponse.redirect(
      new URL(`${BACKUP_SETTINGS_PATH}?gdrive_error=${message}`, request.url),
      302,
    );
  }
}
