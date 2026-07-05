# Roadmap: Any Discussion

## Overview

Any Discussion is a self-hosted, full-stack blog CMS where one Next.js 16 app serves both an extremely fast public blog (Cache Components + `<Suspense>`, near-zero client JS) and an auth-gated, role-based admin dashboard (TailAdmin UI kit), backed by one PostgreSQL database and a configurable storage layer (local by default, with Cloudflare R2 / Cloudinary / push-CDN as selectable image providers, and local / Google Drive / R2 as selectable backup destinations). v1 is an **authoring + public-site MVP**: a small editorial team (admin/editor/author) can manage the full content lifecycle (draft → review → publish) and readers consume well-optimized, SEO-sound posts at maximum speed.

The journey follows the dependency spine the research consistently surfaced: Foundation (Drizzle schema + storage pipeline) → Auth + RBAC (Better Auth + permission helpers, shipped alongside the post status enum so the review workflow is real on day one) → Content Engine (Tiptap JSON round-trip, double-sanitization, media) → Dashboard Chrome (TailAdmin wired to real data) → SEO Basics → Public Frontend (the highest-complexity phase — Cache Components + Suspense on the single post page) → Performance & Deploy (verified on the real Coolify/Cloudflare stack). The architecture's central rule — the `(site)` and `(admin)` route groups never import each other, both depend on shared `actions/`/`lib/`/`db/` — is established in Phase 1 and audited end-to-end in Phase 7.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Next.js 16 config, Drizzle schema + first migration, R2/sharp pipeline, route-group isolation
- [x] **Phase 2: Auth + RBAC** - Better Auth + admin plugin, proxy cookie gate, permission helpers, review-workflow status enum shipped together (code complete 2026-07-02; pending UAT — email round-trip deferred, see 02-VERIFICATION.md / 02-UAT.md) (completed 2026-07-03)
- [x] **Phase 3: Content Engine** - Posts CRUD + Tiptap JSON round-trip, double-sanitization, categories/tags, provider-based media (local default + R2), revalidation wired in (completed 2026-07-04)
- [ ] **Phase 4: Dashboard Chrome** - TailAdmin wired to real data (posts, taxonomy, media, users, pages) + Storage Settings (Cloudinary/push-CDN providers), RHF+Zod, TanStack Query, demo cleanup
- [ ] **Phase 5: SEO Basics** - generateMetadata per route, dynamic sitemap + robots, JSON-LD, canonical, OG/Twitter cards, RSS
- [ ] **Phase 6: Public Frontend** - Home/blog/archive, category/tag/author archives, single post (Cache Components + Suspense), search, About/Contact/legal, dark mode
- [ ] **Phase 7: Performance & Deploy** - Lighthouse/CWV pass, bundle-budget audit, revalidation audit end-to-end, auth rate limiting, Coolify staging, Dokploy, self host
- [ ] **Phase 8: Backup & Disaster Recovery** - Configurable multi-destination backups (local default/Google Drive/R2), schedule + retention, automated restore-drill with alerting, Backup Settings dashboard page

## Phase Details

### Phase 1: Foundation

**Goal**: Establish the locked Next.js 16 + Drizzle + R2 backbone and the conventions everything else depends on, so content and auth work begins on a stable, drift-free base.
**Mode**: mvp
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06
**Success Criteria** (what must be TRUE):

  1. Running `pnpm dev` boots a Next.js 16 app where PPR (`cacheComponents:true`) is enabled, `next/image` uses a custom loader pointed at cdn.anydiscussion.com, and the build targets `output:"standalone"` for Coolify.
  2. A developer can change `db/schema.ts` (including the new `pages` table) and regenerate migrations purely via `drizzle-kit generate`, with no hand-written SQL anywhere.
  3. Applying every committed migration to a clean empty Postgres reproduces the schema exactly (clean-room migration test passes) — no drift.
  4. The public route group `app/(site)` cannot import anything from `app/(admin)` (and vice-versa) — the ESLint `no-restricted-imports` rule fails the build on any cross-group import, keeping TailAdmin/editor JS out of the public bundle.
  5. A test upload through `lib/r2` writes an object to Cloudflare R2 with `sharp`-derived optimized variants, confirming the media pipeline works end-to-end before features depend on it.

**Plans**: 3/3 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Framework config (cacheComponents/standalone/CDN image loader) + locked-stack package installs + foundation conventions (log/error/cleanup) + Docker Compose + .env.example (Wave 2 unblocker) + ESLint route-group isolation + package.json script wiring

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — DB backbone: Drizzle config + 8-table schema + client singleton + first migration + clean-room drift test (the [BLOCKING] schema-apply task)
- [x] 01-03-PLAN.md — R2/sharp media pipeline (minimal lib/r2 upload helper, consuming the Plan 01 compose + env) + pnpm setup onboarding + pnpm verify orchestrator (all 5 success criteria, R2 smoke via node --experimental-strip-types)

**Pitfalls owned:** #5 (Drizzle migration drift — generate-then-commit-in-same-PR + clean-room test established day one).
**Research flag:** LOW — re-verify `getTableColumns` (not `getColumns`, a 1.0-only API), the sharp postinstall `pnpm approve-builds` flow, and the 2-arg `images.qualities` default.

### Phase 2: Auth + RBAC

**Goal**: A small editorial team can securely access the dashboard with role-based permissions, and the server-side enforcement primitives for the review workflow exist and are exercised — so that when posts ship in Phase 3, the workflow is genuinely enforced, not decorative.
**Mode**: mvp
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08
**Success Criteria** (what must be TRUE):

  1. A user can sign in at the dashboard signin page and stay authenticated across browser sessions; there is no open public sign-up (an admin creates accounts in the dashboard).
  2. An unauthenticated visitor hitting any `(admin)` route is redirected away by `proxy.ts` (cookie-existence gate) — but the dashboard never treats that as the sole auth check (authoritative RBAC happens server-side).
  3. A user with the `author` role is blocked server-side from performing an editor/admin-only mutation (e.g. publishing), even if they craft the request directly — every mutating Server Action starts with `getSession` + role + ownership checks (Pitfall 1 owned here).
  4. A user can reset a forgotten password via an email link and verify their email on account creation (Better Auth defaults + SMTP working).
  5. A user record carries the profile fields (bio, avatar) needed for byline/author pages, and the post status enum (`draft` / `pending_review` / `published`) and review workflow primitives exist so Phase 3 can enforce author → submit-for-review → editor/admin-approve → publish.

**Plans**: 5/5 plans complete

Plans:

**Wave 1**

- [x] 02-01-PLAN.md — Test infra (Vitest) + schema migration (auth tables + role/bio/avatar + FKs + 12-table clean-room test) + Better Auth instance + RBAC config + permission helpers + proxy.ts UX gate + status-transition helpers

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — First-run admin setup wizard (createFirstAdmin with D-08 self-disable + repurposed signup page) + auth browser client + signin form wired to Better Auth (remember-me + deep-link callbackURL)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — Email flows (lib/email Resend helper + verification/reset hooks + customSyntheticUser enumeration protection) + ban/revoke session primitives (D-16/D-17) + manual email round-trip checkpoint

**Wave 4** *(gap-closure — closes AUTH-06 UI gap from 02-UAT.md)*

- [x] 02-04-PLAN.md — Forgot-password + reset-password UI pages (forms calling verified authClient.requestPasswordReset / resetPassword) + SignInForm link fix + proxy.ts gate update

**Wave 5** *(gap-closure — closes AUTH-03 blocker from 02-UAT.md Test 3: unauthenticated /dashboard not redirecting)*

- [x] 02-05-PLAN.md — Authoritative server-side getSession() auth gate in the (admin) layout (defense-in-depth primary fix) + proxy/middleware manifest-registration resolution (UX layer) + integration regression test proving unauthenticated /dashboard redirects to /signin

**Pitfalls owned:** #1 (missing server-side auth on mutating actions) and #4 (proxy-does-cookie-check / action-does-real-check split). Shipped with the status enum so the review workflow is real, not decoration.
**Research flag:** MEDIUM — re-verify the Better Auth `admin` plugin API (`createAccessControl`, `userHasPermission`), whether the `access` plugin is needed beyond the three roles, `nextCookies()`-last placement, and the exact `proxy.ts` matcher against current docs.

### Phase 3: Content Engine

**Goal**: An author or editor can write a post in the Tiptap editor, attach media via a configurable storage provider (local by default, R2 available), categorize/tag it, and move it through the review/publish workflow — with the post body surviving a sanitized JSON → HTML → render round-trip and publish reliably invalidating cached pages.
**Mode**: mvp
**Depends on**: Phase 2
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04, CONT-05, CONT-06, CONT-07, CONT-08, CONT-09, CONT-10, CONT-11, MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04
**Success Criteria** (what must be TRUE):

  1. An author can save a draft and submit it for review; an editor/admin can then approve and publish it; an author cannot publish directly — the workflow enforced server-side (consumes the Phase 2 status enum + RBAC).
  2. A post written in the lazy-loaded Tiptap v3 editor is stored as ProseMirror JSON and renders on the server as correct HTML via `@tiptap/html` `generateHTML` using the same extensions array (the SSR round-trip is validated here before all rendering depends on it).
  3. A malicious payload (e.g. `<img src=x onerror=...>`) submitted in any HTML-capable field is stripped both before storage and before render by one shared `lib/sanitize` config (Pitfall 2 — double-sanitization — owned here).
  4. An editor can upload an image through the storage-provider abstraction (`lib/storage/`), with `sharp` producing optimized variants server-side at upload time; the active provider is read from `settings` (local by default, R2 available), the media record stores provider + key + alt text + dimensions, and every content image is served through `next/image` (loader resolves to the active provider's public URL — never a raw `<img>`).
  5. Publishing or updating a post triggers the correct `revalidatePath` / 2-arg `revalidateTag` calls inside the publish Server Action with concrete paths (not template strings), so cached pages refresh without a full rebuild (Pitfall 3 wired here, audited in Phase 7).

**Plans**: 4/4 plans complete

Plans:

**Wave 1**

- [x] 03-01-PLAN.md — Slice A: Post writing core — Tiptap v3 lazy-loaded editor + extensions single-source-of-truth + schema migration (media provider rename + posts.previewToken) + slug validator + excerpt utility + Zod schema + posts/categories/tags Server Actions + TailAdmin-quality post routes + Wave-0 round-trip test (PRIMARY research flag). Covers CONT-01, CONT-02, CONT-03, CONT-07, CONT-11.

**Wave 2** *(parallel — blocked on Wave 1 schema migration)*

- [x] 03-02-PLAN.md — Slice B: Sanitization + taxonomy — shared `lib/sanitize` DOMPurify config (Pitfall #2 — double-sanitize at storage AND render via ONE config) + iframe domain allowlist hook + SSR render pipeline (generateHTML → sanitizeBeforeRender) + CategoryPicker/TagPicker wired into the post editor. Covers CONT-04, CONT-05, CONT-06.
- [x] 03-03-PLAN.md — Slice C: Media + storage abstraction — `lib/storage/` (interface + registry reading `settings.storage.active_provider` + local + r2 providers) + `actions/media.ts` server-mediated upload + sharp variants at upload (Pitfall #7) + `/api/media/[...path]` Route Handler for local serve (Pitfall #4). Covers MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04.

**Wave 3** *(blocked on Slice A + Slice B)*

- [x] 03-04-PLAN.md — Slice D: Publishing, revalidation, scheduling, preview — publishPost with targeted `revalidatePath` + 2-arg `revalidateTag(tag, 'max')` (Pitfall #3, MEDIUM research flag closed) + node-cron worker via `instrumentation.ts` (D-11 in-process, D-12 system-publish documented exception) + `/preview/[token]` token-gated draft route (D-19) rendering via Slice B's renderPostBody. Covers CONT-08, CONT-09, CONT-10.

**Pitfalls owned:** #2 (double-sanitization + Tiptap JSON storage — Slice B), #3 (`revalidatePath`/`revalidateTag` wired into the publish action — Slice D), #7 (upload-time sharp resize, not per-request — Slice C).
**Research flag:** MEDIUM — validate the Tiptap v3 SSR round-trip (`@tiptap/html` `generateHTML` with the chosen extensions array) and confirm the `revalidateTag(tag, 'max')` 2-arg form on a real publish action before wiring all rendering.

### Phase 4: Dashboard Chrome

**Goal**: The editorial team manages the full content lifecycle through a polished TailAdmin dashboard wired to real data — posts, taxonomy, media, users/roles, dashboard-managed pages, AND the active image storage destination (local/Cloudinary/R2/push-CDN) — with a lean initial load and a single shared form/validation pattern.
**Mode**: mvp
**Depends on**: Phase 3
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09
**Success Criteria** (what must be TRUE):

  1. A team member can list, create, and edit posts/categories/tags/media through TailAdmin pages wired to the real Server Actions from Phase 3 (no demo data).
  2. An admin can create/disable users and assign roles (admin/editor/author) from a users management UI that only admins can reach — and the underlying action re-checks admin permission server-side.
  3. An editor can edit legal/contact page content (T&C, Privacy, Contact) through the same Tiptap editor used for posts, stored in the `pages` table (no dev intervention needed for non-post content).
  4. Every dashboard form uses React Hook Form + a Zod schema that is the same file reused server-side for Server Action validation, with TanStack Query powering optimistic UI on mutations.
  5. The `ecommerce/` demo folder and unused chart/table demos are removed, the heavy editor/charts are lazy-loaded, and dark mode works across the dashboard — initial dashboard load stays lean.
  6. An admin can open a Storage Settings page, pick the active image destination (local/Cloudinary/R2/push-CDN), enter per-provider credentials, and persist the choice to `settings` — the Cloudinary + push-CDN providers are implemented here (extending the `lib/storage/` abstraction from MEDIA-04), and the save action re-checks admin permission server-side.

**Plans**: 1/5 plans executed

**Wave 1** (foundational — unblocks all of Wave 2)

- [x] 04-01-PLAN.md — Dashboard shell + pattern foundation: route restructure under `/dashboard/*` (D-01) + sidebar CMS nav with role-filter (D-02/D-05) + demo cleanup (D-03) + lean real-stats overview (D-04) + `(admin)`-scoped TanStack QueryClient (D-28) + PostForm `useMutation` retrofit (D-26 baseline) + auth-gate test marker sync (Pitfall 5)

**Wave 2** (parallel vertical slices — blocked on 04-01)

- [ ] 04-02-PLAN.md — Taxonomy + Media library + reusable MediaPicker: Categories + Tags TailAdmin tables (D-16) + Media library browser with drag-drop uploader + soft-delete warn (D-12/D-14/D-15) + reusable `<MediaPicker>` modal wired into PostForm feature-image + editor Toolbar image button (D-13)
- [ ] 04-03-PLAN.md — Users & roles management + Profile: `listUsers` + `updateUser` actions + users table + drawer (D-07/D-08/D-10/D-11) + self-service profile editing for any role (D-09)
- [ ] 04-04-PLAN.md — Pages management: `actions/pages.ts` + slimmed Tiptap editor (D-18) + T&C/Privacy/Contact seed (D-17/D-29a) + draft/published-only status (D-20) + Contact content-only (D-19)

**Wave 3** (most technically nuanced — blocked on 04-02 for media.ts sequencing)

- [ ] 04-05-PLAN.md — DASH-09 Storage Settings + new providers + crypto: `lib/crypto` AES-256-GCM (D-25) + Cloudinary provider (D-22) + generic S3-compatible push-CDN provider (D-21) + `lib/storage/registry` `getProviderByName` + `deleteMedia` multi-provider bug fix (Pitfall 0) + admin-only Storage Settings page (D-23) + "Test connection" probes (D-24) + `next.config.ts` remotePatterns (Pitfall 4) + instrumentation register + cloudinary@2.10.0 install + `SETTINGS_ENCRYPTION_KEY` env + new settings-keys seed (D-29b) + Wave 0 tests (cloudinary/push-cdn/crypto/storage-settings)

**Pitfalls owned:** cross-group import leakage prevention continues (bundle-budget check enforced in Phase 7); dashboard bloat avoided via lazy-loading; `deleteMedia` multi-provider correctness bug fixed in Wave 3 (Pitfall 0 from RESEARCH.md).
**Research flag:** none — TailAdmin wiring + RHF/Zod + TanStack Query are well-documented standard patterns.

### Phase 5: SEO Basics

**Goal**: Every public-facing route emits accurate, source-of-truth metadata so posts are indexable, shareable, and canonical-correct — sourced from `post_seo`/`settings`, including Bangla-aware validation and an RSS feed.
**Mode**: mvp
**Depends on**: Phase 3
**Requirements**: SEO-01, SEO-02, SEO-03, SEO-04, SEO-05, SEO-06, SEO-07, SEO-08
**Success Criteria** (what must be TRUE):

  1. Each public route produces correct `<title>`, meta description, canonical, and OG/Twitter card tags via Next.js `generateMetadata`, sourced from `post_seo` / `settings` (respecting a `canonical_url` override when set, else deriving from slug).
  2. `/sitemap.xml` lists every published post and managed page (with per-content-type priority/changefreq), and `/robots.txt` is generated correctly — both update without a full rebuild.
  3. A published post page injects valid `BlogPosting` JSON-LD structured data.
  4. A post with a long Bangla meta description passes validation using a byte/reasonable-char-count rule, not a Latin-character limit (Bangla content does not get falsely rejected).
  5. An RSS feed at `/rss.xml` (or `/feed.xml`) publishes the latest posts for feed readers.

**Plans**: TBD

Plans:

- [ ] 05-01: TBD (planning pending)
- [ ] 05-02: TBD (planning pending)

**Pitfalls owned:** Bangla meta-length validation (byte/char, not Latin assumptions); sitemap must update via revalidation, not require a full rebuild.
**Research flag:** none — `generateMetadata`, `sitemap.ts`, and JSON-LD are standard Next.js Metadata API patterns. (Redirects-manager UI is fast-follow — `proxy.ts` checks the table but v1 ships it empty.)

### Phase 6: Public Frontend

**Goal**: Readers can browse and consume the blog at maximum speed — home, feeds, archives, single posts, search, and marketing/legal pages — with the public site staying ISR/Cache Components-first and near-zero client JS, including the highest-complexity surface: the single-post page with a static Tiptap body streaming dynamic holes.
**Mode**: mvp
**Depends on**: Phase 3, Phase 5
**Requirements**: SITE-01, SITE-02, SITE-03, SITE-04, SITE-05, SITE-06, SITE-07, SITE-08, SITE-09, SITE-10, SITE-11, SITE-12, SITE-13, SITE-14, SITE-15, SITE-16, SITE-17, ANAL-01, ANAL-02
**Success Criteria** (what must be TRUE):

  1. A reader can land on the home page and `/blog` feed, browse the full chronological filterable archive, and drill into `/category/[slug]`, `/tag/[slug]`, and `/author/[slug]` archives — all server-rendered with minimal client JS.
  2. A reader opens a single post and sees the static Tiptap body render immediately while the view count and related-posts blocks stream in behind `<Suspense>` boundaries (Cache Components + PPR) — the page does not block on the dynamic holes (HIGHEST-complexity spike candidate).
  3. A reader can search posts via Postgres full-text search with filters (category, tag, date, author) and get relevant ranked results.
  4. A reader can view the About page (hard-coded TSX/MDX), submit the Contact form (delivered via SMTP, honeypot + rate-limited, no paid API), read T&C/Privacy from the dashboard-managed `pages` table, and hit a proper 404 on an unmatched path; a draft preview link works for an unpublished post (gated by secret token, consuming CONT-10).
  5. Single posts expose derived reading time + a table of contents (from headings), social share buttons + a read-progress indicator, a working view count, and dark mode across the public site; the analytics script (default Umami, swappable) is injected from `settings`.

**Plans**: TBD

Plans:

- [ ] 06-01: TBD (planning pending)
- [ ] 06-02: TBD (planning pending)

**Pitfalls owned:** #3 (publish→visible tested end-to-end on the real stack in Phase 7), #2 reinforced (re-sanitize at render before any `dangerouslySetInnerHTML`); cross-group leakage forbidden.
**Research flag:** HIGHEST — Cache Components + `<Suspense>` boundary placement on the single-post page (`/[slug]`) is the single most likely place to need a spike; confirm `cacheLife`/`cacheTag` profile behavior and where to place Suspense boundaries for related-posts/view-count before building all archive routes.

### Phase 7: Performance & Deploy

**Goal**: The blog ships on the real self-hosted stack (Coolify + Postgres + Cloudflare) meeting the non-negotiable performance/SEO bar, with the publish→visible loop, bundle isolation, and auth rate limiting verified in production-like conditions. (Backups moved to Phase 8.)
**Mode**: mvp
**Depends on**: Phase 6
**Requirements**: PERF-01, PERF-02, PERF-03, PERF-04, PERF-06 (PERF-05 superseded — backups moved to Phase 8)
**Success Criteria** (what must be TRUE):

  1. Public-site pages pass the Lighthouse / Core Web Vitals bar on the real Coolify + Cloudflare stack (the non-negotiable PROJECT.md performance requirement).
  2. A bundle-budget check proves no TailAdmin or Tiptap/editor JS leaks into the public chunk — and a deliberate cross-group import fails CI (Pitfall 3-style silent breakage caught automatically).
  3. A published post is visible to readers immediately after publish on the real stack — every mutating action's `revalidatePath`/`revalidateTag` is audited and publish→visible is verified end-to-end (Pitfall 3 closed).
  4. Auth endpoints (sign-in, password reset) are rate-limited. (Backup scheduling moved to Phase 8.)
  5. The app deploys to staging on Coolify via git-push with managed SSL, build-vs-runtime env secrets correctly separated, and the single-instance ISR scaling cliff (multi-replica needs a shared Redis cache handler) documented for v2.

**Plans**: TBD

Plans:

- [ ] 07-01: TBD (planning pending)
- [ ] 07-02: TBD (planning pending)

**Pitfalls owned:** #3 (publish→visible verified on real stack), #6 (document single-replica ISR scaling cliff before adding a second Coolify replica), R2 op-count/sharp-CPU cost monitoring + billing alerts, Coolify build-vs-runtime env secret separation.
**Research flag:** LOW — Coolify staging deploy + env-handling verification (backup/ops strategy moved to Phase 8).

### Phase 8: Backup & Disaster Recovery

**Goal**: An admin can configure (from the dashboard) where database backups are stored, how often they run, and how long they're kept — and an automated restore-drill proves backups are restorable. Local is the default destination; Google Drive and Cloudflare R2 are selectable, multi-select destinations.
**Mode**: mvp
**Depends on**: Phase 7 (needs the deployed/runtime environment on Coolify + the `lib/storage` abstraction established in Phase 3/4)
**Requirements**: BACKUP-01, BACKUP-02, BACKUP-03, BACKUP-04, BACKUP-05
**Success Criteria** (what must be TRUE):

  1. An admin can open the Backup Settings dashboard page, select one or more backup destinations (local default / Google Drive / Cloudflare R2), set schedule (frequency/RPO) + retention (keep N days/weeks), and persist the config to `settings` — with a server-side admin permission check on save.
  2. A backup runs on the configured schedule and writes to every selected destination; the backup is restorable (a real restore succeeds against a throwaway Postgres instance).
  3. An automated restore-drill runs on a configurable cadence: it restores the latest backup to a throwaway DB, verifies integrity, and alerts on failure — closing the "backup-never-restored" gamble.
  4. Provider credentials for each destination (Google OAuth tokens, R2 keys, local paths) are stored securely as runtime secrets / encrypted `settings` values — never exposed in client-visible state or shipped into the build bundle.

**Plans**: TBD

Plans:

- [ ] 08-01: TBD (planning pending)

**Pitfalls owned:** backup-never-restored gamble (closed by restore-drill BACKUP-04); Google Drive OAuth external-dependency caveat (mild tension vs self-hosted / no-paid-API ethos — research before committing); build-vs-runtime secret separation for provider credentials (must not leak into the standalone build output).
**Research flag:** MEDIUM — backup tooling selection (pg_dump cron vs WAL-G vs Coolify built-in vs pg_backrest, chosen against the configurable multi-destination requirement) + Google Drive OAuth / Drive API integration specifics.
**UI hint**: yes

## Coverage

**v1 requirements:** 75 total (69 original + MEDIA-04, DASH-09, BACKUP-01..05; PERF-05 superseded/moved)
**Mapped to phases:** 75 (100%)
**Unmapped:** 0

| Phase | Requirements | Count |
|-------|--------------|-------|
| 1. Foundation | FOUND-01..06 | 6 |
| 2. Auth + RBAC | AUTH-01..08 | 8 |
| 3. Content Engine | CONT-01..11, MEDIA-01..04 | 15 |
| 4. Dashboard Chrome | DASH-01..09 | 9 |
| 5. SEO Basics | SEO-01..08 | 8 |
| 6. Public Frontend | SITE-01..17, ANAL-01..02 | 19 |
| 7. Performance & Deploy | PERF-01..04, PERF-06 (PERF-05 superseded) | 5 |
| 8. Backup & Disaster Recovery | BACKUP-01..05 | 5 |
| **Total** | | **75** |

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-07-02 |
| 2. Auth + RBAC | 3/3 | Pending UAT | 2026-07-02 (code) |
| 3. Content Engine | 4/4 | Complete | 2026-07-04 |
| 4. Dashboard Chrome | 0/5 | Not started | - |
| 5. SEO Basics | 0/TBD | Not started | - |
| 6. Public Frontend | 0/TBD | Not started | - |
| 7. Performance & Deploy | 0/TBD | Not started | - |
| 8. Backup & Disaster Recovery | 0/TBD | Not started | - |
