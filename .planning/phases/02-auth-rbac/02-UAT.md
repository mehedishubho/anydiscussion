# Phase 02 — Auth + RBAC: UAT / Verification Debt

Pending human-verification items deferred from plan execution. `/gsd-verify-work` and `/gsd-audit-uat` surface these.

---

## UAT-02-01 — Manual email verification + password-reset round-trip to a real inbox

**Status:** pending
**Deferred from:** Plan 02-03, Task 3 (`checkpoint:human-verify`, gate `blocking`)
**Requirements covered:** AUTH-06 (password reset via email link), AUTH-07 (email verification on account creation)
**Decision:** User explicitly accepted deferral — automated tests prove the hooks fire with a stubbed sender; the deferred item only proves Resend actually delivers to a real inbox.

### What automation already proves

- `__tests__/email-flows.test.ts` "verification sent" — `admin.createUser` fires `sendVerificationEmail` → `sendEmail` called with the verification URL (AUTH-07).
- `__tests__/email-flows.test.ts` "unverified blocked" — an unverified account's sign-in attempt is rejected (`requireEmailVerification:true` — D-09).
- `__tests__/email-flows.test.ts` "password reset" — a reset request triggers `sendResetPassword` → `sendEmail` called with the reset URL (AUTH-06).

These run with a stubbed `sendEmail` (`vi.hoisted()` spy), so they prove the hooks fire correctly without a real Resend key.

### What the manual round-trip proves (the gap)

That Resend actually delivers the email to a real inbox — i.e. the SDK send succeeds, the from-domain is accepted, and DKIM/SPF/DMARC (if configured) lets it land in inbox (not spam).

### Prerequisites

1. A real `RESEND_API_KEY=re_xxx` in `.env.local` (source: https://resend.com/api-keys).
2. For the dev sandbox sender `onboarding@resend.dev` (the `EMAIL_FROM` default), mail delivers ONLY to the Resend account owner's inbox. For other recipients, a verified from-domain is needed.
3. DNS deliverability (DKIM/SPF/DMARC on the from-domain) — a Phase 7 / D-04 concern. Not required for the dev sandbox sender.

### Steps

1. `pnpm dev` — start the app.
2. Create a user via the dashboard (or the first-run setup wizard) using an email you control (the Resend account owner's email for the sandbox sender).
3. Check that inbox for the verification email from `onboarding@resend.dev` (or your verified from-domain). Click the verification link.
4. Confirm the user can now sign in (previously blocked by `requireEmailVerification`).
5. Sign out, then trigger "forgot password" — confirm the reset email arrives. Click the reset link, set a new password, and sign in with the new password.
6. If either email lands in spam, note it — this is the D-04 DNS deliverability gate (DKIM/SPF/DMARC), flagged for Phase 7.

### Expected outcome

Both the verification and reset emails arrive (not in spam, if DNS is configured) and the flows complete end-to-end (click link → verified/reset → sign in succeeds).

### Sign-off

When complete, record: "approved — both emails arrived, flows completed" (or describe the failure). Update REQUIREMENTS.md AUTH-06/07 verification-debt note + this file's status to `done`.
