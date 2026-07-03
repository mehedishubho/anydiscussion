---
status: testing
phase: 02-auth-rbac
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md]
started: 2026-07-03T12:13:41.000Z
updated: 2026-07-03T12:41:31.000Z
---

## Current Test

number: 3
name: Sign in as admin → reach /dashboard (AUTH-02, AUTH-03 proxy gate)
expected: |
  On /signin, enter the admin email + password → submit → land on /dashboard (the proxy cookie gate lets an authed user through). Then sign out (or open /dashboard in a fresh private window with no cookie) → /dashboard bounces back to /signin (proxy gate blocks unauthed access). "Keep me logged in" checkbox is present.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Stop any running dev server. From a clean state run `pnpm dev` (or `pnpm build` then start). The Next.js app boots with no errors, the Postgres migration is already applied (no drift / no "incompatible PG version"), and loading http://localhost:3000/signin returns the rendered sign-in page (live data, no crash / no 500). The auth API route /api/auth/[...all] is mounted.
result: pass

### 2. First-run setup wizard — create admin & self-disable (AUTH-02, D-08)
expected: With NO admin in the DB, open /signup → "Create Admin Account" form. Fill name/email/password → submit → success message "Account created. Redirecting to sign in…" → land on /signin. Then open /signup AGAIN → it auto-redirects to /signin (the wizard self-disabled because an admin now exists — the D-08 security gate). If an admin already exists in your dev DB, you'll only see the self-disable redirect on the first /signup visit.
result: pass

### 3. Sign in as admin → reach /dashboard (AUTH-02, AUTH-03 proxy gate)
expected: On /signin, enter the admin email + password → submit → land on /dashboard (the proxy cookie gate lets an authed user through). Then sign out (or open /dashboard in a fresh private window with no cookie) → /dashboard bounces back to /signin (proxy gate blocks unauthed access). "Keep me logged in" checkbox is present.
result: [pending]

### 4. Forgot-password → reset email → reset password (AUTH-06, live inbox round-trip — coverage D5)
expected: On /signin click "Forgot password?" → land on /forgot-password → enter the admin email → submit → see the generic "Check your email. If an account exists…" message (never reveals whether the email exists). A reset email arrives in the inbox → click the link → land on /reset-password?token=xxx → enter a new password → submit → redirect to /signin → sign in WITH THE NEW password and reach /dashboard. Requires RESEND_API_KEY set and the recipient to be deliverable (Resend sandbox sender delivers only to the account owner's inbox; other recipients need a verified from-domain — Phase 7 / D-04).
result: [pending]

### 5. Verification email on signup (AUTH-07, live inbox round-trip)
expected: A NEW (non-admin) user is created via the dashboard (admin.createUser) — a verification email arrives → click the link → the user is verified → they can now sign in (previously blocked by requireEmailVerification). NOTE: the bootstrap admin is auto-verified (emailVerified:true by design), so this requires a non-admin user, whose creation UI lands in Phase 4. AUTH-06's reset email exercises the same sendEmail/Resend path, so AUTH-07 delivery is implied once Test 4's reset email lands.
result: [pending]

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
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

[none yet]
