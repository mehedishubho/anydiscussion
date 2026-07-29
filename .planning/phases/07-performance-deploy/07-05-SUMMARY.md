---
phase: 07-performance-deploy
plan: 05
subsystem: performance-audit-isr-docs
tags: [perf, lighthouse, isr, adr, documentation, deploy]
requires:
  - 07-04 (Coolify production deploy — provides the live audit URL)
provides:
  - lighthouserc.json (INP-correct PERF-01 thresholds)
  - "@lhci/cli devDep + pnpm lighthouse script"
  - docs/adr/0001-isr-single-instance-scaling.md (ISR scaling cliff + v2 path)
  - README.md (project README replacing the TailAdmin template leftover)
affects:
  - package.json (scripts + devDeps)
  - .gitignore (.lighthouseci output)
tech-stack:
  added:
    - "@lhci/cli@^0.15.1 (GoogleChrome/lighthouse-ci — devDep; lighthouse peer)"
  patterns:
    - "Lighthouse CI assert.assertions with interaction-to-next-paint (INP), NOT max-potential-fid (FID retired March 2024)"
    - "ISR single-instance in-memory cache; v2 = Redis-backed cacheHandler (singular, Next 14.1+)"
key-files:
  created:
    - lighthouserc.json
    - docs/adr/0001-isr-single-instance-scaling.md
  modified:
    - package.json
    - .gitignore
    - README.md
decisions:
  - "INP (interaction-to-next-paint, max 200ms) replaces the retired FID metric in all PERF-01 assertions (RESEARCH Pitfall 2)"
  - "Replaced the TailAdmin template README with a project README (the scaffold leftover was misleading — said 'npm install', pointed to tailadmin.com)"
  - "Task 2 (live Lighthouse run) deferred: the operator skipped the 07-04 Coolify deploy, so there is no live production URL to audit yet"
metrics:
  duration: ~5m
  completed: 2026-07-29
  tasks_total: 3
  tasks_done: 2
  tasks_deferred: 1
status: partial
---

# Phase 7 Plan 05: Performance Audit Config + ISR Scaling Docs Summary

Authored the INP-correct `lighthouserc.json` with `@lhci/cli` wired as a pnpm script, plus an ISR scaling ADR and a real project README (replacing the TailAdmin template leftover). Task 2 (the live Lighthouse-vs-prod run) is deferred pending the 07-04 Coolify production deploy.

## What Was Built

### Task 1 — Lighthouse CI config + wiring (PERF-01, D-05/D-06/D-07) [DONE]

- Installed `@lhci/cli@^0.15.1` as a devDependency (the `lighthouse` peer comes automatically). Package verified legitimate per RESEARCH.md Package Legitimacy Audit (GoogleChrome/lighthouse-ci, OK verdict).
- Authored repo-root `lighthouserc.json` with the four PERF-01 thresholds, using the **INP-correct audit id** (`interaction-to-next-paint`, max 200ms) — NOT the deprecated `max-potential-fid`. FID was retired March 2024 (RESEARCH Pitfall 2). Assertions:
  - `error` level (fail the run): `categories:performance` >= 0.9, `largest-contentful-paint` <= 2500ms, `interaction-to-next-paint` <= 200ms, `cumulative-layout-shift` <= 0.1.
  - `warn` level (track, non-blocking): `first-contentful-paint` <= 1800ms, `total-blocking-time` <= 200ms.
  - 3 stable URLs (`/`, `/blog`, `/archive`), `numberOfRuns: 3`, `preset: "desktop"`, filesystem upload to `.lighthouseci/`.
- Wired `"lighthouse": "lhci autorun --config=./lighthouserc.json"` into `package.json` scripts. All existing scripts preserved (`dev`, `build`, `start`, `lint`, `db:generate`, `test`, `test:migrations`, `test:auth-gate`, `test:auth-ratelimit`, `test:publish-visible`, `setup`, `verify`, `check-bundle`).
- Confirmed `.dockerignore` excludes `.lighthouseci` (Plan 07-01) and added `.lighthouseci/` to `.gitignore` so generated reports never enter git history or the Docker build context.
- Commit: `0d01648`.

### Task 2 — Run Lighthouse CI audit against the production URL [DEFERRED]

**Deferred — not attempted.** This is a `checkpoint:human-verify` task that requires a live `https://anydiscussion.com`. The operator skipped the 07-04 Coolify production deploy, so there is no live production URL to audit. The config and tooling from Task 1 are ready; Task 2 runs once the operator completes the 07-04 deploy and the production URL is live. Re-run: `pnpm lighthouse` from a dev machine against the prod URL, plus the manual DevTools per-route audit per D-08.

### Task 3 — ISR scaling ADR + project README (D-28/D-29/D-30) [DONE]

- Created `docs/adr/0001-isr-single-instance-scaling.md` with the standard ADR structure (Title, Status=Accepted v1, Context, Decision, Consequences, References). Documents:
  - The cliff: Next.js ISR uses an in-memory cache per Node process; a single Coolify instance keeps it coherent, but a second replica gives each replica its own stale cache (the publish -> visible loop from Plan 07-03 is the user-visible symptom).
  - v1 decision: single Coolify instance (D-32) sidesteps the cliff.
  - v2 path: Redis-backed `cacheHandler` (singular form, stable since Next 14.1; NOT the deprecated name). Cross-references SCALE-01 (v2), Plan 07-02 (`src/lib/redis/index.ts` singleton = the connection primitive), Plan 07-03 (publish -> visible loop), and the Plan 07-04 build-time `DATABASE_URL` ARG (base `fc3286d`) that lets ISR prerender DB-dependent pages at build.
- Replaced the repo-root `README.md` (which was the TailAdmin template leftover — described the generic admin template, said "npm install", pointed to tailadmin.com) with a real project README: Stack, Local Development, Scripts (table), Performance (links `lighthouserc.json`), Deployment (links `docs/operations/coolify-deploy.md`), ISR Scaling (links the ADR), Project Planning (links `.planning/ROADMAP.md`).
- Commit: `bcc59b9`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Replaced the TailAdmin template README instead of creating a new one**
- **Found during:** Task 3
- **Issue:** The plan/PATTERNS.md assumed no `README.md` existed at repo root, but a `README.md` DID exist — it was the TailAdmin scaffold's leftover README. It described the generic admin template, instructed `npm install`/`yarn install` (violating the pnpm-only constraint), and pointed readers to tailadmin.com. Leaving it would mislead contributors and contradict the locked pnpm-only convention.
- **Fix:** Replaced it entirely with a project-specific README that fulfills the plan's intent (Stack, Scripts, Performance, Deployment, ISR Scaling, Project Planning sections). The replacement is the documented deliverable; the TailAdmin content is removed.
- **Files modified:** `README.md`
- **Commit:** `bcc59b9`

**2. [Documentation/verification nuance] ADR mentions `incrementalCacheHandlerPath` in a do-not-use context**
- **Found during:** Task 3
- **Issue:** The plan's automated verify proxy expects `grep -c "incrementalCacheHandlerPath"` to return 0, but the TASK3_SPEC and the plan's own `must_haves` frontmatter instruct naming the deprecated key to contrast it with the singular `cacheHandler`.
- **Resolution:** The ADR mentions `incrementalCacheHandlerPath` exactly once, in an explicit "Do NOT use the deprecated ... name" context. This is explicitly permitted by the acceptance criterion ("unless used in a 'deprecated, do not use' context"). The positive `cacheHandler` reference appears 7 times. Compliant with the authoritative acceptance criterion.

No code-level bugs were encountered. `pnpm lint --max-warnings 0` stays green.

## Deferred Issues

- **Task 2 (live Lighthouse audit) — operator-gated.** Requires the 07-04 Coolify production deploy to be complete so `https://anydiscussion.com` is live. When the operator deploys, re-run `pnpm lighthouse` (Task 1's config is ready) + the manual DevTools per-route audit (D-08). The `.lighthouseci/manual-audit-<date>.md` deliverable is produced at that time.

## Authentication Gates

None.

## Known Stubs

None. No application code stubs were introduced — this plan is config + documentation only.

## Threat Flags

None. The threat model's three entries (T-07-05-SC package legitimacy, T-07-05-01 report disclosure, T-07-05-02 missing-docs) are all mitigated: `@lhci/cli` is GoogleChrome-published; `.lighthouseci/` is gitignored + dockerignored; the ADR documents the scaling cliff. No new security surface beyond the plan's threat model.

## Self-Check: PASSED

**Files exist:**
- FOUND: `lighthouserc.json`
- FOUND: `docs/adr/0001-isr-single-instance-scaling.md`
- FOUND: `README.md`
- FOUND: `package.json`
- FOUND: `.gitignore`

**Commits exist:**
- FOUND: `0d01648` (Task 1 — lighthouserc + @lhci/cli)
- FOUND: `bcc59b9` (Task 3 — ADR + README)

**Lint:** `pnpm lint --max-warnings 0` exits 0 (no regression; this plan touched only JSON/Markdown/config).
