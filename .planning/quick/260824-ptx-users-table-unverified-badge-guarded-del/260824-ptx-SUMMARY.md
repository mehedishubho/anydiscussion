---
status: complete
quick_id: 260824-ptx
completed: 2026-08-24
---

# 260824-ptx: Users table — Unverified badge + guarded delete user

Closes the two Phase 2 UAT test 5 gaps on the users dashboard: `listUsers` now projects `emailVerified` so the Status column renders three states (Banned > Unverified > Active — amber warning palette), and a new `deleteUser` action revises D-08's disable-only policy per the owner decision of 2026-08-24 with structural guards (permission-first, self, last-admin, has-posts) that preserve authorship integrity without a permissions.ts change.

## Tasks Completed

| # | Task | Commit(s) | What changed |
|---|------|-----------|--------------|
| 1 | deleteUser server action (RED→GREEN) + emailVerified projection | RED `4ff25c5` → GREEN `b5230e1` | `src/actions/__tests__/users.test.ts`: `removeUserMock` in hoisted block + auth.api mock, `posts.authorId` in schema mock, 5-case describe block with exact friendly error strings and MUST_NOT_BE_REACHED structural proofs; `src/actions/users.ts`: exported `deleteUser(userId)` — `requireCan({user:["delete"]})` FIRST (returns the session — no second fetch), self guard before any DB query, target-role fetch with defensive "User not found.", last-admin guard (exact createFirstAdmin count pattern, only when target is admin), has-posts guard (converts the bare-FK NO ACTION raw error into a friendly message), then `auth.api.removeUser({ body: { userId } })` flat-keyed; `listUsers` projection + JSDoc now include `emailVerified`; stale "D-08 still authoritative" comment revised |
| 2 | Users dashboard UI — three-state badge, guarded Delete, revised helper text | `7a0cdbe` | `page.tsx`: `UserRow.emailVerified: boolean`, `getSessionOrThrow` in its own try/catch feeding a `sessionUserId` prop (defense in depth), helper text now "Admin-only. Delete is guarded (self, last-admin, and post-count checks) — ban is still preferred for authors with posts.", header [CITED] notes the D-08 revision; `UsersTable.tsx`: Unverified branch (`user.emailVerified === false`, `bg-warning-100 … text-warning-700 dark:bg-warning-900/30 dark:text-warning-300`) between Banned and Active, `deleteMutation` following the banMutation optimistic idiom (snapshot + filter-out + pendingAction, rollback on error, invalidate `["users"]`), `deleteMutation.error` in the shared error-alert chain, filled-red Delete button (`bg-error-500 text-white hover:bg-error-600`) hidden on the session user's own row, `window.confirm` carrying "permanently deletes this user and cannot be undone" |

## Files Changed

**Modified (4):**
- `src/actions/users.ts` — deleteUser action + emailVerified in listUsers projection + comment revisions
- `src/actions/__tests__/users.test.ts` — mock extensions + 5-case guarded-delete block
- `src/app/(admin)/dashboard/users/page.tsx` — UserRow.emailVerified, sessionUserId wiring, revised helper text
- `src/app/(admin)/dashboard/users/UsersTable.tsx` — three-state badge + guarded Delete action

No new files; no schema/migration changes (`user.email_verified` and `posts.author_id` already exist); zero changes to `src/lib/auth/permissions.ts` (`user:["delete"]` comes from Better Auth `defaultStatements`, granted to admin via `adminAc.statements`).

## Verification

- `pnpm test` — 567/567 green across 56 files (562 pre-existing + 5 new deleteUser cases)
- TDD gates honored: RED run failed exactly the 5 new tests (`deleteUser is not a function`) with all 562 existing green; GREEN run all-pass
- `pnpm exec tsc --noEmit` — zero errors in the four touched files (grep-filtered; 12 pre-existing errors elsewhere, see deferred-items.md)
- `pnpm lint` — zero problems in the four touched files (2 pre-existing errors + 4 warnings elsewhere, see deferred-items.md)
- Plan grep checks: "Unverified" ×2 and "cannot be undone" ×1 in UsersTable.tsx; "emailVerified" ×3 in page.tsx; old "instead of delete" wording gone (0 matches)
- Manual (optional, next dev server run): /dashboard/users shows amber Unverified for test@gmail.com and mhs@wpmhs.com; Delete absent on own row; deleting a post-author surfaces the friendly guard error with the row restored

## Deviations from Plan

None — plan executed exactly as written.

Out-of-scope discoveries (pre-existing tsc/lint failures in unrelated auth-form/backup/subscriber files) were logged to `deferred-items.md` per the scope-boundary rule, not fixed.

## Known Stubs

None — no placeholder data paths introduced.

## Threat Flags

None — the implemented surface matches the plan's threat model exactly (T-Q-01 permission-first removeUser-unreachable proof, T-Q-02 self/last-admin lockout guards, T-Q-03 has-posts FK guard, T-Q-04 success logging all shipped and tested).

## Self-Check: PASSED

Files: src/actions/users.ts, src/actions/__tests__/users.test.ts, src/app/(admin)/dashboard/users/page.tsx, src/app/(admin)/dashboard/users/UsersTable.tsx, 260824-ptx-SUMMARY.md, deferred-items.md — all FOUND.
Commits: 4ff25c5 (test RED), b5230e1 (feat GREEN), 7a0cdbe (feat UI) — all FOUND on worktree-agent-aee95ad40a3b71ebb.
