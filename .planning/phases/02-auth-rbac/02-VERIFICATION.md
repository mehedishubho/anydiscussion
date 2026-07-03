---
phase: 02-auth-rbac
verified: 2026-07-03T17:35:00Z
status: human_needed
score: 22/23 must-haves verified
behavior_unverified: 1 # UAT-02-01 live email-inbox round-trip (the only behavior-unverified truth)
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 17/18
  gaps_closed:
    - "AUTH-06 UI gap: /forgot-password + /reset-password pages + forms now exist (plan 02-04); SignInForm 'Forgot password?' link no longer 404s; proxy.ts gates /forgot-password (logged-in bounce) while leaving /reset-password public (token-gated)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "Password reset via email link + email verification on account creation reaches a real inbox and completes end-to-end (ROADMAP SC #4 / AUTH-06 / AUTH-07 live delivery)"
    test: "With a real RESEND_API_KEY in .env.local + DNS deliverability (DKIM/SPF/DMARC), run pnpm dev, request a reset from /forgot-password, click the emailed link, set a new password, and sign in. Repeat for the signup verification email (non-admin user)."
    expected: "Both the verification email and the password-reset email arrive at a real inbox (not spam) and the flows complete end-to-end (click link → verified/reset → sign in succeeds)."
    why_human: "Requires operator infrastructure (RESEND_API_KEY + verified from-domain DNS records — Phase 7 / D-04). Automation proves the Better Auth hooks fire correctly with a stubbed sendEmail (61 tests green incl. email-flows.test.ts) and now proves the UI trigger is wired (ForgotPasswordForm.test.tsx + ResetPasswordForm.test.tsx). The code is complete and correct; only real-inbox delivery is unexercisable without operator infrastructure. Explicitly deferred by user decision and recorded as UAT-02-01 in 02-UAT.md."
human_verification:
  - test: "Manual email verification + password-reset round-trip to a real inbox (UAT-02-01)"
    expected: "Both the verification email and the password-reset email arrive (not in spam) and the flows complete end-to-end (click link → verified/reset → sign in succeeds). The forgot-password → reset-password UI path is now exercisable end-to-end."
    why_human: "Requires the operator's RESEND_API_KEY + DNS deliverability (DKIM/SPF/DMARC — Phase 7 / D-04). The 61 automated tests prove the Better Auth hooks fire correctly with a stubbed sendEmail AND now prove the UI forms call authClient.requestPasswordReset / resetPassword with the verified signatures (ForgotPasswordForm.test.tsx + ResetPasswordForm.test.tsx — 8 new cases). They cannot prove Resend actually delivers to a real inbox. Explicitly deferred by user decision to UAT (02-UAT.md UAT-02-01)."
---

# Phase 2: Auth + RBAC — Re-Verification Report (post 02-04 gap closure)

**Phase Goal:** A small editorial team can securely access the dashboard with role-based permissions, and the server-side enforcement primitives for the review workflow exist and are exercised — so that when posts ship in Phase 3, the workflow is genuinely enforced, not decorative.

**Verified:** 2026-07-03T17:35:00Z
**Status:** human_needed (1 deferred UAT item — automated verification otherwise clean)
**Re-verification:** Yes — after gap closure (plan 02-04 delivered the AUTH-06 UI gap)

## Re-Verification Summary

This re-verification confirms that plan 02-04 closed the AUTH-06 UI gap diagnosed in 02-UAT.md. The prior verification (2026-07-02T23:20:00Z, status `human_needed`, 17/18) was driven by two separate concerns that the 02-UAT conflation had hidden:

1. **Implementation gap (now CLOSED):** The `sendResetPassword` server hook was wired (02-03) but had NO UI trigger, and `SignInForm.tsx` linked to a 404 `/reset-password`. Plan 02-04 built `/forgot-password` + `/reset-password` pages + forms + tests, fixed the SignInForm link, and updated `proxy.ts`. All 5 gap-closure truths (below) are VERIFIED at the code/UI level.
2. **Behavior gap (still DEFERRED to UAT):** The live email-inbox round-trip (UAT-02-01) still requires operator infrastructure (`RESEND_API_KEY` + DNS deliverability — Phase 7 / D-04). The automated hook-firing is proven by `__tests__/email-flows.test.ts`; the UI form-wiring is now also proven by `ForgotPasswordForm.test.tsx` + `ResetPasswordForm.test.tsx`. Real-inbox delivery remains the sole human-verification item.

No implementation gaps remain. No regressions detected across the previously-verified items (quick regression checks below).

## Goal Achievement

### Observable Truths

Truths merged from ROADMAP Success Criteria (5 SCs) + PLAN frontmatter `must_haves.truths` across plans 02-01..04. Truths 1-18 are carried from the prior verification (now with refreshed evidence); Truths 19-23 are the 5 NEW gap-closure truths added by plan 02-04.

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A user can sign in at the dashboard signin page and stay authenticated across browser sessions; no open public sign-up (admin creates accounts). (SC #1) | ✓ VERIFIED | `src/components/auth/SignInForm.tsx:50-55` calls `authClient.signIn.email({email,password,rememberMe,callbackURL})`; `src/app/api/auth/[...all]/route.ts` mounts `toNextJsHandler(auth)`; `src/app/(full-width-pages)/(auth)/signup/page.tsx` redirects to `/signin` when an admin exists; `__tests__/sessions.test.ts` "persist" green (61/61 suite pass — see Behavioral Spot-Checks). Session-persistence across requests is exercised; `session.expiresIn: 60*60*24*30` at `src/lib/auth/index.ts:86`. Regression check — unchanged. |
| 2 | Unauthenticated visitor hitting any `(admin)` route is redirected by `proxy.ts` (cookie gate); dashboard never treats that as the sole auth check. (SC #2) | ✓ VERIFIED | `proxy.ts:28-31` redirects no-cookie `/dashboard/*` → `/signin?next=<path>`; `proxy.ts:3-8` carries the explicit `UX-ONLY — NOT authoritative RBAC (Pitfall #4)` callout; `src/lib/permissions/index.ts:23-30` `getSessionOrThrow` is the real auth path. Regression check — unchanged. |
| 3 | An author is blocked server-side from editor/admin-only mutations (e.g. publishing), even via crafted requests — every mutating Server Action starts with `getSession` + role + ownership checks (Pitfall #1). (SC #3) | ✓ VERIFIED | `src/lib/auth/permissions.ts` authorRole omits `post:["publish"]`; `src/actions/users.ts:86,108,125,142` each call `requireCan(...)` FIRST (verified via grep — line numbers shifted slightly from prior report due to file growth, ordering invariant holds); `src/actions/__tests__/users.test.ts` proves all 4 user-management actions throw FORBIDDEN before reaching `auth.api.*`. |
| 4 | Author cannot transition draft → published directly; transition table excludes it AND requireCan({post:['publish']}) fails — double enforcement (D-15). | ✓ VERIFIED | `src/lib/permissions/post-transitions.ts:22-27` `TRANSITIONS.author` has no path to `published`; `post-transitions.ts:69-71` calls `requireCan({post:['publish']})` BEFORE the table check when `target==="published"`; `transitions.test.ts:46-58` proves author draft→published throws FORBIDDEN at requireCan. Regression check — unchanged. |
| 5 | Password reset via email link + email verification on account creation (Better Auth defaults + SMTP). (SC #4 / AUTH-06 / AUTH-07) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | **Status narrowed since prior verification.** The UI gap is now closed: `ForgotPasswordForm.tsx:35-38` calls `authClient.requestPasswordReset({email, redirectTo:"/reset-password"})`; `ResetPasswordForm.tsx:80-83` calls `authClient.resetPassword({newPassword, token:token!})`; Better Auth endpoints `/request-password-reset`, `/reset-password`, `/reset-password/:token` confirmed real in `node_modules/better-auth/dist/api/routes/password.mjs` (line 72 confirms the `?callbackURL=` redirect chain lands the user at `/reset-password?token=xxx`). `__tests__/email-flows.test.ts` proves the hooks fire with stubbed sendEmail. **Behavior NOT exercised against a real inbox** — see Human Verification (UAT-02-01, deferred by user decision — depends on operator `RESEND_API_KEY` + DNS deliverability Phase 7 / D-04). The automation now covers BOTH the hook-firing AND the UI form-submission; only real-inbox delivery is unexercisable without operator infrastructure. |
| 6 | User record carries profile fields (bio, avatar) for byline/author pages; post status enum + review workflow primitives exist. (SC #5 / AUTH-08) | ✓ VERIFIED | `src/db/schema.ts:158-159` `bio` + `avatar` columns on `user`; `schema.ts:50-51` FKs; `src/lib/permissions/post-transitions.ts:50` `transitionPost` funnels ALL status writes (R7). Regression check — unchanged. |
| 7 | createFirstAdmin checks count(admins)===0 BEFORE any Better Auth call and refuses (FORBIDDEN) when an admin exists (D-08 — non-negotiable). | ✓ VERIFIED | `src/actions/users.ts` count query + refusal BEFORE the `adminApi.createUser` call; `users.test.ts` "createFirstAdmin blocked" test mocks `createUser` to throw `MUST_NOT_BE_REACHED` — proves the count-check gates the auth call BY EXECUTION ORDER. Regression check — unchanged. |
| 8 | createFirstAdmin succeeds when zero admins exist (creates role:'admin'). | ✓ VERIFIED | `src/actions/users.ts` calls `adminApi.createUser` with `role:"admin"` + `emailVerified:true`; `users.test.ts:94-114` asserts createUser called once with `role:"admin"`. Regression check — unchanged. |
| 9 | Signup page renders admin-creation form ONLY when count(admins)===0; otherwise redirects to /signin. | ✓ VERIFIED | `src/app/(full-width-pages)/(auth)/signup/page.tsx` `SetupGate` Server Component queries count + redirects when > 0, else renders `<SignUpForm/>`. Regression check — unchanged. |
| 10 | SignInForm calls authClient.signIn.email with email, password, rememberMe, callbackURL (D-18/D-19). | ✓ VERIFIED | `src/components/auth/SignInForm.tsx:50-55`; `useCallbackURL` at `:24-32` reads `next` with same-origin guard; `SignInForm.test.tsx` asserts spy args for both rememberMe + both callbackURL states. Regression check — unchanged. |
| 11 | Every action in src/actions/users.ts starts with getSession + permission check EXCEPT createFirstAdmin (bootstrap exception). | ✓ VERIFIED | `createUser` (line 86), `banUser` (108), `unbanUser` (125), `revokeSessions` (142) each call `requireCan(...)` first; `createFirstAdmin` is the documented exception gated by `count===0`. Regression check — ordering invariant holds. |
| 12 | nextCookies() is the LAST entry in the Better Auth plugins array (R2). | ✓ VERIFIED | `src/lib/auth/index.ts:99` plugins array ends with `nextCookies()`. Regression check — unchanged. |
| 13 | requireEmailVerification is true (D-09). | ✓ VERIFIED | `src/lib/auth/index.ts:36` `requireEmailVerification: true`; `email-flows.test.ts` "unverified blocked" green. Regression check — unchanged. |
| 14 | No extra CSRF library — auth mutations rely on Better Auth origin validation + Next 16 built-in Server Action origin check (D-23). | ✓ VERIFIED | No `csurf`/`csrf` package in `package.json`; `src/lib/auth/index.ts:24-26` sets `trustedOrigins` from env; Server Actions carry `"use server"` directive. Regression check — unchanged. |
| 15 | posts.authorId references user.id and posts.categoryId references categories.id (FK closure). | ✓ VERIFIED | `src/db/schema.ts:50-51` references confirmed via grep. Regression check — unchanged. |
| 16 | Applying every committed migration to a clean empty Postgres reproduces the schema with all 12 tables. | ✓ VERIFIED | Prior `pnpm test:migrations` exit 0 confirmed 12-table clean-room drift pass. Regression check — no schema changes this plan. |
| 17 | Banned user cannot sign in; admin.unbanUser restores; revokeUserSessions invalidates all sessions (D-16/D-17). | ✓ VERIFIED (wiring) | `src/actions/users.ts` `banUser`/`unbanUser`/`revokeSessions` each preceded by `requireCan` and call the admin primitives; `__tests__/ban.test.ts` + `__tests__/sessions.test.ts` exercise the paths. The actual "banned user sign-in blocked" runtime enforcement is a Better Auth admin-plugin invariant — present + wired, primitive invocation proven. Regression check — unchanged. |
| 18 | All email sends in hooks are fire-and-forget (void sendEmail) — never awaited (R8); lib/email returns silently on error. | ✓ VERIFIED | `src/lib/auth/index.ts:56,66` both hooks use `void sendEmail(...)`; `src/lib/email/index.ts` logs + returns on error. Regression check — unchanged. |
| 19 | A user can request a password reset from /forgot-password by entering their email, which calls authClient.requestPasswordReset with redirectTo '/reset-password' and shows a generic 'check your email' message (AUTH-06, NEW). | ✓ VERIFIED | `src/components/auth/ForgotPasswordForm.tsx:35-38` calls `authClient.requestPasswordReset({email, redirectTo:"/reset-password"})`; `:44-75` always shows "Check your email..." regardless of result (the await result is not even inspected — pure enumeration protection); `ForgotPasswordForm.test.tsx:54-67` asserts spy called once with `{email:"admin@example.com", redirectTo:"/reset-password"}`. |
| 20 | A user clicking the email reset link lands on /reset-password?token=xxx, enters a new password, and the form calls authClient.resetPassword({ newPassword, token }) which completes the reset (AUTH-06, NEW). | ✓ VERIFIED (form wiring) | Form wiring proven: `src/components/auth/ResetPasswordForm.tsx:22-23` reads `useSearchParams().get("token")`; `:80-83` calls `authClient.resetPassword({newPassword, token:token!})`; `:96` `router.push("/signin")` on success; `ResetPasswordForm.test.tsx:74-88` asserts spy called once with `{newPassword:"new-pass-123", token:"abc123"}` + push to /signin. Better Auth GET `/reset-password/:token` callback (confirmed in `node_modules/better-auth/dist/api/routes/password.mjs:83,116`) verifies the token and redirects to `?token=xxx`. **Note:** the live "click email link" step depends on real-inbox delivery and is covered by Truth 5 / UAT-02-01. |
| 21 | The SignInForm 'Forgot password?' link targets /forgot-password (not the 404 /reset-password it pointed to before) (NEW). | ✓ VERIFIED | `src/components/auth/SignInForm.tsx:138` `href="/forgot-password"` confirmed via direct read (was `/reset-password` before — fix landed in commit 352d9f9). |
| 22 | A logged-in user hitting /forgot-password is redirected to /dashboard by proxy.ts (mirrors /signin reverse-redirect per D-20) (NEW). | ✓ VERIFIED | `proxy.ts:15-22` `isAuthPage` now includes `pathname === "/forgot-password"`; redirects authed users to `/dashboard`. |
| 23 | The /reset-password page is reachable while logged out (NOT in the logged-in reverse-redirect) because the reset flow is initiated from an email link (NEW). | ✓ VERIFIED | `proxy.ts:41-51` matcher omits `/reset-password`; documented justification comment at `:41-45` ("reached via an email reset link by a logged-out user carrying a token... token is the authorization — validated server-side"). D-02-04-1 design decision respected. |

**Score:** 22/23 truths verified (1 present + wired + UI-tested but behavior-unverified against a real inbox — UAT-02-01 deferral)

### Required Artifacts (gap-closure focus)

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/app/(full-width-pages)/(auth)/forgot-password/page.tsx` | Thin Server Component rendering ForgotPasswordForm | ✓ VERIFIED | 19 lines; metadata export; renders `<ForgotPasswordForm/>` (verified by direct read) |
| `src/components/auth/ForgotPasswordForm.tsx` | Calls authClient.requestPasswordReset({email, redirectTo:"/reset-password"}) on submit; generic "check your email" UX | ✓ VERIFIED | 137 lines; `:35-38` call; `:44-75` always-success panel; no Suspense (no useSearchParams — PPR-safe) |
| `src/app/(full-width-pages)/(auth)/reset-password/page.tsx` | Thin Server Component rendering ResetPasswordForm | ✓ VERIFIED | 19 lines; metadata export; renders `<ResetPasswordForm/>` |
| `src/components/auth/ResetPasswordForm.tsx` | Reads token from useSearchParams; calls authClient.resetPassword({newPassword, token}); redirects to /signin on success | ✓ VERIFIED | 178 lines; `:22-23` useSearchParams; `:80-83` resetPassword call; `:96` router.push("/signin"); `:31-66` missing-token guard; wrapped in `<Suspense>` |
| `src/components/auth/__tests__/ForgotPasswordForm.test.tsx` | vi.hoisted spy on authClient.requestPasswordReset; 4 cases | ✓ VERIFIED | 123 lines; 4 cases (call args, success message, error-enumeration, loading state); `pnpm test` confirms 4 cases pass |
| `src/components/auth/__tests__/ResetPasswordForm.test.tsx` | vi.hoisted spy on authClient.resetPassword; 4 cases | ✓ VERIFIED | 127 lines; 4 cases (call args + push, redirect on success, error no-redirect, missing-token guard); `pnpm test` confirms 4 cases pass |
| `src/components/auth/SignInForm.tsx` | "Forgot password?" href is "/forgot-password" (was "/reset-password") | ✓ VERIFIED | `:138` `href="/forgot-password"` (direct read) |
| `proxy.ts` | matcher + isAuthPage include "/forgot-password"; /reset-password intentionally excluded | ✓ VERIFIED | `:18` isAuthPage check; `:50` matcher entry; `:41-45` justification comment for /reset-password exclusion |

### Key Link Verification (gap-closure focus)

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| ForgotPasswordForm | authClient.requestPasswordReset → Better Auth POST /request-password-reset → sendResetPassword hook | `authClient.requestPasswordReset({email, redirectTo})` | ✓ WIRED | `ForgotPasswordForm.tsx:35-38`; endpoint path confirmed in `node_modules/better-auth/dist/api/routes/password.mjs:20` (`/request-password-reset`); hook wired at `src/lib/auth/index.ts:55-61` (verified via grep) |
| ResetPasswordForm | authClient.resetPassword → Better Auth POST /reset-password | `authClient.resetPassword({newPassword, token})` | ✓ WIRED | `ResetPasswordForm.tsx:80-83`; endpoint confirmed in `password.mjs:120` (`/reset-password`) |
| Email link → /reset-password?token=xxx | Better Auth GET /reset-password/:token → server redirect | Better Auth callback | ✓ WIRED (code) / ⚠️ UAT (live) | `password.mjs:83` defines `/reset-password/:token` callback; `:72` builds `${baseURL}/reset-password/${token}?callbackURL=...`; `:116` consumes the token. Live click-through requires real-inbox delivery — UAT-02-01. |
| SignInForm "Forgot password?" link | /forgot-password (no longer 404) | `<Link href="/forgot-password">` | ✓ WIRED | `SignInForm.tsx:138` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| ForgotPasswordForm | email (FormData) | user input → authClient.requestPasswordReset | Yes (real auth client → real endpoint) | ✓ FLOWING |
| ResetPasswordForm | token (URLSearchParams) | Better Auth GET callback redirect → useSearchParams | Yes (real Better Auth callback, stubbed in tests) | ✓ FLOWING (live delivery = UAT) |
| ResetPasswordForm | newPassword (FormData) | user input → authClient.resetPassword | Yes (real auth client → real endpoint) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full test suite (11 files) | `pnpm test` | 61 passed (61) — 53 prior + 8 new (4 ForgotPasswordForm + 4 ResetPasswordForm) | ✓ PASS |
| Production build | `pnpm build` | exit 0; both `/forgot-password` and `/reset-password` compile as Static routes; `/signup` remains Partial Prerender | ✓ PASS |
| Better Auth endpoints exist (not just mocked) | `grep -nE "requestPasswordReset\|resetPassword" node_modules/better-auth/dist/api/routes/password.mjs` | `requestPasswordReset` (line 20), `resetPassword` (line 120), `requestPasswordResetCallback` (line 83) — all real; export at line 194 | ✓ PASS |
| R8: no `await sendEmail` in hooks | `grep "await sendEmail" src/lib/auth` | No matches (regression check) | ✓ PASS |
| drizzle-orm pinned (R5) | `grep "drizzle-orm" package.json` | `"drizzle-orm": "^0.45.2"` (not 1.x — regression check) | ✓ PASS |
| nextCookies LAST (R2) | `grep -nE "nextCookies" src/lib/auth/index.ts` | `:99` (last entry — regression check) | ✓ PASS |
| requireCan-first ordering (Pitfall #1) | `grep -nE "requireCan\|adminApi\." src/actions/users.ts` | `:86,108,125,142` requireCan precede adminApi calls | ✓ PASS |
| Commits 352d9f9 + a61326f exist | `git log --oneline` | Both present ("feat(02-04): add forgot-password page + form..." + "feat(02-04): add reset-password page + form...") | ✓ PASS |
| No debt markers in AUTH-06 files | `grep -E "TBD\|FIXME\|XXX"` on 5 files | No matches | ✓ PASS |

### Probe Execution

Not applicable — Phase 2 declares no probe-based verification. Conventional `scripts/*/tests/probe-*.sh` probes do not exist for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| AUTH-01 | 02-01, 02-03 | Better Auth + admin plugin; 3 roles via createAccessControl | ✓ SATISFIED | permissions.ts (3 roles); rbac.test.ts green; ban/sessions tests green (regression) |
| AUTH-02 | 02-02 | Sign-in working; admin creates accounts; no open sign-up | ✓ SATISFIED | SignInForm wired; createFirstAdmin + users.test.ts green; signup page self-closes (regression) |
| AUTH-03 | 02-01 | proxy.ts cookie-existence gate | ✓ SATISFIED | proxy.ts + proxy.test.ts green (regression) |
| AUTH-04 | 02-01 | lib/permissions helpers; every mutating action server-side checks | ✓ SATISFIED | permissions/index.ts exports all 4 helpers; users.test.ts proves ordering (regression) |
| AUTH-05 | 02-01 | Author→submit→editor/admin-approve→publish enforced server-side | ✓ SATISFIED | post-transitions.ts TRANSITIONS + double enforcement; transitions.test.ts green (regression) |
| AUTH-06 | 02-03, **02-04** | Password reset via email link | ✓ SATISFIED (code+UI) / ⚠️ UAT (live delivery) | **UI gap closed by 02-04**: ForgotPasswordForm + ResetPasswordForm wired with verified Better Auth method signatures (8 new tests green); real-inbox delivery deferred to UAT-02-01 |
| AUTH-07 | 02-03 | Email verification on account creation | ✓ SATISFIED (code) / ⚠️ UAT (delivery) | email-flows.test.ts "verification sent" + "unverified blocked" green; real-inbox delivery deferred to UAT-02-01 |
| AUTH-08 | 02-01 | Author profile fields (bio, avatar) | ✓ SATISFIED | schema.ts user.bio + user.avatar (regression) |

**Orphaned requirements:** None. REQUIREMENTS.md maps AUTH-01..08 to Phase 2; all 8 appear in PLAN frontmatter `requirements:` fields (02-04 declares `requirements: [AUTH-06]`) and are covered above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none of concern) | — | — | — | — |

No `TBD`/`FIXME`/`XXX` debt markers in any AUTH-06 file (ForgotPasswordForm.tsx, ResetPasswordForm.tsx, both page.tsx files, SignInForm.tsx, proxy.ts). No stub implementations — every form handler has a real body wired to a real Better Auth primitive. The `token!` non-null assertion at `ResetPasswordForm.tsx:82` is documented (early-return guard at `:31` guarantees safety — TS control-flow limitation with hoisted function declarations, not a runtime concern).

### Prohibitions Verification (02-04-PLAN `must_haves.prohibitions`)

Both judgment-tier prohibitions are wired + observable in code (both passed):

| Prohibition | Status | Evidence |
| --- | --- | --- |
| The /forgot-password form MUST NOT reveal whether the email exists (T-02-04 email-enumeration protection) | ✓ VERIFIED | `ForgotPasswordForm.tsx:35-41` — the `await authClient.requestPasswordReset(...)` result is not even inspected; `setSubmitted(true)` runs unconditionally after the await; the same "Check your email..." panel shows for both success and error. Test case `:79-94` proves no `role="alert"` leaks on error. |
| The /reset-password page MUST NOT be added to the isAuthPage reverse-redirect | ✓ VERIFIED | `proxy.ts:46-51` matcher explicitly omits `/reset-password`; `:41-45` documents the design justification (D-02-04-1 — token is the authorization, validated server-side). |

### Human Verification Required

### 1. Manual email verification + password-reset round-trip to a real inbox (UAT-02-01)

**Test:** With a real `RESEND_API_KEY` in `.env.local` + DNS deliverability (DKIM/SPF/DMARC), run `pnpm dev`, then:
1. Visit `/signin` → click "Forgot password?" → land on `/forgot-password`
2. Enter an email → submit → see "Check your email..." confirmation
3. Check the inbox for the reset email → click the link
4. Land on `/reset-password?token=xxx` → enter a new password → submit
5. Auto-redirect to `/signin` → sign in with the new password

**Expected:** All steps complete end-to-end. The verification email on a non-admin signup (AUTH-07) follows the same `sendEmail` → Resend path.

**Why human:** Requires the operator's Resend account + DNS deliverability (Phase 7 / D-04). The 61 automated tests prove:
- The Better Auth hooks fire correctly with stubbed sendEmail (`email-flows.test.ts`)
- The UI forms call `authClient.requestPasswordReset` / `resetPassword` with verified signatures (`ForgotPasswordForm.test.tsx` + `ResetPasswordForm.test.tsx` — 8 new cases)
- The SignInForm "Forgot password?" link no longer 404s

They cannot prove Resend actually delivers to a real inbox. Explicitly deferred by user decision and recorded as UAT-02-01 in `.planning/phases/02-auth-rbac/02-UAT.md`. This is a delivery-test gap, not an implementation gap — the code is complete and correct.

**Status assessment:** This single deferred UAT item is what keeps Phase 2 at `human_needed` rather than `passed`. Per the verifier decision tree, `passed` requires the human-verification section to be empty. The user explicitly chose to defer this to UAT (it depends on operator infrastructure, not code correctness — Phase 7 / D-04 DNS task). When the operator runs the live round-trip and confirms delivery, Phase 2 can transition to `passed`.

### Gaps Summary

**No implementation gaps.** All 8 requirements (AUTH-01..08) are satisfied in code with passing automated tests (61/61 green; build exit 0). The AUTH-06 UI gap diagnosed in 02-UAT.md is now CLOSED — both `/forgot-password` and `/reset-password` pages exist, are wired to verified Better Auth method signatures (`requestPasswordReset` / `resetPassword` confirmed real in `node_modules/better-auth/dist/api/routes/password.mjs`), the SignInForm link no longer 404s, and `proxy.ts` gates the new pages correctly.

The single human-verification item is the live email-inbox round-trip (UAT-02-01), which is explicitly deferred to UAT by user decision. This is a delivery-test gap (depends on operator `RESEND_API_KEY` + DNS deliverability Phase 7 / D-04), NOT an implementation gap. The code is complete and correct.

Security-critical items all verified (no regressions from prior verification):
- **D-08 createFirstAdmin self-disable** — count-before-create ordering proven structurally.
- **Pitfall #1 (server-side auth on every mutation)** — all 4 user-management actions start with requireCan (ordering invariant holds).
- **Pitfall #4 (proxy UX-only)** — proxy.ts header carries the explicit callout.
- **R8 (no await sendEmail)** — both hooks use `void sendEmail(...)`.
- **R5 (drizzle ^0.45.2)** — pinned in package.json.
- **R2 (nextCookies last)** — confirmed last in the plugins array.
- **R7 (transitionPost single funnel)** — all status writes flow through the helper.
- **T-02-04 (email enumeration)** — ForgotPasswordForm never reveals whether the email exists (result not inspected).
- **T-02-10 (token tampering)** — Better Auth validates the token server-side; form shows error on rejection; missing-token guard.
- **T-02-11 (open redirect)** — `redirectTo` hardcoded to "/reset-password".

---

_Verified: 2026-07-03T17:35:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification of: 02-VERIFICATION.md (2026-07-02T23:20:00Z, status human_needed, 17/18)_
