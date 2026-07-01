# Requirements: Any Discussion

**Defined:** 2026-07-01
**Core Value:** Editors/authors can publish well-optimized blog posts and readers can consume them at maximum speed — fast/SEO-sound public blog + a dashboard that lets a small team manage the full content lifecycle (draft → review → publish) without touching code.

## v1 Requirements

v1 = authoring + public-site MVP, extended with the full agreed feature set. Each requirement maps to exactly one roadmap phase (traceability filled during roadmap creation).

### Foundation

- [ ] **FOUND-01**: Next.js 16 app configured for the locked stack — App Router, `cacheComponents:true` (PPR), Turbopack, `output:"standalone"`, custom `next/image` loader pointed at cdn.anydiscussion.com
- [ ] **FOUND-02**: Drizzle ORM + Postgres connection established (`db/` client instance, `drizzle.config.ts`)
- [ ] **FOUND-03**: Base schema defined and first migration generated via `drizzle-kit generate` (posts, post_seo, categories, tags, post_tags, media, settings, pages — 8 tables; the `users` table is deferred to Phase 2 per D-07, where Better Auth generates it)
- [ ] **FOUND-04**: `app/(site)` and `app/(admin)` route-group isolation enforced (ESLint `no-restricted-imports` preventing cross-group imports; public bundle stays free of TailAdmin/editor JS)
- [ ] **FOUND-05**: Cloudflare R2 client + `sharp` resize-at-upload pipeline in `lib/r2`
- [ ] **FOUND-06**: Drizzle migration hygiene — generate-then-commit-in-same-PR + clean-room migration test (empty Postgres ← all migrations reproduces schema)

### Auth & RBAC

- [ ] **AUTH-01**: Better Auth configured with the `admin` plugin; roles `admin`, `editor`, `author` via `createAccessControl`
- [ ] **AUTH-02**: Sign-in page working; user accounts created by an admin in the dashboard (no open public sign-up)
- [ ] **AUTH-03**: `proxy.ts` cookie-existence gate redirecting unauthenticated users away from `(admin)`
- [ ] **AUTH-04**: `lib/permissions` helpers (`requireRole`, `requireCan`, `assertOwnsPost`); every mutating Server Action starts with the appropriate server-side check
- [ ] **AUTH-05**: Author → submit-for-review → editor/admin-approve → publish workflow enforced server-side via post status
- [ ] **AUTH-06**: Password reset via email link (Better Auth default + SMTP)
- [ ] **AUTH-07**: Email verification on account creation (Better Auth default + SMTP)
- [ ] **AUTH-08**: Author profile fields on `users` (bio, avatar) to support byline/author pages

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

- [ ] **MEDIA-01**: Upload to R2 via presigned URL (client direct-to-R2, avoiding VPS egress) + `sharp` resize-at-upload producing optimized variants
- [ ] **MEDIA-02**: Media library — `media` records (R2 key, alt text, `uploaded_by`, dimensions) + dashboard browser
- [ ] **MEDIA-03**: All content images served through `next/image` with the R2/CDN custom loader (never raw `<img>`)

### Dashboard Chrome

- [ ] **DASH-01**: TailAdmin posts list / new / edit pages wired to real data
- [ ] **DASH-02**: Categories + tags management UI
- [ ] **DASH-03**: Media library browser UI
- [ ] **DASH-04**: Users + roles management UI (admin only — create/disable users, assign role)
- [ ] **DASH-05**: Pages management UI (T&C, Privacy, Contact content) using the same Tiptap editor
- [ ] **DASH-06**: Forms via React Hook Form + Zod (schema shared server-side for Server Action validation); TanStack Query for mutations/optimistic UI
- [ ] **DASH-07**: Remove `ecommerce/` demo + unused chart/table demos; keep initial dashboard load lean (lazy-load editor/charts)
- [ ] **DASH-08**: Dark mode applied to the dashboard (existing ThemeContext)

### SEO

- [ ] **SEO-01**: `generateMetadata` per public route sourced from `post_seo` / `settings`
- [ ] **SEO-02**: Dynamic `sitemap.ts` (published posts + pages) + `robots.ts`
- [ ] **SEO-03**: JSON-LD `BlogPosting` schema per post
- [ ] **SEO-04**: Canonical handling (respect `canonical_url` override; else derive from slug)
- [ ] **SEO-05**: OG + Twitter card images (per-post `og_image`, fallback to feature image / site default)
- [ ] **SEO-06**: Bangla-aware meta length validation (byte/reasonable char count, not Latin-character limits)
- [ ] **SEO-07**: RSS feed (`/rss.xml` or `/feed.xml`) of published posts
- [ ] **SEO-08**: Sitemap priority / changefreq metadata per content type

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
- [ ] **PERF-05**: Postgres backups scheduled
- [ ] **PERF-06**: Staging deployment on Coolify (git-push, managed SSL)

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
| FOUND-01 | Phase 1 — Foundation | Pending |
| FOUND-02 | Phase 1 — Foundation | Pending |
| FOUND-03 | Phase 1 — Foundation | Pending |
| FOUND-04 | Phase 1 — Foundation | Pending |
| FOUND-05 | Phase 1 — Foundation | Pending |
| FOUND-06 | Phase 1 — Foundation | Pending |
| AUTH-01 | Phase 2 — Auth + RBAC | Pending |
| AUTH-02 | Phase 2 — Auth + RBAC | Pending |
| AUTH-03 | Phase 2 — Auth + RBAC | Pending |
| AUTH-04 | Phase 2 — Auth + RBAC | Pending |
| AUTH-05 | Phase 2 — Auth + RBAC | Pending |
| AUTH-06 | Phase 2 — Auth + RBAC | Pending |
| AUTH-07 | Phase 2 — Auth + RBAC | Pending |
| AUTH-08 | Phase 2 — Auth + RBAC | Pending |
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
| DASH-01 | Phase 4 — Dashboard Chrome | Pending |
| DASH-02 | Phase 4 — Dashboard Chrome | Pending |
| DASH-03 | Phase 4 — Dashboard Chrome | Pending |
| DASH-04 | Phase 4 — Dashboard Chrome | Pending |
| DASH-05 | Phase 4 — Dashboard Chrome | Pending |
| DASH-06 | Phase 4 — Dashboard Chrome | Pending |
| DASH-07 | Phase 4 — Dashboard Chrome | Pending |
| DASH-08 | Phase 4 — Dashboard Chrome | Pending |
| SEO-01 | Phase 5 — SEO Basics | Pending |
| SEO-02 | Phase 5 — SEO Basics | Pending |
| SEO-03 | Phase 5 — SEO Basics | Pending |
| SEO-04 | Phase 5 — SEO Basics | Pending |
| SEO-05 | Phase 5 — SEO Basics | Pending |
| SEO-06 | Phase 5 — SEO Basics | Pending |
| SEO-07 | Phase 5 — SEO Basics | Pending |
| SEO-08 | Phase 5 — SEO Basics | Pending |
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
| PERF-05 | Phase 7 — Performance & Deploy | Pending |
| PERF-06 | Phase 7 — Performance & Deploy | Pending |

**Coverage:**
- v1 requirements: 69 total
- Mapped to phases: 69 (100%)
- Unmapped: 0

**Per-phase counts:**
- Phase 1 — Foundation: 6 (FOUND-01..06)
- Phase 2 — Auth + RBAC: 8 (AUTH-01..08)
- Phase 3 — Content Engine: 14 (CONT-01..11, MEDIA-01..03)
- Phase 4 — Dashboard Chrome: 8 (DASH-01..08)
- Phase 5 — SEO Basics: 8 (SEO-01..08)
- Phase 6 — Public Frontend: 19 (SITE-01..17, ANAL-01..02)
- Phase 7 — Performance & Deploy: 6 (PERF-01..06)

---
*Requirements defined: 2026-07-01*
*Last updated: 2026-07-01 after roadmap creation — traceability filled (69/69 mapped)*
