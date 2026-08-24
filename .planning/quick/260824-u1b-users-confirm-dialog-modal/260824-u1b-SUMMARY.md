---
phase: quick-260824-u1b
plan: 01
subsystem: dashboard-users
tags: [ui, modal, confirm-dialog, users-table, tailadmin]
requires: []
provides:
  - "ConfirmDialog — reusable TailAdmin Modal-based confirmation dialog (danger/neutral styling, pending Working… state)"
affects: []
tech-stack:
  added: []
  patterns:
  - "payload-carrying dialog state: nullable { kind, user } doubles as open flag instead of boolean-only useModal hook"
key-files:
  created:
    - src/app/(admin)/dashboard/users/ConfirmDialog.tsx
  modified:
    - src/app/(admin)/dashboard/users/UsersTable.tsx
decisions:
  - "confirmTarget nullable state instead of useModal hook — hook is boolean-only, dialog must carry kind+user payload"
  - "CONFIRM_MUTATIONS left unannotated — the four mutations have different context generics; an annotated Record may not unify"
  - "danger=true on ban+delete (solid red bg-error-500/600, matches Delete row-button palette); unban+revoke neutral solid (bg-gray-800/700)"
metrics:
  duration: 5 min
  completed: "2026-08-24"
status: complete
---

# Quick Task 260824-u1b: Users Confirm Dialog Modal Summary

**One-liner:** Replaced the browser-native confirm popup on all four /dashboard/users row actions (Unban/Ban/Revoke sessions/Delete) with a reusable TailAdmin Modal-based ConfirmDialog — exact prior wording preserved, mutation logic byte-identical, danger-styled destructive confirms.

## What Was Built

### Task 1 (single atomic commit `da85bf9`)

**`src/app/(admin)/dashboard/users/ConfirmDialog.tsx` (new, 71 lines)**
- Default-export client component wrapping the shared `Modal` from `@/components/ui/modal` (the same shell UserDrawer uses) with `className="max-w-md"`, inner content `p-6`.
- Props interface exactly per plan: `isOpen`, `onClose`, `title`, `description`, `confirmLabel`, `onConfirm`, `pending?`, `danger?`.
- Title `h3` with UserDrawer's heading idiom; description `p` in `text-sm text-gray-600 dark:text-gray-400`.
- Footer `mt-6 flex justify-end gap-3`: Cancel (className copied verbatim from UserDrawer's cancel button + `disabled:cursor-not-allowed disabled:opacity-50`) left, Confirm right.
- Confirm button: solid red when `danger` (`bg-error-500 text-white hover:bg-error-600` — matches the existing Delete row-button palette), neutral solid otherwise (`bg-gray-800 text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600`); label flips to "Working…" and both buttons disable while `pending`.
- Escape / backdrop-click / body-scroll-lock inherited from the shared Modal shell.
- Comment discipline honored: the removed browser confirm API token appears nowhere in this file.

**`src/app/(admin)/dashboard/users/UsersTable.tsx` (rewired)**
- Module scope, next to ROLE_BADGE: `type ConfirmKind = "delete" | "ban" | "unban" | "revoke"` and `CONFIRM_CONTENT: Record<ConfirmKind, { title: (name: string) => string; description: string; confirmLabel: string; danger: boolean }>` with the exact prior popup wording preserved verbatim (title = question, description = consequence sentence); `danger: true` on ban and delete, `false` on unban and revoke.
- New state `const [confirmTarget, setConfirmTarget] = useState<{ kind: ConfirmKind; user: UserRow } | null>(null)` with a comment explaining why `src/hooks/useModal.ts` is deliberately NOT used (boolean-only hook; this state must carry a payload; nullable state doubles as the open flag). useModal.ts untouched.
- After the four useMutation definitions: unannotated `const CONFIRM_MUTATIONS = { unban: unbanMutation, ban: banMutation, revoke: revokeMutation, delete: deleteMutation }` (annotated Record intentionally avoided — different context generics).
- The four confirm-wrapped onClicks each collapsed to a single `setConfirmTarget({ kind, user })`; everything else on those buttons byte-identical (type, `disabled={...Mutation.isPending}`, classNames, the isBanned ternary, the `user.id !== sessionUserId` Delete render guard).
- ONE conditionally-mounted ConfirmDialog rendered after UserDrawer: props derived from `CONFIRM_CONTENT[confirmTarget.kind]` + `confirmTarget.user.name`, `pending={CONFIRM_MUTATIONS[kind].isPending}`, onConfirm fires `void CONFIRM_MUTATIONS[kind].mutate(user.id)` then closes immediately (`setConfirmTarget(null)` — accidental double-fire guard, T-Q1-01). Conditional mount guarantees non-null-derived props.
- Stale delete-mutation comment rewritten: final sentence now names the ConfirmDialog modal as the UX-friction layer (rest of comment intact).
- File-header CITED line added for 260824-u1b-PLAN.md.

## Threat Model Disposition

- **T-Q1-01 (double-fire, mitigate):** dialog closes immediately on confirm; both dialog buttons + row buttons disable while pending. Implemented.
- **T-Q1-02 (EoP, accept):** `src/actions/users.ts` untouched — server-side requireCan gates unchanged; UI confirmation was never the security boundary.
- **T-Q1-03 (destructive misclick, mitigate):** exact prior wording incl. "permanently deletes … cannot be undone"; red danger styling distinguishes destructive confirms; Cancel/Escape/backdrop close without acting. Implemented.

## Verification Results

| Gate | Result |
|------|--------|
| `pnpm vitest run` | **573/573 passed** (56 files) — no test files touched |
| `pnpm exec tsc --noEmit` | **Zero new errors** — only the 4 pre-existing TS18048 errors in `src/actions/__tests__/storage-settings.test.ts` (lines 318/319/321/322), byte-identical to the set documented in 260824-qtu deferred-items |
| `pnpm lint` | **Clean on both touched files** (targeted `eslint` exit 0). Repo-wide run reports 2 pre-existing errors (`prefer-rest-params` in `src/lib/backup/__tests__/google-drive.test.ts` lines 63/75) + 4 pre-existing warnings — all in backup/subscribers files untouched by this task; the `...arguments` usage verified present at base commit `ef79626`, logged to deferred-items |
| grep gate | `window.confirm` count in UsersTable.tsx = **0** (4 call sites + 1 comment all rewritten); also 0 in ConfirmDialog.tsx |
| grep gates | `ConfirmDialog` referenced 6x in UsersTable.tsx; `confirmLabel` present 4x in ConfirmDialog.tsx |

Worktree-environment recipe applied per 260824-qtu deferred-items: fresh `pnpm install --frozen-lockfile` + `pnpm exec next typegen` before running gates.

## Deviations from Plan

None — plan executed exactly as written. The one judgment call within plan latitude: kept the codebase's `void` fire-and-forget prefix on the `.mutate()` call inside onConfirm (house idiom from the original call sites; plan specified the call itself, `void` only preserves style).

## Out-of-Scope Files Verified Untouched

`src/actions/users.ts`, `src/components/ui/modal/index.tsx`, `UserDrawer.tsx`, `useModal.ts`, `CategoriesTable`/`TagsTable`, all test files — `git show --stat da85bf9` confirms exactly 2 files changed.

## Self-Check: PASSED

- `src/app/(admin)/dashboard/users/ConfirmDialog.tsx` — FOUND (committed, created in da85bf9)
- `src/app/(admin)/dashboard/users/UsersTable.tsx` — FOUND (committed, modified in da85bf9)
- Commit `da85bf9` — FOUND on branch `worktree-agent-af8e78d5ac4f1540f`
