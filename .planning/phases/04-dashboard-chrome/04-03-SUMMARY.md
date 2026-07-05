---
phase: 04-dashboard-chrome
plan: 03
subsystem: ui
tags: [nextjs, tailadmin, tanstack-query, react-hook-form, rbac, better-auth, app-router]

# Dependency graph
requires:
  - phase: 04-dashboard-chrome
    provides: "/dashboard/* URL prefix, (admin)-scoped QueryProvider, role-prop wiring"
  - phase: 02-auth-rbac
    provides: "createUser / banUser / unbanUser / revokeSessions primitives + requireCan / getSessionOrThrow helpers"
provides:
  - "/dashboard/users — admin-only users table + drawer (create/edit/ban/unban/revoke-sessions/role-assign)"
  - "/dashboard/profile — self-service profile form for any role (D-09)"
  - "listUsers + updateUser server actions (permission-check-first; self-edit strips role per T-04-11)"
  - "Dashboard mutation pattern reuse — RHF + Zod + TanStack useMutation with selective optimistic UI on ban/unban"
affects: [04-02 (MediaPicker integration target), phase-05-seo, phase-06-public-frontend (byline/avatar fields)]

# Tech tracking
tech-stack:
  added: []  # no new deps — RHF + Zod + TanStack Query + Better Auth all from prior phases
  patterns:
    - "Permission-check-first with self-edit exception: updateUser gates !isSelf with requireCan({user:['update']}); self-edit (userId === session.user.id) bypasses the gate and strips role (T-04-11 defense in depth)"
    - "D-27 selective optimistic UI: ban/unban = optimistic (onMutate snapshot + rollback); createUser/updateUser/profile-save = non-optimistic (server confirms)"
    - "Cross-wave dependency handling: when a referenced component (MediaPicker) lives in a parallel-wave plan not yet merged, ship a functional text-input fallback with the canonical integration target documented inline (Rule 3 auto-fix)"

key-files:
  created:
    - "src/app/(admin)/dashboard/users/page.tsx — Server Component; calls listUsers (requireCan user:read fires), passes rows to UsersTable"
    - "src/app/(admin)/dashboard/users/UsersTable.tsx — client; optimistic ban/unban via useMutation; revoke-sessions; initials avatars (no raw <img>)"
    - "src/app/(admin)/dashboard/users/UserDrawer.tsx — RHF+Zod side drawer (Modal shell); create via createUser, edit via updateUser; non-optimistic"
    - "src/app/(admin)/dashboard/profile/ProfileForm.tsx — self-service form (name/bio/avatar; no role field per D-09)"
  modified:
    - "src/actions/users.ts — + listUsers, updateUser (self-edit path strips role; cross-user path requireCan user:update)"
    - "src/actions/__tests__/users.test.ts — + 6 tests (listUsers permission gate; updateUser cross-user + self-edit + role-strip)"
    - "src/app/(admin)/dashboard/profile/page.tsx — replaced TailAdmin demo (UserMetaCard/UserInfoCard/UserAddressCard) with real session data → ProfileForm"

key-decisions:
  - "updateUser persistence routes ALL fields (name/bio/avatar/role) through db.update(schema.user) rather than auth.api.updateUser — Better Auth's updateUser body type rejects `userId` as a body property (types body as Partial<AdditionalUserFieldsInput>). The plan's <action> step 3 explicitly offered this db.update fallback. The next session read picks up the new values."
  - "Self-edit role strip is双层防御: (1) ProfileForm UI hides the role field entirely; (2) updateUser destructures `role` out of safeInput and guards persistence with !isSelf. A hostile client sending role on a self-edit hits both layers (T-04-11)."
  - "UsersTable avatar thumbnails render initials (colored circle with first letters), NOT next/image. Rationale: the CDN remote pattern ships with Plan 04-05 (storage settings); initials keep the build green and the table professional for the 2-5 person team. No <img> tag is rendered (grep-verified)."
  - "Cross-wave MediaPicker dependency: Plan 04-02 owns MediaPicker.tsx and runs in parallel. The avatar fields in UserDrawer + ProfileForm ship as text inputs (paste CDN URL) with the canonical <MediaPicker onSelect={(url) => setValue('avatar', url)}> integration target documented inline. Rule 3 auto-fix — the upgrade is a one-line swap once 04-02 merges."
  - "revokeSessions is NOT optimistic — there's no visible row-state flip (banned stays the same); a success result is sufficient feedback. D-27 lists ban/role-change as the optimistic cases."

patterns-established:
  - "Pattern: self-edit bypass with role strip — actions that accept a userId compare session.user.id === userId; the self path skips requireCan and destructures-out role before persisting (canonical in updateUser)."
  - "Pattern: cross-wave component fallback — when a referenced component lives in a parallel-wave plan, ship a functional fallback (text input) + inline comment naming the integration target. Avoids creating the file (which would conflict at merge) while keeping the build green and the upgrade path obvious."

requirements-completed: [DASH-04, DASH-06]

# Coverage metadata — per-deliverable verification matrix (#1602)
coverage:
  - id: D1
    description: "listUsers action exists, calls requireCan({user:['read']}) FIRST, returns user rows"
    requirement: DASH-04
    verification:
      - kind: unit
        ref: "src/actions/__tests__/users.test.ts — listUsers: admin returns rows; non-admin throws FORBIDDEN before db.select (MUST_NOT_BE_REACHED)"
        status: pass
      - kind: other
        ref: "grep -c 'export async function listUsers' src/actions/users.ts returns 1; grep -cE 'requireCan.*user.*read' returns present"
        status: pass
    human_judgment: false

  - id: D2
    description: "updateUser action: self-edit allowed for any role; cross-user requires admin; role stripped on self-edit (T-04-11/T-04-12)"
    requirement: DASH-04
    verification:
      - kind: unit
        ref: "src/actions/__tests__/users.test.ts — 4 updateUser cases (admin cross-user, non-admin FORBIDDEN, self-edit allowed, self-edit role strip)"
        status: pass
      - kind: other
        ref: "grep -c 'isSelf' src/actions/users.ts returns 8; grep -c 'deleteUser' returns 0 (D-08 disable-only)"
        status: pass
    human_judgment: false

  - id: D3
    description: "/dashboard/users renders admin-only table with ban/unban/revoke/role-assign + drawer (D-07, D-08, D-10, D-11)"
    requirement: DASH-04
    verification:
      - kind: other
        ref: "pnpm build route table — /dashboard/users present (PPR); files: users/page.tsx (Server Component), UsersTable.tsx (client useMutation), UserDrawer.tsx (RHF+Zod+Modal)"
        status: pass
      - kind: other
        ref: "grep useMutation in UsersTable returns 7; optimistic|onMutate returns 11 (D-27); no raw <img>"
        status: pass
    human_judgment: true
    rationale: "Visual verification of table layout, ban/unban optimistic flip, drawer create/edit flow, role dropdown behavior, and dark mode rendering requires a running browser with a seeded DB. Static analysis proves the wiring but not the live UX."

  - id: D4
    description: "/dashboard/profile self-service form for any role (D-09) — name/bio/avatar editable; role field absent"
    requirement: DASH-04
    verification:
      - kind: other
        ref: "profile/page.tsx replaced TailAdmin demo with getSession() → ProfileForm; ProfileForm has no role input field (defense in depth — server strips role on self-edit anyway)"
        status: pass
    human_judgment: true
    rationale: "Three-role visual verification (admin/editor/author each see the form, none can change role, all can save name/bio/avatar) requires a running browser with multiple seeded sessions."

  - id: D5
    description: "RHF + Zod + TanStack Query applied to all new forms (D-26 extension); D-27 selective optimistic UI"
    requirement: DASH-06
    verification:
      - kind: other
        ref: "UserDrawer (createUser/updateUser via useMutation, non-optimistic), ProfileForm (updateUser via useMutation, non-optimistic), UsersTable (ban/unban optimistic via onMutate+rollback, revoke non-optimistic)"
        status: pass
    human_judgment: false

# Metrics
duration: 187min
completed: 2026-07-05
status: complete
---

# Phase 4 Plan 03: Users + Roles + Profile Summary

**Surfaced the Phase 2 user-management primitives in a TailAdmin users table + drawer (admin-only: create/edit/ban/unban/revoke-sessions/role-assign) and shipped self-service profile editing for any role. Added `listUsers` + `updateUser` actions with the permission-check-first pattern and a self-edit role-strip path (T-04-11 defense in depth). No destructive delete (D-08 disable-only).**

## Performance

- **Duration:** ~187 min wall-clock (includes a provider quota pause mid-execution; work time substantially less)
- **Started:** 2026-07-05T17:55:18Z
- **Completed:** 2026-07-05T21:02:37Z
- **Tasks:** 2
- **Files modified:** 7 (4 created + 3 modified)

## Accomplishments

- **`listUsers` action** — `requireCan({ user: ["read"] })` fires FIRST (Phase 2 Pitfall #1); returns the columns the table needs (id/name/email/role/bio/avatar/banned/banReason/banExpires) — no passwordHash/emailVerified shipped to the client bundle. Non-admin hitting it via direct URL → FORBIDDEN before any db.select (T-04-10, structurally proven by MUST_NOT_BE_REACHED test).
- **`updateUser` action** — two execution paths: self-edit (session.user.id === userId) bypasses requireCan and strips `role` from the input (T-04-11); cross-user edit requires `requireCan({ user: ["update"] })` (T-04-12). All field persistence routes through `db.update(schema.user)` because Better Auth's `auth.api.updateUser` body type rejects `userId` (plan's step-3 fallback). No destructive delete (D-08).
- **`/dashboard/users` page + table + drawer** — admin-only Server Component calls listUsers(); the client UsersTable surfaces ban/unban/revoke-sessions/role-assign via TanStack useMutation. Ban/unban use optimistic UI (onMutate snapshot + onError rollback per D-27); create/edit (UserDrawer) are non-optimistic. Initials-based avatar thumbnails (no raw `<img>`, grep-verified).
- **`/dashboard/profile` self-service form** — replaced the TailAdmin demo entirely. Reads `getSession()` server-side and passes the real user to ProfileForm (name/bio/avatar; NO role field per D-09). Self-edit calls `updateUser(session.user.id, { name, bio, avatar })` — the server strips role anyway (defense in depth).
- **6 new tests + 178 existing green** — listUsers (admin returns rows; non-admin FORBIDDEN before db.select), updateUser (admin cross-user role change; non-admin FORBIDDEN before db.update; self-edit allowed; self-edit role strip verified).

## Task Commits

Each task committed atomically; Task 1 followed TDD RED→GREEN:

1. **Task 1 RED** — `test(04-03): add failing tests for listUsers + updateUser` — `156d369`
2. **Task 1 GREEN** — `feat(04-03): implement listUsers + updateUser actions` — `e5b0d0f`
3. **Task 2** — `feat(04-03): users table + drawer + self-service profile UI` — `02e0a70`

## Files Created/Modified

**Created:**
- `src/app/(admin)/dashboard/users/page.tsx` — Server Component; calls listUsers (requireCan user:read), passes rows to UsersTable.
- `src/app/(admin)/dashboard/users/UsersTable.tsx` — client; optimistic ban/unban via useMutation; revoke-sessions; initials avatars (no raw `<img>`).
- `src/app/(admin)/dashboard/users/UserDrawer.tsx` — RHF+Zod side drawer (Modal shell); create via createUser, edit via updateUser; non-optimistic.
- `src/app/(admin)/dashboard/profile/ProfileForm.tsx` — self-service form (name/bio/avatar; no role field per D-09).

**Modified:**
- `src/actions/users.ts` — added listUsers + updateUser (self-edit path strips role; cross-user path requireCan user:update). getSessionOrThrow added to imports.
- `src/actions/__tests__/users.test.ts` — added 6 tests (listUsers permission gate; updateUser cross-user + self-edit + role-strip). Extended hoisted mocks (updateUserMock, selectAllResult, updateSetWhere); restructured db mock to support select-all and update chains alongside the existing count path.
- `src/app/(admin)/dashboard/profile/page.tsx` — replaced TailAdmin demo (UserMetaCard/UserInfoCard/UserAddressCard) with real session data → ProfileForm.

## Decisions Made

- **All updateUser persistence through `db.update(schema.user)`** rather than `auth.api.updateUser`. The Better Auth admin plugin's updateUser body type rejects `userId` as a body property (it types body as `Partial<AdditionalUserFieldsInput<...>>`). The plan's `<action>` step 3 explicitly offered this db.update fallback. The next session read picks up the new values.
- **Initials avatars in UsersTable** instead of next/image thumbnails. The CDN remote pattern ships with Plan 04-05 (storage settings); initials keep the build green and look professional for the 2-5 person team per CLAUDE.md. No `<img>` tag is rendered (acceptance criterion grep-verified).
- **revokeSessions is NOT optimistic** — there's no visible row-state flip (banned stays the same), so a success result is sufficient feedback. D-27 lists ban/role-change as the optimistic cases; revoke is a one-shot action.
- **Avatar fields ship as text inputs**, not `<MediaPicker>`. Plan 04-02 owns MediaPicker and runs in parallel — the file is not in this worktree's build. Inline text input with the canonical `<MediaPicker onSelect={(url) => setValue('avatar', url)}>` integration target documented in both UserDrawer and ProfileForm. Rule 3 auto-fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing parallel-wave MediaPicker component**
- **Found during:** Task 2
- **Issue:** The plan's must_haves require avatar fields use `<MediaPicker>` from Plan 04-02. Plan 04-02 runs in the same Wave 2 (parallel worktree); its file (`src/components/dashboard/media/MediaPicker.tsx`) is not present in this worktree. A static import would fail the build.
- **Fix:** Shipped the avatar field as a text input (paste CDN URL) in both UserDrawer and ProfileForm. The canonical `<MediaPicker onSelect={(url) => setValue('avatar', url)}>` integration target is documented inline in both files. The upgrade is a one-line swap once 04-02 merges. Stayed within the declared `files_modified` set (did NOT create MediaPicker.tsx — that would create a merge conflict with 04-02).
- **Files modified:** `src/app/(admin)/dashboard/users/UserDrawer.tsx`, `src/app/(admin)/dashboard/profile/ProfileForm.tsx`
- **Commit:** `02e0a70`

**2. [Rule 3 - Blocking] auth.api.updateUser body type rejects userId**
- **Found during:** Task 1 GREEN (build failure)
- **Issue:** `auth.api.updateUser({ body: { userId, name } })` fails TypeScript type-checking — Better Auth admin plugin types `body` as `Partial<AdditionalUserFieldsInput<...>>` which does not accept `userId`.
- **Fix:** Consolidated all updateUser persistence (name + bio + avatar + role) through a single `db.update(schema.user).set(patch).where(eq(schema.user.id, userId))`. The plan's `<action>` step 3 explicitly offered this db.update fallback ("IF Better Auth owns that field; otherwise db.update"). All fields live on the Drizzle `user` table.
- **Files modified:** `src/actions/users.ts`, `src/actions/__tests__/users.test.ts` (test assertion updated to match)
- **Commit:** `e5b0d0f`

## Known Stubs

| File | Field | Reason | Resolution |
|------|-------|--------|------------|
| `src/app/(admin)/dashboard/users/UserDrawer.tsx` | Avatar URL text input | Plan 04-02 (parallel wave) owns the reusable `<MediaPicker>` modal; the file is not in this worktree. | One-line swap to `<MediaPicker onSelect={(url) => setValue('avatar', url)}>` once 04-02 merges. Canonical API documented inline. |
| `src/app/(admin)/dashboard/profile/ProfileForm.tsx` | Avatar URL text input | Same as above. | Same as above. |

These stubs do NOT prevent the plan's goal — both forms are fully functional (paste CDN URL). The MediaPicker upgrade is a UX polish, not a correctness gap.

## User Setup Required

None — no external service configuration required. The avatar fields accept any URL; once Plan 04-05 (storage settings) configures the CDN remote pattern, the URLs render as images. The MediaPicker modal (Plan 04-02) is a parallel-wave deliverable that upgrades the avatar input UX.

## Next Phase Readiness

**Ready for the rest of Phase 4:**

- **Plan 04-04 (pages)** can build `/dashboard/pages` against the same list-page + RHF+Zod+useMutation patterns established here and in 04-01/04-02.
- **Plan 04-05 (storage settings)** ships the CDN remote pattern that unlocks next/image rendering for the avatar URLs this plan's forms already accept.

**Manual verification still owed (UAT, not blockers):**

- Sign in as admin → /dashboard/users table renders; create a new editor; ban them; revoke their sessions; unban; assign admin role via the drawer.
- Sign in as the new editor → /dashboard/profile renders; self-edit name/bio/avatar succeeds; role field absent (D-09).
- Sign in as author → /dashboard/users NOT in sidebar; hitting the URL directly → FORBIDDEN error surfaces.
- Dark mode renders on /dashboard/users + /dashboard/profile (DASH-08).
- After Plan 04-02 merges: swap the avatar text inputs for `<MediaPicker>` in UserDrawer + ProfileForm (one-line each).

**No blockers.** Plan 04-03 unblocks DASH-04 as designed.

## Self-Check: PASSED

All claimed files exist; all task commits (`156d369`, `e5b0d0f`, `02e0a70`) found in git log; no file deletions in any task commit; no untracked files remaining.

**Files verified FOUND:** `src/app/(admin)/dashboard/users/page.tsx`, `src/app/(admin)/dashboard/users/UsersTable.tsx`, `src/app/(admin)/dashboard/users/UserDrawer.tsx`, `src/app/(admin)/dashboard/profile/ProfileForm.tsx`, `src/app/(admin)/dashboard/profile/page.tsx`, `src/actions/users.ts`, `src/actions/__tests__/users.test.ts`.

**Commits verified FOUND:** `156d369` (RED), `e5b0d0f` (Task 1 GREEN), `02e0a70` (Task 2).

---
*Phase: 04-dashboard-chrome*
*Plan: 03*
*Completed: 2026-07-05*
