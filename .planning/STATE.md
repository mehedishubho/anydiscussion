---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 5
current_phase_name: SEO Basics
status: executing
stopped_at: Phase 4 context gathered
last_updated: "2026-07-06T15:38:19.002Z"
last_activity: 2026-07-06
last_activity_desc: Phase 04 complete, transitioned to Phase 5
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 18
  completed_plans: 18
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-01)

**Core value:** Editors/authors can publish well-optimized blog posts and readers can consume them at maximum speed — fast/SEO-sound public blog + a dashboard that lets a small team manage the full content lifecycle (draft → review → publish) without touching code.
**Current focus:** Phase 04 — dashboard-chrome

## Current Position

Phase: 5 — SEO Basics
Plan: Not started
Status: Executing Phase 04
Last activity: 2026-07-06 — Phase 04 complete, transitioned to Phase 5

Progress: [█░░░░░░░░░] 13%

## Roadmap Snapshot

| Phase | Goal (one-line) | Reqs |
|-------|-----------------|------|
| 1. Foundation | Next.js 16 + Drizzle + storage backbone, route-group isolation, migration hygiene | 6 |
| 2. Auth + RBAC | Better Auth + admin plugin, proxy gate, permission helpers + status enum shipped together | 8 |
| 3. Content Engine | Posts CRUD + Tiptap JSON round-trip, double-sanitize, categories/tags, provider-based media (local default + R2), revalidation | 15 |
| 4. Dashboard Chrome | TailAdmin wired to real data + Storage Settings (Cloudinary/push-CDN providers), RHF+Zod, TanStack Query, demo cleanup | 9 |
| 5. SEO Basics | generateMetadata, dynamic sitemap/robots, JSON-LD, canonical, OG, RSS | 8 |
| 6. Public Frontend | Home/feeds/archives, single post (Cache Components + Suspense), search, About/Contact/legal, dark mode | 19 |
| 7. Performance & Deploy | Lighthouse/CWV pass, bundle audit, revalidation audit, auth rate limiting, Coolify staging (backups moved to P8) | 5 |
| 8. Backup & Disaster Recovery | Configurable multi-destination backups (local default/Drive/R2), schedule+retention, restore-drill, dashboard page | 5 |

## Performance Metrics

**Velocity:**

- Total plans completed: 14
- Average duration: — min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |
| 02 | 5 | - | - |
| 04 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P02 | 5min | 2 tasks | 8 files |
| Phase 01 P03 | 12min | 2 tasks | 5 files |
| Phase 02 P01 | 27min | 3 tasks | 19 files |
| Phase 02 P02 | 22min | 2 tasks | 9 files |
| Phase 02 P03 | 18min | 2 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 7-phase dependency spine from research (Foundation → Auth+RBAC → Content → Dashboard → SEO → Public → Perf/Deploy); media folded into Content Engine (3 reqs, tightly coupled to R2 pipeline); analytics folded into Public Frontend (2 reqs, one-line script injection). Both avoid single-purpose phases.
- [Roadmap]: Phase 2 ships RBAC helpers AND the post status enum together — a status column without role/ownership checks is decoration, not a workflow (Pitfall 1 owned in Phase 2, reinforced in Phase 3).
- [Roadmap]: Phase 6 (Public Frontend) flagged HIGHEST research risk — Cache Components + `<Suspense>` on the single-post page is the most likely spike candidate.
- [Phase ?]: Drizzle pinned at 0.45.2 — Better Auth peer prevents upgrading to 1.x RC
- [Phase 01]: posts.author_id/categoryId plain integer columns in Phase 1 (no FK) — added Phase 2 per D-07
- [Phase 01]: tsconfig.json excludes scripts/ so r2-smoke.ts's .ts-extension import (required by node --experimental-strip-types) does not break next build — scripts are dev-time tooling, not app code
- [Phase ?]: drizzle-orm pinned at ^0.45.2 — Better Auth peer prevents 1.x RC bump (R5 gate verified in 02-01)
- [Phase ?]: RBAC via admin plugin createAccessControl — author role LACKS post.publish, double-enforced in TRANSITIONS table + requireCan (02-01)
- [Phase ?]: proxy.ts is UX-only (Next 16) — matcher targets resolved /dashboard paths, not (admin) route group (02-01)
- [Phase ?]: D-08 createFirstAdmin self-disable proven by structural test (02-02)
- [Phase ?]: adminApi type cast: Better Auth plugin endpoints flat in TS but nested at runtime (02-02)
- [Phase ?]: signup page uses Suspense-wrapped async child for PPR-compatible dynamic count query (02-02)
- [Phase 02]: lib/email thin Resend wrapper (D-03) — all hooks fire-and-forget (`void sendEmail`); lib/email never throws on error (R8) (02-03)
- [Phase 02]: customSyntheticUser with admin-plugin fields for email-enumeration protection (T-02-04) (02-03)
- [Phase 02]: AUTH-06/07 automated-hook-firing tests green (53 total); real-inbox delivery deferred to UAT — requires operator RESEND_API_KEY + DNS (Phase 7 / D-04) (02-03)

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

- **Configurable multi-destination backup system** (area: database; captured 2026-06-30) — **ROADMAP MUTATION APPLIED 2026-07-02.** Split into two configurable features: (A) image storage is now a provider abstraction (local default / Cloudinary / R2 / push-CDN, admin-selectable — MEDIA-01..04 + DASH-09), and (B) backups moved OUT of Phase 7 into the new Phase 8 — Backup & Disaster Recovery (BACKUP-01..05). PERF-05 is superseded. Backup destinations: **local (default)** · Google Drive · Cloudflare R2 (multi-select). Cloudinary was considered for backups and deliberately DROPPED (image-only). Tooling selection + Google Drive OAuth caveat left to Phase 8 research. See `.planning/todos/pending/2026-06-30-configurable-multi-destination-backup-system.md`.

### Blockers/Concerns

[Issues that affect future work]

- [Phase 3]: Tiptap v3 SSR round-trip (`@tiptap/html` `generateHTML` with chosen extensions) is MEDIUM-confidence — validate before wiring all rendering.
- [Phase 6]: Cache Components + `<Suspense>` boundary placement on `/[slug]` is HIGHEST-confidence open question — plan a spike before building all archive routes.
- [Phase 2 → UAT]: **Verification debt** — AUTH-06/07 real-inbox email delivery deferred to UAT (`.planning/phases/02-auth-rbac/02-UAT.md` UAT-02-01). Automated hook-firing tests pass (53 green); the manual round-trip requires operator `RESEND_API_KEY` + DNS deliverability (DKIM/SPF/DMARC — Phase 7 / D-04). Must close before production launch.
- [Phase 2]: Better Auth `admin` vs `access` plugin split — confirm whether `access` plugin is needed for fine-grained permissions beyond the three roles.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2 / fast-follow | Menu builder (SETT-01) | Deferred | Project init |
| v2 / fast-follow | Header/footer custom-code injection (SETT-02) — security-sensitive | Deferred | Project init |
| v2 / fast-follow | Redirects manager UI (SETT-03) — table ships in v1 schema, UI deferred | Deferred | Project init |
| v2 | Revision history (CONTv2-01) | Deferred | Project init |

## Session Continuity

Last session: 2026-07-05T11:17:34.841Z
Stopped at: Phase 4 context gathered
Resume file: .planning/phases/04-dashboard-chrome/04-CONTEXT.md
