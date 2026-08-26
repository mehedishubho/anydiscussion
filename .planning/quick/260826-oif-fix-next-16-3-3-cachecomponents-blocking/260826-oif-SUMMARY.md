---
phase: quick-260826-oif
plan: 01
type: execute
subsystem: admin-dashboard
tags: [next-16.3.3, cacheComponents, instant-navigation, ppr, proxy, dashboard]
status: complete
commits:
  - cb692c7 "fix(260826-oif): unblock 16.3.3 build type-check — optional-chain 4 TS18048 provider-creds assertions"
  - a893f06 "fix(260826-oif): opt (admin) dashboard routes into blocking rendering under Next 16.3.3 cacheComponents"
duration: ~19 min
completed: 2026-08-26
---

# Quick Task 260826-oif — Next 16.3.3 cacheComponents blocking-render fix for (admin) routes

**One-liner:** Restored a buildable, navigable dashboard under Next 16.3.3 by adding the `instant = false` segment opt-out to the (admin) layout (entry navigations) plus all 16 data-fetching dashboard pages (sibling client navigations), after unblocking the 16.3.3 build's new project-wide type-check.

## What landed (shapes)

BOTH shapes, per the installed next@16.3.3 `instant-navigation.md` "Opting out" section (lines 550-576):

1. **Layout-level** — `src/app/(admin)/layout.tsx` carries `export const instant = false` with a comment citing the docs' scope rule. Covers ENTRY navigations into `/dashboard/*` from outside.
2. **Page-level (16 files)** — every data-fetching dashboard page carries the same module-scope export, placed directly after its `export const metadata` block with a 2-4 line comment naming the page's uncached call sites. Covers client navigations between sibling `/dashboard/a` ↔ `/dashboard/b` segments, whose re-render scope sits BELOW the (admin) layout so neither its `<Suspense>` nor its opt-out can cover the transition — the root cause of the reported uncached-data-outside-Suspense throw.

Deliberately EXCLUDED (stay validated, genuinely static): `dashboard/calendar/page.tsx` and the `(ui-elements)` demo pages.

### Stage A empirical outcome

After the layout-only change, `rm -rf .next && pnpm build` exited 0 but the route table was byte-for-byte UNCHANGED (all dashboard routes still `◐` Partial Prerender with `1h`/`1d` fallbacks) and validation still governed the page segments — empirically confirming the docs' rule that the layout export does not cover sibling client navigations. Stage B (page exports) was therefore required, exactly as planned.

### Scope delta (16 pages vs the 5 observed)

The 5 observed erroring flows: posts list, posts/new, posts/[id]/edit, users, profile. The 11 ADDITIONAL pages carrying the identical page-scope uncached-await pattern (each fixed with its own export):

| Page | Uncached call sites |
|---|---|
| dashboard overview | listPosts + listMedia |
| categories | listCategories |
| tags | listTags |
| media | listMedia |
| pages | listPages |
| pages/[id]/edit | getPage |
| subscribers | listSubscribers + countSubscribers + awaited searchParams |
| settings/storage | getStorageSettings |
| settings/newsletter | readNewsletterSettings |
| settings/seo | getSeoSettings |
| settings/backup | getBackupSettings + listBackups |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 16.3.3 build type-check now fails on the 4 pre-existing TS18048 test errors**
- **Found during:** Task 1 Step 1 (baseline capture)
- **Issue:** The as-found baseline build died at the TypeScript phase — `src/actions/__tests__/storage-settings.test.ts` lines 318/319/321/322, `result.cloudinary`/`result.r2` possibly undefined. These 4 errors are byte-identical to the old 16.1.6 `tsc --noEmit` baseline, but under 16.3.3 the build's type-check covers the full tsconfig project, so they now fail `next build` BEFORE the prerender/validation phase — blocking every build gate in this task (must-have #1: `pnpm build` exits 0).
- **Fix:** Optional chaining in the four assertions (`result.cloudinary?.api_secret` etc.) — assertion semantics preserved (a missing creds object still fails `toBe("")`); 12/12 file tests pass; tsc fully clean afterward.
- **Files modified:** `src/actions/__tests__/storage-settings.test.ts` (outside the plan's files_modified — documented here as the sole out-of-scope touch; the "no file outside (admin)" must-have is otherwise honored)
- **Commit:** cb692c7 (separate atomic commit, so HEAD remains the exact 17-file fix commit)
- **Consequence for baselines:** the plan's "pre-change" captures were taken AFTER this fix (build-baseline exit 0 / tsc empty); the AS-FOUND failing capture was preserved separately as deviation evidence before being distilled and deleted.

**2. [Observation, no code change] Route-table annotation does not change for opted-out segments**
- The plan expected `/dashboard/*` to be annotated "dynamic/blocking" in the final build's route table. Actually they remain `◐` (Partial Prerender, `1h`/`1d` fallbacks): `instant = false` opts out of validation and ALLOWS blocking navigations, but does not remove the PPR shell (the AuthGate `<Suspense>` fallback remains the prerendered shell, containing no dashboard content). Docs: "The segment may still navigate instantly if its structure supports it; the framework just won't surface insights for it." Gates that matter passed: exit 0, zero validation errors.

## Verification Battery (evidence)

| Check | Result |
|---|---|
| `rm -rf .next && pnpm build` (as-found, pre-fix) | exit 1 — TypeScript phase, 4× TS18048 in storage-settings.test.ts (deviation #1) |
| `rm -rf .next && pnpm build` (baseline, post-blocker-fix) | exit 0; zero cacheComponents validation errors; dashboard `◐ 1h/1d` |
| Stage A build (layout export only) | exit 0; route table UNCHANGED — layout export covers entry navigations only |
| Final build (all 17 opt-outs) | **exit 0; zero `uncached`/`blocking-prerender-dynamic` occurrences**; route table still `◐` (see deviation #2); `ƒ Proxy (Middleware)` listed |
| `pnpm test` (vitest) | **62 files / 621 tests passed, 0 failures** — same 621 count as the 16.1.6 baseline |
| `npx tsc --noEmit` post-change | exit 0, output **byte-identical** to the pre-change capture (both clean); the fix added zero type errors |
| `pnpm test:auth-gate` | **PASS** — structural (shell for /dashboard contains NO dashboard content; PARTIALLY_STATIC) + HTTP (booted `next start` :3939, signed-out GET /dashboard → 307 `location=/signin?next=%2Fdashboard`) |
| Proxy manifest | `.next/server/middleware-manifest.json` is EMPTY under 16.3.3 (legacy location); the proxy registers in **`.next/server/functions-config-manifest.json`** under key **`/_middleware`** (runtime nodejs, 5 matchers: /dashboard/:path*, /signin, /signup, /forgot-password, redirects-table catch-all) — matching the plan's key_link anticipating functions-config-manifest discovery |
| Behavioral proxy proof | `pnpm start` on :3000, `curl -sI http://localhost:3000/dashboard/posts` (no cookies) → **HTTP/1.1 307 Temporary Redirect, `location: /signin?next=%2Fdashboard%2Fposts`** — the `next=` deep-link param is set ONLY by src/proxy.ts branch 2 (lines 107-111); the (admin) layout AuthGate's redirect emits bare `/signin`. Conclusive proof the proxy executes under 16.3.3, reversing the 05-04 never-registered finding |
| Export scope | layout grep count = 1; exactly 16 of 17 dashboard page.tsx files carry the export (calendar excluded); **0 occurrences anywhere in src/app outside (admin)** — (site) PPR untouched; owner commit 14b4044 intact (nothing reverted/restaged) |
| Server cleanup | next-start PID on :3000 killed (netstat verified; :3939 clean too — the auth-gate script reaped its own child) |
| Signed-in page loads | NOT verified here (no real credentials at hand; plan forbids inventing them) — covered by the owner's next UAT pass |

## Commits

- **cb692c7** — `fix(260826-oif): unblock 16.3.3 build type-check — optional-chain 4 TS18048 provider-creds assertions` (1 file, deviation #1)
- **a893f06** — `fix(260826-oif): opt (admin) dashboard routes into blocking rendering under Next 16.3.3 cacheComponents` (exactly 17 (admin) files, 141 insertions, 0 deletions; verified via `git show --stat HEAD`)

`.planning/config.json` remains modified-uncommitted (GSD-owned), untouched by both commits. Raw log captures were distilled into this SUMMARY and deleted per the plan.

## Key files

- `src/app/(admin)/layout.tsx` — layout-level opt-out + docs-citing comment
- 16 dashboard pages listed in the plan's `files_modified` — page-level opt-outs
- `src/actions/__tests__/storage-settings.test.ts` — deviation #1 type fix

## Threat model outcomes

- **T-oif-01 (Info Disclosure via opt-out):** mitigated — opt-out changes rendering mode only; `test:auth-gate` structural check passed post-fix (no dashboard content in any prerendered shell) and content still renders per-request behind the AuthGate.
- **T-oif-02 (opt-out escaping to (site)):** mitigated — region-scoped negative verify passed (0 exports outside (admin)); calendar + (ui-elements) stay validated.
- **T-oif-SC (package installs):** n/a — no installs.

## Known Stubs

None — no stub patterns introduced; every opt-out page keeps its real data-fetching wiring.

## Notes for the owner

- The 4 TS18048 test errors were NOT new upgrade fallout in tsc (identical under 16.1.6); what changed is that 16.3.3's `next build` type-check now covers the full tsconfig project, promoting them from `tsc --noEmit`-only noise to build blockers. They are now fixed (cb692c7), so both `tsc --noEmit` and `pnpm build` are fully clean — cleaner than the 16.1.6 status quo.
- `scripts/test-auth-gate.mjs` still reads the legacy `middleware-manifest.json` (empty under 16.3.3) and prints "middleware NOT registered (Branch B)" as an informational line; its definitive HTTP check passes and proves the proxy runs. A fast-follow could point the informational manifest read at `functions-config-manifest.json` — out of scope here (file outside task scope; script still exits PASS).
