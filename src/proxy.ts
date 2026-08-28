// src/proxy.ts
// [CITED: better-auth/docs/integrations/next.mdx — Next.js proxy; RESEARCH.md Pattern 4]
// LOCATION NOTE (Plan 05-04): this file MUST live in src/, not the repo root.
// Next 16.2.9's functions-config-manifest discovery derives its scan directory
// from the app dir's parent (src/app → src/), so a REPO-ROOT proxy.ts is
// never analyzed there — its runtime export is missed and production servers
// (which load Node middleware ONLY via functions-config-manifest.json) skip it
// entirely. Turbopack's bundler still compiles a root proxy.ts, which made
// this failure mode silent (bundle exists, never invoked in prod).
//
// *** UX-ONLY auth gate — NOT authoritative RBAC (Pitfall #4) ***
// getSessionCookie() checks cookie EXISTENCE, not validity. Forged/expired cookies
// pass this gate. The real auth check happens in EVERY Server Action via
// auth.api.getSession() + the permission helpers in @/lib/permissions, AND in the
// (admin) layout Server Component via getSession() + redirect("/signin").
// The auth branches below exist purely for UX (don't render the dashboard shell
// to logged-out users) — never as a security boundary.
//
// Why proxy.ts (Next 16 rename of middleware.ts): the "middleware" file convention
// is deprecated in Next.js 16; the file was renamed to proxy.ts and the exported
// function to `proxy()` (codemod: npx @next/codemod@canary middleware-to-proxy).
// The build output labels it "ƒ Proxy (Middleware)" and registers it in
// middleware-manifest.json. The previous branch-A note claiming proxy.ts failed to
// register predated the `turbopack.root` fix in next.config.ts (see that file's
// comment) — with root set, proxy.ts compiles AND registers, so we use the
// supported proxy convention.
//
// ── NODE runtime ──────────────────────────────────────────────────────────────
// Proxy files DEFAULT to the Node.js runtime in Next.js 16 (the `runtime` config
// option is NOT available in proxy files — setting it throws). This is exactly
// what we need: the redirects-table lookup (D-12 slug-change SEO continuity)
// below runs directly, and Drizzle/pg cannot execute in the edge sandbox the
// middleware used to default to. Next compiles a nodejs-runtime proxy to
// .next/server/middleware.js and runs it in the Node server process, pre-routing.
//
// WHY the lookup lives HERE and not only in not-found.tsx (Phase 5 UAT test 5
// root cause, verified live): under cacheComponents (PPR) the 404 route's static
// shell — including its HTTP STATUS — flushes BEFORE the RedirectChecker
// <Suspense> hole streams. A redirect thrown inside that hole can only become a
// client-side <meta refresh> (curl sees 404/200 + meta tag, never a 3xx). A
// proxy-level check runs before any rendering starts, so it returns a REAL
// HTTP 308/307 — which is what crawlers need for slug-change signal transfer.
// The not-found.tsx RedirectChecker is kept as a graceful streamed fallback.
//
// T-05-09 (anti-spoof): the x-incoming-path header is OVERWRITTEN on every
// matched request below — a client-supplied value never survives proxy. A
// spoofed header could only influence the fallback checker, whose target must
// already have an admin-created DB row — impact bounded.
//
// Known limitation: the matcher excludes file-extension-like paths (see config
// below), so a redirects-table row whose old_path ends in e.g. ".xml" or ".png"
// will NOT fire. Acceptable — redirects exist for slug changes, which are always
// path-like, never asset-like.
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { db, schema } from "@/lib/db";

// ── Redirects snapshot cache ─────────────────────────────────────────────────
// The matcher below matches every public page request, so without a cache each
// request would pay a Postgres roundtrip BEFORE the (possibly cached) page even
// renders. The redirects table is tiny (v1 ships empty; rows are rare
// admin-created slug changes), so we snapshot ALL rows and refresh at most once
// per TTL. Newly inserted rows apply within REDIRECT_CACHE_TTL_MS — no server
// restart, satisfying the Plan 05-04 "no container restart" truth.
type RedirectSnapshotRow = {
  oldPath: string;
  newPath: string;
  statusCode: number;
};
let redirectSnapshot: { fetchedAt: number; rows: RedirectSnapshotRow[] } | null =
  null;
const REDIRECT_CACHE_TTL_MS = 5_000;

async function getRedirectRows(): Promise<RedirectSnapshotRow[]> {
  const now = Date.now();
  if (redirectSnapshot && now - redirectSnapshot.fetchedAt < REDIRECT_CACHE_TTL_MS) {
    return redirectSnapshot.rows;
  }
  const rows = await db.select().from(schema.redirects);
  redirectSnapshot = {
    fetchedAt: now,
    rows: rows.map((row) => ({
      oldPath: row.oldPath,
      newPath: row.newPath,
      statusCode: row.statusCode,
    })),
  };
  return redirectSnapshot.rows;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);

  // 1. No proxy-level authed→/dashboard bounce (previously: isAuthPage && cookie → /dashboard).
  //    That optimistic cookie check caused a redirect loop with stale/expired cookies:
  //    proxy (stale cookie EXISTS → /dashboard) ↔ (admin) AuthGate (session INVALID → /signin).
  //    Auth pages now handle the "already signed in" case authoritatively via
  //    getSession() + redirect("/dashboard") — only a DB-validated session redirects.

  // 2. Unauthenticated user hitting (admin) → redirect to /signin with deep-link
  //    return param (D-19). The (admin) route group renders under /dashboard/*.
  //    Route groups in parens do NOT appear in URLs (R6) — matcher targets resolved paths.
  if (!sessionCookie && pathname.startsWith("/dashboard")) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("next", pathname); // D-19 deep-link return
    return NextResponse.redirect(signInUrl);
  }

  // 3. Redirects-table check (D-12) — skipped for /dashboard/* (redirect rows are
  //    public-path SEO constructs; an authed dashboard request must not pay even
  //    a cached lookup). Status mapping matches not-found.tsx's fallback checker:
  //    301 → 308 (permanent, method-preserving), 302 → 307 (temporary).
  if (!pathname.startsWith("/dashboard")) {
    try {
      const rows = await getRedirectRows();
      const match = rows.find((row) => row.oldPath === pathname);
      if (match) {
        const status = match.statusCode === 302 ? 307 : 308;
        return NextResponse.redirect(new URL(match.newPath, request.url), status);
      }
    } catch {
      // T-05-08 graceful degradation — DB unavailable/missing table: fall
      // through and render normally (a 404 path then reaches not-found.tsx's
      // RedirectChecker, which retries per-request and degrades to the 404 UI).
    }
  }

  // 4. Fall-through: propagate the real incoming pathname to server components
  //    as a request header (self-hosted runtime has no Vercel-internal path
  //    header; not-found.tsx's RedirectChecker consumes this). The branches
  //    above return early and never reach this. T-05-09: ALWAYS overwrite,
  //    never merge — client-supplied values die here.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-incoming-path", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Match dashboard paths. The redirects-table portion also needs public-page
  // invocations (fifth entry) — the standard "run on all pages, skip assets"
  // pattern for slug-change SEO continuity. NOTE: (admin)/(site)/(auth) are
  // ROUTE GROUPS (parentheses) — they do NOT appear in the URL (R6).
  //
  // Auth pages (/signin /signup /forgot-password) are intentionally NOT
  // listed here anymore. Their "already signed in → /dashboard" decision is
  // DB-validated in each page's own getSession() gate — the loop fix removed
  // the optimistic getSessionCookie() bounce from the proxy (see branches
  // 1/2 above). Keeping them in the matcher would pay needless DB roundtrips
  // on the negative-lookahead entry's behalf only.
  //
  // NOTE: /reset-password is intentionally NOT in this list. It is reached
  // via an email reset link by a logged-out user carrying a token in the URL
  // query param. The token is the authorization — validated server-side by
  // Better Auth's resetPassword endpoint (POST /reset-password). Adding it
  // here would break the flow for a user with a stale session cookie from
  // another device/tab.
  //
  // The second entry (negative lookahead) extends proxy to ALL public page
  // paths so the redirects-table check above runs for them. It excludes
  // framework internals (_next/static, _next/image), favicon.ico, api/ routes,
  // and file-extension-like assets (svg, png, jpg, jpeg, gif, webp, ico, txt,
  // xml, json, webmanifest, woff2). Known limitation (acceptable): redirect
  // rows whose old_path looks like an asset will not fire — slug changes are
  // always path-like.
  matcher: [
    "/dashboard/:path*",
    "/((?!_next/static|_next/image|favicon\\.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest|woff2)$).*)",
  ],
};
