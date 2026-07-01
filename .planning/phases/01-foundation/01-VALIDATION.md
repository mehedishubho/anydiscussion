---
phase: 1
slug: foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-01
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js scripts (no unit-test framework needed for Phase 1 — verification is via `pnpm verify` + `next build`) |
| **Config file** | `package.json` scripts: `setup`, `verify`, `test:migrations`, `db:generate` |
| **Quick run command** | `pnpm verify` |
| **Full suite command** | `pnpm verify` (Phase 1 has one gate that checks all 5 success criteria) |
| **Estimated runtime** | ~30-60 seconds (dominated by `next build` + clean-room migration test) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm verify` (or the relevant subset if the full gate is not yet wired)
- **After every plan wave:** Run `pnpm verify` + manual `pnpm dev` boot check
- **Before `/gsd-verify-work`:** Full suite must be green (`pnpm verify` exits 0)
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | FOUND-01 | T-01-01 | remotePatterns whitelists exactly CDN + MinIO (no wildcards) | script | `grep -q 'cacheComponents\|standalone\|image-loader' next.config.ts` | ✅ (modifies next.config.ts) | ⬜ pending |
| 1-01-01 | 01 | 1 | FOUND-01 | T-01-04 | NEXT_PUBLIC_CDN_URL is the only client-exposed env var | script | `grep -q 'NEXT_PUBLIC_CDN_URL' src/lib/image-loader.ts` | ❌ W0 → created in task | ⬜ pending |
| 1-01-01 | 01 | 1 | D-17 | T-01-02 | error.tsx does not leak stack traces to client | script | `grep -q 'use client' src/app/error.tsx` | ❌ W0 → created in task | ⬜ pending |
| 1-01-01 | 01 | 1 | D-17 | — | lib/log is server-safe (no "use client") | script | `! grep -q 'use client' src/lib/log/index.ts` | ❌ W0 → created in task | ⬜ pending |
| 1-01-01 | 01 | 1 | D-18 | — | legacy artifacts removed | script | `test ! -f .eslintrc.json && test ! -f package-lock.json && test ! -d src/components/ecommerce` | ✅ (deletes) | ⬜ pending |
| 1-01-01 | 01 | 1 | FOUND-01 | T-01-SC | pnpm build succeeds with cacheComponents + standalone | build | `pnpm build` | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | FOUND-04 | T-01-03 | ESLint no-restricted-imports uses literal globs | script | `grep -q 'no-restricted-imports' eslint.config.mjs` | ✅ (modifies) | ⬜ pending |
| 1-01-02 | 01 | 1 | D-13, D-15 | — | package.json has setup/verify/test:migrations/db:generate scripts | script | `grep -q '"setup"\|"verify"\|"test:migrations"\|"db:generate"' package.json` | ✅ (modifies) | ⬜ pending |
| 1-02-01 | 02 | 2 | FOUND-02 | T-01-05 | Drizzle client uses parameterized ORM (no raw SQL) | script | `grep -q 'drizzle' src/lib/db/index.ts` | ❌ W0 → created in task | ⬜ pending |
| 1-02-01 | 02 | 2 | FOUND-03 | — | 8 tables, no users table, correct soft-delete split | script | `grep -c 'pgTable' src/db/schema.ts` (== 8) + `! grep -iq 'pgTable.*users'` | ❌ W0 → created in task | ⬜ pending |
| 1-02-01 | 02 | 2 | D-07 | — | posts.author_id is plain column (no FK) | script | `grep -q 'author_id' src/db/schema.ts && ! grep 'author_id.*references' src/db/schema.ts` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 2 | FOUND-06 | T-01-06 | Clean-room test applies all migrations to fresh Postgres | script | `pnpm test:migrations` (exits 0) | ❌ W0 → created in task | ⬜ pending |
| 1-02-02 | 02 | 2 | FOUND-06 | T-01-06 | Drift gate = generate + git diff (not check alone) | script | `pnpm drizzle-kit generate --name drift-check-verify && git diff --exit-code src/db/migrations/` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 2 | FOUND-03 | — | Zero hand-written SQL (all via drizzle-kit generate) | script | `test -f src/db/migrations/0000_*.sql` | ❌ W0 → generated in task | ⬜ pending |
| 1-03-01 | 03 | 2 | FOUND-05 | T-01-09 | R2 keys are server-generated (baseKey param, no user input in Phase 1) | script | `grep -q 'baseKey' src/lib/r2/index.ts` | ❌ W0 → created in task | ⬜ pending |
| 1-03-01 | 03 | 2 | FOUND-05 | T-01-11 | forcePathStyle is env-driven (MinIO/R2 toggle) | script | `grep -q 'S3_FORCE_PATH_STYLE' src/lib/r2/index.ts` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 2 | D-14 | — | No presigned-URL code in Phase 1 | script | `! grep -q 'presigner\|PresignedUrl' src/lib/r2/index.ts` | ❌ W0 | ⬜ pending |
| 1-03-02 | 03 | 2 | FOUND-05 | T-01-10 | R2 smoke writes 3 WebP variants to MinIO | smoke | `pnpm verify` (R2 upload smoke step) | ❌ W0 → created in task | ⬜ pending |
| 1-03-02 | 03 | 2 | FOUND-04 | T-01-03 | Planted cross-group import fails ESLint | lint | `pnpm verify` (ESLint isolation step) | ❌ W0 | ⬜ pending |
| 1-03-02 | 03 | 2 | FOUND-01,06 | — | All 5 criteria machine-checked 1:1 | script | `pnpm verify` (exits 0) | ❌ W0 → created in task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Phase 1 has no pre-existing test infrastructure — all verification scripts are created as the FIRST task in each plan (the scripts/ directory does not exist yet). The "Wave 0" for this phase is distributed: each plan creates the verification tooling it needs as its first or second task.

- [x] `scripts/verify.mjs` — created in Plan 03 Task 2 (the `pnpm verify` orchestrator — D-15)
- [x] `scripts/test-migrations.mjs` — created in Plan 02 Task 2 (the clean-room migration test — D-09)
- [x] `scripts/setup.mjs` — created in Plan 03 Task 2 (the `pnpm setup` onboarding — D-04)
- [x] `docker-compose.yml` — created in Plan 03 Task 1 (Postgres + MinIO — D-01/D-02)
- [x] `.env.example` — created in Plan 03 Task 1 (documented MinIO defaults — D-03)
- [x] Planted cross-group import fixture — created dynamically inside `scripts/verify.mjs` (Plan 03 Task 2) in a temp directory, cleaned up after the check

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker Desktop is running before `pnpm setup` | FOUND-05, FOUND-06 | Docker engine must be started by the user (OS-level interaction) | Ensure Docker Desktop (system tray) shows "Docker is running" before executing `pnpm setup` |

*All other phase behaviors have automated verification via `pnpm verify`.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (each plan creates its own verification infra)
- [x] No watch-mode flags
- [x] Feedback latency < 60s (dominated by `next build`)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (set to approved YYYY-MM-DD after first green `pnpm verify` run)
