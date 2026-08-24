---
phase: quick-260824-qtu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/actions/users.ts
  - src/actions/__tests__/users.test.ts
autonomous: true
requirements: [DASH-04]
must_haves:
  truths:
    - "All FOUR middleware-gated auth.api call sites in src/actions/users.ts (banUser ~line 148, unbanUser ~line 168, revokeUserSessions ~line 188, removeUser ~line 443) pass headers: await headers() in the options object — the live 401 root cause (adminMiddleware at node_modules/better-auth/dist/plugins/admin/routes.mjs:16-20 throws UNAUTHORIZED when getAuthoritativeSessionFromCtx finds no session) is eliminated"
    - "deleteUser no longer logs 'user deleted' before the delete happened — log.info fires only AFTER auth.api.removeUser resolves, and a removeUser rejection instead fires log.error and throws Error('Failed to delete user — please try again.') so the dashboard alert is never a blank message"
    - "auth.api.createUser (lines 65, 100) and auth.api.sendVerificationEmail (line 120) keep their EXACT current headerless call shapes — createUser tolerates headerless calls by design (routes.mjs:146-149) and sendVerificationEmail is deliberately headerless (anti-enumeration, .planning/debug/createuser-no-verify-email.md)"
    - "Every existing guard test (permission-first FORBIDDEN ordering, self-delete, last-admin, has-posts, AUTH-07 block) passes unchanged"
    - "A regression test per endpoint asserts the headers key is PRESENT in the call argument for all four middleware-gated endpoints — the headerless-internal-call bug class is now structurally caught"
  artifacts:
    - "src/actions/users.ts — headers import from next/headers; headers forwarded at the 4 middleware-gated call sites; removeUser wrapped in try/catch with log reordering; explanatory comment documenting the headerless/gated asymmetry; stale updateUser JSDoc line (~259) corrected"
    - "src/actions/__tests__/users.test.ts — vi.mock('next/headers', ...) added; deleteUser success assertion extended with headers; new regression describe block covering all four endpoints + failure path + log ordering + headerless createUser documentation"
  key_links:
    - "users.ts `import { headers } from 'next/headers'` → `headers: await headers()` at each middleware-gated options object → adminMiddleware resolves the caller's session from the forwarded cookie — same established pattern as src/lib/permissions/index.ts:24 (auth.api.getSession)"
    - "deleteUser removeUser rejection → log.error('deleteUser failed', …) + throw friendly Error → UsersTable deleteMutation onError → shared red alert (built in 260824-ptx) now shows a real message"
---

<objective>
Fix the live 401 bug shipped by quick task 260824-ptx: the dashboard deleteUser logged "user deleted" and then threw APIError UNAUTHORIZED, with the user still in the DB and a blank error alert. Root cause (verified live, do not re-derive): better-auth 1.6.23 admin-plugin routes gated by adminMiddleware (node_modules/better-auth/dist/plugins/admin/routes.mjs:16-20) throw APIError UNAUTHORIZED when invoked server-side WITHOUT request headers, because getAuthoritativeSessionFromCtx finds no session. ALL FOUR middleware-gated auth.api call sites in src/actions/users.ts are headerless, so ban/unban/revoke-sessions have the same latent bug (DB has zero banned users — ban has never worked live).

Purpose: user management (delete / ban / unban / revoke sessions) must actually work in production, and failures must surface as readable alerts, not blank Server Components errors.
Output: src/actions/users.ts with headers forwarded at exactly the four gated call sites (createUser and sendVerificationEmail deliberately untouched), plus regression tests for the headerless-call bug class.
</objective>

<execution_context>
@D:/Devsroom-Work/anydiscussion/.claude/gsd-core/workflows/execute-plan.md
@D:/Devsroom-Work/anydiscussion/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/actions/users.ts
@src/actions/__tests__/users.test.ts
@src/lib/permissions/index.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Forward request headers to the four middleware-gated auth.api calls + honest deleteUser logging/erroring (RED→GREEN)</name>
  <files>src/actions/__tests__/users.test.ts, src/actions/users.ts</files>
  <behavior>
    Mock change FIRST (RED enabler): add to src/actions/__tests__/users.test.ts, next to the existing next/cache mock — `vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "test" }) }))`. It does not exist yet (permissions is module-mocked, so next/headers was never imported transitively); after the fix users.ts imports it directly and the test would throw outside a request scope without this mock.

    Update the existing deleteUser success test (~lines 655-664): change the exact-shape assertion to `expect(removeUserMock).toHaveBeenCalledWith(expect.objectContaining({ body: { userId: "target-1" }, headers: expect.anything() }))`.

    New describe block "REGRESSION 260824-qtu: middleware-gated admin endpoints receive forwarded request headers (headerless internal call = live 401)" using the file's established idioms (beforeEach vi.clearAllMocks; requireCanMock.mockResolvedValue with an admin session for success paths). Cases:
    - banUser success: requireCan resolves; banUserMock resolves; call banUser("target-id", { banReason: "spam" }) → banUserMock called once; assertion 1 (shape): `toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ userId: "target-id", banReason: "spam" }), headers: expect.anything() }))`; assertion 2 (bug-class regression): `expect(banUserMock.mock.calls[0][0].headers).toBeDefined()`.
    - unbanUser success: same pair of assertions with body containing userId.
    - revokeSessions success: same pair of assertions (action input `{ userId: "target-id" }`).
    - deleteUser failure path: requireCan resolves admin; countResult queue `[{ role: "author" }]` then `[{ n: 0 }]` (guards pass); removeUserMock.mockRejectedValueOnce(new Error("APIError UNAUTHORIZED")) → `deleteUser("target-1")` rejects with "Failed to delete user — please try again."; logErrorMock called with "deleteUser failed" and an objectContaining({ userId: "target-1" }); logInfoMock NOT called (the old premature "user deleted" log must not fire on failure).
    - deleteUser log-ordering: same green-path mocks as the success test; after resolution, `expect(removeUserMock.mock.invocationCallOrder[0]).toBeLessThan(logInfoMock.mock.invocationCallOrder[0])` — precedent: the AUTH-07 ordering test (~lines 513-521); also assert logInfoMock called with "user deleted".
    - Deliberate asymmetry documentation: after calling the createUser action (green path), assert the auth.api.createUser call arg does NOT have a headers key (`expect(createUserMock.mock.calls[0][0]).not.toHaveProperty("headers")`); the existing AUTH-07 exact-match assertion on sendVerificationEmail (`{ body: { email } }`, ~line 508) already enforces headerless there — leave it untouched.

    All pre-existing tests must stay green UNCHANGED (self-delete, last-admin, has-posts, permission-first MUST_NOT_BE_REACHED orderings, AUTH-07 block, listUsers/updateUser blocks).
  </behavior>
  <action>
    RED: apply the mock + assertion updates + new describe block; run the test file — the new regression block MUST fail on the four headers assertions (calls are headerless today) and the failure-path test MUST fail (removeUser rejection currently propagates as the raw APIError, and log.info fires prematurely). Existing tests stay green.

    GREEN — implement in src/actions/users.ts, following the file's comment idioms ([CITED:] header lines, log-then-throw):

    1. Add `import { headers } from "next/headers";` next to the next/cache import. Add a short comment at the import or first use documenting WHY, so the asymmetry is not "cleaned up" later: middleware-gated admin-plugin routes (removeUser, banUser, unbanUser, revokeUserSessions, setRole, listUsers-admin, etc. — routes.mjs:16-20 adminMiddleware) resolve the caller's session from ctx headers and throw UNAUTHORIZED headerless, so server-side auth.api calls to them MUST forward `await headers()` (pattern: src/lib/permissions/index.ts:24); createUser deliberately does NOT (headerless caller-check skip, routes.mjs:146-149) and sendVerificationEmail is deliberately headerless (anti-enumeration — .planning/debug/createuser-no-verify-email.md).

    2. banUser (~line 148): add `headers: await headers(),` as a sibling of body in the auth.api.banUser options object.

    3. unbanUser (~line 168): same addition.

    4. revokeSessions (~line 188): same addition in the auth.api.revokeUserSessions options object.

    5. deleteUser success block (~lines 440-443) — three changes at once:
       - Wrap the removeUser call in try/catch. Try: `const result = await auth.api.removeUser({ headers: await headers(), body: { userId } });` then `log.info("user deleted", { userId });` then `return result;` — the success log moves AFTER resolution so it can no longer claim a deletion that did not happen (update the T-Q-04 comment: logging follows resolution, mirroring the verified-not-assumed principle).
       - Catch: `log.error("deleteUser failed", { userId, err: String(err) });` then `throw new Error("Failed to delete user — please try again.");` — converts the opaque APIError (which produced the blank dashboard alert + "no message was provided" Server Components error) into a readable message. Do NOT rethrow the raw err.
       - Guard order and all guard bodies above this block stay byte-for-byte unchanged.

    6. Trivial stale-comment fix in passing (~line 259, updateUser JSDoc): the line claiming name flows through auth.api.updateUser is stale — the action persists via direct db.update. Correct the sentence to match the code; no behavior change.

    DO NOT touch: auth.api.createUser at lines 65 (createFirstAdmin) and 100 (createUser action), and auth.api.sendVerificationEmail at line 120 — their call shapes stay exactly as-is per the verified headerless-by-design rationale.

    Run the test file again — all green (existing ~25 tests + the new regression block + updated success assertion).
  </action>
  <verify>
    <automated>pnpm test -- src/actions/__tests__/users.test.ts && pnpm exec tsc --noEmit && test "$(grep -c 'headers: await headers()' src/actions/users.ts)" -eq 4</automated>
  </verify>
  <done>All four middleware-gated auth.api calls in users.ts forward headers (grep count exactly 4); createUser/sendVerificationEmail call shapes unchanged; deleteUser logs success only after removeUser resolves and converts any removeUser rejection into "Failed to delete user — please try again." with a log.error; the new regression block asserts the headers key per endpoint; every pre-existing test passes unchanged; tsc clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dashboard client → Server Action | ban/unban/revokeSessions/deleteUser invocable by any authenticated session; session cookie is the only credential |
| Server Action → auth.api (in-process) | the forwarded `await headers()` carries the SAME caller's cookies across the internal boundary into adminMiddleware's session resolution |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-Q2-01 | Elevation of Privilege | headers forwarding at the 4 call sites | high | mitigate | Forward only `await headers()` from next/headers (the caller's own request) — never fabricate or substitute another principal's headers; requireCan still fires FIRST unchanged, and adminMiddleware then re-authorizes the SAME session requireCan already validated (defense in depth preserved, existing FORBIDDEN tests stay green) |
| T-Q2-02 | Spoofing | headers source | medium | mitigate | No hand-built Headers, no stored/replayed cookie strings in users.ts — the only headers source is the live next/headers async function, matching the permissions/index.ts:24 precedent |
| T-Q2-03 | Repudiation | deleteUser success log | medium | mitigate | log.info("user deleted") fires only after removeUser resolves; failures fire log.error with err detail — the log no longer asserts deletions that never happened |
| T-Q2-04 | Denial of Service (UX) | deleteUser failure surface | low | mitigate | try/catch converts the raw APIError into a thrown friendly message the existing UsersTable shared alert renders — admin can retry instead of hitting a blank error |
</threat_model>

<verification>
- `pnpm test -- src/actions/__tests__/users.test.ts` — new regression block + updated success assertion green, all pre-existing tests green
- `pnpm test` — full suite unaffected
- `pnpm exec tsc --noEmit` — clean (new next/headers import type-checks against the admin endpoint options shape)
- Structural: exactly 4 `headers: await headers()` occurrences in src/actions/users.ts; zero occurrences in the createUser/sendVerificationEmail call expressions
- Manual (next live session): dashboard delete of a post-less junk user actually removes the DB row; ban of a user results in a banned row (previously impossible live)
</verification>

<success_criteria>
- Live 401 root cause eliminated: banUser, unbanUser, revokeUserSessions, removeUser all forward request headers per the permissions/index.ts pattern
- deleteUser logging is honest (success log after resolution) and failures produce a readable alert message
- Headerless-by-design call sites (createUser ×2, sendVerificationEmail) untouched, with the asymmetry documented in a comment and pinned by tests
- Regression coverage for the headerless-internal-call bug class exists per endpoint; every pre-existing guard test passes unchanged
</success_criteria>

<output>
Create `.planning/quick/260824-qtu-fix-headerless-auth-api-admin-401-delete/260824-qtu-SUMMARY.md` when done
</output>
