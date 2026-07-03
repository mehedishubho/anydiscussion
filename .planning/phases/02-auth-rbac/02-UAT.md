---
status: diagnosed
phase: 02-auth-rbac
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md]
started: 2026-07-03T12:13:41.000Z
updated: 2026-07-03T15:36:51.000Z
---

## Current Test

[testing paused — 1 item outstanding (Test 4 blocked: AUTH-06 live inbox round-trip, Resend from-domain unverified — Phase 7 / D-04)]

## Tests

### 1. Cold Start Smoke Test
expected: Stop any running dev server. From a clean state run `pnpm dev` (or `pnpm build` then start). The Next.js app boots with no errors, the Postgres migration is already applied (no drift / no "incompatible PG version"), and loading http://localhost:3000/signin returns the rendered sign-in page (live data, no crash / no 500). The auth API route /api/auth/[...all] is mounted.
result: pass

### 2. First-run setup wizard — create admin & self-disable (AUTH-02, D-08)
expected: With NO admin in the DB, open /signup → "Create Admin Account" form. Fill name/email/password → submit → success message "Account created. Redirecting to sign in…" → land on /signin. Then open /signup AGAIN → it auto-redirects to /signin (the wizard self-disabled because an admin now exists — the D-08 security gate). If an admin already exists in your dev DB, you'll only see the self-disable redirect on the first /signup visit.
result: pass

### 3. Sign in as admin → reach /dashboard (AUTH-02, AUTH-03 proxy gate)
expected: On /signin, enter the admin email + password → submit → land on /dashboard (the proxy cookie gate lets an authed user through). Then sign out (or open /dashboard in a fresh private window with no cookie) → /dashboard bounces back to /signin (proxy gate blocks unauthed access). "Keep me logged in" checkbox is present.
result: issue
reported: "when I http://localhost:3000/dashboard paste this url and hit enter it will login me to dashboard from different browser without asking to login"
severity: blocker

### 4. Forgot-password → reset email → reset password (AUTH-06, live inbox round-trip — coverage D5)
expected: On /signin click "Forgot password?" → land on /forgot-password → enter the admin email → submit → see the generic "Check your email. If an account exists…" message (never reveals whether the email exists). A reset email arrives in the inbox → click the link → land on /reset-password?token=xxx → enter a new password → submit → redirect to /signin → sign in WITH THE NEW password and reach /dashboard. Requires RESEND_API_KEY set and the recipient to be deliverable (Resend sandbox sender delivers only to the account owner's inbox; other recipients need a verified from-domain — Phase 7 / D-04).
result: blocked
blocked_by: third-party
reason: "POST /api/auth/request-password-reset 200; lib/email fire-and-forget swallowed a Resend 403: 'The anydiscussion.com domain is not verified. Please, add and verify your domain on https://resend.com/domains'. Code path is correct (hook fires, silent failure, generic UX); delivery blocked by unverified Resend from-domain — Phase 7 / D-04. Workaround: EMAIL_FROM=onboarding@resend.dev delivers to the Resend account owner's inbox."

### 5. Verification email on signup (AUTH-07, live inbox round-trip)
expected: A NEW (non-admin) user is created via the dashboard (admin.createUser) — a verification email arrives → click the link → the user is verified → they can now sign in (previously blocked by requireEmailVerification). NOTE: the bootstrap admin is auto-verified (emailVerified:true by design), so this requires a non-admin user, whose creation UI lands in Phase 4. AUTH-06's reset email exercises the same sendEmail/Resend path, so AUTH-07 delivery is implied once Test 4's reset email lands.
result: skipped
reason: "Same Resend from-domain blocker as Test 4 (anydiscussion.com unverified) AND requires a non-admin user whose creation UI lands in Phase 4. AUTH-07's sendVerificationEmail hook is auto-covered by coverage D2 (fires on createUser, sendOnSignUp:true); real-inbox delivery is implied once Test 4's reset round-trip is unblocked."

### A1. lib/email Resend helper (AUTH-06) — coverage D1
expected: lib/email exports sendEmail({to, subject, text, html?}) — thin Resend wrapper, fire-and-forget safe, never throws.
result: pass
source: automated
coverage_id: D1

### A2. sendVerificationEmail hook fires on createUser (AUTH-07) — coverage D2
expected: emailVerification.sendVerificationEmail fires on createUser (sendOnSignUp:true), proven with stubbed sender.
result: pass
source: automated
coverage_id: D2

### A3. sendResetPassword hook fires on reset request (AUTH-06) — coverage D3
expected: emailAndPassword.sendResetPassword fires on password-reset request, proven with stubbed sender.
result: pass
source: automated
coverage_id: D3

### A4. Session persists; banned user blocked; revoke-all invalidates (AUTH-01, D-16, D-17) — coverage D4
expected: A valid session persists across requests; a banned user is blocked from sign-in; revokeUserSessions invalidates existing sessions.
result: pass
source: automated
coverage_id: D4

## Summary

total: 5
passed: 2
issues: 1
pending: 0
skipped: 1
blocked: 1

## Gaps

- truth: "An unauthenticated user who visits /dashboard (no session cookie) is redirected to /signin by the proxy cookie gate (AUTH-03); the dashboard never renders without a valid session."
  status: failed
  reason: "User reported: when I http://localhost:3000/dashboard paste this url and hit enter it will login me to dashboard from different browser without asking to login"
  severity: blocker
  test: 3
  root_cause: "proxy.ts is compiled by Turbopack but never registered in middleware-manifest.json (empty `middleware: {}` in both dev and prod builds, reproducible after .next wipe + fresh `pnpm dev`), so Next.js routes zero requests through the proxy — verified by curl: /dashboard → HTTP 200 (no redirect) and /dashboard/foo → HTTP 404 (the proxy would redirect if running, since /dashboard/:path* definitively matches). Compounding defense-in-depth gap: src/app/(admin)/dashboard/page.tsx and src/app/(admin)/layout.tsx have NO server-side getSession() check, and the page is statically prerendered under next.config.ts cacheComponents:true, so /dashboard renders for everyone. __tests__/proxy.test.ts calls proxy(req) directly with mocked cookies — it validates function logic but never that Next.js routes real HTTP requests through the proxy, giving false confidence (24 tests green, integration never tested)."
  artifacts:
    - path: "proxy.ts"
      issue: "Compiled by Turbopack but config.matcher is not registered in middleware-manifest.json → proxy is dead code at runtime despite valid source."
    - path: "src/app/(admin)/dashboard/page.tsx"
      issue: "No server-side getSession() check; pure static component prerendered for all users."
    - path: "src/app/(admin)/layout.tsx"
      issue: "\"use client\" component with no auth boundary — zero server-side protection for the entire (admin) route group."
    - path: "__tests__/proxy.test.ts"
      issue: "Unit test calls proxy(req) directly with mocked cookies; never validates that Next.js routes real HTTP requests through the proxy."
    - path: "next.config.ts"
      issue: "cacheComponents:true causes /dashboard to be statically prerendered, amplifying severity (served from static cache to all users)."
  missing:
    - "Resolve the proxy.ts manifest-registration gap: test whether the deprecated middleware.ts name populates the manifest where proxy.ts does not. If so, either ship middleware.ts (Next still supports it with a deprecation warning) or file a Next.js 16.2.9 + Turbopack bug for proxy.ts and use middleware.ts in the interim."
    - "Add a server-side getSession() auth boundary to the (admin) route group — convert the layout to a Server Component (or add a server-component auth wrapper) that calls getSession() and redirects to /signin when there is no session. This is the authoritative RBAC boundary the UX-only proxy was never meant to be (Pitfall #4)."
    - "Add an integration test that sends a real no-cookie HTTP request to /dashboard and asserts a redirect to /signin — the current direct-call unit test cannot catch this class of failure."
  debug_session: .planning/debug/dashboard-auth-gate-bypass.md
