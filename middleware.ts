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

  return NextResponse.next();
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
  matcher: [
    "/dashboard/:path*",
    "/signin",
    "/signup",
    "/forgot-password",
  ],
};
