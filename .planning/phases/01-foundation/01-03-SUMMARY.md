---
phase: 01-foundation
plan: 03
subsystem: media-pipeline
tags: [r2, s3, minio, sharp, webp, setup, verify, onboarding, ci-gate]

# Dependency graph
requires:
  - phase: 01-01
    provides: "docker-compose.yml (postgres :5435 + postgres-test :5436 + minio :9000), .env.example with S3_* MinIO defaults, package.json scripts setup/verify/test:migrations/db:generate, pnpm-workspace.yaml sharp allowBuild, @aws-sdk/client-s3 + sharp installed, next.config cacheComponents/standalone/image-loader, eslint.config.mjs route-group isolation rule"
  - phase: 01-02
    provides: "src/db/schema.ts (8-table schema), src/db/migrations/0000_*.sql (first migration), src/lib/db/index.ts (Drizzle client), scripts/test-migrations.mjs (clean-room test against :5436)"
provides:
  - "src/lib/r2/index.ts — s3Client (S3Client singleton) + uploadImageVariants(buffer, baseKey) producing 3 WebP variants (640/1024/1920 sm/md/lg)"
  - "UploadedVariant interface (key, width, height, format, sizeBytes)"
  - "scripts/setup.mjs — clone-to-running onboarding (D-04): pnpm install → sharp build check → docker compose up → migrate dev DB → confirm bucket"
  - "scripts/verify.mjs — single pnpm verify phase gate (D-15) running 6 checks against the live Docker stack"
  - "scripts/r2-smoke.ts — transient R2 smoke (1x1 PNG → 3 WebP variants to MinIO, run via node --experimental-strip-types)"
  - "pnpm verify exits 0 with all 6 checks passing (next.config tokens, drift gate, clean-room test, ESLint planted import, next build, R2 smoke)"
affects:
  - "Phase 3 MEDIA-01 consumes uploadImageVariants + the UploadedVariant interface for the presigned-URL direct-to-R2 upload flow"
  - "Phase 3 MEDIA-01 adds input validation (max file size, dimensions, magic-byte format check) before calling sharp (T-01-10 mitigation)"
  - "Phase 3 sanitizes user-supplied filenames before they reach baseKey (T-01-09 mitigation)"
  - "CI workflow runs pnpm verify on every PR as the drift gate + build gate + isolation gate + R2 smoke"
  - "Phase 7 PERF-02 bundle-budget check builds on the ESLint isolation rule verified by Check 4"

# Tech tracking
tech-stack:
  added: [] # all packages installed in Plan 01-01
  patterns:
    - "Env-driven S3 client (S3_FORCE_PATH_STYLE === 'true' toggle — MinIO path-style vs R2 virtual-hosted, Pitfall 3)"
    - "sharp variant pipeline: resize(width, undefined, {fit:'inside', withoutEnlargement:true}).webp({quality:80}).toBuffer({resolveWithObject:true})"
    - "Drift gate = drizzle-kit generate + git diff --exit-code (NOT drizzle-kit check alone — Pitfall 1)"
    - "ESLint planted-import verification: temp file in src/app/(site)/ with cross-group import, assert eslint exits non-zero; inverse with @/lib import asserts zero"
    - "node --experimental-strip-types for running .ts scripts without a build step"
    - "spawnSync with shell:true on Windows for pnpm resolution (D-04)"

key-files:
  created:
    - src/lib/r2/index.ts
    - scripts/setup.mjs
    - scripts/verify.mjs
    - scripts/r2-smoke.ts
  modified:
    - tsconfig.json

decisions:
  - "r2-smoke.ts imports src/lib/r2/index.ts with explicit .ts extension (required by node --experimental-strip-types); tsconfig.json excludes scripts/ from the Next build type-check so the .ts-extension import does not break next build"
  - "verify.mjs Check 4 (ESLint isolation) plants the temp files inside src/app/(site)/ (NOT a separate .eslint-planted-test/ dir) because the no-restricted-imports rule is scoped to src/app/(site)/**/* — a file outside that glob would not trigger the rule. Temp files are cleaned up in finally."
  - "setup.mjs uses `docker compose -p anydiscussion up -d` (explicit project name) to avoid any project-name collision with sibling dev projects on the same host ports"
  - "CHILD_ENV in verify.mjs injects DATABASE_URL + S3_* defaults into spawned child processes because node does not auto-load .env.local — the drift gate and R2 smoke would otherwise see undefined env vars"

requirements-completed:
  - FOUND-05
  - FOUND-01
  - FOUND-04
  - FOUND-06

# Coverage metadata (#1602) — per-deliverable traceability
coverage:
  - id: R1
    description: "src/lib/r2/index.ts exports s3Client + uploadImageVariants producing 3 WebP variants at 640/1024/1920 with env-driven forcePathStyle"
    requirement: "FOUND-05"
    verification:
      - kind: integration
        ref: "pnpm verify Check 6 (R2 smoke) uploads 1x1 PNG → 3 WebP variants (sm/md/lg) to MinIO and cleans up"
        status: pass
    human_judgment: false
  - id: R2
    description: "pnpm verify validates next.config tokens (cacheComponents/standalone/loaderFile) AND next build succeeds"
    requirement: "FOUND-01"
    verification:
      - kind: integration
        ref: "pnpm verify Check 1 + Check 5 both PASS"
        status: pass
    human_judgment: false
  - id: R3
    description: "pnpm verify's planted cross-group import ESLint check proves the isolation rule fires (non-zero exit) while allowed @/lib import passes"
    requirement: "FOUND-04"
    verification:
      - kind: integration
        ref: "pnpm verify Check 4 PASS — cross-group import blocked; allowed @/lib import passes"
        status: pass
    human_judgment: false
  - id: R4
    description: "pnpm verify runs the drift gate (generate + git diff) AND the clean-room migration test (8 tables on fresh postgres-test :5436)"
    requirement: "FOUND-06"
    verification:
      - kind: integration
        ref: "pnpm verify Check 2 (no drift) + Check 3 (8 tables present) both PASS"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-02
status: complete
---

# Phase 1 Plan 3: R2/sharp Media Pipeline + pnpm setup/verify Summary

**Minimal server-side R2/sharp upload helper producing 3 WebP variants (640/1024/1920) with env-driven forcePathStyle, plus the pnpm setup onboarding script and the pnpm verify orchestrator that machine-checks all 5 Phase 1 success criteria across 6 named checks — all 6 passing against the live Docker stack.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-01T20:07:09Z
- **Completed:** 2026-07-02T00:00:00Z
- **Tasks:** 2
- **Files created:** 4
- **Files modified:** 1

## Accomplishments

- **lib/r2 upload helper (D-14):** `src/lib/r2/index.ts` exports `s3Client` (S3Client singleton) and `uploadImageVariants(buffer, baseKey)` producing exactly 3 WebP variants (`{baseKey}-sm.md.lg.webp`) at 640/1024/1920, quality 80, `fit: "inside"`, `withoutEnlargement: true`. Env-driven `forcePathStyle` (`S3_FORCE_PATH_STYLE === "true"` — Pitfall 3). No presigned-URL logic (Phase 3 per D-14), no "use client" (server-only).
- **pnpm setup onboarding (D-04):** `scripts/setup.mjs` runs `pnpm install` → sharp build-approval check → `docker compose -p anydiscussion up -d` → migrate dev DB on :5435 → confirm/create MinIO bucket. Cross-platform (execFileSync + shell:true on Windows), idempotent against pre-provisioned services.
- **pnpm verify phase gate (D-15):** `scripts/verify.mjs` runs 6 checks: (1) next.config tokens, (2) drift gate via `drizzle-kit generate` + `git diff --exit-code src/db/migrations/`, (3) clean-room migration test against postgres-test :5436, (4) ESLint planted cross-group import (asserts rule fires), (5) `next build`, (6) R2 smoke via `node --experimental-strip-types scripts/r2-smoke.ts`. Prints a PASS/FAIL summary, exits 1 on any failure.
- **R2 smoke:** `scripts/r2-smoke.ts` uploads a 1x1 PNG through `uploadImageVariants`, asserts 3 variants with keys `smoke-test/test-{sm,md,lg}.webp`, then cleans up via `DeleteObjectsCommand`.
- **All 6 checks PASS:** `pnpm verify` exits 0 against the live Docker stack (postgres :5435, postgres-test :5436, minio :9000).

## Task Commits

1. **Task 1: Minimal R2/sharp upload helper** — `6146eab` (feat)
2. **Task 2: pnpm setup + pnpm verify + R2 smoke** — `b4af0df` (feat)

## Files Created/Modified

- `src/lib/r2/index.ts` — s3Client singleton + uploadImageVariants + UploadedVariant interface (server-only, env-driven forcePathStyle)
- `scripts/setup.mjs` — clone-to-running onboarding (5 steps, docker compose -p anydiscussion, migrate dev DB :5435, bucket confirm)
- `scripts/verify.mjs` — 6-check phase gate with CHILD_ENV injecting DATABASE_URL + S3_* into spawned steps
- `scripts/r2-smoke.ts` — transient R2 smoke (1x1 PNG → 3 WebP variants, cleanup via DeleteObjectsCommand)
- `tsconfig.json` — added `scripts` to `exclude` (so r2-smoke.ts's .ts-extension import does not break next build type-check)

## Decisions Made

- **tsconfig excludes scripts/:** `r2-smoke.ts` imports `../src/lib/r2/index.ts` with an explicit `.ts` extension (required by `node --experimental-strip-types` for module resolution). Next.js's build type-checker rejects `.ts` extension imports unless `allowImportingTsExtensions` is enabled. Excluding `scripts/` from the build type-check is correct — scripts are dev-time tooling run directly by Node, not app code. This is the cleanest fix; enabling `allowImportingTsExtensions` would have broader implications.
- **ESLint planted-import location:** Check 4 plants temp files inside `src/app/(site)/` (not a separate `.eslint-planted-test/` directory) because the `no-restricted-imports` rule is scoped to `src/app/(site)/**/*`. A file outside that glob would not trigger the rule, making the test meaningless. Temp files are named `__verify_planted_bad.ts` / `__verify_planted_good.ts` and cleaned up in a `finally` block.
- **Explicit docker compose project name:** Both setup.mjs and verify.mjs use `docker compose -p anydiscussion up -d` (explicit project name) to avoid any project-name collision with sibling dev projects on the same host ports.
- **CHILD_ENV in verify.mjs:** Node does not auto-load `.env.local`, so verify.mjs builds a `CHILD_ENV` object that injects `DATABASE_URL` + `TEST_DATABASE_URL` + `S3_*` defaults (overridable by real values already in `process.env`) into every spawned child process. Without this, the drift gate's `drizzle-kit generate` and the R2 smoke would see undefined env vars.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Excluded scripts/ from tsconfig build type-check**
- **Found during:** Task 2 (first `pnpm verify` run — Check 5 next build failed)
- **Issue:** `scripts/r2-smoke.ts` imports `../src/lib/r2/index.ts` with an explicit `.ts` extension (required by `node --experimental-strip-types` for module resolution). Next.js's build type-checker rejects `.ts` extension imports: "An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled." This broke `next build`.
- **Fix:** Added `"scripts"` to the `exclude` array in `tsconfig.json`. Scripts are dev-time tooling run directly by Node (not part of the app build), so excluding them from the build type-check is correct. The explicit `.ts` extension is kept because `node --experimental-strip-types` requires it for relative module resolution.
- **Files modified:** tsconfig.json
- **Verification:** `pnpm build` succeeds; `pnpm verify` Check 5 now PASS
- **Commit:** b4af0df

---

**Total deviations:** 1 auto-fixed (1 bug — tsconfig exclude for .ts-extension imports)
**Impact on plan:** Environment adaptation, not scope change. No plan logic altered.

## Verification Results

`pnpm verify` final output (all 6 checks PASS):

```
============================================================
pnpm verify — summary
============================================================
✓ PASS  Check 1: next.config validation (cacheComponents/standalone/image-loader)
✓ PASS  Check 2: drift gate (drizzle-kit generate + git diff src/db/migrations)
✓ PASS  Check 3: clean-room migration test (test-migrations.mjs)
✓ PASS  Check 4: ESLint route-group isolation (planted cross-group import)
✓ PASS  Check 5: next build succeeds
✓ PASS  Check 6: R2 upload smoke (3 WebP variants to MinIO)
============================================================
6/6 checks passed.
✓ pnpm verify PASSED — Phase 1 backbone proven working.
```

Additional verification:
- `grep 'S3Client\|uploadImageVariants\|forcePathStyle\|sharp' src/lib/r2/index.ts` → all present
- `grep 'presigner\|PresignedUrl' src/lib/r2/index.ts` → absent (Phase 3 scope per D-14)
- `head -1 src/lib/r2/index.ts` → comment (no "use client" directive)
- `npx tsc --noEmit --skipLibCheck src/lib/r2/index.ts` → exit 0 (type-checks clean)

## Known Stubs

None. All files are functional. The `uploadImageVariants` helper is a complete minimal implementation; Phase 3 (MEDIA-01) adds presigned URLs, media-library UI, and input validation on top of it.

## Threat Flags

None new. The plan's threat register covered T-01-09 (path traversal in keys — mitigated: baseKey is server-generated), T-01-10 (image bomb — Phase 3 adds input validation), T-01-11 (S3 credentials in env — mitigated: only MinIO defaults in .env.example, real secrets in gitignored .env.local). No additional threat surface introduced.

## Self-Check: PASSED

All 4 created files verified to exist on disk. Both commit hashes (6146eab, b4af0df) verified present in git log.
