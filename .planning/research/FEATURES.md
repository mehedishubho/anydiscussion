# Feature Research

**Domain:** Self-hosted blog CMS (public frontend + admin dashboard) — custom-built, Next.js 16 + Postgres
**Researched:** 2026-06-30
**Confidence:** HIGH for scope/alignment (PROJECT.md is authoritative), MEDIUM for external technical specifics (live docs re-verification limited by an upstream web-tool rate limit through 2026-07-12; the load-bearing facts below are stable, well-established specs and match the locked stack in `CLAUDE.md`)

> **Scope note.** This document answers "what features does a production blog CMS have?" and categorizes them as table stakes / differentiators / anti-features **for this specific project**, cross-checked against `.planning/PROJECT.md`. Where PROJECT.md already makes a v1-vs-defer decision, that is marked explicitly. The stack is **locked** (`CLAUDE.md`) — this research does not propose alternative libraries.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features readers or the dashboard team assume exist. Missing one makes the CMS feel broken. **All items here are in PROJECT.md v1 Active scope unless tagged `[fast-follow]`.**

#### Content lifecycle & authoring

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Posts CRUD (create / read / update / delete) | A CMS that can't edit posts isn't a CMS | MEDIUM | Server Actions grouped in `actions/posts.ts`; Drizzle queries; React Hook Form + Zod (shared schema) |
| Rich-text editor (Tiptap) | Plain-textarea blogs feel like 2005 | HIGH | Tiptap (ProseMirror) wrapper in `components/editor/`; **store ProseMirror JSON** via `getJSON()` in `posts.content`; render via `generateHTML(json, extensions)` on server for ISR/PPR pages. Must register the same extension set on both editor and renderer, or content renders inconsistently |
| Content statuses: `draft` / `pending_review` / `published` | The review workflow has nowhere to live without these | LOW (enum) / MEDIUM (state machine) | Status column + **server-enforced transition rules** (see Pitfalls); never trust a client-sent status |
| Author → review → publish workflow | PROJECT.md Core Value: a small team manages the full lifecycle without touching code | MEDIUM | Author submits (`draft→pending_review`); editor/admin approves (`pending_review→published`). Server Action must check both **role** and **ownership/state** |
| Categories (single per post) + tags (many) | Standard blog navigation/taxonomy | MEDIUM | `categories`, `tags`, `post_tags` join; `category_id` on post. Both in v1 (PROJECT.md explicitly keeps tags + tag archive pages) |
| Excerpt / summary field | Needed for post cards, feeds, meta description fallback | LOW | Either a dedicated column or a derived slice of content |
| Slug (URL-safe, unique) | Pretty URLs are non-negotiable for SEO | LOW | Stored on `post_seo.slug`; uniqueness check; Bangla-aware (don't assume ASCII) |
| Feature/cover image per post | Every post card and OG image expects this | LOW | `posts.feature_image` = R2 key; `next/image` with R2/CDN loader |
| Autosave / draft persistence | Losing a long draft is a trust-destroying bug | MEDIUM | Not explicitly listed in PROJECT.md Active — **flag for requirements confirmation**. Minimum: manual save; recommended: debounced autosave of JSON |

#### Media library

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Upload to R2 (S3-compatible) | PROJECT.md: R2 only, never local disk/Postgres | MEDIUM | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, endpoint `https://{ACCOUNT_ID}.r2.cloudflarestorage.com`, region `auto`. **Recommend presigned PUT URLs** (client uploads direct to R2) to avoid routing media through the VPS |
| Server-side image resize (`sharp`) | Don't store/serving multi-MB originals | MEDIUM | Resize to a sane max width on upload; generate web-friendly variants; `sharp` is the PROJECT.md-mandated tool. (pnpm may block its postinstall — run `pnpm approve-builds`) |
| `next/image` with custom R2/CDN loader | Public-site performance is non-negotiable | LOW | Custom loader pointing at `cdn.anydiscussion.com`; never raw `<img>` |
| Alt text on media | Accessibility + SEO; readers expect it even if authors skip it | LOW | `media.alt_text` column; required-ish in the editor UX |
| Media browser (dashboard) | Reuse previously-uploaded images instead of re-uploading | MEDIUM | `app/(admin)/media/` TailAdmin table; list, search, copy-key, delete |

#### Roles & permissions

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Three roles: `admin` / `editor` / `author` | PROJECT.md mandates this exact set | MEDIUM | Better Auth + admin/RBAC plugin; **role enum on User + permission map in code** is the documented pattern (dynamic role creation is an active feature request, not built-in). The admin plugin's default roles can be overridden |
| Server-side permission check on **every** mutating Server Action | UI hiding alone is not security | LOW (per action) / MEDIUM (discipline) | PROJECT.md + CLAUDE.md: every mutating action starts with a role/permission check; also re-check **resource ownership** for authors |
| Middleware route-level gate on `(admin)` | Stop unauthenticated users at the edge, not at the page | LOW | matcher on `(admin)/` group; Better Auth session cookie |
| User management UI (admin only) | Hand-added team of 2–5; admins must add/remove editors | MEDIUM | `app/(admin)/users/`; invite or create; assign role; disable |

#### Public frontend (ISR/PPR-first)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Home page (feed / featured) | The front door | MEDIUM | Server Component, ISR; featured posts + latest feed |
| `/blog` feed (latest + featured) | Distinct from full archive — engaging entry to recent content | MEDIUM | PROJECT.md Key Decision: `/blog` = engaging latest/featured feed |
| Full archive (chronological + filterable) | Readers (and SEO) need the complete index | MEDIUM | Distinct from `/blog`; filter by category/tag; pagination |
| Category archive `/category/[slug]` | Standard blog IA + SEO landing pages | LOW | `generateMetadata`, ISR, JSON-LD `CollectionPage` |
| Tag archive `/tag/[slug]` | PROJECT.md keeps tags + tag archives in v1 (SEO + browse value) | LOW | Same shape as category archive |
| Single post `/[slug]` | The actual product | HIGH | ISR + **PPR**: static post body + dynamic related-posts/view-count holes via `<Suspense>`; `generateMetadata` from `post_seo`; JSON-LD `BlogPosting` |
| Search page | Readers expect to search; also internal nav | MEDIUM | **Postgres full-text search** (`tsvector`/`tsquery`, GIN index, `websearch_to_tsquery`) — already in the stack, no new infra. Sufficient for the traffic profile (tens of thousands/month, small corpus). Upgrade path: self-hosted Meilisearch when relevance/typo-tolerance matters |
| `404` (`not-found.tsx`) | Missing | LOW | PROJECT.md Active |
| About us (`hard-coded` TSX/MDX) | Rarely-changing marketing page | LOW | PROJECT.md Key Decision: hard-coded, no schema/routing overhead |
| Contact us (dashboard-managed content + **working form → SMTP**) | Readers expect a way to reach the team | MEDIUM | Server Action → Nodemailer/SMTP, **no DB storage** of submissions in v1. Spam: **honeypot + rate-limit** (self-hosted, no paid API). Content of the page itself is dashboard-managed via the `pages` table |
| T&C + Privacy (dashboard-managed legal pages) | Legal pages must be editable without a dev | LOW–MEDIUM | PROJECT.md Active; uses the lightweight `pages` table (extends CLAUDE.md schema) |

#### SEO basics

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `generateMetadata` per route | Modern Next.js SEO primitive; readers' link previews depend on it | MEDIUM | Sourced from `post_seo` / `settings`; Next.js **deep-merges** root-layout → nested-layout → page metadata; child overrides parent. File conventions (`opengraph-image.tsx`, `robots.ts`, `sitemap.ts`, `icon.tsx`) auto-recognized |
| Dynamic `sitemap.ts` (posts + pages) | Search engines expect it; readers don't but SEO depends on it | LOW | `MetadataRoute.Sitemap`; only published items |
| JSON-LD `BlogPosting` per post | Rich results / entity recognition | LOW | `<script type="application/ld+json>`; fields: `headline`, `image`, `datePublished`, `dateModified`, `author` (Person), `publisher` (Organization + logo), `mainEntityOfPage` |
| Canonical URL handling | Avoid duplicate-content penalties (slug changes, syndication) | LOW | `post_seo.canonical_url` override else derive from slug |
| OpenGraph + Twitter Card meta | Link previews on social/messaging drive traffic | LOW | `openGraph:{...}` + `twitter:{...}` keys; OG image ~1200×630; `summary_large_image` card; image from R2/CDN |
| `robots.ts` | Tell crawlers what's indexable + where the sitemap is | LOW | Static route convention |
| Fast, server-rendered content (ISR/PPR) | Core Web Vitals = SEO + reader retention | HIGH | `revalidatePath`/`revalidateTag` on publish/update; no client-fetching for server-renderable content |

#### Auth & contact

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Dashboard auth (sign in) | Required to enter `(admin)` | MEDIUM | Better Auth wired in `(auth)` route group; session cookie |
| Password reset / email verification | Token-rotation basics; without it, lockouts are fatal | MEDIUM | Better Auth built-ins; SMTP required (reuse contact-form SMTP) — **flag for requirements confirmation** if not already implied |
| Contact form spam protection | A form without protection is a spam firehose within a week | LOW | Honeypot + per-IP rate limit in middleware/server action. (reCAPTCHA avoided: Google tracking + UX cost) |

---

### Differentiators (Competitive Advantage)

Not expected, but valuable. **For this project, "differentiator" mostly means "executing the table stakes unusually well"** — the brand promise is *clean, fast, professional*, so performance and SEO execution are where this product wins, not feature breadth.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **ISR + PPR public site, near-zero client JS** | Beats WordPress/Ghost-on-bloated-theme on Core Web Vitals; readers feel it instantly | HIGH | This is the core competitive lever. Static post body + dynamic holes via Suspense. Public route group `(site)` stays physically isolated from `(admin)` so no TailAdmin JS leaks onto public pages |
| **Self-hosted, no paid-API lock-in** | Cost-predictable at scale; full data ownership; no Vercel/Vercel-Blob/Vercel-KV dependency | MEDIUM | R2 (egress-free reads via CDN) + VPS via Coolify is a strong economic story vs hosted CMS pricing |
| **Proper review workflow enforced server-side** | Most lightweight CMSes bolt on roles as an afterthought; a genuinely-working author→review→publish flow is a real advantage for a small editorial team | MEDIUM | State-machine + role + ownership checks in every Server Action |
| **Editorial media pipeline (sharp + R2 CDN + next/image)** | Crisp images, automatic sizing, CDN delivery — visually better than most self-hosted blogs | MEDIUM | Presigned uploads, server-side resize on entry, CDN-served variants |
| **Dashboard-managed legal + contact content** | Non-devs can edit T&C/Privacy/Contact copy without a deploy | LOW | The lightweight `pages` table is a small but meaningful differentiator vs hard-coding |
| **SEO discipline baked in** (canonical, redirects-ready, JSON-LD, OG) | Long-tail organic discovery from day one | MEDIUM | The **redirects manager** is the v1-fast-follow that closes the loop on slug-change SEO continuity |
| **Search that just works without external deps** | Postgres FTS means search ships with v1, no Algolia bill | MEDIUM | Good relevance up to ~100k posts; clean upgrade path to Meilisearch |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features to **deliberately NOT build**. All entries here are confirmed in PROJECT.md "Out of Scope" and/or CLAUDE.md "What NOT to do." Documenting them now prevents scope creep during requirements.

| Feature | Why Requested | Why Problematic (for this project) | Alternative |
|---------|---------------|------------------------------------|-------------|
| **Comments / reader discussion** | Brand name is "anydiscussion" | "anydiscussion" is a brand name only. Comments force reader auth, moderation tooling, spam defense at scale, and a second auth realm — all out of scope. PROJECT.md: readers consume, they don't post | No comments. A future v2 discussion surface, if ever, would be its own milestone |
| **Reader-facing auth / public accounts** | Comments, bookmarks, personalized feeds all want it | With no comments, there's no reader-facing mutation requiring identity. Adds a whole auth surface for zero v1 value | Auth stays scoped to the dashboard team (admin/editor/author) |
| **Full i18n routing / locale switching** | "Bangla content" sounds like a translated UI is needed | PROJECT.md/CLAUDE.md: Bangla support is **UTF-8 + font handling**, not a multi-locale site. i18n routing doubles the URL space, SEO complexity, and QA surface | Single locale, English UI, UTF-8 content. Validate meta length by byte/char, not Latin assumptions |
| **Newsletter / email marketing** | Blog + newsletter is a common bundle | Adds a subscriber DB, double-opt-in flow, unsubscribe compliance, deliverability work — a separate product surface. PROJECT.md: out of scope | Defer entirely. Contact form covers "reach us." A newsletter milestone, if ever, is separate |
| **Paid third-party APIs** (Algolia, reCAPTCHA, Vercel Blob, etc.) | Faster to integrate than self-hosted alternatives | Hard constraint in PROJECT.md/CLAUDE.md: avoid paid-API dependencies. Cost unpredictability, vendor lock-in, and a billing dependency on a side project | Postgres FTS (search), honeypot+rate-limit (spam), R2 (media), SMTP (email) |
| **Vercel-specific tooling** (Vercel Blob, Vercel KV, etc.) | Default Next.js examples use them | Self-hosted on a VPS via Coolify; Vercel-specific APIs break portability and create lock-in | R2 for storage; Postgres + in-memory/Redis-if-needed for caching |
| **Menu builder** | "Real CMSes let admins edit nav menus" | PROJECT.md: **fast-follow after v1** — deferred to keep MVP lean. Greenfield launch can ship with code-defined nav | `[fast-follow]` Hard-code nav in v1; build menu builder (`menus`/`menu_items` already in schema ref) once settings phase lands |
| **Header/footer custom-code injection** | "Let admins paste analytics/GTM scripts" | PROJECT.md: **fast-follow**. Security-sensitive (raw HTML/JS injection needs isomorphic-dompurify on store **and** render) and not needed for launch | `[fast-follow]` Code-embed analytics in v1; build the managed injection field post-launch with sanitization |
| **Redirects manager** | "Slug changes need 301s for SEO" | PROJECT.md: **fast-follow** — greenfield DB, no existing slugs to preserve, so continuity isn't urgent for v1 | `[fast-follow]` Hard-code any one-off 301s in middleware initially; build the `redirects` table UI post-launch. Note: schema already has `redirects` table ref, so the table can ship early even if the UI defers |
| **Content migration / WordPress import** | Existing blogs want to move over | PROJECT.md: starting fresh, empty DB, no content to import | Skip. If a migration ever becomes needed, it's its own milestone |
| **Ecommerce / sales-dashboard features** (TailAdmin demo folder) | TailAdmin ships with `ecommerce/` components | Not this product's domain; pulls dead code into the bundle | Remove `ecommerce/` folder; drop unused chart/table demos once real dashboard pages exist |

---

## Feature Dependencies

```
[Drizzle schema migrated] ──────────────────────────────────────┐
   │                                                            │
   ├──> [Better Auth + RBAC plugin] ──> [Middleware (admin) gate]──┐
   │         │                                                      │
   │         └──> [permission helper] ──> [every mutating Server Action]
   │                                                                │
   ├──> [Posts CRUD] ──> [Tiptap editor (getJSON storage)] ──┐      │
   │              │                                          │      │
   │              ├──> [Statuses + review workflow]          │      │
   │              ├──> [Categories + tags]                   │      │
   │              └──> [post_seo (slug, meta, OG, canonical)] │      │
   │                                                          │      │
   ├──> [R2 media + sharp + next/image loader] ──enhances──> [Posts]
   │         │                                                │      │
   │         └──> [Media library browser]                     │      │
   │                                                          │      │
   └──> [pages table] ──> [Contact (form→SMTP) + T&C + Privacy]      │
                                                                    │
[Public (site) route group]                                         │
   ├──> [Home + /blog feed] <──requires── [Posts published]          │
   ├──> [Archive (filterable)] <──requires── [Posts + categories/tags]
   ├──> [/category/[slug], /tag/[slug]] <──requires── [taxonomy]    │
   ├──> [/post single, PPR + ISR] <──requires── [Posts + post_seo]  │
   ├──> [Search] <──requires── [Posts] (Postgres FTS)              │
   ├──> [generateMetadata + sitemap.ts + JSON-LD + OG] <──requires── [post_seo + settings]
   └──> [Contact] <──requires── [pages + SMTP]                     │
                                                                    │
[revalidatePath/revalidateTag] ──enhances──> [all cached public pages]
[About us (hard-coded)] ──independent (no DB dependency)
[404 not-found.tsx] ──independent

[fast-follow] Menu builder        ──requires── [menus/menu_items tables + permission gate]
[fast-follow] Header/footer code injection ──requires── [isomorphic-dompurify sanitization]
[fast-follow] Redirects manager   ──requires── [redirects table + middleware check before 404]

CONFLICTS:
  [Reader-facing auth] conflicts with [Dashboard-only auth scope] (rejected: anti-feature)
  [Full i18n routing] conflicts with [Single-locale UTF-8 design] (rejected: anti-feature)
  [Comments] conflicts with [No reader mutations] (rejected: anti-feature)
```

### Dependency Notes

- **Posts CRUD requires the base schema migration first** — it's the spine. Everything content-related hangs off `posts` + `post_seo`.
- **Review workflow requires both RBAC and the status enum** — a status column without role/ownership checks is decoration, not a workflow.
- **Public single post requires `post_seo`** — without slug/meta/OG, the page can't be routed or previewed correctly.
- **Search requires published posts** — Postgres FTS indexes the post body/title; ships once content exists.
- **`revalidatePath`/`revalidateTag` enhances every cached public page** — without it, edits don't reflect (or you poll/full-rebuild, which PROJECT.md forbids).
- **Menu builder / code injection / redirects manager are `[fast-follow]` dependencies of a polished settings phase**, not of the authoring+public MVP. The schema tables can land early; the UI is what's deferred.
- **`[Reader-facing auth]` conflicts with the dashboard-only auth scope** — building it would require solving comments/moderation, which is why it's an anti-feature, not just a deferral.

---

## MVP Definition

### Launch With (v1) — from PROJECT.md "Active"

This is the **authoring + public-site MVP**. Every item maps to an Active requirement in PROJECT.md.

- [ ] **Foundation** — Next.js 16 App Router, Drizzle + Postgres base schema (users, posts, post_seo, categories, tags, post_tags, media, settings, **pages**), R2 wired with CDN domain — *the spine everything hangs on*
- [ ] **Auth + RBAC** — Better Auth + admin/RBAC plugin, three roles, middleware gate, permission checks on every mutating action, author→review→publish workflow enforced server-side — *the review workflow must genuinely work for a 2–5 person team*
- [ ] **Content engine** — Posts CRUD + Tiptap (store ProseMirror JSON), categories + tags, R2 media library (presigned upload, sharp resize, next/image loader, alt text)
- [ ] **Dashboard chrome** — TailAdmin wired to real data: posts, categories, tags, media, users + roles, dashboard-managed **pages** (legal + contact content)
- [ ] **SEO basics** — `generateMetadata` per route, dynamic `sitemap.ts`, JSON-LD `BlogPosting`, canonical handling, OG images
- [ ] **Public frontend (ISR/PPR-first)** — Home + `/blog` feed, full archive, category/tag archives, single post (PPR), search, About (hard-coded), Contact (form → SMTP, honeypot + rate-limit), T&C/Privacy (dashboard-managed), 404
- [ ] **Performance + deploy** — `revalidatePath`/`revalidateTag` on publish, no client fetching for server-renderable content, lean initial dashboard load, staging on Coolify

### Add After Validation (v1.x — fast-follows)

PROJECT.md explicitly defers these; they're scoped, not cancelled.

- [ ] **Menu builder** — trigger: admins want to edit header/footer nav without a deploy. Tables (`menus`/`menu_items`) already in schema ref.
- [ ] **Header/footer custom-code injection** — trigger: need to inject analytics/GTM/verification tags. **Must sanitize** (isomorphic-dompurify) on store and render.
- [ ] **Redirects manager UI** — trigger: slug changes start happening. The `redirects` table can ship in v1 schema even if the UI defers; middleware checks it before 404ing.
- [ ] **Autosave / draft revision history** — trigger: a long draft is lost once. Not in PROJECT.md; flag for requirements.
- [ ] **Password reset / email verification polish** — trigger: lockout support cases. Likely covered by Better Auth defaults but confirm during requirements.

### Future Consideration (v2+)

Defer until the v1 blog is validated in production.

- [ ] **Self-hosted Meilisearch** — why defer: Postgres FTS is sufficient for the v1 corpus and traffic profile; add when relevance/typo-tolerance becomes limiting
- [ ] **Scheduled publish (datetime → auto-publish)** — why defer: not in PROJECT.md v1; useful but adds a cron/queue dependency
- [ ] **Revision history / content audit log** — why defer: storage + UX surface; nice for editorial accountability, not needed at 2–5 people initially
- [ ] **Reader-facing discussion surface (if ever)** — why defer: anti-feature in v1; would be its own milestone with moderation/auth at its core
- [ ] **Newsletter** — why defer: anti-feature; separate product surface
- [ ] **Analytics dashboard (privacy-friendly, self-hosted e.g. Plausible)** — why defer: not in scope; analytics IDs can ship as code-injected scripts first (post fast-follow), self-hosted analytics later

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Posts CRUD + Tiptap (JSON storage) | HIGH | HIGH | P1 |
| Content statuses + review workflow | HIGH | MEDIUM | P1 |
| Categories + tags + tag archives | HIGH | MEDIUM | P1 |
| R2 media + sharp + next/image | HIGH | MEDIUM | P1 |
| RBAC (3 roles) + middleware gate + per-action checks | HIGH | MEDIUM | P1 |
| Public: home, /blog feed, single post (PPR/ISR) | HIGH | HIGH | P1 |
| Public: category/tag archives + full archive | MEDIUM | MEDIUM | P1 |
| Search (Postgres FTS) | MEDIUM | MEDIUM | P1 |
| SEO: generateMetadata, sitemap, JSON-LD, OG, canonical | HIGH | MEDIUM | P1 |
| Contact form (SMTP + honeypot + rate-limit) | MEDIUM | LOW–MEDIUM | P1 |
| Dashboard-managed pages (legal + contact content) | MEDIUM | LOW–MEDIUM | P1 |
| About (hard-coded), 404, robots.ts | LOW | LOW | P1 |
| revalidatePath/revalidateTag on publish | HIGH | LOW | P1 |
| Staging deploy on Coolify | HIGH | MEDIUM | P1 |
| User management UI (admin) | MEDIUM | MEDIUM | P1 |
| Menu builder | MEDIUM | MEDIUM | P2 (fast-follow) |
| Header/footer code injection | MEDIUM | MEDIUM (sanitization-sensitive) | P2 (fast-follow) |
| Redirects manager UI | MEDIUM | LOW–MEDIUM | P2 (fast-follow) |
| Autosave / draft persistence | MEDIUM | MEDIUM | P2 (flag for requirements) |
| Revision history | LOW–MEDIUM | HIGH | P3 |
| Scheduled publish | LOW–MEDIUM | MEDIUM | P3 |
| Meilisearch upgrade | LOW (at v1 scale) | MEDIUM | P3 |
| Comments / reader discussion | — | — | Anti-feature |
| Full i18n routing | — | — | Anti-feature |
| Newsletter | — | — | Anti-feature |
| Reader-facing auth | — | — | Anti-feature |
| Paid third-party APIs / Vercel tooling | — | — | Anti-feature |

**Priority key:** P1 = must have for launch (PROJECT.md Active). P2 = fast-follow after v1. P3 = future consideration. "Anti-feature" = deliberately not built (PROJECT.md Out of Scope).

---

## Competitor Feature Analysis

| Feature | WordPress (classic blog CMS) | Ghost (modern blog platform) | Our Approach (anydiscussion) |
|---------|------------------------------|------------------------------|------------------------------|
| Content lifecycle | draft / pending / publish / schedule / trash; roles contributor→admin | draft / published / scheduled; admin/editor/author | **Subset:** draft / pending_review / published, three roles — intentionally leaner, server-enforced |
| Editor | Block editor (Gutenberg) or Classic | Block editor (Koenig) | **Tiptap** (ProseMirror JSON) — custom extensions, JSON stored, server-rendered via `generateHTML` |
| Media | Media library, image sizes, plugins | Media library, automatic image sizes | **R2 + sharp + next/image + CDN loader** — cost-predictable, no plugin sprawl |
| SEO | via plugin (Yoast/RankMath) | Built-in meta, canonical, sitemap, schema | **Native Next.js Metadata API** — no plugin, `generateMetadata` + `sitemap.ts` + JSON-LD, per-route |
| Auth | Built-in, role-heavy | Built-in, staff + members | **Better Auth, dashboard-team only** — no reader auth (no comments ⇒ no reader mutations) |
| Comments | Built-in (often disabled/spam) | Built-in (members-only) | **None** (anti-feature) — readers consume only |
| Performance | Theme/plugin-dependent, often heavy | Fast, but Node server-rendered | **Next.js ISR + PPR, near-zero client JS on public pages** — the core differentiator |
| Hosting | Any LAMP | Ghost(Pro) or self-host | **Self-hosted VPS via Coolify + R2** — no paid-API/Vercel lock-in |
| Search | Plugin (SearchWP, etc.) | Built-in simple search | **Postgres FTS** — ships with v1, no external dep |
| Self-hosting DX | Manual / per-host | Container / 1-click | **Coolify git-push deploys + staging** |

**Read:** where WordPress/Ghost win on *breadth* (plugins, members, comments, newsletters), this project wins on *focus and execution* — a fast, SEO-sound, review-driven blog with zero paid-API lock-in. We deliberately do not compete on feature count.

---

## Sources

Confidence reflects live-verification status as of this session. An upstream web-tool rate limit (resets 2026-07-12) prevented re-fetching some sources live; those are marked and rely on stable specs + training data.

- **Project context (authoritative for scope):** `.planning/PROJECT.md` — Active requirements, Out of Scope, Key Decisions (HIGH confidence for *what's in v1*)
- **Project conventions (authoritative for mechanics):** `CLAUDE.md` — locked stack, schema reference, "What NOT to do" (HIGH)
- **Next.js `generateMetadata` (official docs, current):** [nextjs.org/docs/app/api-reference/functions/generate-metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) — deep-merge behavior, file conventions, ISR dedup (HIGH, verified)
- **Next.js SEO guide (community, cross-check):** [digitalapplied.com/blog/nextjs-seo-guide](https://www.digitalapplied.com/blog/nextjs-seo-guide) — Metadata API + file conventions (MEDIUM, corroborating)
- **Next.js sitemap.ts / PPR / revalidatePath / revalidateTag:** official Next.js docs conventions (MEDIUM — conventions HIGH-confidence from training; **PPR's exact GA status in Next.js 16 not re-verified live this session** — flag for STACK/phase research to confirm `experimental.ppr` vs stable flag)
- **Better Auth admin/RBAC plugin (official docs):** [better-auth.com/docs/plugins/admin](https://better-auth.com/docs/plugins/admin) — roles, permissions, server-side role checks (HIGH, verified via search result)
- **Better Auth dynamic roles feature request:** [github.com/better-auth/better-auth/issues/4557](https://github.com/better-auth/better-auth/issues/4557) — dynamic role creation not built-in; fixed-enum pattern recommended (MEDIUM)
- **Tiptap `getHTML`/`getJSON` + `generateHTML`:** [tiptap.dev/docs/editor/api/editor](https://tiptap.dev/docs/editor/api/editor) — JSON-storage recommendation (MEDIUM — well-stable API, not re-fetched live this session)
- **Cloudflare R2 + AWS SDK presigned-URL pattern:** Cloudflare R2 docs + `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` (MEDIUM — stable, widely-used pattern)
- **schema.org `BlogPosting`:** [schema.org/BlogPosting](https://schema.org/BlogPosting) + Google rich-results docs (MEDIUM — stable spec; Google recommendations evolve slowly)
- **OpenGraph protocol:** [ogp.me](https://ogp.me/) + X/Twitter Card docs (MEDIUM — stable)
- **Postgres full-text search:** `tsvector`/`tsquery`/GIN index/`websearch_to_tsquery` — Postgres official docs (MEDIUM — long-stable feature)

---
*Feature research for: self-hosted blog CMS (authoring + public-site MVP)*
*Researched: 2026-06-30*
