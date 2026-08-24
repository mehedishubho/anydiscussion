---
phase: 02-auth-rbac
plan: 06
subsystem: auth
tags: [auth, email-verification, better-auth, gap-closure, regression-test]

# Dependency graph
requires:
  - phase: 02-02
    provides: createUser/createFirstAdmin Server Actions + requireCan permission gate
  - phase: 02-03
    provides: Better Auth instance with emailVerification hooks wired to Resend-backed sendEmail
provides:
  - createUser action explicitly calls auth.api.sendVerificationEmail after creation (AUTH-07 causal link enforced in action code)
  - AUTH-07 action-layer regression block (5 tests: causal link, ordering, failure isolation, no-send-on-failed-creation, bootstrap scope)
  - Verified better-auth 1.6.23 boundary documented in code (sendOnSignUp consumed only by /sign-up/email + OAuth link-account)
affects: [02-auth-rbac, uat-test-5, future-user-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
  - "Action-layer causal regression tests: when a framework behavior is assumed, the test must observe the CALL on the mocked framework boundary, not the config flag that was assumed to trigger it (the blind-spot class this plan closes)"

key-files:
  created: []
  modified:
  - src/actions/users.ts
  - src/lib/auth/index.ts
  - src/actions/__tests__/users.test.ts
  - __tests__/email-flows.test.ts

key-decisions:
  - "Explicit send in the action (await auth.api.sendVerificationEmail in try/catch) rather than any framework reliance — better-auth 1.6.23's admin createUser endpoint provably contains no email-verification logic"
  - "Send failure is swallowed AFTER log.error carrying { email, err } — a propagated rejection would mask a successful creation as failed (ghost user; retry collides on duplicate email)"
  - "Awaited (not void) send inside the action so the catch observes the rejection — the R8 timing-attack rationale for void does not apply to a requireCan-gated admin action with no account-existence secret"

patterns-established:
  - "Config-wiring tests must carry an explicit CONFIG WIRING ONLY comment pointing at the behavioral proof's location — prevents the email-flows.test.ts blind-spot class from recurring"

requirements-completed: [AUTH-07]

coverage:
  - id: D1
    description: "createUser action sends the verification email exactly once after creation resolves (AUTH-07 causal link)"
    requirement: AUTH-07
    verification:
      - kind: unit
        ref: "src/actions/__tests__/users.test.ts#AUTH-07: createUser action explicitly sends the verification email after creation > causal link"
        status: pass
      - kind: unit
        ref: "src/actions/__tests__/users.test.ts#AUTH-07 > ordering: the send happens only AFTER the creation call resolves"
        status: pass
    human_judgment: false
  - id: D2
    description: "Send-failure isolation + no-send-on-failed-creation + bootstrap no-send semantics"
    requirement: AUTH-07
    verification:
      - kind: unit
        ref: "src/actions/__tests__/users.test.ts#AUTH-07 > failure isolation / no send on failed creation / bootstrap scope"
        status: pass
    human_judgment: false
  - id: D3
    description: "False sendOnSignUp comment and dishonest config-only test name replaced with the verified framework boundary"
    verification:
      - kind: other
        ref: "negative greps: 'fires on admin.createUser' absent from src/lib/auth/index.ts; 'so admin.createUser fires' absent from __tests__/email-flows.test.ts"
        status: pass
      - kind: unit
        ref: "pnpm vitest run __tests__/email-flows.test.ts (10/10 pass)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live round-trip: dashboard-created non-admin user receives 'Verify your email address' via Resend, link click enables sign-in (UAT Test 5)"
    requirement: AUTH-07
    verification: []
    human_judgment: true
    rationale: "Real Resend delivery to a fresh deliverable inbox and the verification-link click are external-world behavior a unit suite cannot exercise; the plan's verification section explicitly designates this as the manual post-execution gate."

# Metrics
duration: 6min
completed: 2026-08-24
status: complete
---

# Phase 2 Plan 06: createUser Verification-Email Gap Closure Summary

**createUser action now explicitly awaits auth.api.sendVerificationEmail after creation (try/catch, log.error on failure) with a 5-test AUTH-07 regression block proving the causal link the config-only D2 tests never observed**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-24T10:10:55Z
- **Completed:** 2026-08-24T10:16:55Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- createUser action captures the auth.api.createUser result, then explicitly calls auth.api.sendVerificationEmail({ body: { email } }) in try/catch — the AUTH-07 causal link enforced in our action code, not assumed of better-auth 1.6.23
- Send failures are logged (log.error with the created email + error) and swallowed — a failed Resend call can never report a successful creation as failed
- New AUTH-07 regression describe block in src/actions/__tests__/users.test.ts: causal link, invocation ordering, failure isolation, no-send-on-failed-creation, and bootstrap no-send (createFirstAdmin untouched)
- False comment at src/lib/auth/index.ts:73 replaced with the verified boundary (sendOnSignUp consumed ONLY by /sign-up/email and OAuth link-account), citing the debug session
- Dishonest config-only test renamed to an honest boundary statement with a CONFIG WIRING ONLY comment pointing at the action-layer proof

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): AUTH-07 regression block** - `3827446` (test)
2. **Task 1 (GREEN): createUser explicit send** - `c4a5a1a` (feat)
3. **Task 2: comment + test-name truth fixes** - `050a040` (docs)

**Plan metadata:** see final docs commit

_Note: TDD tasks may have multiple commits (test → feat → refactor). No refactor needed — GREEN code is minimal._

## TDD Gate Compliance

Task 1 executed with strict RED → GREEN:
- RED (`3827446`): 3 new tests failed against the unmodified action (causal link: 0 send calls; ordering: no send to order; failure isolation: no log.error) while all 15 existing tests stayed green — the D2 blind spot became observable in the suite
- GREEN (`c4a5a1a`): 18/18 pass after the action fix
- REFACTOR: not needed

## Files Created/Modified
- `src/actions/users.ts` - createUser captures creation result, sends verification email explicitly, swallows+logs send failures, returns captured result; requireCan still first; createFirstAdmin untouched
- `src/lib/auth/index.ts` - sendOnSignUp comment corrected to the verified better-auth 1.6.23 boundary with debug-session citation
- `src/actions/__tests__/users.test.ts` - sendVerificationEmailMock + hoisted log spies wired into the auth.api/log mocks; new 5-test AUTH-07 describe block
- `__tests__/email-flows.test.ts` - third AUTH-07 test renamed to the honest boundary statement + CONFIG WIRING ONLY comment

## Decisions Made
- Awaited send (not void) inside the action so the catch observes rejections; R8 void rationale documented as inapplicable (requireCan-gated admin action, no account-existence secret)
- log.error carries the created email deliberately: the original failure mode was fully silent and server logs are admin-only
- Hoisted logInfo/logError spies (replacing the anonymous no-op log stub) so the failure-isolation test can assert on log.error — minimal mock-structure extension, no new imports

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fresh worktree had no node_modules**
- **Found during:** Task 1 (RED verification)
- **Issue:** pnpm vitest failed — 'vitest' not found; the worktree checkout ships without installed dependencies
- **Fix:** pnpm install --prefer-offline (lockfile-faithful, no new packages)
- **Files modified:** none committed (node_modules is gitignored)
- **Verification:** vitest 4.1.9 ran the suite successfully
- **Committed in:** n/a (environment only)

**2. [Scope boundary] Pre-existing tsc --noEmit errors logged, not fixed**
- **Found during:** Task 1 (GREEN verification)
- **Issue:** pnpm exec tsc --noEmit reports 20 error lines (TS2322 className-on-IntrinsicAttributes in SignInForm/SignUpForm/date-picker/AppSidebar; TS18048 in storage-settings.test.ts)
- **Fix:** Proved pre-existing by reverting the plan's two edited files to base f93e44b and re-running tsc (20 errors before, 20 after — zero delta). Logged to .planning/phases/02-auth-rbac/deferred-items.md per the scope-boundary rule; none touch this plan's four files
- **Files modified:** .planning/phases/02-auth-rbac/deferred-items.md (new)
- **Verification:** tsc delta vs base is exactly zero
- **Committed in:** plan metadata commit

---

**Total deviations:** 2 (1 blocking auto-fix [environment], 1 documented scope-boundary log)
**Impact on plan:** None on plan scope — all four target files changed exactly as specified.

## Issues Encountered
- None beyond the deviations above. RED proof matched the plan's prediction exactly (causal-link + failure-isolation fail; existing suite stays green).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- AUTH-07 automated coverage is complete at the action layer; the live Resend round-trip (UAT Test 5 re-run) remains the designated manual gate before closing the UAT issue
- Pre-existing repo-wide tsc errors (icon className typing + one test file) are logged in deferred-items.md for a future cleanup pass

## Self-Check: PASSED

- .planning/phases/02-auth-rbac/02-06-SUMMARY.md — FOUND
- .planning/phases/02-auth-rbac/deferred-items.md — FOUND
- Task commits on branch: 3827446 (test RED), c4a5a1a (feat GREEN), 050a040 (docs) — all FOUND
- Verification gates: users.test.ts 18/18, email-flows.test.ts 10/10, full suite 562/562, both negative greps pass, tsc delta vs base zero

---
*Phase: 02-auth-rbac*
*Completed: 2026-08-24*
