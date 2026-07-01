# Any Discussion

## What This Is

A custom-built, self-hosted blog CMS for **anydiscussion.com** — not WordPress. One Next.js 16 app serves both a public-facing blog (extremely fast: ISR/PPR, minimal client JS) and an auth-gated, role-based admin dashboard (more JS-heavy, not optimizing for public Core Web Vitals), backed by one PostgreSQL database. English UI with Bangla content allowed (UTF-8, not a translated UI). Brand identity: clean, fast, professional.

## Core Value

Editors/authors can publish well-optimized blog posts and readers can consume them at maximum speed — the public blog must be fast and SEO-sound, and the dashboard must let a small team manage the full content lifecycle (draft → review → publish) without touching code.

## Requirements

### Validated

(None yet — ship to validate)

### Active

<!-- v1 scope = Authoring + public-site MVP. All hypotheses until shipped. -->

**Foundation**
- [ ] Next.js 16 App Router app, Server Components by default, Server Actions for mutations
- [ ] Drizzle ORM + Postgres connection; base schema migrated via drizzle-kit (users, posts, post_seo, categories, tags, post_tags, media, settings, **pages**)
- [ ] Cloudflare R2 wired for media (S3-compatible) with a CDN domain (cdn.anydiscussion.com)

**Auth + RBAC**
- [ ] Better Auth with the admin/RBAC plugin; roles `admin`, `editor`, `author`
- [ ] Middleware route-level gate on the `(admin)` group + server-side permission checks on every mutating Server Action
- [ ] Author → submit-for-review → editor/admin-approve → publish workflow enforced server-side

**Content engine**
- [ ] Posts CRUD with Tiptap (ProseMirror) editor; statuses draft / pending_review / published
- [ ] Categories + tags (tags fully in v1, including public tag archive pages)
- [ ] R2 media library: upload, alt text, sharp server-side resize, `next/image` with R2/CDN loader

**Dashboard chrome**
- [ ] TailAdmin components wired to real data: posts list/new/edit, categories, tags, media library, users + roles
- [ ] Dashboard-managed **pages** section for legal (T&C, Privacy) and Contact content
- [ ] React Hook Form + Zod (shared server-side) for forms; TanStack Query for dashboard mutations/optimistic UI

**SEO basics**
- [ ] `generateMetadata` per route sourced from `post_seo` / `settings`
- [ ] Dynamic `sitemap.ts` (published posts/pages), JSON-LD Article schema per post, canonical handling, OG images

**Public frontend (ISR/PPR-first, minimal client JS)**
- [ ] Home (feed/featured) and `/blog` (latest/featured feed)
- [ ] Full blog archive (chronological + filterable) — distinct from the `/blog` feed
- [ ] Category archive (`/category/[slug]`) and tag archive (`/tag/[slug]`)
- [ ] Single post page (Tiptap body, ISR/PPR)
- [ ] Search page
- [ ] About us (**hard-coded** TSX/MDX)
- [ ] Contact us (**dashboard-managed** content + working contact **form → SMTP email**, honeypot + rate-limit, self-hosted, no paid API)
- [ ] T&C + Privacy (**dashboard-managed** legal pages)
- [ ] 404 (`not-found.tsx`)

**Performance & deploy**
- [ ] `revalidatePath`/`revalidateTag` on publish/update; no client fetching for server-renderable content; lean initial dashboard load (lazy-load heavy editor/charts)
- [ ] Staging deployment on Coolify (git-push, SSL)

### Out of Scope

- **Menu builder** — fast-follow after v1 (CLAUDE.md scope, deferred to keep MVP lean)
- **Header/footer custom-code injection** — fast-follow after v1
- **Redirects manager** — fast-follow; greenfield DB with no migration, so slug-change continuity is not urgent for v1
- **Comments / reader discussion** — "anydiscussion" is a brand name only; readers consume, they do not post
- **Content migration** — starting fresh, empty database; no import from WordPress or any other source
- **i18n routing / locale switching** — Bangla content support is UTF-8 + font handling, not a translated UI
- **Newsletter / email marketing** — not part of this project
- **Vercel-specific tooling (Vercel Blob, Vercel KV, etc.)** — hard constraint; self-hosted on VPS
- **Paid third-party APIs** — hard constraint; avoid as a dependency
- **Reader-facing auth** — auth is for the dashboard team only (no comments ⇒ no public accounts)

## Context

- **Existing scaffold:** The repo already contains the TailAdmin *free-nextjs-admin-dashboard* (installed via pnpm). Keep the `(admin)` shell and reusable demo components (calendar, profile, form/table/header/ui kits). Remove the `ecommerce/` demo folder and drop unused chart/table demos once real ones exist. New dashboard feature pages sit as siblings to `(others-pages)` / `(ui-elements)`, not nested inside them.
- **Public/dashboard isolation:** `app/(site)` and `app/(admin)` stay physically separate so the public site never pulls in dashboard JS or TailAdmin client-heavy components.
- **Domain & CDN:** anydiscussion.com (public + dashboard); planned media CDN at cdn.anydiscussion.com backed by Cloudflare R2.
- **Bangla content:** purely a UTF-8 + font-handling concern. Do not assume Latin-based character/byte limits for meta description validation.
- **Traffic profile:** designing for *growing* traffic (tens of thousands/month) — ISR + CDN + aggressive image optimization matter; R2 egress worth watching. Not optimizing for viral-scale spikes yet.
- **Team:** small fixed team (2–5 people, added by hand) using the dashboard in v1 — full RBAC and the review/publish workflow must genuinely work, not just exist in code.
- **Branding:** no logo/palette/typefaces yet; default to clean/fast/professional and refine during the UI design phase.
- **Reference:** `CLAUDE.md` at repo root is the authoritative source for stack, conventions, folder structure, schema reference, and "what NOT to do." Where this document and CLAUDE.md overlap, CLAUDE.md wins on mechanics; this document wins on v1 scope decisions.

## Constraints

- **Tech stack (locked):** Next.js 16 App Router, Drizzle ORM + drizzle-kit, PostgreSQL, Better Auth (+admin/RBAC plugin), Tiptap, React Hook Form + Zod, TanStack Query, Cloudflare R2, dnd-kit, isomorphic-dompurify, Coolify. Do not suggest NextAuth, Prisma, or alternatives unless asked.
- **Package manager:** pnpm only — never npm or yarn, in commands/scripts/READMEs/CI.
- **Performance:** public pages ISR/static by default; PPR where pages mix static body + dynamic related content; `next/image` only (never raw `<img>`); `revalidatePath`/`revalidateTag` on publish — no polling or full rebuilds.
- **Security:** every mutating Server Action starts with a role/permission check; sanitize any raw HTML/JS field (custom code, embeds) before storage **and** before render; never rely on UI hiding alone.
- **Self-hosted / no paid APIs:** VPS via Coolify; no Vercel-specific or paid third-party APIs without explicit approval.
- **Migrations:** generate via `drizzle-kit generate` after schema changes — never hand-write SQL.
- **Timeline:** no hard deadline; sequence for correctness and the non-negotiable perf/SEO bar.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| v1 = authoring + public-site MVP | Ship an independently-useful blog (author + read) before polishing settings/chrome; quality-first, no deadline pressure | — Pending |
| Greenfield DB, no content migration | No existing content to import | — Pending |
| No comments / reader discussion | "anydiscussion" is a brand name; readers consume only — keeps auth scoped to the dashboard team | — Pending |
| Add a lightweight `pages` table for legal + contact pages | T&C, Privacy, and Contact need non-dev edits; extends the CLAUDE.md schema (which has no `pages` table) | — Pending |
| About us hard-coded (TSX/MDX) | Rarely-changing marketing page; avoid schema/routing overhead | — Pending |
| Contact form → SMTP email (no DB storage) | Sufficient for a small team; self-hosted, no paid API; honeypot + rate-limit for spam | — Pending |
| Tag archive pages (`/tag/[slug]`) in v1 | SEO + browse value worth the marginal cost over a category-only archive | — Pending |
| `/blog` feed vs full archive split | `/blog` = engaging latest/featured feed; archive = complete chronological/filterable list | — Pending |
| Branding deferred to UI phase | No assets yet; default clean/professional, refine during build | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-02 — Phase 1 (Foundation) complete: Next.js 16 config (cacheComponents/standalone/CDN loader), 8-table Drizzle schema + first migration (zero hand-written SQL), R2/sharp media pipeline, (site)/(admin) ESLint isolation. FOUND-01..06 validated. Dev ports remapped to 5435/5436 (host 5432/5433 taken by sibling projects).*
