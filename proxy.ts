// proxy.ts (repo root — Next 16 rename of middleware.ts)
// [CITED: better-auth/docs/integrations/next.mdx — Next.js 16+ (Proxy); RESEARCH.md Pattern 4]
// *** UX-ONLY — NOT authoritative RBAC (Pitfall #4) ***
// getSessionCookie() checks cookie EXISTENCE, not validity. Forged/expired cookies
// pass this gate. The real auth check happens in EVERY Server Action via
// auth.api.getSession() + the permission helpers in @/lib/permissions. This proxy
// exists purely for UX (don't render the dashboard shell to logged-out users) —
// never as a security boundary.
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);
  const isAuthPage = pathname === "/signin" || pathname === "/signup";

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
  // (Next handles those before the proxy runs). NOTE: (admin)/(site)/(auth) are
  // ROUTE GROUPS (parentheses) — they do NOT appear in the URL (R6).
  matcher: ["/dashboard/:path*", "/signin", "/signup"],
};
