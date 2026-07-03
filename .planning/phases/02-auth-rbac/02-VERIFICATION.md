---
phase: 02-auth-rbac
verified: 2026-07-02T23:20:00Z
status: human_needed
score: 17/18 must-haves verified
behavior_unverified: 1 # the live-inbox email round-trip (deferred UAT item)
overrides_applied: 0
human_verification:
  - test: "Manual email verification + password-reset round-trip to a real inbox (UAT-02-01)"
    expected: "Both the verification email and the password-reset email arrive at a real inbox and the flows complete end-to-end (click link → verified/reset → sign in succeeds)."
    why_human: "Requires the operator's RESEND_API_KEY + DNS deliverability (DKIM/SPF/DMARC — Phase 7 / D-04). Automation proves the Better Auth hooks fire correctly with a stubbed sendEmail (53 tests green); it cannot prove Resend actually delivers to a real inbox. Explicitly deferred by user decision to UAT."
---

# Phase 2: Auth + RBAC — Verification Report

**Phase Goal:** Better Auth + admin plugin (3-role RBAC: admin/editor/author), the Next 16 `proxy.ts` UX-only gate, server-side permission helpers (requireRole/requireCan/assertOwnsPost), the post status-transition workflow (transitionPost), email verification + password reset, and the ban/revoke-session primitives — shipped together so the review workflow is genuinely enforced (not decorative) when posts ship in Phase 3.

**Verified:** 2026-07-02T23:20:00Z
**Status:** human_needed (1 deferred UAT item — automated verification otherwise clean)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Truths merged from ROADMAP Success Criteria + PLAN frontmatter `must_haves.truths` (PLAN truths add plan-specific detail; none reduce ROADMAP SC scope).

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A user can sign in at the dashboard signin page and stay authenticated across browser sessions; no open public sign-up (admin creates accounts). | ✓ VERIFIED | `src/components/auth/SignInForm.tsx:50-55` calls `authClient.signIn.email({email,password,rememberMe,callbackURL})`; `src/app/api/auth/[...all]/route.ts:12` mounts `toNextJsHandler(auth)`; `src/app/(full-width-pages)/(auth)/signup/page.tsx:35-44` redirects to `/signin` when an admin exists (no open sign-up); `__tests__/sessions.test.ts` "persist" green (53/53 suite pass). Session-persistence across requests is exercised; calendar-time 30d duration is a manual-only VALIDATION item but the config (`session.expiresIn: 60*60*24*30`, `src/lib/auth/index.ts:86`) is set. |
| 2 | Unauthenticated visitor hitting any `(admin)` route is redirected by `proxy.ts` (cookie gate); dashboard never treats that as the sole auth check. | ✓ VERIFIED | `proxy.ts:25-29` redirects no-cookie `/dashboard/*` → `/signin?next=<path>`; `proxy.ts:3-8` header carries the explicit `UX-ONLY — NOT authoritative RBAC (Pitfall #4)` callout; `__tests__/proxy.test.ts` "unauth redirect" + "authed pass" + "reverse redirect" green. Server-side re-check lives in `src/lib/permissions/index.ts:23-30` `getSessionOrThrow` (every helper calls it). |
| 3 | An author is blocked server-side from editor/admin-only mutations (e.g. publishing), even via crafted requests — every mutating Server Action starts with `getSession` + role + ownership checks (Pitfall #1). | ✓ VERIFIED | `src/lib/auth/permissions.ts:43-45` `authorRole` omits `post:["publish"]`; `src/lib/permissions/__tests__/rbac.test.ts:10-18` asserts `authorRole.authorize({post:['publish']}).success === false` + statements lack publish; `src/actions/users.ts:103,125,142,159` each `requireCan` FIRST; `src/actions/__tests__/users.test.ts:163-214` proves all 4 user-management actions throw FORBIDDEN before reaching `auth.api.admin.*` when `requireCan` denies. |
| 4 | Author cannot transition draft → published directly; transition table excludes it AND requireCan({post:['publish']}) fails — double enforcement (D-15). | ✓ VERIFIED | `src/lib/permissions/post-transitions.ts:23-27` `TRANSITIONS.author` has no path to `published`; `post-transitions.ts:69-71` calls `requireCan({post:['publish']})` BEFORE the table check when `target==="published"`; `src/lib/permissions/__tests__/transitions.test.ts:46-58` proves author draft→published throws FORBIDDEN at requireCan; editor approve path green. |
| 5 | Password reset via email link + email verification on account creation (Better Auth defaults + SMTP). | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Code present + hook wiring verified: `src/lib/auth/index.ts:55-61` `sendResetPassword` hook fires `void sendEmail(...)`; `index.ts:65-72` `sendVerificationEmail` + `sendOnSignUp:true`; `requireEmailVerification:true` at `index.ts:36`; `__tests__/email-flows.test.ts` "verification sent" + "unverified blocked" + "password reset" green with STUBBED sendEmail. Behavior NOT exercised against a real inbox — see Human Verification (UAT-02-01, deferred by user decision). |
| 6 | User record carries profile fields (bio, avatar) for byline/author pages; post status enum + review workflow primitives exist. | ✓ VERIFIED | `src/db/schema.ts:158-159` `bio` + `avatar` columns on `user`; `schema.ts:33-37` `postStatusEnum` = draft/pending_review/published; `src/lib/permissions/post-transitions.ts:50-84` `transitionPost` funnels ALL status writes (R7); `pnpm test:migrations` confirms 12 tables in clean DB incl. user with bio/avatar. |
| 7 | createFirstAdmin checks count(admins)===0 BEFORE any Better Auth call and refuses (FORBIDDEN) when an admin exists (D-08 — non-negotiable). | ✓ VERIFIED | `src/actions/users.ts:66-75` count query + refusal BEFORE the `adminApi.createUser` call at line 80; `src/actions/__tests__/users.test.ts:117-148` "createFirstAdmin blocked" test mocks `createUser` to throw `MUST_NOT_BE_REACHED` — proves the count-check gates the auth call BY EXECUTION ORDER, not just refusal. The structural ordering property is enforced, not a code-review judgment. |
| 8 | createFirstAdmin succeeds when zero admins exist (creates role:'admin'). | ✓ VERIFIED | `src/actions/users.ts:80-88` calls `adminApi.createUser` with `role:"admin"` + `emailVerified:true`; `users.test.ts:94-114` "createFirstAdmin zero" test asserts createUser called once with `role:"admin"` and returns the result. |
| 9 | Signup page renders admin-creation form ONLY when count(admins)===0; otherwise redirects to /signin. | ✓ VERIFIED | `src/app/(full-width-pages)/(auth)/signup/page.tsx:35-44` `SetupGate` Server Component queries count + `redirect("/signin")` when > 0, else renders `<SignUpForm/>`; `SignUpForm.tsx:14,34` bound to `createFirstAdmin` via `useActionState`. |
| 10 | SignInForm calls authClient.signIn.email with email, password, rememberMe, callbackURL (D-18/D-19). | ✓ VERIFIED | `src/components/auth/SignInForm.tsx:50-55` calls `authClient.signIn.email({email,password,rememberMe:isChecked,callbackURL})`; `useCallbackURL` at `:24-32` reads `next` search param with `/dashboard` fallback + same-origin guard (rejects absolute URLs — T-02-08); `src/components/auth/__tests__/SignInForm.test.tsx` asserts spy args for both rememberMe states + both callbackURL states. |
| 11 | Every action in src/actions/users.ts starts with getSession + permission check EXCEPT createFirstAdmin (bootstrap exception). | ✓ VERIFIED | `createUser` (line 103), `banUser` (125), `unbanUser` (142), `revokeSessions` (159) each call `requireCan(...)` first; `createFirstAdmin` is the documented exception gated by `count===0`; `users.test.ts:151-214` proves the ordering structurally for all 4 non-bootstrap actions. |
| 12 | nextCookies() is the LAST entry in the Better Auth plugins array (R2). | ✓ VERIFIED | `src/lib/auth/index.ts:90-100` plugins array: `[admin({...}), nextCookies()]` — nextCookies is last, with an inline comment at `:97-98` documenting the ordering constraint. |
| 13 | requireEmailVerification is true (D-09). | ✓ VERIFIED | `src/lib/auth/index.ts:36` `requireEmailVerification: true` inside `emailAndPassword`; `email-flows.test.ts` "unverified blocked" green. |
| 14 | No extra CSRF library — auth mutations rely on Better Auth origin validation + Next 16 built-in Server Action origin check (D-23). | ✓ VERIFIED | No `csurf`/`csrf` package in `package.json`; `src/lib/auth/index.ts:24-26` sets `trustedOrigins` from env (Better Auth origin validation surface); Server Actions carry `"use server"` directive (`src/actions/users.ts:15`) which Next 16 origin-checks. |
| 15 | posts.authorId references user.id and posts.categoryId references categories.id (FK closure). | ✓ VERIFIED | `src/db/schema.ts:50` `authorId: text("author_id").references(() => user.id)`; `schema.ts:51` `categoryId: integer("category_id").references(() => categories.id)`; clean-room migration test applies both FK constraints (12-table drift pass). |
| 16 | Applying every committed migration to a clean empty Postgres reproduces the schema with all 12 tables. | ✓ VERIFIED | `pnpm test:migrations` exit 0: "Tables in clean DB (12): account, categories, media, pages, post_seo, post_tags, posts, session, settings, tags, user, verification — All 12 expected tables present." |
| 17 | Banned user cannot sign in; admin.unbanUser restores; revokeUserSessions invalidates all sessions (D-16/D-17). | ✓ VERIFIED (wiring) | `src/actions/users.ts:121-134` `banUser` calls `adminApi.banUser`; `:141-147` `unbanUser` calls `adminApi.unbanUser`; `:158-164` `revokeSessions` calls `adminApi.revokeUserSessions`; each preceded by `requireCan`. `__tests__/ban.test.ts` exercises the ban/unban success path; `__tests__/sessions.test.ts` exercises revoke. The actual "banned user sign-in blocked" runtime enforcement is a Better Auth admin-plugin invariant (it reads `user.banned` on sign-in) — present + wired, primitive invocation proven. |
| 18 | All email sends in hooks are fire-and-forget (void sendEmail) — never awaited (R8); lib/email returns silently on error. | ✓ VERIFIED | `src/lib/auth/index.ts:56,66` both hooks use `void sendEmail(...)`; `grep "await sendEmail" src/lib/auth` returns no matches; `src/lib/email/index.ts:56-70` logs + returns on error (does NOT throw). R8 satisfied structurally. |

**Score:** 17/18 truths verified (1 present + wired but behavior-unverified against a real inbox — UAT deferral)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/lib/auth/index.ts` | exports `auth` + `getSession` | ✓ VERIFIED | betterAuth() instance + getSession (lines 20,107); nextCookies LAST; requireEmailVerification:true; customSyntheticUser present |
| `src/lib/auth/permissions.ts` | exports ac, adminRole, editorRole, authorRole | ✓ VERIFIED | createAccessControl + 3 roles (lines 24,27,35,43); authorRole lacks publish |
| `src/lib/auth/client.ts` | exports authClient (adminClient plugin) | ✓ VERIFIED | createAuthClient + adminClient + 3 roles (lines 13-20) |
| `src/lib/auth/server.ts` | re-exports getSession + permission helpers | ✓ VERIFIED | thin barrel (lines 9-10) |
| `src/lib/permissions/index.ts` | requireRole/requireCan/assertOwnsPost/getSessionOrThrow | ✓ VERIFIED | all 4 exported (lines 23,40,57,78); each denial path log.error then throw |
| `src/lib/permissions/post-transitions.ts` | transitionPost + TRANSITIONS | ✓ VERIFIED | exported (line 50); TRANSITIONS record (line 22); double enforcement for publish |
| `src/app/api/auth/[...all]/route.ts` | GET + POST via toNextJsHandler | ✓ VERIFIED | line 12 |
| `proxy.ts` | UX-only gate + matcher | ✓ VERIFIED | lines 12-32 (gate), 38 (matcher); UX-only header callout present |
| `src/actions/users.ts` | createFirstAdmin/createUser/banUser/unbanUser/revokeSessions | ✓ VERIFIED | all 5 exported; requireCan-first convention; D-08 ordering proven |
| `src/lib/email/index.ts` | sendEmail + server-only + no-throw | ✓ VERIFIED | lines 40-72; server-only header; logs+returns on error |
| `src/db/schema.ts` | auth tables + role/banned/bio/avatar + FK closure | ✓ VERIFIED | user/session/account/verification tables; bio+avatar (158-159); FKs (50-51) |
| `src/db/auth-schema.ts` | (CLI-generated) | ℹ️ INFO | merged into schema.ts (single-schema approach); no separate file but the schema content is present and the clean-room test passes |
| `vitest.config.ts` | test runner wired | ✓ VERIFIED | `pnpm test` runs 53 tests |
| Test files (9) | rbac/ownership/transitions/proxy/users/SignInForm/email-flows/ban/sessions | ✓ VERIFIED | all present, all green |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| Better Auth instance | Drizzle adapter / db singleton | `drizzleAdapter(db, {schema})` | ✓ WIRED | `src/lib/auth/index.ts:28-31` uses the same `@/lib/db` pool |
| Better Auth instance | nextCookies() LAST | plugins array ordering | ✓ WIRED | `index.ts:90-100` — nextCookies is the final entry |
| Permission helpers | auth.api.getSession + userHasPermission | authoritative RBAC path | ✓ WIRED | `src/lib/permissions/index.ts:24,59-61` |
| proxy.ts | getSessionCookie (optimistic) | UX-only check | ✓ WIRED | `proxy.ts:10,14` — explicitly NOT authoritative (header callout) |
| transitionPost | assertOwnsPost + requireCan + db.update | single funnel (R7) | ✓ WIRED | `post-transitions.ts:63,70,80-83` |
| createFirstAdmin | auth.api.admin.createUser (role:'admin') | bootstrap path | ✓ WIRED | `users.ts:80-88` — gated by count===0 first |
| signup page (Server Component) | count(admins) + createFirstAdmin | setup gate | ✓ WIRED | `signup/page.tsx:35-44` + `SignUpForm.tsx:14` |
| SignInForm | authClient.signIn.email → /api/auth/[...all] | signin loop | ✓ WIRED | `SignInForm.tsx:50-55`; route handler mounted |
| Better Auth hooks | lib/email sendEmail → Resend | email flows | ✓ WIRED | `index.ts:56,66` `void sendEmail(...)`; `email/index.ts:46` `resend.emails.send` |
| ban/revoke actions | auth.api.admin.banUser/revokeUserSessions | primitives | ✓ WIRED | `users.ts:127,144,161` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| signup/page.tsx | count(admins) row.n | `db.select({n:count()}).from(user).where(role='admin')` | Yes (real DB query) | ✓ FLOWING |
| createFirstAdmin | count check + createUser result | db.select + auth.api.admin.createUser | Yes (both real) | ✓ FLOWING |
| SignInForm | error/result | authClient.signIn.email response | Yes (real auth route) | ✓ FLOWING |
| email hooks | sendEmail call args | Better Auth hook `{user,url}` | Yes (real hook args, stubbed sender in tests) | ✓ FLOWING (live delivery = UAT) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full test suite (all 9 files) | `pnpm test` | 53 passed (53) | ✓ PASS |
| Clean-room migration drift (12 tables) | `pnpm test:migrations` | "All 12 expected tables present. PASSED" | ✓ PASS |
| Production build | `pnpm build` | exit 0; /signup is Partial Prerender (Suspense boundary works) | ✓ PASS |
| R8: no `await sendEmail` in hooks | `grep "await sendEmail" src/lib/auth` | No matches | ✓ PASS |
| drizzle-orm pinned (R5) | `grep "drizzle-orm" package.json` | `"drizzle-orm": "^0.45.2"` (not 1.x) | ✓ PASS |

### Probe Execution

Not applicable — Phase 2 declares no probe-based verification. Conventional `scripts/*/tests/probe-*.sh` probes do not exist for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| AUTH-01 | 02-01, 02-03 | Better Auth + admin plugin; 3 roles via createAccessControl | ✓ SATISFIED | permissions.ts (3 roles); rbac.test.ts green; ban/sessions tests green |
| AUTH-02 | 02-02 | Sign-in working; admin creates accounts; no open sign-up | ✓ SATISFIED | SignInForm wired; createFirstAdmin + users.test.ts green; signup page self-closes |
| AUTH-03 | 02-01 | proxy.ts cookie-existence gate | ✓ SATISFIED | proxy.ts + proxy.test.ts (3 cases) green |
| AUTH-04 | 02-01 | lib/permissions helpers; every mutating action server-side checks | ✓ SATISFIED | permissions/index.ts exports all 4 helpers; ownership.test.ts green; users.test.ts proves ordering |
| AUTH-05 | 02-01 | Author→submit→editor/admin-approve→publish enforced server-side | ✓ SATISFIED | post-transitions.ts TRANSITIONS + double enforcement; transitions.test.ts green |
| AUTH-06 | 02-03 | Password reset via email link | ✓ SATISFIED (code) / ⚠️ UAT (delivery) | email-flows.test.ts "password reset" green (hook fires); real-inbox delivery deferred to UAT-02-01 |
| AUTH-07 | 02-03 | Email verification on account creation | ✓ SATISFIED (code) / ⚠️ UAT (delivery) | email-flows.test.ts "verification sent" + "unverified blocked" green; real-inbox delivery deferred to UAT-02-01 |
| AUTH-08 | 02-01 | Author profile fields (bio, avatar) | ✓ SATISFIED | schema.ts user.bio + user.avatar; clean-room migration test confirms columns |

**Orphaned requirements:** None. REQUIREMENTS.md maps AUTH-01..08 to Phase 2; all 8 appear in PLAN frontmatter `requirements:` fields and are covered above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none of concern) | — | — | — | — |

No `TBD`/`FIXME`/`XXX` debt markers in any phase-modified file. The `ecommerce/` TailAdmin demo folder noted in CLAUDE.md as "remove" still exists but is out of Phase 2 scope (Phase 4 cleanup). No stub implementations: every exported function has a real body wired to a real primitive. The `email/index.ts:24` `dev-placeholder` fallback for an empty `RESEND_API_KEY` is intentional (prevents the Resend constructor from throwing during dev/build — documented in the file comment, not a stub).

### Human Verification Required

### 1. Manual email verification + password-reset round-trip to a real inbox (UAT-02-01)

**Test:** With a real `RESEND_API_KEY` in `.env.local`, run `pnpm dev`, create a user via the setup wizard or dashboard, check the inbox for the verification email, click the link, then trigger "forgot password" and click the reset link.
**Expected:** Both the verification email and the password-reset email arrive (not in spam, if DNS is configured) and the flows complete end-to-end (click link → verified/reset → sign in succeeds).
**Why human:** Requires the operator's Resend account + DNS deliverability (DKIM/SPF/DMARC — Phase 7 / D-04). The 53 automated tests prove the Better Auth hooks fire correctly with a stubbed sendEmail (verification URL/reset URL passed to sendEmail with the right args); they cannot prove Resend actually delivers to a real inbox. Explicitly deferred by user decision and recorded as UAT-02-01 in `.planning/phases/02-auth-rbac/02-UAT.md`. This is a delivery-test gap, not an implementation gap — the code is complete and correct.

### Gaps Summary

No implementation gaps. All 8 requirements (AUTH-01..08) are satisfied in code with passing automated tests. The single human-verification item is the live email-inbox round-trip, which is explicitly deferred to UAT by user decision (it depends on operator infrastructure, not code correctness).

Security-critical items all verified:
- **D-08 createFirstAdmin self-disable** — count-before-create ordering proven structurally by the "createFirstAdmin blocked" test (mocks createUser to throw `MUST_NOT_BE_REACHED`).
- **Pitfall #1 (server-side auth on every mutation)** — all 4 user-management actions start with `requireCan`; proven by users.test.ts ordering assertions.
- **Pitfall #4 (proxy UX-only)** — proxy.ts header carries the explicit callout; real auth happens in permission helpers.
- **R8 (no await sendEmail)** — both hooks use `void sendEmail(...)`; grep confirms no `await sendEmail`.
- **R5 (drizzle ^0.45.2)** — pinned in package.json; not bumped to 1.x.
- **R2 (nextCookies last)** — confirmed last in the plugins array with inline comment.
- **R7 (transitionPost single funnel)** — all status writes flow through the helper.

---

_Verified: 2026-07-02T23:20:00Z_
_Verifier: Claude (gsd-verifier)_
