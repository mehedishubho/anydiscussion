---
status: partial
phase: 02-auth-rbac
source: [02-03-SUMMARY.md, 02-VERIFICATION.md]
started: 2026-07-02T17:30:00.000Z
updated: 2026-07-03T15:10:00.000Z
---

## Current Test

[testing paused — forgot/reset-password UI gap blocks the email round-trip; route to /gsd-plan-phase 2 --gaps]

## Tests

### 1. Signup → create first admin
expected: Submit /signup form → admin created → "Account created. Redirecting to sign in…" → redirect to /signin.
result: pass
note: After 3 inline fixes during UAT (see Issues Resolved). Admin created with email_verified=t (auto-verified by design — createFirstAdmin passes emailVerified:true). Redirect to /signin now works.

### 2. Sign in as the admin
expected: /signin with admin email + password → reach /dashboard.
result: pending
note: Admin is auto-verified so requireEmailVerification (D-09) passes. Should work — user to confirm when continuing.

### 3. Forgot-password → reset email → reset password (AUTH-06)
expected: /signin "Forgot password?" → enter email → reset email arrives → click link → /reset-password → set new password → sign in.
result: blocked
blocked_by: prior-phase
reason: "Forgot-password + reset-password UI pages were never built. SignInForm.tsx:138 links to /reset-password which 404s."

### 4. Verification email on signup (AUTH-07)
expected: New (non-admin) user signup → verification email arrives → click link → verified.
result: skipped
reason: "AUTH-07's verification email is suppressed for the bootstrap admin (createFirstAdmin passes emailVerified:true by design — D-09). Full delivery test requires a non-admin user (Phase 4 user-management UI). AUTH-06's reset email exercises the same sendEmail/Resend path, so AUTH-07 delivery is implied once AUTH-06's reset email lands."

## Summary

total: 4
passed: 1
issues: 0
pending: 1
skipped: 1
blocked: 1

## Gaps

- truth: "A user can request a password reset via a forgot-password page and complete the reset via the emailed link (AUTH-06)"
  status: failed
  reason: "Forgot-password + reset-password UI pages were never built in Phase 2. SignInForm.tsx:138 links to /reset-password which 404s. The email hook (sendResetPassword at src/lib/auth/index.ts:55) is wired and its firing is proven by __tests__/email-flows.test.ts (stubbed sendEmail), but there is no UI to trigger it or to land the reset link."
  severity: major
  test: 3
  artifacts:
    - path: "src/components/auth/SignInForm.tsx"
      issue: "Forgot-password link (line 138) targets /reset-password which has no page (404)"
    - path: "src/app/(full-width-pages)/(auth)/"
      issue: "Missing /forgot-password and /reset-password route pages (only /signin, /signup exist)"
  missing:
    - "Build /forgot-password page + form: email → authClient.forgetPassword({ email, redirectTo: '/reset-password' }) → triggers sendResetPassword → 'check your email' UX"
    - "Build /reset-password page + form: read token from URL query → authClient.resetPassword({ newPassword, token }) → redirect to /signin"
    - "Verify Better Auth authClient.forgetPassword / resetPassword method names + call signatures against better-auth@1.6.23 (server hook sendResetPassword already wired)"
    - "Add /forgot-password and /reset-password to proxy.ts config.matcher if needed (current matcher: /dashboard/:path*, /signin, /signup — these are public auth pages)"
    - "Add tests for both pages (form submission → authClient call) mirroring src/components/auth/__tests__/SignInForm.test.tsx"

## Issues Resolved During UAT (inline fixes, committed)

- **Logo crash `Failed to construct 'URL'`** — Phase-1 custom image-loader concatenated `./`-prefixed srcs onto the CDN host, producing a malformed URL; ~50 local /public SVGs would also have 404'd against MinIO. Fixed loader (normalize `./`, serve local assets from app origin, pass absolute URLs through) + 2 logo srcs. Commit `18acdad`.
- **`createFirstAdmin` always threw `Cannot read properties of undefined`** — Better Auth admin endpoints are FLAT on `auth.api` (`auth.api.createUser`…), NOT nested under `auth.api.admin.*`. The 02-02 executor's typed cast read `undefined`; every user-mgmt action was broken at runtime. Mock-based tests asserted on the phantom nested path → false confidence. Fixed flat calls + 3 test mocks. Commit `c384ead`.
- **Signup success showed "Redirecting…" but never redirected** — no `useEffect`/`router.push` on the success state. Fixed. Commit `69077bf`.

## Notes

- The createFirstAdmin flat-endpoint bug (c384ead) is worth a phase retrospective: mock-based tests gave false confidence by asserting on a path that doesn't exist at runtime. A runtime smoke test (`typeof auth.api.createUser === 'function'`, `auth.api.admin === undefined`) would have caught it.
- AUTH-06 + AUTH-07 share the same `sendEmail` → Resend path. Once the forgot/reset UI is built and a reset email lands, BOTH delivery paths are proven.
- Real email delivery depends on the Resend sandbox sender restriction: `onboarding@resend.dev` (EMAIL_FROM default) delivers ONLY to the Resend account owner's inbox. For other recipients, a verified from-domain is needed (Phase 7 / D-04 DNS task).

## Next

`/gsd-plan-phase 2 --gaps` → plans the forgot/reset-password UI from the gap above →
`/gsd-execute-phase 2 --gaps-only` → builds it →
`/gsd-verify-work 2` → re-run to clear the email round-trip (then Phase 2 → passed → transition).
