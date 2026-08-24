---
phase: quick-260824-ptx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/actions/users.ts
  - src/actions/__tests__/users.test.ts
  - src/app/(admin)/dashboard/users/page.tsx
  - src/app/(admin)/dashboard/users/UsersTable.tsx
autonomous: true
requirements: [DASH-04]
must_haves:
  truths:
    - "An admin viewing /dashboard/users sees an amber Unverified badge (not green Active) for any user whose emailVerified is false — test@gmail.com and mhs@wpmhs.com no longer read as Active while unverified"
    - "Status priority is Banned > Unverified > Active — a banned-and-unverified user still shows Banned"
    - "deleteUser enforces user:delete FIRST (admin-only via adminAc.statements; editors/authors get FORBIDDEN before any DB query — proven structurally, removeUser never reached)"
    - "An admin cannot delete themselves, the last remaining admin, or a user who still has posts — each rejected with a friendly error before auth.api.removeUser is called"
    - "A successful delete removes the row optimistically from the table, calls auth.api.removeUser({ body: { userId } }) exactly once, and rolls back with the shared error alert on failure"
    - "The session user's own row renders no Delete action; the stale disable-only helper text is replaced with the revised wording"
  artifacts:
    - "src/actions/users.ts — deleteUser exported; listUsers projection includes emailVerified"
    - "src/actions/__tests__/users.test.ts — deleteUser describe block with the 5 cases listed in Task 1 <behavior>"
    - "src/app/(admin)/dashboard/users/page.tsx — UserRow.emailVerified field, sessionUserId wired to UsersTable, revised helper text"
    - "src/app/(admin)/dashboard/users/UsersTable.tsx — three-state status badge + guarded Delete action with optimistic removal"
  key_links:
    - "listUsers select emailVerified → UserRow.emailVerified → UsersTable badge condition (user.emailVerified === false)"
    - "UsersTable deleteMutation → deleteUser action → requireCan({user:['delete']}) → auth.api.removeUser({ body: { userId } })"
    - "page.tsx getSessionOrThrow().user.id → UsersTable sessionUserId prop → own-row Delete button hidden"
---

<objective>
Close the two owner-reported gaps from the Phase 2 UAT test 5 session on the users dashboard:

1. **Email-verification status badge** — the Status column currently renders only Banned/Active from `user.banned`, so unverified users (test@gmail.com, mhs@wpmhs.com — `email_verified` false in DB) display "Active". Add `emailVerified` to the data path and render three states with priority Banned > Unverified > Active.

2. **Guarded delete user** — implement `deleteUser(userId)` per the owner decision of 2026-08-24, which revisits 04-CONTEXT D-08 ("disable-only, no delete"). D-08's authorship-integrity rationale is preserved structurally: a post-count guard rejects deletion of any user who still has posts (the posts.authorId FK at src/db/schema.ts:82 is a bare `.references()` — default NO ACTION — so without the guard the DB would raw-error). Self-delete and last-admin guards prevent lockout. Permission key `user: ["delete"]` already exists in `defaultStatements` and is granted to the admin role via `adminAc.statements` in src/lib/auth/permissions.ts — NO changes to permissions.ts.

Purpose: an admin must be able to see which accounts cannot pass email verification, and safely remove junk accounts without breaking authorship or locking out the last admin.
Output: tested deleteUser action + emailVerified projection in src/actions/users.ts; three-state badge, guarded Delete UI, and revised helper text in the users dashboard.
</objective>

<execution_context>
@D:/Devsroom-Work/anydiscussion/.claude/gsd-core/workflows/execute-plan.md
@D:/Devsroom-Work/anydiscussion/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/actions/users.ts
@src/actions/__tests__/users.test.ts
@src/app/(admin)/dashboard/users/page.tsx
@src/app/(admin)/dashboard/users/UsersTable.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: deleteUser server action (RED→GREEN) + emailVerified in listUsers projection</name>
  <files>src/actions/__tests__/users.test.ts, src/actions/users.ts</files>
  <behavior>
    New describe block "DASH-04: deleteUser — guarded destructive removal (owner decision 2026-08-24, revising D-08)" in src/actions/__tests__/users.test.ts, following the file's established mock idioms. Mock extensions needed FIRST (RED phase):
    - Add `removeUserMock: vi.fn()` to the vi.hoisted block and `removeUser: removeUserMock` to the auth.api mock object (flat keying — same place as createUser/banUser keys).
    - Add `posts: { authorId: "authorId" }` to the mocked `schema` object (the has-posts guard's `eq(schema.posts.authorId, userId)` dereferences it; plain string keys suffice per the existing mock comment).
    - CRITICAL mock-shape note: in this file's db mock, EVERY `db.select(...).from(...).where(...)` chain resolves to `countResult()` — it is the generic `.where`-chain result, not just createFirstAdmin's admin count (precedent: the updateUser username fetch at the file's ~lines 376-380 seeds a username row into countResult). deleteUser performs sequential `.where` queries (target-role fetch, then admin count or post count); queue their results with `countResult.mockResolvedValueOnce(...)` in execution order.

    The five test cases (exact expected error strings, so tests and implementation stay in lockstep):
    - Test 1 (permission-first): requireCanMock throws FORBIDDEN; removeUserMock AND countResult throw MUST_NOT_BE_REACHED → `deleteUser("target-1")` rejects FORBIDDEN; removeUser never called; `requireCanMock` called with `{ user: ["delete"] }`.
    - Test 2 (self-delete guard): requireCanMock resolves `{ user: { id: "self-1", role: "admin" } }`; countResult throws MUST_NOT_BE_REACHED → `deleteUser("self-1")` rejects "You cannot delete your own account."; removeUser never called (guard fires before any DB query).
    - Test 3 (last-admin guard): requireCanMock resolves admin session id "admin-1"; call `deleteUser("target-1")`; countResult queue: first `.where` (target-role fetch) → `[{ role: "admin" }]`, second `.where` (admin count) → `[{ n: 1 }]` → rejects "Cannot delete the last remaining admin. Promote another admin first."; removeUser never called.
    - Test 4 (has-posts guard): queue `[{ role: "author" }]` then `[{ n: 3 }]` → rejects "This user still has posts. Reassign or delete their posts first."; removeUser never called.
    - Test 5 (success): queue `[{ role: "author" }]` then `[{ n: 0 }]`; removeUserMock resolves → action resolves; removeUser called exactly once with `{ body: { userId: "target-1" } }`.
  </behavior>
  <action>
    RED: write the mock extensions + describe block above; run `pnpm test -- src/actions/__tests__/users.test.ts` — the new block MUST fail (deleteUser not exported yet) while all existing tests stay green.

    GREEN — implement in src/actions/users.ts (follow the file's comment idioms: [CITED:] header lines, log-then-throw, permission-check-first):

    1. New exported `deleteUser(userId: string)` with a doc comment citing the owner decision of 2026-08-24 revising 04-CONTEXT D-08 (guarded delete now allowed; authorship rationale preserved via the post-count guard). Execution order, non-negotiable:
       - `const session = await requireCan({ user: ["delete"] });` FIRST (Pitfall #1). requireCan already returns the getSessionOrThrow session (see src/lib/permissions/index.ts — it delegates to getSessionOrThrow and returns its result), so use its return value for the identity check — do NOT issue a second getSessionOrThrow call.
       - Self guard: if `session.user.id === userId` → `log.error("deleteUser blocked — self-delete")` then `throw new Error("You cannot delete your own account.")`.
       - Fetch the target's role: `db.select({ role: schema.user.role }).from(schema.user).where(eq(schema.user.id, userId))`. If no row returned → `throw new Error("User not found.")` (defensive; Better Auth would otherwise error opaquely).
       - Last-admin guard: only when target role is "admin" — count admins with the exact createFirstAdmin pattern (`db.select({ n: count() }).from(schema.user).where(eq(schema.user.role, "admin"))`, Number(row?.n ?? 0)); if count <= 1 → log.error then `throw new Error("Cannot delete the last remaining admin. Promote another admin first.")`.
       - Has-posts guard (preserves D-08's authorship integrity): count posts via `db.select({ n: count() }).from(schema.posts).where(eq(schema.posts.authorId, userId))`; if > 0 → log.error then `throw new Error("This user still has posts. Reassign or delete their posts first.")`. Note in the comment WHY: the posts.authorId FK (src/db/schema.ts:82) is a bare `.references()` with no onDelete — default NO ACTION — so the guard converts the raw FK error into a friendly message.
       - Success: `log.info("user deleted", { userId })` then `return auth.api.removeUser({ body: { userId } });` — flat keying per the file's verified comment at the top (auth.api endpoints are FLAT; same call shape as the existing auth.api.createUser at ~line 99). The admin-plugin endpoint cascades sessions/accounts on the auth side.

    2. In `listUsers()` (~line 227-239): add `emailVerified: schema.user.emailVerified` to the select projection. Update the now-stale JSDoc phrase "(no passwordHash / no emailVerified)" to reflect that emailVerified IS now projected (keep passwordHash excluded).

    Run the test file again — all green (existing ~20 tests + the 5 new ones).
  </action>
  <verify>
    <automated>pnpm test -- src/actions/__tests__/users.test.ts</automated>
  </verify>
  <done>All 5 deleteUser cases pass with the exact error strings; every pre-existing test in the file still passes; deleteUser never calls auth.api.removeUser when any guard rejects; listUsers projection includes emailVerified.</done>
</task>

<task type="auto">
  <name>Task 2: Users dashboard UI — three-state badge, guarded Delete action, revised helper text</name>
  <files>src/app/(admin)/dashboard/users/page.tsx, src/app/(admin)/dashboard/users/UsersTable.tsx</files>
  <action>
    In src/app/(admin)/dashboard/users/page.tsx:
    1. Extend the `UserRow` type (~lines 30-40) with `emailVerified: boolean` (schema column is notNull with default false — src/db/schema.ts:254). Keep the type's "in sync with select() projection" comment accurate.
    2. Import `getSessionOrThrow` from `@/lib/permissions`; fetch the session user id in its own try/catch (`let sessionUserId: string | null = null;` — on throw, leave null; the AuthGate/proxy already redirect unauthenticated viewers, this is defense in depth) and pass it to UsersTable as a new prop: `<UsersTable initialUsers={users} sessionUserId={sessionUserId} />`.
    3. Replace the stale disable-only helper text under "Team Members" (~line 64, the sentence citing D-08's ban-only policy) with: "Admin-only. Delete is guarded (self, last-admin, and post-count checks) — ban is still preferred for authors with posts." Update the file-header [CITED] comment to note the D-08 revision per the owner decision of 2026-08-24.

    In src/app/(admin)/dashboard/users/UsersTable.tsx:
    4. Accept the new prop: `export default function UsersTable({ initialUsers, sessionUserId }: { initialUsers: UserRow[]; sessionUserId: string | null })`.
    5. Status cell (~lines 176-186): render three states with priority Banned > Unverified > Active — keep the existing Banned (red) span; insert an Unverified branch when `user.emailVerified === false` using the same badge shape with the warning palette (verified present in src/app/globals.css lines 120-130): `bg-warning-100 ... text-warning-700 dark:bg-warning-900/30 dark:text-warning-300`; the existing green Active span becomes the final else.
    6. Add a `deleteMutation` following the existing banMutation optimistic idiom (~lines 65-82): mutationFn calls `deleteUser(userId)` (add to the existing @/actions/users import); onMutate snapshots `users` and optimistically filters the row out (`prev.filter((u) => u.id !== userId)`) plus sets a pendingAction label; onError restores the snapshot; onSuccess invalidates the `["users"]` query; onSettled clears pendingAction.
    7. Add `deleteMutation.error` to the shared error-alert condition and message chain at the bottom of the component (~lines 245-249) so guard rejections (e.g. "This user still has posts…") surface in the existing red alert box.
    8. Delete button in the Actions cell: render ONLY when `user.id !== sessionUserId` (own row gets no Delete). Red danger styling that reads as more destructive than the outline Ban button — filled `bg-error-500 text-white hover:bg-error-600` with the file's rounded-md/px-2.5/py-1/text-xs shape, disabled while `deleteMutation.isPending`. onClick wraps in `window.confirm` whose message includes the user's name and the explicit phrase "permanently deletes this user and cannot be undone", then `void deleteMutation.mutate(user.id)`.
    9. Update the file-header [CITED] comment block to cite the owner decision of 2026-08-24 (D-08 revision) for the delete path.
  </action>
  <verify>
    <automated>pnpm exec tsc --noEmit && pnpm lint && grep -c "Unverified" "src/app/(admin)/dashboard/users/UsersTable.tsx" | grep -qv '^0$' && grep -c "cannot be undone" "src/app/(admin)/dashboard/users/UsersTable.tsx" | grep -qv '^0$' && grep -c "emailVerified" "src/app/(admin)/dashboard/users/page.tsx" | grep -qv '^0$' && { grep -q "instead of delete" "src/app/(admin)/dashboard/users/page.tsx" && exit 1 || exit 0; }</automated>
  </verify>
  <done>tsc and eslint clean; UsersTable contains an Unverified badge branch, a deleteMutation with optimistic removal, a confirm dialog carrying the permanence wording, and no Delete button path for the session user's own row; page.tsx UserRow carries emailVerified, passes sessionUserId, and the helper text reflects guarded delete (old disable-only wording gone); full test suite still green via `pnpm test`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dashboard client → Server Action | deleteUser is invocable by any authenticated session via the action boundary; the session cookie is the only credential |
| Server Action → DB / auth API | guarded counts + auth.api.removeUser perform destructive writes |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-Q-01 | Elevation of Privilege | deleteUser | critical | mitigate | requireCan({ user: ["delete"] }) FIRST — admin-only via adminAc.statements; structural MUST_NOT_BE_REACHED test proves removeUser is unreachable when denied (Task 1, Test 1) |
| T-Q-02 | Denial of Service (lockout) | deleteUser self/last-admin guards | high | mitigate | Session-identity self guard + admin-count <= 1 guard prevent self-deletion and last-admin removal (Tests 2-3) |
| T-Q-03 | Tampering / information disclosure | deleteUser has-posts guard | medium | mitigate | Post-count guard converts the raw NO-ACTION FK error into a friendly message and preserves D-08 authorship integrity (Test 4) |
| T-Q-04 | Repudiation | deleteUser success path | low | mitigate | log.info("user deleted", { userId }) on success mirrors the updateUser logging precedent |
</threat_model>

<verification>
- `pnpm test -- src/actions/__tests__/users.test.ts` — 5 new deleteUser cases + all existing cases green
- `pnpm test` — full suite unaffected
- `pnpm exec tsc --noEmit && pnpm lint` — type/lint clean across the four touched files
- Manual (optional, next dev server run): /dashboard/users shows amber Unverified for test@gmail.com and mhs@wpmhs.com; Delete absent on own row; deleting a post-author surfaces the friendly guard error with the row restored
</verification>

<success_criteria>
- listUsers projects emailVerified; UserRow carries it; the table renders Banned > Unverified > Active with the warning palette
- deleteUser enforces user:delete first, then self / last-admin / has-posts guards, each with a friendly error and a structural not-called test
- Successful delete calls auth.api.removeUser({ body: { userId } }) exactly once; UI removes the row optimistically, rolls back on error, hides Delete on the session user's own row
- Helper text reflects the D-08 revision (owner decision 2026-08-24); no changes to src/lib/auth/permissions.ts
</success_criteria>

<output>
Create `.planning/quick/260824-ptx-users-table-unverified-badge-guarded-del/260824-ptx-SUMMARY.md` when done
</output>
