// src/middleware.ts
// [CITED: better-auth/docs/integrations/next.mdx — Next.js middleware; RESEARCH.md Pattern 4]
// LOCATION NOTE (Plan 05-04): this file MUST live in src/, not the repo root.
// Next 16.2.9's functions-config-manifest discovery derives its scan directory
// from the app dir's parent (src/app → src/), so a REPO-ROOT middleware.ts is
// never analyzed there — its runtime export is missed and production servers
// (which load Node middleware ONLY via functions-config-manifest.json) skip it
// entirely. Turbopack's bundler still compiles a root middleware.ts, which made
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
// Why middleware.ts and not proxy.ts: Under Next.js 16.2.9 + Turbopack, proxy.ts
// is compiled into the middleware bundle but NEVER registered in
// middleware-manifest.json (manifest stays empty: "middleware":{}), so Next.js
// routes zero requests through the proxy. Renaming to middleware.ts (the
// deprecated-but-battle-tested filename) fixes the registration — the manifest
// now contains all 4 matchers. Next.js 16 still fully supports middleware.ts
// (build output labels it "ƒ Proxy (Middleware)"). Filed as an observation here,
// not a Next.js bug report.
//
// ── NODE runtime (Plan 05-04 deviation, Rule 1) ───────────────────────────────
// `export const runtime = "nodejs"` below is REQUIRED. This middleware runs the
// redirects-table lookup (D-12 slug-change SEO continuity) directly, and
// Drizzle/pg cannot execute in the edge sandbox the middleware defaults to.
// Next 16.2.9 compiles a nodejs-runtime middleware to .next/server/middleware.js
// (functions-config-manifest.json lists /_middleware with runtime:"nodejs") and
// runs it in the Node server process, pre-routing.
//
// WHY the lookup lives HERE and not only in not-found.tsx (Phase 5 UAT test 5
// root cause, verified live): under cacheComponents (PPR) the 404 route's static
// shell — including its HTTP STATUS — flushes BEFORE the RedirectChecker
// <Suspense> hole streams. A redirect thrown inside that hole can only become a
// client-side <meta refresh> (curl sees 404/200 + meta tag, never a 3xx). A
// middleware-level check runs before any rendering starts, so it returns a REAL
// HTTP 308/307 — which is what crawlers need for slug-change signal transfer.
// The not-found.tsx RedirectChecker is kept as a graceful streamed fallback.
//
// T-05-09 (anti-spoof): the x-incoming-path header is OVERWRITTEN on every
// matched request below — a client-supplied value never survives middleware. A
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

// REQUIRED for the Drizzle/pg redirect lookup above — see the header comment.
export const runtime = "nodejs";

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);
  const isAuthPage =
    pathname === "/signin" ||
    pathname === "/signup" ||
    pathname === "/forgot-password";

  // 1. Already-authed user hitting an auth page → redirect to dashboard (D-20 reverse).
  if (isAuthPage && sessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

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
  // Match dashboard paths + auth pages. Exclude _next/static, _next/image, favicon
  // (Next handles those before the middleware runs). NOTE: (admin)/(site)/(auth) are
  // ROUTE GROUPS (parentheses) — they do NOT appear in the URL (R6).
  // NOTE: /reset-password is intentionally NOT in this list. It is reached via an
  // email reset link by a logged-out user carrying a token in the URL query param.
  // The token is the authorization — validated server-side by Better Auth's
  // resetPassword endpoint (POST /reset-password). Adding it here would break the
  // flow for a user with a stale session cookie from another device/tab.
  //
  // The fifth entry (negative lookahead) extends middleware to ALL public page
  // paths so the redirects-table check above runs for them — the standard "run
  // on all pages, skip assets" pattern. It excludes framework internals
  // (_next/static, _next/image), favicon.ico, api/ routes, and file-extension-like
  // assets (svg, png, jpg, jpeg, gif, webp, ico, txt, xml, json, webmanifest,
  // woff2). Known limitation (acceptable): redirect rows whose old_path looks
  // like an asset will not fire — slug changes are always path-like.
  matcher: [
    "/dashboard/:path*",
    "/signin",
    "/signup",
    "/forgot-password",
    "/((?!_next/static|_next/image|favicon\\.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest|woff2)$).*)",
  ],
};
