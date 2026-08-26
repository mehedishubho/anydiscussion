---
phase: 07-performance-deploy
plan: 04
subsystem: ops-deploy
tags: [coolify, umami, dns, dkim, spf, dmarc, deploy, runbooks, email-deliverability, operator-gated]
requires:
  - "07-01 Dockerfile multi-stage build (both build-step gates) — the build pipeline the deploy runbooks reference"
  - "07-02 Redis singleton + docker-compose Redis + Better Auth rateLimit — the runtime services the runbooks mirror in Coolify"
  - "07-03 revalidation audit + scripts/test-publish-visible.mjs — the end-to-end check that would run against the production URL"
provides:
  - "docs/operations/coolify-deploy.md — git-push production deploy runbook (D-32 no-staging), runtime env injection list (D-21), Redis managed service config, secret non-leakage verification, build-step gate documentation"
  - "docs/operations/umami-deploy.md — Umami Coolify service runbook (docker.umami.is image D-24, separate umami database D-25, mandatory default-password change Pitfall 5, script wiring into /dashboard/settings/seo D-26)"
  - "docs/operations/dns-email-deliverability.md — DKIM CNAME + SPF TXT + DMARC TXT templates (D-33), p=none→p=quarantine progression (Pitfall 6), real-inbox verification procedure"
  - "Dockerfile build-blocker fixes (fc3286d, operator-approved): build-time DATABASE_URL ARG for cacheComponents prerender + 1000KB bundle-gate budget (D-21/D-14 overrides documented in Dockerfile comments)"
affects:
  - "07-05 live Lighthouse run — still deferred; re-runs `pnpm lighthouse` once a production URL exists"
  - "Phase 8 deferred live verifications (real pg_dump/cron/OAuth/R2 upload/restore-drill) — all parked on the same production-deploy gate"
tech-stack:
  added: []
  patterns:
    - "Operator runbooks as the executable contract for owner-gated infrastructure: Prerequisites / Steps / Verification / Rollback sections so the operator never needs further documentation"
    - "Build-vs-runtime secret separation (D-21): only NEXT_PUBLIC_* bakes at build; every runtime secret injects via the platform env, verified by an env-grep-returns-empty check"
key-files:
  created:
    - docs/operations/coolify-deploy.md
    - docs/operations/umami-deploy.md
    - docs/operations/dns-email-deliverability.md
  modified:
    - Dockerfile
    - package.json
decisions:
  - "Task 1 runbooks authored against the planned Coolify git-push Docker deploy (D-32) — owner course-corrected 2026-07-29: production deploy is MANUAL, Dockerfile/docker-compose are local-dev tooling only, and the deploy system is reviewed after app completion. The runbooks remain the operator checklist baseline but must be revised for the actual manual flow when deploy is revisited."
  - "Build-needs-DB resolved by build-time DATABASE_URL ARG in the builder stage only (fc3286d, operator-approved): pnpm build under cacheComponents prerenders DB-dependent pages; the runner stage stays secret-free and runtime gets DATABASE_URL from the platform env (D-21 preserved)"
  - "Bundle gate raised 100KB→1000KB total budget (fc3286d, operator-approved): gate 2 summed all ~48 chunks (~749KB) and could not separate public/admin bundles; gate 1 (no-restricted-imports) remains the precise (site)→(admin) leak guard (D-14 override rationale in Dockerfile comments)"
  - "Tasks 2–3 (operator-gated deploy + DNS/inbox checkpoints) DEFERRED per owner decision 2026-07-29 — deploy is out of scope until the application is complete and the owner reviews the deploy system. Real-inbox deliverability itself was substantively closed by Phase 2 UAT 2026-08-24 (AUTH-06 forgot/reset + AUTH-07 dashboard-user verification both landed in a real inbox); the formal D-33 DNS-record publication + DMARC p=quarantine tightening ride with the production mail-domain setup."
metrics:
  duration: 0m (close-out of 2026-07-29 execution)
  completed: 2026-08-26
  tasks_total: 3
  tasks_done: 1
  tasks_deferred: 2
status: partial
---

# Phase 7 Plan 04: Ops + Deploy Runbooks (Coolify, Umami, DNS/Email) Summary

**One-liner:** Three operator runbooks (Coolify deploy, Umami analytics, DKIM/SPF/DMARC email deliverability) authored and verified — plus operator-approved Dockerfile build-blocker fixes — while the operator-gated production deploy + DNS checkpoints are deferred per the owner's manual-deploy decision (2026-07-29), the same deferral pattern as 07-05.

## What Was Built

### Task 1 — Operator runbooks (563667e) [DONE]

All three runbooks created in `docs/operations/`, each with Prerequisites / Steps / Verification / Rollback sections (automated section check returns 4/4 for each file; `PLAN-07-04-RUNBOOKS-OK` re-verified 2026-08-26):

- **coolify-deploy.md (359 lines)** — git-push production deploy flow (D-32 no-staging), the full runtime env-var injection list from `.env.example` with the explicit "NEVER as Dockerfile ARGs" callout (D-21), NEXT_PUBLIC_* as the only bake-time build args, Redis managed service config (256mb / allkeys-lru / no persistence / internal-only, mirroring 07-02's docker-compose), health check + restart policy, the secret non-leakage verification (`docker run --rm <image> env | grep -E "(DATABASE_URL|RESEND_API_KEY|SECRET)"` must return empty), and the two build-step gates (lint `--max-warnings 0` + bundle gate) documented as the load-bearing pre-production safety net (D-31/D-32). Also records the two build-time decisions the operator must resolve (build-needs-DB, bundle threshold) — both subsequently resolved in fc3286d.
- **umami-deploy.md (209 lines)** — Umami as a Coolify managed service (`docker.umami.is/umami-software/umami:postgresql-latest`, D-24), separate `umami` database in the shared Postgres (D-25), first-boot auto-migration, the MANDATORY default admin/umami password change (Pitfall 5), website registration + script-URL retrieval, and wiring the script into `/dashboard/settings/seo` via the existing Phase 6 D-17 analytics injection (D-26 — configuration only, no code).
- **dns-email-deliverability.md (247 lines)** — DKIM CNAME + SPF TXT retrieval from the Resend dashboard (auto-generated), manual DMARC TXT authoring at `_dmarc.<domain>` (Resend does NOT generate DMARC — Pitfall 6), `v=DMARC1; p=none;` monitoring start tightened to `p=quarantine;` only after inbox tests pass, DNS propagation + Resend Verified checks, and the real-inbox procedure for both password-reset and email-verification emails.

### Deploy-blocker fixes (fc3286d, operator-approved) [Task 2 prerequisite work]

Two decisions that unblock the Dockerfile build the runbook depends on:

1. **Build-time DATABASE_URL ARG (builder stage only)** — `pnpm build` under `cacheComponents` prerenders DB-dependent pages and needs Postgres to populate the ISR cache. The ARG is NOT copied into the runner image (fresh `node:20-alpine`); runtime gets DATABASE_URL from platform env. Redis stays deferred (`lazyConnect:true`).
2. **Bundle gate 1000KB total budget** — gate 2 summed all ~48 chunks (~749KB) vs a 100KB budget and cannot separate public/admin chunks. Raised to 1000KB (~33% headroom); gate 1 (no-restricted-imports) remains the precise leak guard. `package.json` `check-bundle` bumped to match.

### Task 2 — Coolify production deploy + Umami + verifications [DEFERRED]

**Deferred — not attempted.** `checkpoint:human-verify` requiring live infrastructure the owner has not provisioned. The owner course-corrected on 2026-07-29 (recorded in project memory): *production deploy is MANUAL; the Dockerfile and docker-compose are local-development tooling only; the deploy system is reviewed after the application is fully complete; until then deploy is deferred and out of scope.* The runbooks assume the Coolify Docker flow and will be revised for the manual flow at that time (for the manual path, `pnpm build` runs on the VPS where Postgres is reachable, so the build-needs-DB consideration is handled by the VPS environment rather than a Dockerfile ARG). Deferred sub-items: local Docker dry-run + secret non-leakage check, production deploy + SSL, runtime env injection, Redis service, production smoke test, `PROD_URL=... pnpm test:publish-visible` (Pitfall #3 on the real stack), Umami deploy + password change + script wiring, rate-limit smoke test.

### Task 3 — DKIM/SPF/DMARC DNS records + real-inbox test [DEFERRED]

**Deferred — not attempted.** `checkpoint:human-action` executed entirely in the Cloudflare + Resend dashboards. The substantive deliverability question was already answered during Phase 2 UAT (2026-08-24): AUTH-06 (forgot/reset) and AUTH-07 (dashboard-created-user verification) emails both completed real round-trips into a real inbox — so transactional email demonstrably delivers. What remains deferred: publishing the formal DKIM/SPF/DMARC record set for the production mail domain, the DMARC `p=none`→`p=quarantine` progression (Pitfall 6), and the documented inbox-placement capture. These ride with the production deploy review.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Blocking] Dockerfile + package.json modified outside plan files_modified**
- **Found during:** Task 2 preparation (2026-07-29)
- **Issue:** Plan's `files_modified` listed only the three runbooks, but the runbook's own verification path (local `docker build` dry-run) was blocked by two build failures: prerender-time DB access and a bundle-gate threshold that failed its own baseline.
- **Fix:** fc3286d — build-time `DATABASE_URL` ARG (builder stage only) + 1000KB bundle budget, with D-21/D-14 override rationale documented in Dockerfile comments. Operator-approved at the time.
- **Files modified:** Dockerfile, package.json
- **Verification:** Docker build gates pass; rationale documented in-repo.
- **Committed in:** fc3286d

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** Necessary for the runbooks' verification path to be executable. No scope creep.

## Issues Encountered

- **Owner course-correction mid-plan (2026-07-29):** the Coolify git-push Docker deploy premise underlying the runbooks was superseded by the manual-deploy decision (project memory `deploy-approach-manual-no-docker-prod`). Task 1's runbooks remain committed as the operator checklist baseline pending revision; Tasks 2–3 deferred rather than executed against infrastructure the owner chose not to provision. This SUMMARY records that state honestly instead of forcing an executor re-run that would stop at the same operator gate.

## User Setup Required

When the owner revisits deploy post-app-completion: revise `docs/operations/coolify-deploy.md` (+ `umami-deploy.md` service sections) for the manual VPS flow, then execute Tasks 2–3 as revised — production smoke test, `PROD_URL=... pnpm test:publish-visible` (<30s), Umami + script wiring into `/dashboard/settings/seo`, DKIM/SPF/DMARC publication + DMARC tightening, and `pnpm lighthouse` (07-05 Task 2).

## Next Phase Readiness

- 07-05 (final plan in phase) already recorded its live Lighthouse run as deferred on this same gate — nothing further blocks on 07-04.
- Phase 8's deferred live verifications park on the same production-deploy gate.
- Phase-level verification can now run: all 5 plans have summaries (4 complete/partial + this close-out).

---
*Phase: 07-performance-deploy*
*Closed out: 2026-08-26 (Task 1 executed 2026-07-29)*
