# 07-03 — Revalidation audit + fixes (PERF-03)

**Status:** complete (3/3 tasks)
**Plan:** `.planning/phases/07-performance-deploy/07-03-PLAN.md`

## What shipped

- **Task 1 — audit:** `07-REVALIDATION-AUDIT.md` classifies every mutating Server Action in `src/actions/` as HAS / MISSING / N/A, with a per-route cache-strategy column (the load-bearing input to Pitfall #7).
- **Task 2 — fixes:** categories / tags / pages / users actions now revalidate the public routes they affect AFTER the DB write + permission gate, using the SAME mechanism each route uses for caching (Pitfall #7): concrete-literal `revalidatePath` for path-cached routes + 2-arg `revalidateTag(tag, "max")` for cacheTag-cached routes. Slug-change handling on category/tag update+delete. Template: `posts.ts:publishPost`. Audit rows flipped MISSING → HAS.
- **Task 3 — publish→visible script:** `scripts/test-publish-visible.mjs` + `pnpm test:publish-visible`. Polls the deployed public URL after a publish and confirms content lands within the 30s revalidation window on the real stack (closes Pitfall #3).

## Commits (worktree-agent-a292b863c3b0a916e)

- `f7fdf35` docs(07-03): revalidation audit — classify every mutating action
- `b45a468` docs(07-03): flip audit rows MISSING→HAS after Task 2 fixes applied
- `f2623b5` feat(07-03): add revalidation calls to categories/tags/pages/users actions
- `86f681c` feat(07-03): add publish→visible verification script
- (this SUMMARY)

## Verification

- `pnpm test -- --run` → 383/383 pass (taxonomy/pages/users test files gained a `next/cache` mock + an extended db select-chain supporting the new `.where().limit(1)` slug-fetches).
- `pnpm lint --max-warnings 0` → exit 0.
- `node --check scripts/test-publish-visible.mjs` → OK.

## Deviations / notes

1. **Test mocks added (Rule 1):** the plan's Task 2 didn't explicitly list test-file updates, but the new revalidation calls read `next/cache` inside the action bodies, so the action unit tests needed a `vi.mock("next/cache", …)` (revalidatePath/revalidateTag as `vi.fn()`) plus db-chain support for the new `.limit(1)` slug-fetch. Applied to `taxonomy.test.ts`, `pages.test.ts`, `users.test.ts`.
2. **publish-visible script is a poller, not an auto-publisher (executor discretion per the plan):** the operator publishes the test post via the dashboard (the real `publishPost` action fires revalidation) and the script polls `PROD_URL/blog/{slug}`. This avoids the fragile auth/DB-insert path AND exercises the actual publish→revalidate→visible loop end-to-end. ASCII-only; `process.exitCode = 1` (not `process.exit`); SKIPs on unreachable; 30s deadline; instructs cleanup.
3. **Inline completion by the orchestrator:** the dispatched executor hit a usage-quota 429 mid-Task-2 (while updating test mocks). The orchestrator finished Tasks 2–3 inline + this SUMMARY; all commits land on the same worktree branch.
4. **End-to-end publish→visible verification on the real stack is deferred to Plan 07-04** (run `PROD_URL=… pnpm test:publish-visible` after the Coolify deploy).
