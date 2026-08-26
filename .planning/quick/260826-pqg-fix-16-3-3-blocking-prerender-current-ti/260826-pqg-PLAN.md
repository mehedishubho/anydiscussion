---
phase: quick-260826-pqg
plan: 01
type: execute
subsystem: admin-dashboard
tags: [next-16.3.3, cacheComponents, ppr, prerender, connection, better-auth, auth-gate]
wave: 1
depends_on: []
files_modified:
  - src/app/(admin)/layout.tsx
autonomous: true
must_haves:
  truths:
    - "AuthGate's first statement is `await connection()` (named import from next/server), executed strictly before `await getSession()`"
    - "Full vitest suite passes with the same file/test counts as the captured pre-change baseline; `npx tsc --noEmit` exits 0 with empty output"
    - "The task commit changes exactly one file — src/app/(admin)/layout.tsx; the 16 page-level `instant` exports and every other file are untouched"
    - "No pnpm build, no .next wipe, no server boot, no process kill — the owner's live dev server on port 3000 is undisturbed"
    - "The AuthGate inline comment names connection() as the 16.3.3 dynamic marker and explains why headers()-in-Suspense alone no longer precedes Better Auth's Date construction"
  artifacts:
    - src/app/(admin)/layout.tsx
  key_links:
    - "connection() call site → first statement of AuthGate, immediately above the getSession() line that previously threw (old line 47)"
    - "AuthGate → still wrapped by the existing <Suspense> boundary in AdminLayout (shell fallback and auth logic byte-identical)"
---

<objective>
Fix the Next.js 16.3.3 `blocking-prerender-current-time` error thrown in the (admin) AuthGate: `Route "/dashboard/posts": Next.js encountered the unstable value new Date() while prerendering`, stack at `AuthGate (src/app/(admin)/layout.tsx:47)` — the `await getSession()` line.

Purpose (diagnosed live this session — do NOT re-derive): after quick task 260826-oif landed `export const instant = false` on the (admin) layout + 16 pages (clearing the uncached-data error), the (admin) shell STILL prerenders through AuthGate (the instant opt-out keeps the PPR shell — confirmed empirically in the oif SUMMARY, deviation #2). During that shell-prerender pass, Better Auth's `getSession()` internally constructs an argument-less `new Date()` for session-expiry math BEFORE any tracked dynamic access (headers()) postpones the pass — so the 16.3.3 current-time guard fires. The fix is the error message's own [dynamic] remedy: `await connection()` from `next/server` as the FIRST statement of AuthGate, postponing the boundary at the top so headers access AND the session Date math both render at request time inside the existing `<Suspense>` boundary.

Output: one surgical edit to `src/app/(admin)/layout.tsx` (AuthGate + its comment + one import), one atomic commit.
</objective>

<execution_context>
@D:/Devsroom-Work/anydiscussion/.claude/gsd-core/workflows/execute-plan.md
@D:/Devsroom-Work/anydiscussion/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/quick/260826-oif-fix-next-16-3-3-cachecomponents-blocking/260826-oif-SUMMARY.md
@src/app/(admin)/layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Postpone the AuthGate boundary — await connection() before getSession()</name>
  <files>src/app/(admin)/layout.tsx</files>
  <action>
Step 0 — capture baseline: run `pnpm test` and `npx tsc --noEmit` once (both green at current HEAD per live diagnosis; record the vitest "N files / M tests passed" summary line for the post-change comparison).

Step 1 — edit `src/app/(admin)/layout.tsx` ONLY, three changes:
(a) Add a new import line for the named export `connection` from `next/server`, placed directly below the existing `next/navigation` import.
(b) In `AuthGate`, insert `await connection();` as the function's FIRST statement, immediately above `const session = await getSession();`. Change NOTHING else in the function — the `redirect("/signin")` branch, the Phase 4 D-05 role coercion, and the AdminShell render stay byte-identical.
(c) Rewrite the three-line comment directly above the getSession call (the one currently claiming that headers()-inside-Suspense alone opts the gate into dynamic rendering). The replacement comment (3-6 lines) must state: under next@16.3.3 the (admin) shell still prerenders through AuthGate (`instant = false` keeps the PPR shell per task 260826-oif), and Better Auth's getSession constructs an argument-less Date for session-expiry math BEFORE headers() postpones the pass — so the 16.3.3 current-time guard threw at this exact line during the shell-prerender pass (observed live on /dashboard/posts). `await connection()` is the error message's own [dynamic] remedy: it postpones the boundary at the top of the gate so headers access AND the session Date math both run at request time inside the existing Suspense boundary.

Untouched: the `export const instant = false` block and its docs comment (lines 6-17), the large layout-level doc block (its Suspense strategy description remains accurate), all 16 page-level `instant` exports, and every other file in the repo.

HARD environment constraints: the owner's `pnpm dev` is LIVE on port 3000 and must not be disturbed. Do NOT run `pnpm build`, `pnpm start`, `pnpm dev`, or boot any server; do NOT `rm -rf .next`; do NOT kill or signal any node/next process. `pnpm test` (vitest) and `npx tsc --noEmit` are the ONLY commands to run — neither touches `.next/`. The fix reaches the running app via HMR on the owner's next signed-in reload; that runtime check is the owner's pending Phase 05 UAT R1 step, deliberately OUT OF SCOPE here (no invented credentials).

Step 2 — commit (worktrees DISABLED — work directly on the main checkout): stage surgically with the path quoted for its parentheses — `git add "src/app/(admin)/layout.tsx"` — never `git add -A`/`-a`, and never stage `.planning/config.json` (it stays uncommitted-dirty). Conventional commit including the task id, e.g. `fix(260826-pqg): await connection() before getSession in (admin) AuthGate — unblock 16.3.3 prerender current-time guard`.
  </action>
  <verify>
    <automated>
pnpm test && npx tsc --noEmit && git show --stat HEAD && grep -c "await connection" "src/app/(admin)/layout.tsx"
    </automated>
    Expected: vitest all-pass with the SAME file/test counts as the Step 0 baseline; tsc exit 0 with empty output; `git show --stat HEAD` lists exactly one file (src/app/(admin)/layout.tsx); grep count is 1.
  </verify>
  <done>
- connection() is awaited as AuthGate's first statement, strictly before getSession(); the `connection` import from next/server is added
- Auth logic (redirect branch, role coercion, AdminShell render) and the Suspense wrapper are byte-identical to pre-change
- Full vitest suite green at baseline counts; `npx tsc --noEmit` clean
- Commit contains exactly one file; no dashboard page file, (site) file, or config file modified
- Dev server on :3000 and the `.next/` directory left completely undisturbed
- Rewritten comment documents the Date-guard root cause and the connection() remedy
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| prerender pass → request-time rendering | Not a trust boundary change — rendering-mode marker only; no input parsing, no auth-logic modification |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-pqg-01 | Tampering | AuthGate (src/app/(admin)/layout.tsx) | medium | mitigate | connection() postpones rendering only; session check + redirect stay byte-identical — proven by code review of the one-file diff plus full vitest suite green (auth/permission tests included in the 621-test baseline) |
| T-pqg-02 | Info Disclosure | (admin) shell prerender | low | accept | Change makes the gate MORE conservative (session work always at request time); the prerendered shell remains the bare root-layout fallback with no dashboard content (structurally proven in 260826-oif test:auth-gate); nothing shifts from dynamic to static |
| T-pqg-SC | Tampering | package installs | low | accept | No installs — `connection` is an existing named export of the installed next@16.3.3; package.json/lockfile untouched |
</threat_model>

<verification>
- Full vitest suite passes at the captured baseline counts; `npx tsc --noEmit` exit 0.
- Static diff review: exactly one file in the commit; `await connection()` present exactly once, above the getSession call; no other statement reordered.
- Environmental: no build run, `.next/` not wiped, no process killed (owner's dev server on :3000 still serving).
- OUT OF SCOPE (owner's pending UAT R1 step): signed-in reload of /dashboard/posts confirming the error is gone via HMR.
</verification>

<success_criteria>
- The 16.3.3 current-time prerender guard can no longer fire inside AuthGate: the boundary is postponed before Better Auth's internal Date construction, per the error message's own [dynamic] remedy.
- All automated gates green (vitest baseline counts, tsc clean, one-file commit).
- Owner's live dev session undisturbed; their HMR reload is the runtime confirmation.
</success_criteria>

<output>
Create `.planning/quick/260826-pqg-fix-16-3-3-blocking-prerender-current-ti/260826-pqg-SUMMARY.md` when done
</output>
