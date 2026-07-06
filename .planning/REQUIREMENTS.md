# Requirements: Any Discussion

**Defined:** 2026-07-01
**Core Value:** Editors/authors can publish well-optimized blog posts and readers can consume them at maximum speed — fast/SEO-sound public blog + a dashboard that lets a small team manage the full content lifecycle (draft → review → publish) without touching code.

## v1 Requirements

v1 = authoring + public-site MVP, extended with the full agreed feature set. Each requirement maps to exactly one roadmap phase (traceability filled during roadmap creation).

### Foundation

- [x] **FOUND-01**: Next.js 16 app configured for the locked stack — App Router, `cacheComponents:true` (PPR), Turbopack, `output:"standalone"`, custom `next/image` loader pointed at cdn.anydiscussion.com
- [x] **FOUND-02**: Drizzle ORM + Postgres connection established (`db/` client instance, `drizzle.config.ts`)
- [x] **FOUND-03**: Base schema defined and first migration generated via `drizzle-kit generate` (posts, post_seo, categories, tags, post_tags, media, settings, pages — 8 tables; the `users` table is deferred to Phase 2 per D-07, where Better Auth generates it)
- [x] **FOUND-04**: `app/(site)` and `app/(admin)` route-group isolation enforced (ESLint `no-restricted-imports` preventing cross-group imports; public bundle stays free of TailAdmin/editor JS)
- [x] **FOUND-05**: Cloudflare R2 client + `sharp` resize-at-upload pipeline in `lib/r2`
- [x] **FOUND-06**: Drizzle migration hygiene — generate-then-commit-in-same-PR + clean-room migration test (empty Postgres ← all migrations reproduces schema)

### Auth & RBAC

- [x] **AUTH-01**: Better Auth configured with the `admin` plugin; roles `admin`, `editor`, `author` via `createAccessControl`
- [x] **AUTH-02**: Sign-in page working; user accounts created by an admin in the dashboard (no open public sign-up)
- [x] **AUTH-03**: `proxy.ts` cookie-existence gate redirecting unauthenticated users away from `(admin)`
- [x] **AUTH-04**: `lib/permissions` helpers (`requireRole`, `requireCan`, `assertOwnsPost`); every mutating Server Action starts with the appropriate server-side check
- [x] **AUTH-05**: Author → submit-for-review → editor/admin-approve → publish workflow enforced server-side via post status
- [x] **AUTH-06**: Password reset via email link (Better Auth default + SMTP) — *verification-debt: automated hook-firing test green (02-03); real-inbox delivery deferred to UAT (`.planning/phases/02-auth-rbac/02-UAT.md` UAT-02-01 — requires operator `RESEND_API_KEY` + DNS deliverability, Phase 7 / D-04)*
- [x] **AUTH-07**: Email verification on account creation (Better Auth default + SMTP) — *verification-debt: automated hook-firing test green (02-03); real-inbox delivery deferred to UAT (`.planning/phases/02-auth-rbac/02-UAT.md` UAT-02-01 — requires operator `RESEND_API_KEY` + DNS deliverability, Phase 7 / D-04)*
- [x] **AUTH-08**: Author profile fields on `users` (bio, avatar) to support byline/author pages

### Content Engine

- [ ] **CONT-01**: Posts CRUD with status `draft` / `pending_review` / `published`
- [ ] **CONT-02**: Tiptap v3 editor (dashboard, lazy-loaded) storing ProseMirror JSON (`getJSON()`) as jsonb
- [ ] **CONT-03**: Server-side render pipeline — JSON → `@tiptap/html` `generateHTML` → shared DOMPurify sanitize
- [ ] **CONT-04**: Double sanitization (sanitized before storage AND before render) via one shared `lib/sanitize` config
- [ ] **CONT-05**: Categories CRUD (one category per post)
- [ ] **CONT-06**: Tags CRUD + `post_tags` join (many tags per post)
- [ ] **CONT-07**: Bangla-aware slugs on posts and taxonomy
- [ ] **CONT-08**: `revalidatePath` / `revalidateTag` wired into publish/update Server Actions
- [ ] **CONT-09**: Scheduled publishing — `published_at` datetime + a scheduler/cron that flips status to `published` at the set time (adds a worker/cron dependency)
- [ ] **CONT-10**: Draft preview links — secret token allowing review of unpublished posts on a public route
- [ ] **CONT-11**: Autosave — debounced auto-save of Tiptap JSON while editing in the dashboard

### Media

- [ ] **MEDIA-01**: Upload via a storage-provider abstraction; the active provider is configurable (local by default), not hardcoded to R2 — `sharp` resize-at-upload still produces optimized variants regardless of provider
- [ ] **MEDIA-02**: Media library — `media` records store the active provider + object key, alt text, `uploaded_by`, dimensions; dashboard browser works across providers
- [ ] **MEDIA-03**: All content images served through `next/image` (never raw `<img>`) — the loader resolves to the active provider's public URL
- [ ] **MEDIA-04**: Storage provider abstraction (`lib/storage/`) with a common `StorageProvider` interface + a registry that reads the active provider from the `settings` table; ships with local (default) + R2 providers in this phase (R2 wraps the existing Phase-1 `lib/r2`) — Cloudinary + push-CDN providers are added in Phase 4 (DASH-09)

### Dashboard Chrome

- [x] **DASH-01**: TailAdmin posts list / new / edit pages wired to real data
- [x] **DASH-02**: Categories + tags management UI
- [x] **DASH-03**: Media library browser UI
- [x] **DASH-04**: Users + roles management UI (admin only — create/disable users, assign role)
- [x] **DASH-05**: Pages management UI (T&C, Privacy, Contact content) using the same Tiptap editor
- [x] **DASH-06**: Forms via React Hook Form + Zod (schema shared server-side for Server Action validation); TanStack Query for mutations/optimistic UI
- [x] **DASH-07**: Remove `ecommerce/` demo + unused chart/table demos; keep initial dashboard load lean (lazy-load editor/charts)
- [x] **DASH-08**: Dark mode applied to the dashboard (existing ThemeContext)
- [x] **DASH-09**: Storage Settings page (admin-only) — choose the active image destination (local/Cloudinary/R2/push-CDN) + enter per-provider credentials, persisted to `settings`; the underlying action re-checks admin permission server-side. Adds the Cloudinary + push-CDN image providers so they become selectable from this UI (extends the `lib/storage/` abstraction from MEDIA-04)

### SEO

- [x] **SEO-01**: `generateMetadata` per public route sourced from `post_seo` / `settings`
- [x] **SEO-02**: Dynamic `sitemap.ts` (published posts + pages) + `robots.ts`
- [x] **SEO-03**: JSON-LD `BlogPosting` schema per post
- [x] **SEO-04**: Canonical handling (respect `canonical_url` override; else derive from slug)
- [x] **SEO-05**: OG + Twitter card images (per-post `og_image`, fallback to feature image / site default)
- [x] **SEO-06**: Bangla-aware meta length validation (byte/reasonable char count, not Latin-character limits)
- [x] **SEO-07**: RSS feed (`/rss.xml` or `/feed.xml`) of published posts
- [x] **SEO-08**: Sitemap priority / changefreq metadata per content type

### Public Frontend

- [ ] **SITE-01**: Home page (featured / latest feed)
- [ ] **SITE-02**: `/blog` feed (latest / featured)
- [ ] **SITE-03**: Full blog archive (chronological + filterable)
- [ ] **SITE-04**: `/category/[slug]` category archive
- [ ] **SITE-05**: `/tag/[slug]` tag archive
- [ ] **SITE-06**: `/author/[slug]` author profile + their posts (byline pages)
- [ ] **SITE-07**: Single post page — Cache Components + `<Suspense>` (static Tiptap body + dynamic view count + related posts)
- [ ] **SITE-08**: `/search` page (Postgres full-text search) with filters (category, tag, date, author)
- [ ] **SITE-09**: About us (hard-coded TSX/MDX)
- [ ] **SITE-10**: Contact us (dashboard-managed content + working form → SMTP email; honeypot + rate-limit)
- [ ] **SITE-11**: T&C + Privacy (dashboard-managed `pages`)
- [ ] **SITE-12**: `not-found.tsx` 404 page
- [ ] **SITE-13**: Single-post extras — reading time (derived) + table of contents (from headings)
- [ ] **SITE-14**: Single-post extras — social share buttons + read-progress indicator
- [ ] **SITE-15**: Public draft preview route gated by preview token (consumes CONT-10)
- [ ] **SITE-16**: Dark mode applied to the public site
- [ ] **SITE-17**: View count display on posts (consumes a view-count write path)

### Analytics

- [ ] **ANAL-01**: Analytics integration via a `settings`-stored script/ID injected on the public site
- [ ] **ANAL-02**: Default platform — self-hosted Umami (privacy-friendly, free, self-hosted via Coolify); GA4/Plausible are swappable alternatives decided at deploy

### Performance & Deploy

- [ ] **PERF-01**: Public-site performance pass — Lighthouse / Core Web Vitals meets the non-negotiable bar
- [ ] **PERF-02**: Bundle-budget check enforcing no TailAdmin/editor JS leaking into the public chunk
- [ ] **PERF-03**: `revalidatePath` / `revalidateTag` audit — every mutating action triggers correct revalidation; publish→visible verified end-to-end
- [ ] **PERF-04**: Rate limiting on auth endpoints (sign-in, password reset)
- [ ] ~~**PERF-05**: Postgres backups scheduled~~ — **SUPERSEDED**: replaced by BACKUP-01..05 (new Phase 8 — Backup & Disaster Recovery). Backup system moved out of Phase 7 into its own configurable, dashboard-driven phase.
- [ ] **PERF-06**: Staging deployment on Coolify (git-push, managed SSL)

### Backup & Disaster Recovery

- [ ] **BACKUP-01**: Backup storage via the `lib/storage` abstraction; destinations local (default), Google Drive, Cloudflare R2 (multi-select, configurable in dashboard) — Cloudinary was considered and deliberately dropped (image-only, not suitable for DB dumps)
- [ ] **BACKUP-02**: Google Drive destination via Google OAuth / Drive API (research caveat: external dependency with mild tension vs the self-hosted / no-paid-API ethos — flag for Phase 8 research)
- [ ] **BACKUP-03**: Configurable schedule (frequency / RPO) + retention (keep N days/weeks) — tooling selection left to Phase 8 research (pg_dump cron, WAL-G, Coolify built-in, etc.)
- [ ] **BACKUP-04**: Automated restore-drill on a configurable cadence (restore to a throwaway DB, verify integrity, alert on failure) — closes the "backup-never-restored" gamble
- [ ] **BACKUP-05**: Backup Settings dashboard page (admin-only) — destinations, schedule, retention, restore-drill cadence; server-side admin permission check

## v2 Requirements

Deferred — tracked but not in the current roadmap. Moving any of these into v1 requires a roadmap update.

### Settings & Customization (fast-follow cluster)

- **SETT-01**: Menu builder (`menus`, `menu_items`, nested + ordered, dnd-kit)
- **SETT-02**: Header/footer custom-code injection (security-sensitive — gated behind a proven sanitization story)
- **SETT-03**: Redirects manager UI (table ships in v1 schema; UI deferred — greenfield DB means no urgent continuity)

### Content & Search

- **CONTv2-01**: Revision history / draft versions
- **SEARCH-01**: Meilisearch upgrade path if Postgres FTS relevance proves insufficient
- **SEARCH-02**: Bangla-aware Postgres FTS stemming (no built-in Bengali stemmer until partial PG 17 support)

### Scale & Ops

- **SCALE-01**: Multi-instance ISR — Redis-backed shared cache handler (needed before a second Coolify replica)

### Other

- **NOTF-01**: Newsletter / email marketing integration
- **COMM-01**: Comments / reader discussion (treated as a new milestone, not v1.x creep, if ever revisited)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Comments / reader discussion | "anydiscussion" is a brand name only; readers consume, not post |
| Full i18n routing / locale switching | Bangla content support is UTF-8 + fonts, not a translated UI |
| Content migration from another CMS | Greenfield database; no existing content to import |
| Paid third-party APIs | Hard constraint — avoid as a dependency |
| Vercel-specific tooling (Blob, KV, etc.) | Hard constraint — self-hosted on VPS |
| Reader-facing auth / open public sign-up | Auth is for the dashboard team only (admin creates users) |
| NextAuth / Prisma | Locked stack explicitly excludes them |
| Mobile app | Web-first; native later if ever |
| Freeform custom-code injection in v1 | Site-wide XSS vector; deferred (SETT-02) until sanitization story is proven |

## Traceability

Which phases cover which requirements. Updated during roadmap creation (Step 8).

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 — Foundation | Complete |
| FOUND-02 | Phase 1 — Foundation | Complete |
| FOUND-03 | Phase 1 — Foundation | Complete |
| FOUND-04 | Phase 1 — Foundation | Complete |
| FOUND-05 | Phase 1 — Foundation | Complete |
| FOUND-06 | Phase 1 — Foundation | Complete |
| AUTH-01 | Phase 2 — Auth + RBAC | Complete |
| AUTH-02 | Phase 2 — Auth + RBAC | Complete |
| AUTH-03 | Phase 2 — Auth + RBAC | Complete |
| AUTH-04 | Phase 2 — Auth + RBAC | Complete |
| AUTH-05 | Phase 2 — Auth + RBAC | Complete |
| AUTH-06 | Phase 2 — Auth + RBAC | Complete |
| AUTH-07 | Phase 2 — Auth + RBAC | Complete |
| AUTH-08 | Phase 2 — Auth + RBAC | Complete |
| CONT-01 | Phase 3 — Content Engine | Pending |
| CONT-02 | Phase 3 — Content Engine | Pending |
| CONT-03 | Phase 3 — Content Engine | Pending |
| CONT-04 | Phase 3 — Content Engine | Pending |
| CONT-05 | Phase 3 — Content Engine | Pending |
| CONT-06 | Phase 3 — Content Engine | Pending |
| CONT-07 | Phase 3 — Content Engine | Pending |
| CONT-08 | Phase 3 — Content Engine | Pending |
| CONT-09 | Phase 3 — Content Engine | Pending |
| CONT-10 | Phase 3 — Content Engine | Pending |
| CONT-11 | Phase 3 — Content Engine | Pending |
| MEDIA-01 | Phase 3 — Content Engine | Pending |
| MEDIA-02 | Phase 3 — Content Engine | Pending |
| MEDIA-03 | Phase 3 — Content Engine | Pending |
| MEDIA-04 | Phase 3 — Content Engine | Pending |
| DASH-01 | Phase 4 — Dashboard Chrome | Complete |
| DASH-02 | Phase 4 — Dashboard Chrome | Complete |
| DASH-03 | Phase 4 — Dashboard Chrome | Complete |
| DASH-04 | Phase 4 — Dashboard Chrome | Complete |
| DASH-05 | Phase 4 — Dashboard Chrome | Complete |
| DASH-06 | Phase 4 — Dashboard Chrome | Complete |
| DASH-07 | Phase 4 — Dashboard Chrome | Complete |
| DASH-08 | Phase 4 — Dashboard Chrome | Complete |
| DASH-09 | Phase 4 — Dashboard Chrome | Complete |
| SEO-01 | Phase 5 — SEO Basics | Complete |
| SEO-02 | Phase 5 — SEO Basics | Complete |
| SEO-03 | Phase 5 — SEO Basics | Complete |
| SEO-04 | Phase 5 — SEO Basics | Complete |
| SEO-05 | Phase 5 — SEO Basics | Complete |
| SEO-06 | Phase 5 — SEO Basics | Complete |
| SEO-07 | Phase 5 — SEO Basics | Complete |
| SEO-08 | Phase 5 — SEO Basics | Complete |
| SITE-01 | Phase 6 — Public Frontend | Pending |
| SITE-02 | Phase 6 — Public Frontend | Pending |
| SITE-03 | Phase 6 — Public Frontend | Pending |
| SITE-04 | Phase 6 — Public Frontend | Pending |
| SITE-05 | Phase 6 — Public Frontend | Pending |
| SITE-06 | Phase 6 — Public Frontend | Pending |
| SITE-07 | Phase 6 — Public Frontend | Pending |
| SITE-08 | Phase 6 — Public Frontend | Pending |
| SITE-09 | Phase 6 — Public Frontend | Pending |
| SITE-10 | Phase 6 — Public Frontend | Pending |
| SITE-11 | Phase 6 — Public Frontend | Pending |
| SITE-12 | Phase 6 — Public Frontend | Pending |
| SITE-13 | Phase 6 — Public Frontend | Pending |
| SITE-14 | Phase 6 — Public Frontend | Pending |
| SITE-15 | Phase 6 — Public Frontend | Pending |
| SITE-16 | Phase 6 — Public Frontend | Pending |
| SITE-17 | Phase 6 — Public Frontend | Pending |
| ANAL-01 | Phase 6 — Public Frontend | Pending |
| ANAL-02 | Phase 6 — Public Frontend | Pending |
| PERF-01 | Phase 7 — Performance & Deploy | Pending |
| PERF-02 | Phase 7 — Performance & Deploy | Pending |
| PERF-03 | Phase 7 — Performance & Deploy | Pending |
| PERF-04 | Phase 7 — Performance & Deploy | Pending |
| ~~PERF-05~~ | ~~Phase 7~~ — **SUPERSEDED**, moved to Phase 8 (BACKUP-01..05) | Superseded |
| PERF-06 | Phase 7 — Performance & Deploy | Pending |
| BACKUP-01 | Phase 8 — Backup & Disaster Recovery | Pending |
| BACKUP-02 | Phase 8 — Backup & Disaster Recovery | Pending |
| BACKUP-03 | Phase 8 — Backup & Disaster Recovery | Pending |
| BACKUP-04 | Phase 8 — Backup & Disaster Recovery | Pending |
| BACKUP-05 | Phase 8 — Backup & Disaster Recovery | Pending |

**Coverage:**

- v1 requirements: 75 total (69 original + MEDIA-04, DASH-09, BACKUP-01..05 added; PERF-05 superseded — net 69 + 7 - 1 = 75)
- Mapped to phases: 75 (100%)
- Unmapped: 0

**Per-phase counts:**

- Phase 1 — Foundation: 6 (FOUND-01..06)
- Phase 2 — Auth + RBAC: 8 (AUTH-01..08)
- Phase 3 — Content Engine: 15 (CONT-01..11, MEDIA-01..04)
- Phase 4 — Dashboard Chrome: 9 (DASH-01..09)
- Phase 5 — SEO Basics: 8 (SEO-01..08)
- Phase 6 — Public Frontend: 19 (SITE-01..17, ANAL-01..02)
- Phase 7 — Performance & Deploy: 5 (PERF-01..04, PERF-06 — PERF-05 superseded/moved to Phase 8)
- Phase 8 — Backup & Disaster Recovery: 5 (BACKUP-01..05)

---
*Requirements defined: 2026-07-01*
*Last updated: 2026-07-02 — in-place revision: storage-provider abstraction (MEDIA-01..04, DASH-09), backups moved to new Phase 8 (BACKUP-01..05), PERF-05 superseded. Traceability re-validated (75/75 mapped).*
