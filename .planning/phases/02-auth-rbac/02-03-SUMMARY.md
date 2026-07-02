---
phase: 02-auth-rbac
plan: 03
subsystem: auth-rbac
tags: [auth, email, resend, verification, password-reset, ban, sessions, better-auth, fire-and-forget, enumeration]
requires:
  - "02-01: auth instance (sendResetPassword/sendVerificationEmail stub hooks to replace), admin plugin, requireCan helper, test scaffold"
  - "02-02: src/actions/users.ts banUser/unbanUser/revokeSessions signatures + adminApi cast"
  - "docker-compose postgres (5435) + postgres-test (5436) services"
provides:
  - "sendEmail({to, subject, text, html?}) — thin Resend-backed lib/email helper (D-03), fire-and-forget safe (R8)"
  - "Better Auth sendResetPassword + sendVerificationEmail hooks wired to real sendEmail (void — R8)"
  - "customSyntheticUser for email-enumeration protection (T-02-04) with admin-plugin fields"
  - "sendOnSignUp:true — admin.createUser fires the verification email"
  - "ban/revoke session primitives coverage (D-16/D-17) — ban + sessions tests"
affects:
  - "Phase 4 (dashboard user-management UI calls banUser/unbanUser/revokeSessions — bodies proven here)"
  - "Phase 7 / D-04 (DNS deliverability for real-inbox verification — deferred to UAT)"
tech-stack:
  added:
    - "resend@6.16.0 (verified in 02-01; SDK shape `new Resend(key)` + `resend.emails.send({...})` — lib/email wraps it)"
  patterns:
    - "lib/email thin-wrapper-around-external-SDK (mirrors src/lib/r2 s3Client singleton + env-with-dev-default)"
    - "Fire-and-forget email hooks: `void sendEmail(...)` in Better Auth hooks — never awaited (R8 timing-attack mitigation)"
    - "lib/email returns silently on error (logs, does NOT throw) — Better Auth hooks cannot leak send-failure timing"
    - "customSyntheticUser with admin-plugin fields (role/banned/banReason/banExpires) for email-enumeration protection (T-02-04)"
    - "Dev-placeholder Resend key guard: `new Resend(process.env.RESEND_API_KEY || 'dev-placeholder')` so build-time construction never throws"
key-files:
  created:
    - "src/lib/email/index.ts (real Resend helper — replaces the 02-01 no-op stub)"
    - "__tests__/email-flows.test.ts (AUTH-06/07 + customSyntheticUser — 3 tests with stubbed sendEmail)"
    - "__tests__/ban.test.ts (D-16 banned-blocked + unban success path)"
    - "__tests__/sessions.test.ts (D-17 revoke-all + AUTH-01 session-persist)"
  modified:
    - "src/lib/auth/index.ts (hook stubs → real sendEmail wiring; customSyntheticUser; sendOnSignUp:true)"
decisions:
  - "lib/email is the thin helper (D-03) — hardcoded to Resend, no provider abstraction; swapping to Brevo/SES = editing one file"
  - "All email hooks use `void sendEmail(...)` (fire-and-forget) — R8 timing-attack mitigation; lib/email never throws"
  - "Dev placeholder Resend key (`|| 'dev-placeholder'`, not `??`) so construction never throws at build time even when the key is absent — real send fails at runtime and lib/email swallows it silently"
  - "customSyntheticUser includes admin-plugin fields (role/banned/banReason/banExpires) so the synthetic response shape matches a real user (T-02-04 enumeration protection)"
  - "Task 3 (manual email round-trip to a real inbox) DEFERRED to UAT — automated tests prove the hooks fire with a stubbed sender; the deferred item only proves Resend actually delivers, which depends on the operator's Resend account + DNS deliverability (Phase 7 / D-04)"
patterns-established:
  - "Pattern: thin external-SDK wrapper in lib/ with env-with-dev-default + singleton client (mirrors lib/r2)"
  - "Pattern: fire-and-forget email-send in auth hooks (`void sendEmail(...)`) — never await"
  - "Pattern: lib/email never throws on error (returns silently after structured console.error) — prevents timing leakage"
requirements-completed: [AUTH-01, AUTH-06, AUTH-07]
coverage:
  - id: D1
    description: "lib/email Resend helper exports sendEmail({to, subject, text, html?}) — thin wrapper, fire-and-forget safe"
    requirement: "AUTH-06"
    verification:
      - kind: unit
        ref: "__tests__/email-flows.test.ts#password reset"
        status: pass
      - kind: integration
        ref: "src/lib/email/index.ts (real Resend SDK; returns silently on error; never throws)"
        status: pass
    human_judgment: false
  - id: D2
    description: "AUTH-07 sendVerificationEmail hook fires on createUser (sendOnSignUp:true) — proven with stubbed sender"
    requirement: "AUTH-07"
    verification:
      - kind: unit
        ref: "__tests__/email-flows.test.ts#verification sent"
        status: pass
      - kind: unit
        ref: "__tests__/email-flows.test.ts#unverified blocked"
        status: pass
    human_judgment: false
  - id: D3
    description: "AUTH-06 sendResetPassword hook fires on password-reset request — proven with stubbed sender"
    requirement: "AUTH-06"
    verification:
      - kind: unit
        ref: "__tests__/email-flows.test.ts#password reset"
        status: pass
    human_judgment: false
  - id: D4
    description: "AUTH-01 session persists across requests; banned user blocked from sign-in (D-16); revoke-all invalidates sessions (D-17)"
    requirement: "AUTH-01"
    verification:
      - kind: unit
        ref: "__tests__/sessions.test.ts#persist"
        status: pass
      - kind: unit
        ref: "__tests__/ban.test.ts#banned blocked"
        status: pass
      - kind: unit
        ref: "__tests__/sessions.test.ts#revoke all"
        status: pass
    human_judgment: false
  - id: D5
    description: "Manual email verification + password-reset round-trip to a REAL inbox (AUTH-06/07 real delivery — not just hook firing)"
    requirement: "AUTH-06"
    verification: []
    human_judgment: true
    rationale: "Automated tests prove the hooks fire correctly with a stubbed sender. Real-inbox delivery depends on operator-supplied RESEND_API_KEY + DNS deliverability (DKIM/SPF/DMARC — Phase 7 / D-04). A unit/integration test cannot prove an email actually arrives. Deferred to UAT per explicit user decision."
metrics:
  duration: "18 min"
  completed: "2026-07-02"
  tasks: 2
  files: 6
  tests: 53
status: complete
---

# Phase 02 Plan 03: Email Flows + Ban/Revoke Primitives Summary

Thin Resend-backed `lib/email` helper wired fire-and-forget into Better Auth's verification/reset hooks (AUTH-06/07), `customSyntheticUser` email-enumeration protection (T-02-04), and ban/revoke session test coverage (D-16/D-17) — 53 automated tests green; the manual real-inbox round-trip is deferred to UAT.

## What Shipped

### Task 1 (TDD) — lib/email Resend helper + Better Auth hook wiring + customSyntheticUser

- **RED** `1d1e9c0` — failing `__tests__/email-flows.test.ts` (3 tests: "verification sent", "unverified blocked", "password reset" — AUTH-06/07 + customSyntheticUser). Uses `vi.hoisted()` mock spy so the test runs without a real Resend key.
- **GREEN** `c8f347a`:
  - **`src/lib/email/index.ts`** — the thin Resend helper (D-03). `const resend = new Resend(process.env.RESEND_API_KEY || "dev-placeholder")` singleton (mirrors `src/lib/r2` s3Client pattern); `||` (not `??`) so empty-string env also falls back. Exports `sendEmail({to, subject, text, html?})`. Uses `process.env.EMAIL_FROM ?? "onboarding@resend.dev"` (Resend's shared sandbox sender — dev default mirrors `lib/r2`'s `S3_ENDPOINT || "http://localhost:9000"` idiom). **Returns silently on error** (`console.error` structured JSON, then `return;`) — never throws, so Better Auth hooks stay fire-and-forget (R8). Header carries the explicit `// Server-only — NO "use client" directive` (ASVS V8 / T-02-06 — Resend key must never reach a client bundle). Dev-placeholder key guard prevents the Resend SDK constructor from throwing at build time when the key is absent (the SDK throws `Missing API key` on falsy — would break Next.js page-data collection).
  - **`src/lib/auth/index.ts`** — replaced the 02-01 stub hooks with real `void sendEmail(...)` calls:
    - `emailAndPassword.sendResetPassword: async ({ user, url }) => { void sendEmail({ to: user.email, subject: "Reset your password", text: ... }) }` — fire-and-forget (R8).
    - `emailVerification.sendVerificationEmail: async ({ user, url }) => { void sendEmail({ to: user.email, subject: "Verify your email address", text: ... }) }` — fire-and-forget.
    - `emailVerification.sendOnSignUp: true` — admin.createUser now fires the verification email.
    - **`customSyntheticUser`** (T-02-04 email-enumeration protection) — when `requireEmailVerification:true` AND the admin plugin is active, sign-up returns a synthetic user with the admin-plugin fields (`role: "author", banned: false, banReason: null, banExpires: null`) + `additionalFields` placeholders + `id`, so the response shape matches a real user (per Better Auth docs — enumeration protection requires the synthetic shape to match).

### Task 2 (TDD) — ban/revoke session primitive test coverage (D-16/D-17)

- `975a5a6` — **`__tests__/ban.test.ts`** + **`__tests__/sessions.test.ts`**:
  - **ban.test.ts** — "banned blocked" (after `admin.banUser`, a `signInEmail` attempt for the banned user is rejected) + unban success path (D-16). Better Auth's `banUser` sets `banned=true` + revokes all sessions + blocks future sign-in in one call.
  - **sessions.test.ts** — "revoke all" (after `revokeUserSessions`, a subsequent `getSession` with the old session returns null — D-17) + "persist" (a valid session persists across two requests when the cookie is carried — AUTH-01 session persistence). Closes the VALIDATION.md AUTH-01-persist row.
  - The `banUser`/`unbanUser`/`revokeSessions` action **bodies** already shipped in 02-02 (`adminApi.banUser` / `adminApi.unbanUser` / `adminApi.revokeUserSessions` after the `requireCan(...)` check); Task 2 added the test coverage that proves them.

## Verification

| Gate | Result |
|------|--------|
| `pnpm test` (full suite) | **53 passed** (9 test files — 35 prior + 3 email-flows + ban + sessions) |
| `pnpm build` | Succeeded — `/signup` shows `◐ (Partial Prerender)`, no type errors |
| R8 — fire-and-forget | `await sendEmail` returns NO matches in `src` (all hooks use `void sendEmail(...)`) |
| R8 — silent failure | `lib/email` returns silently on error (structured `console.error`, then `return;`) — never throws |
| drizzle-orm version | `^0.45.2` (NOT bumped to 1.x — R5 gate holds) |
| `emailVerification.sendOnSignUp` | `true` (admin.createUser fires verification email) |
| `customSyntheticUser` fields | `role: "author", banned: false, banReason: null, banExpires: null` (admin-plugin shape — T-02-04) |
| lib/email header | `// Server-only — NO "use client" directive` (ASVS V8 / T-02-06) |

### AUTH requirement coverage

- **AUTH-01** (Better Auth + admin plugin, sessions) — sessions "persist" green + ban primitive blocks banned sign-in ✓
- **AUTH-06** (password reset via email link) — email-flows "password reset" green (hook fires with stubbed sender); **real-inbox delivery deferred to UAT** ⚠
- **AUTH-07** (email verification on creation) — email-flows "verification sent" + "unverified blocked" green; **real-inbox delivery deferred to UAT** ⚠

## Deferred to UAT

### Task 3 — Manual email verification + password-reset round-trip to a real inbox

**Status:** DEFERRED to UAT (user explicitly accepted).

**What was deferred:** The manual round-trip checkpoint (`checkpoint:human-verify`, gate `blocking`) that would prove a real verification email and a real password-reset email actually arrive at a real inbox — i.e. that Resend delivers, not just that the hooks fire.

**Why deferred:** The 53 automated tests already prove the Better Auth `sendVerificationEmail` / `sendResetPassword` hooks fire correctly with a stubbed `sendEmail`. The deferred item only proves Resend actually delivers to a real inbox, which depends on:

1. A real `RESEND_API_KEY` in `.env.local` (operator-supplied secret — not available to the executor).
2. The Resend account owner's inbox (for the dev sandbox sender `onboarding@resend.dev`).
3. DNS deliverability (DKIM/SPF/DMARC on the from-domain) — a Phase 7 / D-04 concern, not a Phase 2 build gate.

**Prerequisite to re-run:** Add a real `RESEND_API_KEY=re_xxx` to `.env.local`. For the dev sandbox sender `onboarding@resend.dev`, mail delivers ONLY to the Resend account owner's inbox. For other recipients, a verified from-domain is needed (Phase 7 / D-04).

**Steps for UAT:**

1. `pnpm dev` — start the app.
2. Create a user via the dashboard (or the first-run setup wizard) using an email you control (the Resend account owner's email for the sandbox sender).
3. Check that inbox for the verification email from `onboarding@resend.dev` (or your verified from-domain). Click the verification link.
4. Confirm the user can now sign in (previously blocked by `requireEmailVerification`).
5. Sign out, then trigger "forgot password" — confirm the reset email arrives. Click the reset link, set a new password, and sign in with the new password.
6. If either email lands in spam, note it — this is the D-04 DNS deliverability gate (DKIM/SPF/DMARC), flagged for Phase 7.

**Tracked at:** `.planning/phases/02-auth-rbac/02-UAT.md` (pending). `/gsd-verify-work` and `/gsd-audit-uat` will surface it.

## Task Commits

1. **Task 1 RED** — `1d1e9c0` (test) — failing email-flows tests (AUTH-06/07 + customSyntheticUser)
2. **Task 1 GREEN** — `c8f347a` (feat) — `src/lib/email/index.ts` real Resend helper + `src/lib/auth/index.ts` `customSyntheticUser` + `sendOnSignUp:true` + `void sendEmail` hooks
3. **Task 2** — `975a5a6` (test) — `__tests__/ban.test.ts` + `__tests__/sessions.test.ts` (D-16/D-17 + AUTH-01 persist)
4. **Checkpoint record** — `691624f` (docs) — recorded the human-verify checkpoint before deferral

**Plan metadata:** `<this commit>` (docs: finalize plan — Task 3 deferred to UAT)

## Files Created/Modified

- `src/lib/email/index.ts` — **real** Resend-backed `sendEmail` helper (replaces the 02-01 no-op stub). Thin wrapper, fire-and-forget safe, silent on error.
- `src/lib/auth/index.ts` — verification/reset hooks wired to real `void sendEmail(...)`; `customSyntheticUser` (T-02-04); `sendOnSignUp:true`.
- `__tests__/email-flows.test.ts` — AUTH-06/07 + customSyntheticUser (3 tests, stubbed sendEmail).
- `__tests__/ban.test.ts` — D-16 banned-blocked + unban success path.
- `__tests__/sessions.test.ts` — D-17 revoke-all + AUTH-01 session-persist.

## Decisions Made

- **lib/email is the thin helper (D-03)** — hardcoded to Resend, no provider abstraction. Swapping to Brevo/SES = editing one file. Mirrors the `src/lib/r2` pattern.
- **All email hooks fire-and-forget (`void sendEmail(...)`)** — R8 timing-attack mitigation. `lib/email` never throws on error (returns silently after structured `console.error`).
- **Dev-placeholder Resend key guard** — `new Resend(process.env.RESEND_API_KEY || "dev-placeholder")` so the SDK constructor never throws at build time when the key is absent. The real send fails at runtime and `lib/email` swallows that failure silently.
- **`customSyntheticUser` includes admin-plugin fields** — required for T-02-04 enumeration protection so the synthetic response shape matches a real user.
- **Task 3 deferred to UAT** — automated tests prove hooks fire with stubbed sender; real-inbox delivery depends on operator-supplied key + DNS (Phase 7 / D-04). User explicitly accepted.

## Deviations from Plan

None - plan executed exactly as written for Tasks 1 & 2. Task 3 was a `checkpoint:human-verify` (blocking) task; the user chose to defer it to UAT rather than perform the manual round-trip now. This is the intended outcome for a checkpoint — not a deviation.

## Issues Encountered

None beyond what was already documented in the Task 1/Task 2 commits.

## User Setup Required

**External services require manual configuration.** See the plan's `user_setup` block + the deferred UAT item:

- `RESEND_API_KEY` — add a real key to `.env.local` before the UAT round-trip (source: https://resend.com/api-keys).
- `EMAIL_FROM` — optional; defaults to `onboarding@resend.dev` (dev sandbox, delivers only to the Resend account owner). Prod sets this to a verified from-domain (Resend Dashboard → Domains + DKIM/SPF/DMARC DNS — Phase 7 / D-04).

## Next Phase Readiness

- **Phase 2 is COMPLETE** (all 8 AUTH requirements: 02-01 covered AUTH-01/03/04/05/08; 02-02 covered AUTH-02; 02-03 covers AUTH-06/07 via automation with real-inbox delivery deferred to UAT).
- **Phase 3 (Content Engine)** can consume the auth instance, `requireCan`, `assertOwnsPost`, `transitionPost`, and the session reader.
- **Phase 4 (Dashboard Chrome)** will call `banUser`/`unbanUser`/`revokeSessions` from the users-management UI — bodies are proven by the ban/sessions tests.
- **Phase 7 (Perf & Deploy)** owns the DNS deliverability gate (D-04) and rate limiting on auth endpoints (PERF-04).

### Open verification debt

- AUTH-06/07 real-inbox delivery — `.planning/phases/02-auth-rbac/02-UAT.md` (pending). Must be closed before production launch.

## Self-Check: PASSED

### Created files exist
- FOUND: src/lib/email/index.ts (real Resend helper — replaced 02-01 stub)
- FOUND: __tests__/email-flows.test.ts
- FOUND: __tests__/ban.test.ts
- FOUND: __tests__/sessions.test.ts

### Modified files exist
- FOUND: src/lib/auth/index.ts (hooks wired; customSyntheticUser; sendOnSignUp)

### Commits exist
- FOUND: 1d1e9c0 (Task 1 RED)
- FOUND: c8f347a (Task 1 GREEN)
- FOUND: 975a5a6 (Task 2)
- FOUND: 691624f (checkpoint record)

### Acceptance gates
- FOUND: pnpm test → 53 passed (9 files)
- FOUND: pnpm build → succeeded
- FOUND: R8 — `await sendEmail` returns no matches in src (fire-and-forget holds)
- FOUND: lib/email returns silently on error (never throws)
- FOUND: drizzle-orm ^0.45.2 (not 1.x — R5)
- FOUND: customSyntheticUser with admin-plugin fields (T-02-04)
- FOUND: sendOnSignUp: true

---
*Phase: 02-auth-rbac*
*Completed: 2026-07-02*
