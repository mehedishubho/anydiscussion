---
phase: quick-260826-oif
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(admin)/layout.tsx
  - src/app/(admin)/dashboard/page.tsx
  - src/app/(admin)/dashboard/posts/page.tsx
  - src/app/(admin)/dashboard/posts/new/page.tsx
  - src/app/(admin)/dashboard/posts/[id]/edit/page.tsx
  - src/app/(admin)/dashboard/users/page.tsx
  - src/app/(admin)/dashboard/profile/page.tsx
  - src/app/(admin)/dashboard/categories/page.tsx
  - src/app/(admin)/dashboard/tags/page.tsx
  - src/app/(admin)/dashboard/media/page.tsx
  - src/app/(admin)/dashboard/pages/page.tsx
  - src/app/(admin)/dashboard/pages/[id]/edit/page.tsx
  - src/app/(admin)/dashboard/subscribers/page.tsx
  - src/app/(admin)/dashboard/settings/storage/page.tsx
  - src/app/(admin)/dashboard/settings/newsletter/page.tsx
  - src/app/(admin)/dashboard/settings/seo/page.tsx
  - src/app/(admin)/dashboard/settings/backup/page.tsx
autonomous: true
requirements: [quick-260826-oif]
must_haves:
  truths:
    - "rm -rf .next && pnpm build exits 0 and the captured build log contains ZERO cacheComponents validation errors naming any (admin) route (the dev-DB Postgres on docker compose port 5435 is up, so instrumentation.ts boot seeding does not crash the build)"
    - "Client-side navigation between any two /dashboard/* pages is allowed to block on the server instead of throwing the uncached-data-outside-Suspense error — page-scope opt-out present on ALL 16 data-fetching dashboard pages, because the installed Next 16.3.3 docs state a layout-level opt-out does NOT cover navigations between sibling segments below it"
    - "Signed-out GET /dashboard/posts returns 307/308 with a Location header that contains the next= deep-link param (e.g. /signin?next=%2Fdashboard%2Fposts) — that param exists ONLY in src/proxy.ts branch 2 (lines 107-111); the (admin) layout AuthGate redirect emits bare /signin — so this curl is BEHAVIORAL PROOF the proxy executes under 16.3.3 (reversing the 05-04 never-registered finding), and .next/server/middleware-manifest.json additionally lists the proxy entry"
    - "pnpm test (vitest) reports zero failures — baseline on main was 621/621 before the upgrade; the owner's commit 14b4044 updated __tests__/middleware.test.ts under 16.3.3, so the count may legitimately differ: report the actual number, require zero failures"
    - "npx tsc --noEmit output is IDENTICAL to the pre-change capture taken in Task 1 (the fix adds zero type errors); deltas vs the old 16.1.6 baseline (4x TS18048 in src/actions/__tests__/storage-settings.test.ts) are upgrade fallout reported in the SUMMARY, not force-matched and not fixed here"
    - "No file outside src/app/(admin)/ is modified: dashboard/calendar/page.tsx and the (ui-elements) demo pages get NO export (genuinely static, validation still guards them), the public (site) route group keeps full PPR, and owner commit 14b4044 (16.3.3 + proxy migration) is intact — nothing reverted, nothing restaged"
  artifacts:
    - "src/app/(admin)/layout.tsx carries the segment opt-out export plus a comment citing the installed-docs scope rule (entry navigations) and this task id"
    - "Each of the 16 dashboard page files listed in files_modified carries the same segment opt-out export (placed next to its export const metadata block) plus a 2-4 line comment: why the page is allowed to block (100% session-dependent content via permission-checked Server Actions that call headers(); a static shell buys nothing), the sibling-navigation scope rule, and task id 260826-oif"
    - "SUMMARY at .planning/quick/260826-oif-fix-next-16-3-3-cachecomponents-blocking/260826-oif-SUMMARY.md recording: baseline vs post-fix build evidence, which shape(s) landed (layout and/or pages) and why, vitest count, tsc comparison, proxy registration evidence (manifest + curl), and the (admin)/(site) scope assertion"
  key_links:
    "(admin)/layout.tsx instant=false -> all DIRECT/entry navigations into /dashboard/* (covers outside-in visits the layout <Suspense> already handles at page load)"
    "Each dashboard page's instant=false -> client navigations between /dashboard/a and /dashboard/b (the re-render scope sits BELOW the (admin) layout, so its <Suspense> boundary cannot cover the transition — root cause of the thrown error)"
    "src/proxy.ts branch 2 (sessionCookie check + signInUrl.searchParams.set('next', pathname)) -> 307 Location with next= param -> the behavioral proof requested by the situation brief"
    ".next/server/middleware-manifest.json proxy entry -> proxy registration under the 16.3.3 build (functions-config-manifest discovery, src/ location per the 05-04 note)"
    "instrumentation.ts settings seeding -> every pnpm build requires Postgres on localhost:5435 (docker compose) — DB precheck precedes every build in this task"
---

<objective>
Fix the Next.js 16.3.3 cacheComponents fallout on (admin) dashboard routes: client-side navigation / prerender to dashboard pages throws the uncached-data-outside-Suspense validation error. Root cause and fix are diagnosed — implement, do NOT re-derive. This builds ON TOP of owner commit 14b4044 (next ^16.3.3, react 19.2.8, middleware.ts→proxy.ts rename, updated middleware.test.ts) — never revert or "clean up" any of it.

**Mechanism (verified against the docs SHIPPED IN the installed next@16.3.3 package):**
- src/app/(admin)/layout.tsx already wraps AuthGate in <Suspense>. That boundary covers full page loads ("the full tree renders from the root") but NOT client navigations between two /dashboard/* pages — the re-render scope is below the shared (admin) layout, so a Suspense boundary above that point cannot be used during the transition (node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md lines 24-33 and 131-132).
- The five pages named in the diagnosis (posts list :41/:51, posts/new :27, posts/[id]/edit :67, users :71, profile :38) do page-segment-level uncached reads — permission-checked Server Actions that call headers() via getSession/requireCan plus DB IO. On a sibling client navigation those reads sit outside any effective Suspense boundary → the thrown error.
- The fix is the segment config the installed migration guide prescribes as the replacement for the forbidden dynamic = "force-dynamic" under cacheComponents (the layout.tsx lines 12-14 comment already documents that force-dynamic is rejected): set the instant segment config to false on the segments that raise the error. Per the "Opting out" section of instant-navigation.md (lines 550-576): a layout-level opt-out stops validation flagging navigations INTO /dashboard from outside, but "navigations between sibling segments below are still checked" — so BOTH shapes are required: layout export for entry navigations, page exports for the sibling client navigations that constitute the reported bug. "For opted-out segments, the navigation blocks on the server" — exactly correct for a 100% session-dependent dashboard where a static shell has zero value. The public (site) group is untouched and keeps full PPR.

**Scope delta vs the situation brief (sanity-check finding — brief authorized and requested the check):** the five named pages are the OBSERVED erroring flows, not the complete set. The same page-scope uncached-await pattern exists in 11 MORE dashboard pages: dashboard overview (listPosts/listMedia), categories (listCategories), tags (listTags), media (listMedia), pages (listPages), pages/[id]/edit (getPage), subscribers (listSubscribers/countSubscribers + awaited searchParams), settings/storage (getStorageSettings), settings/newsletter (readNewsletterSettings), settings/seo (getSeoSettings), settings/backup (getBackupSettings + listBackups). Fixing only five would leave sidebar navigation to categories/tags/media/settings throwing the identical error. The fix therefore covers ALL 16 data-fetching dashboard pages. Deliberately EXCLUDED: dashboard/calendar/page.tsx and the (ui-elements) demo pages (no awaits, genuinely static — leaving them validated keeps the guard active where it is free).

Purpose: restore a working dashboard under Next 16.3.3 (Phase 05 UAT continues on it) while preserving the public site's PPR and proving the proxy actually registers/invokes under 16.3.3.
Output: 17 files each carrying the one-line segment opt-out with explanatory comments; verification battery evidence (build log, vitest, tsc comparison, auth-gate script, proxy manifest + behavioral curl) distilled into the SUMMARY; one surgical conventional commit.
</objective>

<execution_context>
@D:/Devsroom-Work/anydiscussion/.claude/gsd-core/workflows/execute-plan.md
@D:/Devsroom-Work/anydiscussion/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/(admin)/layout.tsx
@src/proxy.ts
@next.config.ts
@node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md
@node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md
@src/app/(admin)/dashboard/posts/page.tsx
@src/app/(admin)/dashboard/users/page.tsx
@scripts/test-auth-gate.mjs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Baseline evidence, then segment opt-out in (admin) layout + all 16 data-fetching dashboard pages (staged layout-first with empirical gate)</name>
  <files>src/app/(admin)/layout.tsx, src/app/(admin)/dashboard/page.tsx, src/app/(admin)/dashboard/posts/page.tsx, src/app/(admin)/dashboard/posts/new/page.tsx, src/app/(admin)/dashboard/posts/[id]/edit/page.tsx, src/app/(admin)/dashboard/users/page.tsx, src/app/(admin)/dashboard/profile/page.tsx, src/app/(admin)/dashboard/categories/page.tsx, src/app/(admin)/dashboard/tags/page.tsx, src/app/(admin)/dashboard/media/page.tsx, src/app/(admin)/dashboard/pages/page.tsx, src/app/(admin)/dashboard/pages/[id]/edit/page.tsx, src/app/(admin)/dashboard/subscribers/page.tsx, src/app/(admin)/dashboard/settings/storage/page.tsx, src/app/(admin)/dashboard/settings/newsletter/page.tsx, src/app/(admin)/dashboard/settings/seo/page.tsx, src/app/(admin)/dashboard/settings/backup/page.tsx</files>
  <action>
  Work directly on the main checkout (worktrees disabled). pnpm only. Precheck the DB before ANY build: docker compose ps must show Postgres up (port 5435); if down run docker compose up -d and wait for readiness — instrumentation.ts seeds settings at boot and CRASHES builds when Postgres is unreachable.

  **Step 1 — capture pre-change evidence (before touching any file):**
  - Run: rm -rf .next (mandatory — warm builds reuse stale "use cache" output, a known gotcha) then pnpm build, teeing output to a capture file inside THIS quick task's .planning directory (e.g. build-baseline.log). Record whether the build exits 0 and which routes, if any, the cacheComponents validation names. Whatever the outcome (fail on (admin) routes = perfect RED evidence; green = the bug is navigation-runtime-scoped only, proceed regardless — the fix is docs-mandated), do not fix anything unrelated here; note unrelated failures for the SUMMARY.
  - Run: npx tsc --noEmit, tee to tsc-baseline.log in the same directory. This is the honest 16.3.3 baseline Task 2 compares against (the old 16.1.6 baseline was exactly 4 TS18048 errors in src/actions/__tests__/storage-settings.test.ts — under 16.3.3 the actual output may differ; capture, do not force-match).

  **Step 2 — Stage A (layout-level, the brief's preferred shape):** in src/app/(admin)/layout.tsx add the segment config export `export const instant = false` (module scope, directly below the existing imports, above the AuthGate function) with a 3-5 line comment: cacheComponents-era replacement for the forbidden force-dynamic per the installed 16.3.3 migration guide; opts the whole (admin) group's ENTRY navigations into allowed-to-block; dashboard is 100% session-dependent so a static shell buys nothing; public (site) keeps full PPR; task id 260826-oif. Extend the existing PPR compatibility comment block (lines 6-28) rather than contradicting it. Then rm -rf .next && pnpm build (tee to build-stage-a.log) and record the outcome — this is the empirical check that decides which shape holds: per instant-navigation.md line 574 the layout export does NOT cover sibling client navigations, so a green Stage-A build proves only the prerender path; expect the page scope still to be required.

  **Step 3 — Stage B (page-level, required for the reported client-navigation bug):** in EACH of the 16 dashboard page files listed in <files> (every dashboard page EXCEPT calendar and the (ui-elements) demos — they are genuinely static and stay validated), add the same module-scope segment config export set to false, placed immediately after the file's `export const metadata` block (or after the imports when a page has no metadata export), each with a 2-4 line comment: page-scope uncached reads (permission-checked Server Actions calling headers() + DB IO) sit outside any effective Suspense boundary during client navigations between /dashboard pages because the re-render scope is below the (admin) layout; the layout-level opt-out does not cover sibling navigations per the installed instant-navigation docs; allowed-to-block is correct for session-gated content; task id 260826-oif. Do NOT restructure any page's JSX, do NOT add Suspense wrappers, do NOT touch data-fetching logic — this task adds one export + comment per file, nothing else.

  **Step 4 — final build gate:** rm -rf .next && pnpm build teed to build-final.log; must exit 0. From the build output's route table, note how the /dashboard/* routes are now annotated (expect dynamic/blocking rather than static/instant) for the SUMMARY. Delete the raw log captures from the .planning directory AFTER distilling their evidence into notes (the SUMMARY carries the findings; raw logs are not committed).
  </action>
  <verify>
    <automated>cd "D:/Devsroom-Work/anydiscussion" && grep -c "export const instant = false" "src/app/(admin)/layout.tsx" && [ "$(grep -rl 'export const instant = false' $(find 'src/app/(admin)/dashboard' -name page.tsx) | wc -l)" -eq 16 ] && [ "$(grep -rl 'export const instant = false' 'src/app' | grep -v '(admin)' | wc -l)" -eq 0 ] && grep -c 'blocking-prerender-dynamic' build-final.log; echo "exit=$?"</automated>
  </verify>
  <done>
  Layout export count is 1; exactly 16 of the 17 dashboard page.tsx files carry the export (calendar is the one without); zero occurrences of the export anywhere in src/app outside the (admin) route group (region-scoped negative check — (site) PPR untouched); build-final.log shows exit 0 with a zero count for the blocking-prerender-dynamic token (grep -c returns 0, which under `set -e`-less bash still prints 0 — read the printed count, do not trust the chain exit alone; run the four checks individually if the one-liner is awkward on the shell).
  </done>
</task>

<task type="auto">
  <name>Task 2: Verification battery (vitest, tsc diff, auth-gate, proxy registration + behavioral proof), surgical commit, SUMMARY</name>
  <files>.planning/quick/260826-oif-fix-next-16-3-3-cachecomponents-blocking/260826-oif-SUMMARY.md</files>
  <action>
  **Step 1 — vitest:** pnpm test. Require ZERO failures. The passing count vs the old 621/621 baseline may differ (owner commit 14b4044 updated __tests__/middleware.test.ts for the proxy rename under 16.3.3) — report the actual number in the SUMMARY.

  **Step 2 — tsc comparison:** npx tsc --noEmit again and diff against the Task 1 pre-change capture. PASS = identical output (the fix added zero type errors). Any delta BETWEEN the two captures means the exports introduced a type problem — fix before committing. Deltas vs the OLD 16.1.6 baseline (the 4 TS18048 errors in src/actions/__tests__/storage-settings.test.ts) are pre-existing 16.3.3 upgrade fallout already present in the pre-change capture: report in SUMMARY, do not fix here, do not force-match the old baseline.

  **Step 3 — auth gate + proxy registration evidence (uses the final .next from Task 1; do NOT rebuild — and never without rm -rf .next first if you must):**
  - pnpm test:auth-gate — the script re-uses the existing build, runs the structural check (no dashboard content in any prerendered shell; reports the middleware-manifest entry count) and, since Postgres is up, boots `next start` on port 3939 and asserts the signed-out /dashboard 307/308 bounce to /signin. All its checks must pass.
  - Manifest proof: confirm .next/server/middleware-manifest.json contains the proxy entry (grep for proxy in the JSON; note the exact key in the SUMMARY).
  - Behavioral proxy proof (stronger than the manifest): start the production server — pnpm start in the background on port 3000 — then curl -sI http://localhost:3000/dashboard/posts with NO cookies. Assert: status 307 or 308 AND the Location header is /signin WITH the next= deep-link param (URL-encoded path), e.g. Location: /signin?next=%2Fdashboard%2Fposts. That param is set ONLY by src/proxy.ts branch 2 (lines 107-111); the (admin) layout AuthGate's redirect("/signin") (layout.tsx line 36) emits NO query param — so its presence proves the proxy executed on a real request. Its ABSENCE with a bare /signin Location means the proxy did not invoke (the AuthGate caught it instead) — that is a FAILURE of this proof even though the bounce itself works; investigate before committing. A redirects-table 307/308 via a temporary row is an acceptable alternative proof if the next-param check is inconclusive (insert row, curl the old path, expect 307 with Location, delete the row).
  - Windows cleanup afterward: kill any leftover next-start PIDs on ports 3000 and 3939 (netstat -ano | findstr :3000 then taskkill /PID <pid> /F; repeat for 3939) — known gotcha from project memory.
  - Optional best-effort (NOT a gate, no invented credentials): if real dev credentials are at hand, sign in via POST /api/auth/sign-in/email and curl the five originally-reported pages asserting HTTP 200; otherwise note in the SUMMARY that signed-in rendering is covered by the owner's next UAT pass.

  **Step 4 — surgical commit:** stage EXACTLY the 17 source files from Task 1 via explicit git add paths (the 16 page files + src/app/(admin)/layout.tsx). NEVER git add -A, git add ., or git commit -a — .planning/config.json is currently modified-uncommitted (GSD-owned) and must remain uncommitted-and-intact, and no other dirt may enter this commit. Commit message: `fix(260826-oif): opt (admin) dashboard routes into blocking rendering under Next 16.3.3 cacheComponents` (conventional fix: prefix, task id included). Verify with git show --stat HEAD that exactly 17 files are in the commit and git status still shows the pre-existing unrelated dirt untouched.

  **Step 5 — SUMMARY:** write .planning/quick/260826-oif-fix-next-16-3-3-cachecomponents-blocking/260826-oif-SUMMARY.md recording: which shape(s) landed (layout AND pages) and the Stage-A empirical outcome; the scope delta (16 pages vs the 5 observed — list the 11 additional pages with their uncached call sites); baseline vs final build evidence; vitest actual count; tsc comparison verdict; proxy registration evidence (manifest key + the curl Location observed); commit hash. Stage the SUMMARY file explicitly and amend-follow with a second commit `docs(quick-260826-oif): record fix summary` staging only the SUMMARY.
  </action>
  <verify>
    <automated>cd "D:/Devsroom-Work/anydiscussion" && pnpm test && git show --stat --oneline HEAD | head -25 && git show --stat HEAD | grep -c "src/app/(admin)"</automated>
  </verify>
  <done>
  Vitest zero failures (actual count reported); tsc output byte-identical to the pre-change capture; test-auth-gate passes including the booted-server HTTP check; middleware-manifest lists the proxy; signed-out curl of /dashboard/posts returned 307/308 with a Location containing the next= param (exact header recorded in SUMMARY); leftover server PIDs killed; HEAD commit contains exactly the 17 (admin) files; .planning/config.json still modified-uncommitted and untouched; SUMMARY written and committed.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| unauthenticated client → (admin) routes | forged/absent session cookies reaching /dashboard/* pages |
| client request → proxy (src/proxy.ts) | all matched requests cross the UX-only proxy gate before rendering |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-oif-01 | Information Disclosure | (admin) pages after allowed-to-block opt-out | medium | mitigate | Opt-out changes rendering mode only — content still renders per-request behind the AuthGate (getSession + redirect). scripts/test-auth-gate.mjs structural check continues to assert no dashboard content appears in any prerendered shell; it must pass post-fix. |
| T-oif-02 | Tampering | segment opt-out escaping to the (site) group | medium | mitigate | Region-scoped negative verify: the export exists ONLY inside src/app/(admin)/ (0 occurrences elsewhere in src/app). Public PPR untouched — this is a performance/security-of-cache contract, and calendar + (ui-elements) stay validated. |
| T-oif-SC | Tampering | package installs | n/a | accept | No package installs in this task — dependency changes came from owner commit 14b4044, already reviewed by the owner. |
</threat_model>

<verification>
- rm -rf .next && pnpm build exits 0; captured log has zero validation-error occurrences for (admin) routes; build route table shows dashboard routes as dynamic/blocking.
- pnpm test: zero failures; count reported vs 621 baseline.
- npx tsc --noEmit identical to pre-change capture; upgrade-fallout deltas vs the 16.1.6 baseline reported, not force-matched.
- pnpm test:auth-gate passes (structural + booted-server 307/308 check).
- .next/server/middleware-manifest.json lists the proxy; signed-out curl /dashboard/posts → Location /signin?next=%2Fdashboard%2Fposts (behavioral proxy proof).
- Export present in exactly 16 dashboard page files + the (admin) layout; zero occurrences outside (admin); calendar + (ui-elements) untouched.
- HEAD commit contains exactly the 17 files; no unrelated dirt staged; owner migration commit 14b4044 intact.
</verification>

<success_criteria>
Dashboard routes render under Next 16.3.3 cacheComponents without the uncached-data validation throw — entry navigations covered by the layout opt-out, sibling client navigations covered by the 16 page-level opt-outs — with the public site's PPR unchanged, the full test/type gates green or honestly reported, proxy registration proven behaviorally under 16.3.3, and a single surgical commit that leaves the owner's migration and the GSD config file exactly as found.
</success_criteria>

<output>
Create `.planning/quick/260826-oif-fix-next-16-3-3-cachecomponents-blocking/260826-oif-SUMMARY.md` when done
</output>
