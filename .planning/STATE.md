---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 05
current_phase_name: seo-basics
status: executing
stopped_at: Completed 08-03-PLAN.md (Google Drive destination + OAuth callback)
last_updated: "2026-08-25T21:05:17.061Z"
last_activity: 2026-08-26
last_activity_desc: Completed quick task 260826-pqg — fix 16.3.3 blocking-prerender-current-time in (admin) AuthGate (await connection())
progress:
  total_phases: 8
  completed_phases: 6
  total_plans: 44
  completed_plans: 42
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-01)

**Core value:** Editors/authors can publish well-optimized blog posts and readers can consume them at maximum speed — fast/SEO-sound public blog + a dashboard that lets a small team manage the full content lifecycle (draft → review → publish) without touching code.
**Current focus:** Phase 05 — seo-basics

## Current Position

Phase: 05 (seo-basics) — EXECUTING
Plan: 1 of 6
Status: Executing Phase 05
Last activity: 2026-08-26 — Completed quick task 260826-pqg: fix 16.3.3 blocking-prerender-current-time error in (admin) AuthGate (await connection() before getSession)

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

- Total plans completed: 26
- Average duration: — min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |
| 02 | 5 | - | - |
| 04 | 6 | - | - |
| 06 | 7 | - | - |
| 08 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P02 | 5min | 2 tasks | 8 files |
| Phase 01 P03 | 12min | 2 tasks | 5 files |
| Phase 02 P01 | 27min | 3 tasks | 19 files |
| Phase 02 P02 | 22min | 2 tasks | 9 files |
| Phase 02 P03 | 18min | 2 tasks | 6 files |
| Phase 05 P01 | 17min | 3 tasks | 14 files |
| Phase 05 P02 | 9min | 2 tasks | 7 files |
| Phase 05 P03 | 16min | 3 tasks | 12 files |
| Phase 08 P01 | 13min | 2 tasks | 12 files |
| Phase 08 P02 | 7min | 2 tasks | 6 files |
| Phase 08 P03 | 8min | 2 tasks | 6 files |
| Phase 08 P05 | 5m | 2 tasks | 9 files |

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
- [Phase ?]: Phase 5 P01: cacheTag stable import preferred; SEO grapheme limits 80/200 via Intl.Segmenter
- [Phase ?]: RSS_LIMIT=30 with defensive .slice cap; escapeXml + CDATA as XML-output sanitization contract
- [Phase ?]: Pure SEO helpers exported from route files (not separate builders file) for DB-free unit testing
- [Phase ?]: SeoPanel extracted as standalone component receiving RHF register/errors via props (D-08 gap closure)
- [Phase ?]: seoSettingsSchema split into separate module — use-server files can only export async functions
- [Phase ?]: not-found.tsx redirects check isolated in Suspense for Cache Components compliance (D-12)
- [Phase ?]: 08-01: Separate BackupDestination interface (not StorageProvider overload) — backups need list/download, no CDN URL or sharp variants
- [Phase ?]: 08-01: Lazy dynamic-import registry with non-literal module paths keeps googleapis bundle-excluded and lets r2/gdrive destinations (08-02/03) land without breaking compilation
- [Phase ?]: 08-01: runBackupJob never throws to the caller (records ok:false + logs); destructive-restore confirmation gate deferred to the 08-04 Server Action per D-05
- [Phase 08]: 08-02: R2 backup destination uses a DEDICATED S3Client + dedicated backup bucket from backup.r2_creds — never the media s3Client/getActiveProvider (RESEARCH Anti-Pattern / T-08-02)
- [Phase 08]: 08-02: runBackupJob performs full DR (DB dump + R2 media sync via syncMediaBucket); media sync degrades to DB-only when media is not on R2 or when sync throws (ok stays true)
- [Phase 08]: 08-02: media-source detection reads storage.active_provider via readSetting (not getActiveProvider) to decouple the backup engine from the storage registry
- [Phase ?]: 08-03: Google Drive backup destination via googleapis OAuth2 user-consent flow (D-02) — buildConsentUrl/exchangeCode/revokeDriveToken + gdriveBackupDestination (drive.file scope); googleapis auto-refreshes access token
- [Phase ?]: 08-03: OAuth callback is a standalone Route Handler (NOT Better-Auth-mounted); verifies CSRF state vs signed httpOnly gdrive_oauth_state cookie before token exchange (mismatch->400), encrypts refresh_token, stores backup.gdrive_creds
- [Phase ?]: 08-03: access_type=offline + prompt=consent + drive.file scope are non-negotiable consent params (RESEARCH Pitfall 4)
- [Phase ?]: 08-05: Scratch DB backup_verify on existing Postgres (D-08) via raw autocommit pg.Client (SQLSTATE 25001 guard) + terminate-before-DROP no-linger finally
- [Phase ?]: 08-05: Hourly-poll + isDue(cronExpr) cadence so admin schedule changes take effect without a restart
- [Phase ?]: 08-05: Multi-instance cron double-fire cliff documented not solved in v1; v2 = Redis SET NX lease (ADR 0002)
- [Phase 02]: 02-06: better-auth admin createUser NEVER sends the verification email (sendOnSignUp consumed only by /sign-up/email + OAuth link-account, verified against installed 1.6.23) — createUser action calls auth.api.sendVerificationEmail explicitly post-creation, try/catch so send failure never masks creation
- [Phase ?]: 08-04: Backup Settings dashboard = verbatim Storage Settings sibling + D-01 multi-select delta (3 destination checkboxes) + 8 admin-gated Server Actions (requireRole FIRST proven by MUST_NOT_BE_REACHED) + CSRF-bound OAuth consent + revoke-before-delete Drive disconnect + type-the-DB-name Restore gate
- [Phase 04]: 260824-ptx: D-08 REVISED (owner decision 2026-08-24) — deleteUser allowed with structural guards (permission-first user:delete, self, last-admin, has-posts); authorship integrity preserved via the post-count guard converting the bare-FK NO ACTION error; ban still preferred for authors with posts

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

- **Configurable multi-destination backup system** (area: database; captured 2026-06-30) — **ROADMAP MUTATION APPLIED 2026-07-02.** Split into two configurable features: (A) image storage is now a provider abstraction (local default / Cloudinary / R2 / push-CDN, admin-selectable — MEDIA-01..04 + DASH-09), and (B) backups moved OUT of Phase 7 into the new Phase 8 — Backup & Disaster Recovery (BACKUP-01..05). PERF-05 is superseded. Backup destinations: **local (default)** · Google Drive · Cloudflare R2 (multi-select). Cloudinary was considered for backups and deliberately DROPPED (image-only). Tooling selection + Google Drive OAuth caveat left to Phase 8 research. See `.planning/todos/pending/2026-06-30-configurable-multi-destination-backup-system.md`.

### Blockers/Concerns

[Issues that affect future work]

- [Phase 3]: Tiptap v3 SSR round-trip (`@tiptap/html` `generateHTML` with chosen extensions) is MEDIUM-confidence — validate before wiring all rendering.
- [Phase 6]: Cache Components + `<Suspense>` boundary placement on `/[slug]` is HIGHEST-confidence open question — plan a spike before building all archive routes.
- [Phase 2 → UAT]: ~~Verification debt — AUTH-06/07 real-inbox email delivery deferred to UAT~~ **CLOSED 2026-08-24**: both live round-trips passed (AUTH-06 forgot/reset Test 4; AUTH-07 dashboard-created-user verification email Test 5, after gap closure 02-06). Phase 2 UAT complete — 5/5 pass, 0 issues (`.planning/phases/02-auth-rbac/02-UAT.md`).
- [Phase 2]: Better Auth `admin` vs `access` plugin split — confirm whether `access` plugin is needed for fine-grained permissions beyond the three roles.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260708-n9b | Swap dashboard logo to SEES brand asset and remove TailAdmin promo widget | 2026-07-08 | 1ea60f6 | [260708-n9b-swap-dashboard-logo-to-sees-brand-asset-](./quick/260708-n9b-swap-dashboard-logo-to-sees-brand-asset-/) |
| 260823-4yc | Frontpage design homepage (Featured card + Latest 3×4 grid + /page/N pagination) + site-wide PostCard upgrade (category tag, avatar, read time) | 2026-08-22 | 2b46f15 | [260823-4yc-implement-frontpage-design-homepage-site](./quick/260823-4yc-implement-frontpage-design-homepage-site/) |
| 260823-6je | Site header + footer restyle to frontpage design (speech-bubble logo, outlined circular search button, always-dark 4-column footer with cached dynamic categories + inert newsletter) | 2026-08-22 | 6620a4d | [260823-6je-restyle-public-siteheader-sitefooter-to-](./quick/260823-6je-restyle-public-siteheader-sitefooter-to-/) |
| 260823-79v | Two-row header per frontpage design — static white nav row + sticky-on-scroll category bar (dynamic categories from DB, configured-only social icons, shared socials modules extracted from footer) | 2026-08-23 | 9deadfb | [260823-79v-two-row-header-per-frontpage-design-row-](./quick/260823-79v-two-row-header-per-frontpage-design-row-/) |
| 260824-36g | De-brand dashboard/auth surfaces from SEES to anydiscussion — shared BrandLogo component (speech-bubble SVG from SiteHeader), sidebar/header/auth-panel swaps, sign-in metadata, SEES blurb replaced | 2026-08-24 | 5e5d493 | [260824-36g-de-brand-dashboard-from-sees-to-anydiscu](./quick/260824-36g-de-brand-dashboard-from-sees-to-anydiscu/) |
| 260824-3l2 | Functional frontend newsletter — single-opt-in subscribe Server Action (subscribers table + honeypot + Redis rate limit) as a client island inside the cached footer, dashboard config (enable toggle + heading/description/success texts via settings keys), admin subscribers page with delete + CSV export | 2026-08-24 | a555499 | [260824-3l2-functional-frontend-newsletter-with-dash](./quick/260824-3l2-functional-frontend-newsletter-with-dash/) |
| 260824-ptx | Users dashboard gap closure (Phase 2 UAT test 5) — three-state Status badge (Banned > Unverified > Active, amber warning palette via emailVerified projection) + guarded deleteUser action (permission-first, self / last-admin / has-posts guards; D-08 revised per owner decision) with optimistic-removal Delete UI | 2026-08-24 | 7a0cdbe | [260824-ptx-users-table-unverified-badge-guarded-del](./quick/260824-ptx-users-table-unverified-badge-guarded-del/) |
| 260824-qtu | Fix live 401 on dashboard user delete — better-auth 1.6.23 adminMiddleware throws UNAUTHORIZED on headerless internal calls; ALL FOUR middleware-gated auth.api call sites (removeUser/banUser/unbanUser/revokeUserSessions) now forward headers: await headers() (createUser/sendVerificationEmail deliberately headerless, pinned by tests); lying premature log.info("user deleted") moved after success + friendly error wrap | 2026-08-24 | dd9578b | [260824-qtu-fix-headerless-auth-api-admin-401-delete](./quick/260824-qtu-fix-headerless-auth-api-admin-401-delete/) |
| 260824-u1b | Users page confirmations via app modal system — new feature-local ConfirmDialog (TailAdmin Modal wrapper, danger/pending variants) replacing ALL FOUR browser-native window.confirm popups in UsersTable (Ban/Unban/Revoke/Delete) with one state-driven dialog; exact prior wording kept, mutations byte-identical (owner UAT feedback: native browser popup wrong for this dashboard) | 2026-08-24 | da85bf9 | [260824-u1b-users-confirm-dialog-modal](./quick/260824-u1b-users-confirm-dialog-modal/) |
| 260826-5l0 | Fix two Phase 05 UAT R1 bugs — Tiptap #7849 destroyed-editor crash on /dashboard/posts/[id]/edit (isDestroyed guards in both useEditorState selectors; @tiptap/react 3.27.1 predates upstream fix) + "Invalid url" publish rejection of root-relative /api/media image URLs (shared imageUrlSchema on featureImage/ogImage/defaultOgImage accepting empty / absolute http(s) / root-relative; canonical + base-URL fields stay absolute; protocol-relative //host rejected per T-Q5-01) | 2026-08-26 | a49e155 | [260826-5l0-fix-two-phase-05-uat-r1-bugs-tiptap-v3-7](./quick/260826-5l0-fix-two-phase-05-uat-r1-bugs-tiptap-v3-7/) |
| 260826-oif | Fix Next 16.3.3 cacheComponents blocking-prerender-dynamic errors on (admin) dashboard routes — `export const instant = false` on (admin)/layout.tsx (entry navigations) + all 16 data-fetching dashboard pages (sibling client navigations, per installed 16.3.3 docs scope rule); optional-chain fix for 4 pre-existing TS18048 test assertions that became build-blocking under 16.3.3 project-wide type-check; proxy.ts registration PROVEN under 16.3.3 (functions-config-manifest `/_middleware` + signed-out 307 `location: /signin?next=…` — reverses the 05-04 no-registration finding); 621/621 vitest, build clean, tsc clean | 2026-08-26 | a893f06 | [260826-oif-fix-next-16-3-3-cachecomponents-blocking](./quick/260826-oif-fix-next-16-3-3-cachecomponents-blocking/) |
| 260826-pqg | Fix 16.3.3 blocking-prerender-current-time error in (admin) AuthGate (follow-up to 260826-oif surfaced by live signed-in dev UAT) — Better Auth's getSession constructs an argument-less `new Date()` before any tracked dynamic access postpones the shell prerender; `await connection()` (next/server) added as AuthGate's FIRST statement per the error's [dynamic] remedy, postponing the boundary top-down inside the existing Suspense; one file only (16 page instant exports untouched); 621/621 vitest + tsc clean, no build/server run (owner's dev server live on :3000 — signed-in HMR reload is the owner's R1 UAT step) | 2026-08-26 | 1813b61 | [260826-pqg-fix-16-3-3-blocking-prerender-current-ti](./quick/260826-pqg-fix-16-3-3-blocking-prerender-current-ti/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2 / fast-follow | Menu builder (SETT-01) | Deferred | Project init |
| v2 / fast-follow | Header/footer custom-code injection (SETT-02) — security-sensitive | Deferred | Project init |
| v2 / fast-follow | Redirects manager UI (SETT-03) — table ships in v1 schema, UI deferred | Deferred | Project init |
| v2 | Revision history (CONTv2-01) | Deferred | Project init |

## Session Continuity

Last session: 2026-07-30T02:47:24.901Z
Stopped at: Completed 08-03-PLAN.md (Google Drive destination + OAuth callback)
Resume file: .planning/phases/08-backup-disaster-recovery/08-03-SUMMARY.md
