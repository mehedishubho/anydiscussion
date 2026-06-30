# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-30
**Phase:** 1-Foundation
**Areas discussed:** Dev environment, Schema strategy, Migration hygiene, CDN/R2 readiness, Isolation enforcement, R2 upload scope, Verification shape, Foundation conventions, Backup-system scope

---

## Dev environment

### Local Postgres
| Option | Description | Selected |
|--------|-------------|----------|
| Docker Compose | Committed docker-compose.yml, Postgres 16, one-command up; same compose spawns throwaway DB for FOUND-06 clean-room test | ✓ |
| Native / per-machine | Each dev installs Postgres (Homebrew/installer/Coolify dev). No Docker; manual onboarding | |
| Shared cloud dev DB | One shared Postgres all devs connect to. Zero local setup, but shared state collides | |

**Notes:** Chosen because prod is self-hosted Postgres on Coolify, and the clean-room migration test (FOUND-06) needs a disposable DB — Compose serves both.

### Local S3-compatible store
| Option | Description | Selected |
|--------|-------------|----------|
| MinIO via Compose | Credential-free local dev, zero egress, pairs with Postgres container; R2 parity in Phase 7 staging | ✓ |
| Real R2 dev bucket | Max parity from day one, but per-dev credentials + real egress | |
| Hybrid (MinIO local + R2 in CI) | Best practice but two storage targets to configure | |

### Env-file convention
| Option | Description | Selected |
|--------|-------------|----------|
| .env.example + .env.local | Committed example (documented, MinIO defaults) + gitignored secrets. Standard Next.js pattern | ✓ |
| Single .env.local only | Simpler, but onboarding must discover required vars from code | |
| Per-environment files | More structured, but Coolify injects staging/prod anyway | |

### Onboarding/bootstrap
| Option | Description | Selected |
|--------|-------------|----------|
| `pnpm setup` script | Node, cross-platform/Windows-aware; installs deps, approve-builds, Compose, migrations, MinIO bucket | ✓ |
| Documented manual steps | Transparent but drift/rot-prone | |
| Makefile / justfile | `make` not native on Windows (needs WSL); `just` is another install | |

---

## Schema strategy

### Completion depth
| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: tables + core cols | All tables now with core + specified cols; uncertain feature cols deferred to owning phase | ✓ |
| Full v1 schema now | Every table + final column set through Phase 7. Minimal churn, but speculative cols may drift | |
| Minimal skeleton only | Just enough to pass Phase 1; add tables/columns migration-by-migration. Max YAGNI | |

### `pages` table shape
| Option | Description | Selected |
|--------|-------------|----------|
| Post-like + own SEO cols | status/slug/body + local meta_title/meta_description/canonical; Tiptap-edited | ✓ |
| Simple static-content | slug/title/body only, no status/SEO | |
| Post-like + shared SEO table | Mirror posts + generalize post_seo (polymorphic). Cleanest long-term, but refactor risk now | |

### `users` table timing
| Option | Description | Selected |
|--------|-------------|----------|
| Defer to Phase 2 | Phase 1 ships 8 tables; Better Auth CLI generates users + auth tables in Phase 2; author_id plain col now | ✓ |
| Minimal users stub now | Small users table for FK targets; Better Auth may disagree with the stub | |
| Full users table now | Complete users per CLAUDE.md; reconcile with Better Auth in Phase 2 (highest conflict risk) | |

### Deletion semantics
| Option | Description | Selected |
|--------|-------------|----------|
| Soft-delete content, hard-delete rest | deleted_at on posts/pages/media/categories/tags; hard-delete settings/joins | ✓ |
| Hard-delete everywhere | Simplest; rely on backups for recovery | |
| Soft-delete everywhere | Max recoverability, but pointless boilerplate on joins | |

---

## Migration hygiene

### Clean-room test location
| Option | Description | Selected |
|--------|-------------|----------|
| Local script + CI gate | `pnpm test:migrations` locally + CI on every PR; drift can't merge | ✓ |
| Local script only | Manual discipline; no CI enforcement | |
| CI-only | Devs don't catch drift until push | |

### Generate-then-commit enforcement
| Option | Description | Selected |
|--------|-------------|----------|
| CI `drizzle-kit check` gate | Drizzle's built-in sync validator; no new tooling | ✓ |
| PR-review convention only | Manual; reviewer-vigilance-dependent | |
| Pre-commit git hook | Earlier catch, but bypassable (--no-verify) + cross-machine inconsistency | |

### Rollback stance
| Option | Description | Selected |
|--------|-------------|----------|
| Forward-only + backups | Additive migrations, no down-scripts; recovery via backup restore + forward fix | ✓ |
| Reversible (up + down) | More recovery flexibility, but down-scripts are hand-written SQL (breaks constraint) | |
| Forward-only, prefer non-destructive | Same as forward-only + avoid destructive ops where possible | |

---

## CDN/R2 readiness

### Image loader + cdn.anydiscussion.com
| Option | Description | Selected |
|--------|-------------|----------|
| Env-driven URL, dev=MinIO | `NEXT_PUBLIC_CDN_URL` env var; MinIO default in .env.example; Coolify injects cdn URL; real R2 in Phase 7 | ✓ |
| Provision cdn.anydiscussion.com + R2 now | Blocks Phase 1 on infra provisioning | |
| Hardcode dev placeholder, swap later | Config edit + redeploy later; risk of shipping the placeholder | |

---

## Isolation enforcement

### Cross-group import ban
| Option | Description | Selected |
|--------|-------------|----------|
| ESLint `no-restricted-imports` | Single rule in flat config; FOUND-04 names it; Phase 7 bundle-budget adds 2nd layer | ✓ |
| dependency-cruiser | Purpose-built, catches deeper graph; overkill for one boundary + new dep | |
| Custom build-time check | No third-party dep, but you maintain the scanner | |

**Notes:** Lands in the flat config (`eslint.config.mjs`); the legacy `.eslintrc.json` is deleted (ESLint 9 = flat config only).

---

## R2 upload scope

### How much pipeline in Phase 1
| Option | Description | Selected |
|--------|-------------|----------|
| Minimal server-side helper | file/buffer → sharp variants → write object; enough for FOUND-05; presigned UI → Phase 3 | ✓ |
| Full pipeline incl. presigned URLs | Front-loads MEDIA-01 infra; larger Phase 1, blurs boundary | |
| Presigned path only | FOUND-05 smoke would have to exercise the complex flow; sharp still needs server touchpoint | |

---

## Verification shape

### Phase 1 "done" verification
| Option | Description | Selected |
|--------|-------------|----------|
| `pnpm verify` script | Machine-checks each success criterion 1:1; repeatable, CI-able | ✓ |
| Manual success-criteria checklist | Simple, but not repeatable/CI-able, rots | |
| Playwright smoke vs `pnpm dev` | Heavier dep; Phase 1 has almost no UI to smoke (belongs to Phase 6+) | |

---

## Foundation conventions (batched)

### Path aliases
| Option | Selected |
|--------|----------|
| `@/*` → src/* only | ✓ |
| Add specific aliases (`@/db`, `@/lib`, etc.) | |

### Error/log foundation
| Option | Selected |
|--------|----------|
| Foundation now, no-dep logger (`app/error.tsx` + `lib/log` wrapper) | ✓ |
| Defer until features need it | |
| error.tsx only (no logger) | |

### Demo cleanup line
| Option | Selected |
|--------|----------|
| Remove ecommerce/ now, keep demos till Phase 4 | ✓ |
| Defer all demo cleanup to Phase 4 | |
| Remove all demos now | |

### Compose file location
| Option | Selected |
|--------|----------|
| Repo root | ✓ |
| `docker/` subdir | |

---

## Backup-system scope (cross-phase decision)

**Context:** Backup/restore is scoped to Phase 7 (PERF-05 = "Postgres backups scheduled"). The founder raised wanting a *configurable multi-destination* backup system (R2 · Google Drive · local as multi-select; configurable frequency/retention/off-site; restore-drill cadence; tooling + R2-object-backup TBD).

**Decision:** **Option B — expand v1.** PERF-05 + Phase 7 scope grows to include the configurable system (not just "backups scheduled"). Defaults applied: restore-drill cadence folded in as configurable; Google Drive kept on the destination list with an OAuth/third-party caveat for Phase 7 research to weigh.

**Captured as:** `.planning/todos/pending/2026-06-30-configurable-multi-destination-backup-system.md` (Phase 7's `/gsd-discuss-phase` auto-surfaces via `cross_reference_todos`). Requires a roadmap/requirements update via GSD handlers before Phase 7 planning.

---

## Claude's Discretion

Left open for researcher/planner (founder-level decisions exhausted):
- Exact `drizzle.config.ts` fields + migration folder path.
- Precise ESLint `no-restricted-imports` rule body (route-group patterns + shared-dirs allowlist).
- CI Postgres service-container setup.
- `sharp` output variants/formats + exact MinIO defaults in `.env.example`.
- Internal structure of the `pnpm setup` / `pnpm verify` / `pnpm test:migrations` scripts.
- `next/image` `remotePatterns` whitelisting.
- Backup-system tooling + R2-object-backup question (Phase 7 research).

## Deferred Ideas

- Configurable multi-destination backup system → Phase 7 (option B, captured as todo; roadmap update required).
- Presigned-URL direct-to-storage upload → Phase 3 (MEDIA-01).
- Feature-specific schema columns (Bangla slugs, scheduled `published_at`, view-count, draft preview token) → Phases 3/5/6.
- `users` + auth tables → Phase 2 (Better Auth).
- Chart/table/form demo removal + lazy-loading → Phase 4 (DASH-07).
