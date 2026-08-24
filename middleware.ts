// middleware.ts (repo root)
// [CITED: better-auth/docs/integrations/next.mdx — Next.js middleware; RESEARCH.md Pattern 4]
// *** UX-ONLY — NOT authoritative RBAC (Pitfall #4) ***
// getSessionCookie() checks cookie EXISTENCE, not validity. Forged/expired cookies
// pass this gate. The real auth check happens in EVERY Server Action via
// auth.api.getSession() + the permission helpers in @/lib/permissions, AND in the
// (admin) layout Server Component via getSession() + redirect("/signin").
// This middleware exists purely for UX (don't render the dashboard shell to
// logged-out users) — never as a security boundary.
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
// ── x-incoming-path propagation (Phase 5 UAT test 5 fix) ─────────────────────
// WHY: this project self-hosts on Coolify (no Vercel). Vercel-only internal
// headers like x-invoke-path NEVER exist on this runtime, so the redirects-table
// check in src/app/not-found.tsx (D-12 slug-change SEO continuity) could never
// learn the incoming pathname and silently degraded to a plain 404. The
// fall-through below therefore sets the real pathname as the `x-incoming-path`
// REQUEST header via NextResponse.next({ request: { headers } }) — the documented
// Next.js middleware request-header override — which app-side headers() reads
// observe inside not-found.tsx's RedirectChecker <Suspense> boundary.
//
// T-05-09 (anti-spoof): the header is OVERWRITTEN on every matched request —
// a client-supplied x-incoming-path value never survives middleware.
//
// Known limitation: the matcher excludes file-extension-like paths (see config
// below), so a redirects-table row whose old_path ends in e.g. ".xml" or ".png"
// will NOT fire. Acceptable — redirects exist for slug changes, which are always
// path-like, never asset-like.
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

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

  // 3. Fall-through for every non-redirected matched request: propagate the real
  //    incoming pathname to server components as a request header (see the header
  //    comment — self-hosted runtime has no Vercel x-invoke-path; not-found.tsx's
  //    redirects-table check consumes this). The auth-gate branches above return
  //    early and never reach this — redirected requests don't need the header.
  //    T-05-09: ALWAYS overwrite, never merge — client-supplied values die here.
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
  // paths so the x-incoming-path header above is set for the redirects-table
  // check in not-found.tsx — the standard "run on all pages, skip assets" pattern.
  // It excludes framework internals (_next/static, _next/image), favicon.ico, api/
  // routes, and file-extension-like assets (svg, png, jpg, jpeg, gif, webp, ico,
  // txt, xml, json, webmanifest, woff2). Known limitation (acceptable): redirect
  // rows whose old_path looks like an asset will not fire — slug changes are
  // always path-like.
  matcher: [
    "/dashboard/:path*",
    "/signin",
    "/signup",
    "/forgot-password",
    "/((?!_next/static|_next/image|favicon\\.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest|woff2)$).*)",
  ],
};
