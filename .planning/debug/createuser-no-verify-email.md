---
status: diagnosed
trigger: "AUTH-07 Phase 02 test 5: dashboard-created user (non-admin) never receives verification email — Resend shows NO send record at all"
created: 2026-08-24T00:00:00Z
updated: 2026-08-24T00:05:00Z
---

## Current Focus

hypothesis: CONFIRMED — better-auth 1.6.23's admin-plugin createUser endpoint (/admin/create-user) contains NO email-verification logic; sendOnSignUp:true is consumed only by /sign-up/email and OAuth link-account. The comment "fires on admin.createUser too" (src/lib/auth/index.ts:73, from 02-RESEARCH.md:347) is a docs-memory assumption, never true of the installed version.
test: Exhaustive call-site enumeration of options.emailVerification.sendVerificationEmail + sendOnSignUp across node_modules/better-auth/dist (complete — see Evidence).
expecting: n/a — root cause confirmed.
next_action: Return ROOT CAUSE FOUND to caller (find_root_cause_only mode — no fix applied).

## Symptoms

expected: Dashboard-created user (Users page -> UserDrawer -> createUser action) receives "Verify your email address" email via Resend; Resend dashboard shows a send record.
actual: User IS created successfully, but NO verification email is sent — Resend dashboard shows NO send attempt at all (not failed — never attempted). Server log shows zero email-related lines (lib/email logs on error per R8 fire-and-forget contract).
errors: None — silent. No error in server logs, no Resend record.
reproduction: Sign in as admin -> Dashboard Users page -> UserDrawer -> create user (non-admin role) -> check Resend dashboard + server logs. Test 4 (forgot-password reset email) PASSED minutes earlier in the SAME server process (lib/email + RESEND_API_KEY proven live).
started: Always broken for this path (AUTH-07 Phase 02 test 5, first observation).

## Eliminated

- hypothesis: lib/email / Resend key broken or silently failing
  evidence: Test 4 (forgot-password) delivered live from the same server process minutes earlier; also no lib/email error log line exists (lib/email console.errors on any failure — src/lib/email/index.ts:56-69). Resend shows NO record = sendEmail never called, not "called and failed".
  timestamp: 2026-08-24T00:02:00Z

- hypothesis: emailVerification callback throws before reaching sendEmail (bad env/URL)
  evidence: Runtime path never invokes the callback at all (admin plugin has zero emailVerification references). Also sendVerificationEmail callback body only reads user.email/url — no env dependency that could throw before sendEmail.
  timestamp: 2026-08-24T00:03:00Z

- hypothesis: adminApi nested-vs-flat invocation caused a silent miss (the 02-02 gotcha class)
  evidence: User WAS created — src/actions/users.ts:94 auth.api.createUser (flat) executed successfully. The invocation is correct; the endpoint itself simply does not send verification emails.
  timestamp: 2026-08-24T00:03:00Z

## Evidence

- timestamp: 2026-08-24T00:01:00Z
  checked: src/lib/auth/index.ts
  found: emailVerification config lines 65-74: sendVerificationEmail callback fire-and-forget calls sendEmail; sendOnSignUp:true with comment "fires on admin.createUser too" (line 73 — an UNVERIFIED claim traced to .planning/phases/02-auth-rbac/02-RESEARCH.md:347).
  implication: Callback wiring is correct in isolation; the question is whether Better Auth ever invokes it on the admin path.

- timestamp: 2026-08-24T00:02:00Z
  checked: src/actions/users.ts:81-102 + src/app/(admin)/dashboard/users/UserDrawer.tsx:22,101
  found: Dashboard path: UserDrawer -> createUser action -> auth.api.createUser({ body: { email, password, name, role } }) — flat, body only, no headers. No email logic anywhere in the action or drawer.
  implication: Runtime path is exactly the admin plugin's /admin/create-user endpoint, nothing else.

- timestamp: 2026-08-24T00:03:00Z
  checked: node_modules/better-auth/dist/plugins/admin/ (better-auth 1.6.23, version confirmed via package.json)
  found: grep for sendVerificationEmail|emailVerification|sendOnSignUp across the entire admin plugin dir: ZERO matches. The /admin/create-user endpoint (dist/plugins/admin/routes.mjs:130-208) does: permission check -> internalAdapter.createUser (line 191) -> linkAccount credential (lines 198-206) -> return ctx.json({user}) (line 207). No email code exists in the endpoint.
  implication: The admin createUser endpoint CANNOT send a verification email — the code path does not exist.

- timestamp: 2026-08-24T00:04:00Z
  checked: Exhaustive grep of ALL consumers of sendOnSignUp and options.emailVerification.sendVerificationEmail across better-auth dist
  found: sendOnSignUp consumed at exactly 2 sites: dist/api/routes/sign-up.mjs:241 (/sign-up/email) and dist/oauth2/link-account.mjs:106 (OAuth). sendVerificationEmail invoked at: sign-up.mjs:245, sign-in.mjs:236 (unverified sign-in attempt), update-user.mjs:425 (email change), plugins/username/index.mjs:209, oauth2/link-account.mjs:109, api/routes/email-verification.mjs:30,195,251 (sendVerificationEmailFn helper + /send-verification-email + /verify-email resend). Admin plugin: absent from every list.
  implication: CONFIRMED — sendOnSignUp:true has no effect on admin createUser in 1.6.23. Root cause found.

- timestamp: 2026-08-24T00:04:30Z
  checked: __tests__/email-flows.test.ts (the D2 test backing the coverage claim in 02-03-SUMMARY.md:59-69)
  found: Test mocks betterAuth as identity fn `(opts) => opts` (lines 31-33) and admin plugin as `() => ({})` (lines 39-41). "verification sent" test (lines 83-101) calls the configured sendVerificationEmail callback DIRECTLY with hand-built {user,url,token} args — never through any endpoint. "sendOnSignUp is true so admin.createUser fires the verification email" test (lines 103-105) asserts ONLY `sendOnSignUp === true` — the causal claim exists solely in the test NAME; no assertion exercises createUser.
  implication: D2 proved "callback calls sendEmail when invoked" (tautology) and "config value true" — never "createUser triggers the callback". Same blind-spot class as the proxy.ts issue: unit test asserts config/callbacks directly, bypassing framework routing/registration.

- timestamp: 2026-08-24T00:05:00Z
  checked: Fix vector — dist/api/routes/email-verification.mjs:36-122 (/send-verification-email endpoint) + dist/api/routes/session.mjs:271-300 (getSessionFromCtx) + dist/api/index.d.mts:727
  found: auth.api.sendVerificationEmail exists flat on the server API (d.mts:727, same keying as auth.api.createUser). Headerless server call -> getSessionFromCtx returns null (never throws; session.mjs:286-292 catch->null) -> anti-enumeration branch (email-verification.mjs:96-117) -> findUserByEmail finds the just-created unverified user -> sendVerificationEmailFn (line 109->22-35) -> token + `${baseURL}/verify-email?token=...` URL -> invokes OUR configured callback -> void sendEmail -> Resend. Side effect: ≤500ms constant-time floor (line 103-114).
  implication: Minimal fix is one explicit call in the createUser action.

- timestamp: 2026-08-24T00:05:30Z
  checked: Sign-in fallback behavior (dist/api/routes/sign-in.mjs:236)
  found: When an unverified user attempts sign-in (requireEmailVerification:true), Better Auth DOES send a verification email on that attempt. Mitigating factor only — does not satisfy AUTH-07 test 5 (email at creation).
  implication: Not a fix; explains why the missing email is not fully user-blocking.

## Resolution

root_cause: better-auth 1.6.23's admin-plugin createUser endpoint (/admin/create-user — dist/plugins/admin/routes.mjs:130-208) contains no email-verification logic whatsoever; emailVerification.sendOnSignUp:true is consumed only by /sign-up/email (dist/api/routes/sign-up.mjs:241) and OAuth link-account (dist/oauth2/link-account.mjs:106). Therefore the dashboard's createUser path (UserDrawer -> src/actions/users.ts:94 auth.api.createUser) never invokes the sendVerificationEmail callback — no sendEmail call, no Resend record, no error. The claim "sendOnSignUp: true // fires on admin.createUser too" (src/lib/auth/index.ts:73) is false for the installed version; it originated as a docs-memory assumption in 02-RESEARCH.md:347 and the D2 coverage claim (02-03-SUMMARY.md:59-69) never actually verified the causal link.
fix: (proposed — find_root_cause_only mode, not applied) In src/actions/users.ts createUser action, after successful auth.api.createUser, explicitly invoke `await auth.api.sendVerificationEmail({ body: { email: input.email } })` wrapped in try/catch + log.error (user already exists at that point — a send failure must not mask successful creation). Flat key confirmed at dist/api/index.d.mts:727; headerless server call takes the anti-enumeration branch which sends to the just-created unverified user (email-verification.mjs:96-117), costs ≤500ms. Also correct the false comment at src/lib/auth/index.ts:73. Optional: an integration-style regression test that exercises real endpoint routing (not the mocked-betterAuth identity pattern).
verification: (pending — fix not applied in this mode)
files_changed: []
