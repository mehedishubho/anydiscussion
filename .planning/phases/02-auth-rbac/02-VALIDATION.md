---
phase: 2
slug: auth-rbac
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-02
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | **Vitest** (Wave 0 installs — Phase 1 shipped no test runner; Better Auth peers expect `vitest ^2\|\|^3\|\|^4`). Component tests (`SignInForm.test.tsx`) use the `jsdom` environment (via `@vitest-environment jsdom` pragma or a per-file override) + `@testing-library/react`. |
| **Config file** | `vitest.config.ts` (none today — Wave 0 creates it; node env default, jsdom opt-in per file) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm test:migrations` |
| **Estimated runtime** | ~20–40 seconds (unit + integration + clean-room migration drift) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test && pnpm test:migrations`
- **Before `/gsd-verify-work`:** Full suite must be green AND manual email round-trip complete
- **Max feedback latency:** ~40 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01 (rbac) | 01 | 1 | AUTH-01 | T-02-01 / — | author blocked from `post.publish`; editor/admin allowed | unit | `pnpm test src/lib/permissions/__tests__/rbac.test.ts -t "publish"` | ❌ W0 | ⬜ pending |
| 02-01 (rbac) | 01 | 1 | AUTH-01 | — | `userHasPermission` returns correct result per role | unit | `pnpm test src/lib/permissions/__tests__/rbac.test.ts` | ❌ W0 | ⬜ pending |
| 02-02 (setup) | 02 | 2 | AUTH-02 | T-02-02 / — | createFirstAdmin succeeds with 0 admins | integration | `pnpm test src/actions/__tests__/users.test.ts -t "createFirstAdmin zero"` | ❌ W0 | ⬜ pending |
| 02-02 (setup) | 02 | 2 | AUTH-02 (D-08) | T-02-02 | createFirstAdmin REFUSES when an admin exists (security-critical self-disable) | integration | `pnpm test src/actions/__tests__/users.test.ts -t "createFirstAdmin blocked"` | ❌ W0 | ⬜ pending |
| 02-02 (signin) | 02 | 2 | AUTH-02 (D-18) | — | SignInForm calls authClient.signIn.email with rememberMe matching the checkbox state (checked=true, unchecked=false) | unit (component, jsdom) | `pnpm test src/components/auth/__tests__/SignInForm.test.tsx -t "rememberMe"` | ❌ W0 | ⬜ pending |
| 02-02 (signin) | 02 | 2 | AUTH-02 (D-19) | — | SignInForm calls authClient.signIn.email with callbackURL from the `next` search param, falling back to /dashboard | unit (component, jsdom) | `pnpm test src/components/auth/__tests__/SignInForm.test.tsx -t "callbackURL"` | ❌ W0 | ⬜ pending |
| 02-03 (proxy) | 01 | 1 | AUTH-03 | T-02-03 / Pitfall #4 | proxy.ts redirects unauth `/dashboard/*` → `/signin?next=...` | unit | `pnpm test __tests__/proxy.test.ts -t "unauth redirect"` | ❌ W0 | ⬜ pending |
| 02-03 (proxy) | 01 | 1 | AUTH-03 | Pitfall #4 | proxy.ts passes through with session cookie present | unit | `pnpm test __tests__/proxy.test.ts -t "authed pass"` | ❌ W0 | ⬜ pending |
| 02-03 (proxy) | 01 | 1 | AUTH-03 | — | proxy.ts redirects authed `/signin` → `/dashboard` (reverse) | unit | `pnpm test __tests__/proxy.test.ts -t "reverse redirect"` | ❌ W0 | ⬜ pending |
| 02-04 (ownership) | 01 | 1 | AUTH-04 | T-02-04 / Pitfall #1 | assertOwnsPost blocks non-owner author edit | integration | `pnpm test src/lib/permissions/__tests__/ownership.test.ts -t "non-owner blocked"` | ❌ W0 | ⬜ pending |
| 02-04 (ownership) | 01 | 1 | AUTH-04 | — | assertOwnsPost allows admin/editor bypass | integration | `pnpm test src/lib/permissions/__tests__/ownership.test.ts -t "admin bypass"` | ❌ W0 | ⬜ pending |
| 02-05 (transitions) | 01 | 1 | AUTH-05 | — | author draft→pending_review allowed; draft→published BLOCKED | unit | `pnpm test src/lib/permissions/__tests__/transitions.test.ts -t "author"` | ❌ W0 | ⬜ pending |
| 02-05 (transitions) | 01 | 1 | AUTH-05 | — | editor pending_review→published allowed | unit | `pnpm test src/lib/permissions/__tests__/transitions.test.ts -t "editor approve"` | ❌ W0 | ⬜ pending |
| 02-06 (email) | 03 | 3 | AUTH-06 | — | password reset token round-trip (request → hook fires → reset) | integration | `pnpm test __tests__/email-flows.test.ts -t "password reset"` | ❌ W0 | ⬜ pending |
| 02-06 (email) | 03 | 3 | AUTH-07 | T-02-06 | unverified email cannot sign in (requireEmailVerification) | integration | `pnpm test __tests__/email-flows.test.ts -t "unverified blocked"` | ❌ W0 | ⬜ pending |
| 02-06 (email) | 03 | 3 | AUTH-07 | — | verification email hook fires on createUser (sendOnSignUp) | integration | `pnpm test __tests__/email-flows.test.ts -t "verification sent"` | ❌ W0 | ⬜ pending |
| 02-07 (schema) | 01 | 1 | AUTH-08 | — | user table has bio + avatar columns | migration | `pnpm test:migrations` (clean-room drift test) | ✅ (Phase 1 script) | ⬜ pending |
| 02-08 (ban) | 03 | 3 | AUTH-01 / D-16 | T-02-08 | banned user cannot sign in | integration | `pnpm test __tests__/ban.test.ts -t "banned blocked"` | ❌ W0 | ⬜ pending |
| 02-09 (sessions) | 03 | 3 | D-17 | — | revokeAllSessions invalidates all sessions for a user | integration | `pnpm test __tests__/sessions.test.ts -t "revoke all"` | ❌ W0 | ⬜ pending |
| 02-09 (sessions) | 03 | 3 | AUTH-01 (persist) | — | session persists across requests when cookie carried | integration | `pnpm test __tests__/sessions.test.ts -t "persist"` | ❌ W0 | ⬜ pending |
| 02-07 (schema FK) | 01 | 1 | (FK) | — | posts.authorId FK → user.id; posts.categoryId FK → categories.id | migration | `pnpm test:migrations` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest` + `vitest.config.ts` — install runner (Better Auth peers expect vitest); add `package.json` script `"test": "vitest run"`
- [ ] `jsdom` (or `happy-dom`) dev dependency + `@testing-library/react` + `@testing-library/dom` — for the SignInForm component unit test (Task 1a scaffold lands vitest; the component-test deps land with 02-02 Task 2)
- [ ] `__tests__/` directory at repo root + `src/**/__tests__/` convention established
- [ ] `src/lib/permissions/__tests__/rbac.test.ts` — covers AUTH-01 (role→permission matrix)
- [ ] `src/lib/permissions/__tests__/ownership.test.ts` — covers AUTH-04 (assertOwnsPost)
- [ ] `src/lib/permissions/__tests__/transitions.test.ts` — covers AUTH-05 (status transitions)
- [ ] `src/actions/__tests__/users.test.ts` — covers AUTH-02 / D-08 (first-run self-disable — **security-critical**)
- [ ] `src/components/auth/__tests__/SignInForm.test.tsx` — covers D-18 (rememberMe arg) + D-19 (callbackURL arg) by mocking `authClient.signIn.email`
- [ ] `__tests__/proxy.test.ts` — covers AUTH-03 (proxy.ts redirect logic)
- [ ] `__tests__/email-flows.test.ts` — covers AUTH-06/07 (with stubbed sendEmail)
- [ ] `__tests__/ban.test.ts` + `__tests__/sessions.test.ts` — covers D-16/D-17

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email verification + password-reset reach a real inbox | AUTH-06, AUTH-07 | Requires Resend API key + DKIM/SPF/DMARC DNS records (Phase 7/deploy dependency per D-04) — not available in CI | After deploy: create a user, click the verification link in a real inbox, then trigger forgot-password and click the reset link. Confirm both arrive (not in spam). |
| Remember-me session duration (30d vs 7d/browser-session) | AUTH-01 (D-18) | Long-duration calendar-time behavior not exercisable in fast tests | Sign in with "Remember me" checked; confirm cookie expiry ~30d. Unchecked; confirm shorter/browser-session expiry. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (`vitest run`, not `vitest` watch)
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
