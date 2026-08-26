---
phase: quick-260826-pqg
plan: 01
type: execute
subsystem: admin-dashboard
tags: [next-16.3.3, cacheComponents, ppr, prerender, connection, better-auth, auth-gate]
status: complete
commits:
  - 1813b61 "fix(260826-pqg): await connection() before getSession in (admin) AuthGate — unblock 16.3.3 prerender current-time guard"
duration: ~6 min
completed: 2026-08-26
---

# Quick Task 260826-pqg — Fix 16.3.3 blocking-prerender-current-time in (admin) AuthGate

**One-liner:** Postponed the (admin) AuthGate's dynamic boundary by awaiting `connection()` from `next/server` as the gate's first statement (strictly before Better Auth's `getSession()`), so next@16.3.3's current-time prerender guard can no longer fire on the argument-less `new Date()` that session-expiry math constructs during the PPR shell-prerender pass on `/dashboard/posts`.

## What landed

One surgical edit to `src/app/(admin)/layout.tsx` (commit 1813b61, 1 file, +9/−3):

1. **Import** — `import { connection } from "next/server";` added directly below the existing `next/navigation` import line.
2. **Boundary postponement** — `await connection();` inserted as AuthGate's FIRST statement, immediately above `const session = await getSession();` (the line that previously threw, old line 47). This is the error message's own `[dynamic]` remedy: the boundary postpones at the top of the gate, so BOTH the `headers()` access AND Better Auth's internal session-expiry `new Date()` math execute at request time inside the existing `<Suspense>` boundary.
3. **Comment rewrite** — the stale claim ("headers()-inside-Suspense alone opts the gate into dynamic rendering") replaced with a 7-line comment documenting the root cause: under next@16.3.3 the (admin) shell still prerenders through AuthGate (`instant = false` keeps the PPR shell per task 260826-oif), Better Auth's getSession builds an argument-less Date BEFORE `headers()` postpones the pass, the 16.3.3 current-time guard threw at this exact line on `/dashboard/posts`, and `connection()` awaited as the gate's first statement is the remedy.

Byte-identical (untouched): the `export const instant = false` block and its docs comment (old lines 6-17), the layout-level doc block (Suspense strategy description), the `redirect("/signin")` branch, the Phase 4 D-05 role coercion, the AdminShell render, the `<Suspense>` wrapper in AdminLayout, all 16 page-level `instant` exports, and every other file in the repo.

## Deviations from Plan

**1. [Rule 1 - Bug] Plan's comment spec collided with its own grep gate — comment wording adjusted**
- **Found during:** Task 1 Step 2 verification (`grep -c "await connection"` returned 2, expected 1)
- **Issue:** The plan's (c) required the comment to literally state "`await connection()` is the error message's own [dynamic] remedy", but its automated verify requires `grep -c "await connection" "src/app/(admin)/layout.tsx"` to equal 1 — internally inconsistent (the prose mention would be the second match).
- **Fix:** The comment names the remedy as "`connection()` — awaited as this gate's first statement" (no literal `await connection` substring). All required content is preserved — the must_have only requires the comment to "name connection() as the 16.3.3 dynamic marker". Grep gate now passes exactly as specified.
- **Files modified:** none beyond the planned file
- **Commit:** folded into 1813b61 (initial commit 81a55b2 amended pre-push — see note below)

**2. [Process note] Commit amended before anything was pushed**
- The grep fix above required rewording the comment after the first commit (81a55b2) was created. Amended it (`git commit --amend --no-edit`, authorized via the fact-forcing gate with rollback documented) so the task remains ONE atomic commit as the plan's objective requires. Nothing was pushed; 81a55b2 never left the local repo.

## Verification Battery (evidence)

| Check | Result |
|---|---|
| `pnpm test` baseline (Step 0, pre-change @ 0bc1a00) | **62 files / 621 tests passed, 0 failures**; exit 0 |
| `npx tsc --noEmit` baseline (Step 0) | exit 0, **empty output** |
| `pnpm test` post-change (final wording) | **62 files / 621 tests passed, 0 failures** — identical to baseline counts |
| `npx tsc --noEmit` post-change | exit 0, empty output (0 bytes) |
| `git show --stat HEAD` | exactly **one file**: `src/app/(admin)/layout.tsx`, +9/−3 |
| `grep -c "await connection" "src/app/(admin)/layout.tsx"` | **1** (the code call site; comment prose no longer matches) |
| Commit deletions (`git diff --diff-filter=D HEAD~1 HEAD`) | **0 files deleted** |
| `git status --short` after commit | only ` M .planning/config.json` (GSD-owned, uncommitted-dirty as required) |
| Environmental constraints | **honored** — no `pnpm build`/`start`/`dev`, no `.next/` touch, no process kill; only `pnpm test`, `npx tsc --noEmit`, git ops, grep, and a package.json read ran. Owner's live dev server on :3000 undisturbed |
| Signed-in reload of /dashboard/posts | **NOT verified here** (deliberately out of scope — owner's pending Phase 05 UAT R1 step; no invented credentials). The fix reaches the running app via HMR on their next reload |

## Commits

- **1813b61** — `fix(260826-pqg): await connection() before getSession in (admin) AuthGate — unblock 16.3.3 prerender current-time guard` (1 file; amended from same-session 81a55b2 before any push — deviation #2)

## Key files

- `src/app/(admin)/layout.tsx` — connection import + `await connection()` as AuthGate's first statement + rewritten root-cause comment

## Threat model outcomes

- **T-pqg-01 (Tampering — AuthGate logic):** mitigated — `connection()` postpones rendering only; the session check, `redirect("/signin")` branch, D-05 role coercion, and AdminShell render are byte-identical (verified by diff review); full vitest suite green at the 621-test baseline (auth/permission tests included).
- **T-pqg-02 (Info Disclosure — prerendered shell):** accepted as planned — the change makes the gate MORE conservative (session work always at request time); the prerendered shell remains the bare root-layout fallback with no dashboard content; nothing shifted from dynamic to static.
- **T-pqg-SC (package installs):** n/a — no installs; `connection` is an existing named export of the installed next@16.3.3; package.json/lockfile untouched.

## Known Stubs

None — no stub patterns introduced.

## Notes for the owner

- Root cause recap (diagnosed live in the planning session, not re-derived): 260826-oif's `instant = false` cleared the uncached-data error but kept the PPR shell, and the shell-prerender pass still executed AuthGate — where Better Auth's `getSession()` constructs `new Date()` for session-expiry math BEFORE any tracked dynamic access postpones the pass. The 16.3.3 current-time guard fired on that Date. `await connection()` as the gate's first statement postpones the boundary up front, which is the error message's own recommended `[dynamic]` remedy.
- Your runtime confirmation: signed-in reload of `/dashboard/posts` (HMR picks the change up automatically) — the `Next.js encountered the unstable value new Date() while prerendering` error should be gone. That check is your pending Phase 05 UAT R1 step.
- This summary and the plan/config docs are intentionally uncommitted here; the orchestrator owns the docs commit.

## Self-Check: PASSED

- `260826-pqg-SUMMARY.md` exists at the planned path — FOUND
- `src/app/(admin)/layout.tsx` — FOUND; `await connection();` present exactly once (line 52), directly above `const session = await getSession();`
- Commit 1813b61 — FOUND at HEAD (`git log --oneline --all`), exactly one file, 0 deletions
- Post-commit tree — only `.planning/config.json` modified-uncommitted (required) plus this intentionally-uncommitted SUMMARY.md
