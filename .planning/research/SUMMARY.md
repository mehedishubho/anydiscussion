# Project Research Summary

**Project:** Any Discussion — self-hosted full-stack blog CMS (public blog + admin dashboard, one Next.js app, one Postgres)
**Domain:** Self-hosted Next.js 16 blog CMS with RBAC dashboard
**Researched:** 2026-07-01
**Confidence:** HIGH (stack versions verified against npm registry; MEDIUM on Tiptap SSR specifics and Better Auth RBAC method names — re-verify in implementing phases)

## Executive Summary

Any Discussion is a greenfield, self-hosted blog CMS where one Next.js 16 app serves both an extremely fast public blog (ISR/Cache Components, near-zero client JS) and an auth-gated, role-based admin dashboard (TailAdmin UI kit, more JS-heavy), backed by one PostgreSQL database and Cloudflare R2 media. The stack is **locked** in `CLAUDE.md`/`PROJECT.md` — research verified current 2026 versions and API specifics, not whether to use each tool. v1 scope is an **authoring + public-site MVP**: a small editorial team (admin/editor/author) can manage the full content lifecycle (draft → review → publish) and readers consume well-optimized, SEO-sound posts at maximum speed.

The recommended approach is the dependency spine the research consistently surfaced: Foundation (Drizzle schema + R2 pipeline) → Auth + RBAC (Better Auth + permission helpers) → Content engine (Tiptap JSON, statuses, media) → SEO basics → Public frontend (Cache Components + Suspense) → Dashboard chrome → Performance/deploy. The architecture's central rule is that **the two route groups (`(site)` and `(admin)`) never import each other** — both depend on shared `actions/`, `lib/`, and `db/` modules. Server Actions are the single mutation path, and **every one begins with a server-side RBAC + ownership check**. The product wins on focus and execution (performance + SEO + a genuinely-working review workflow), not feature breadth — it deliberately does not compete with WordPress/Ghost on comments, newsletters, or plugins.

The highest-severity risks are security and silent-staleness. Two pitfalls are **critical**: (1) a mutating Server Action that trusts UI-hiding instead of doing its own `getSession` + role + ownership check, enabling privilege escalation; (2) unsanitized raw HTML/JS rendered via `dangerouslySetInnerHTML`, enabling site-wide XSS. Both are prevented by conventions established in the Auth phase and reinforced everywhere HTML is rendered. The next tier is `revalidatePath`/`revalidateTag` silently no-op'ing (stale content on publish), Drizzle migration drift from hand-edited snapshots, and R2/sharp CPU cost. Critically, **2026-specific version realities invalidate stale assumptions**: `middleware.ts` is renamed `proxy.ts`, PPR is `cacheComponents:true` (not `experimental.ppr`), `revalidateTag` needs a 2-arg form, Tiptap is v3, Zod is v4, and Drizzle is pinned to 0.45.x by Better Auth's peer (not 1.0).

## Key Findings

### Recommended Stack

The stack is locked; STACK.md verified current versions against the npm registry and official docs. The load-bearing 2026 realities: **Next.js 16.2.9** (proxy.ts, cacheComponents, async params, Turbopack default), **Drizzle 0.45.2** (pinned by Better Auth's peer — do NOT install 1.x), **Tiptap v3.27.1** (v2 is maintenance-only), **Zod v4.4.3** (pair with `@hookform/resolvers@5`), **Better Auth 1.6.23** with the **`admin` plugin = RBAC** (there is no separate `rbac` plugin). See STACK.md for installation commands and anti-stale-memory code shapes.

**Core technologies:**
- **Next.js 16** — App Router, Server Components, Server Actions — `proxy.ts` (renamed from middleware), `cacheComponents:true` for PPR, Turbopack default
- **Drizzle ORM 0.45.2 + drizzle-kit 0.31.10** — Postgres ORM, SQL-first, pinned by Better Auth peer; `getTableColumns()` not `getColumns()` (1.0-only)
- **Better Auth 1.6.23 + `admin` plugin** — auth + RBAC; `admin()` plugin provides roles/permissions/`createAccessControl`; `nextCookies()` must be last
- **Tiptap v3.27.1** — ProseMirror editor; store `getJSON()` as jsonb, render via `@tiptap/html` `generateHTML` server-side with the **same extensions array**
- **Zod v4.4.3 + React Hook Form 7 + TanStack Query 5** — one schema reused client+server; optimistic UI in dashboard only
- **Cloudflare R2 + sharp 0.35.2 + next/image** — resize at upload, serve via `cdn.anydiscussion.com`; egress is FREE, cost is in op counts + sharp CPU
- **Postgres 16/17 FTS** — `tsvector`/`websearch_to_tsquery`/GIN index for `/search`; no Algolia; Bangla stemmer caveat for later
- **isomorphic-dompurify 3.18.0** — sanitization at write AND render; pin `jsdom@25.0.1` if `ERR_REQUIRE_ESM` surfaces
- **Coolify v4.1.2** — git-push deploys, managed SSL/Postgres, staging env; `output: "standalone"`, `HOSTNAME=0.0.0.0`

**Critical version requirements (do not let planners use stale memory):**
- `proxy.ts` not `middleware.ts`; function `proxy()`; Node runtime (stable in 16) for Better Auth DB calls
- `cacheComponents:true` not `experimental.ppr` (removed); `'use cache'`, `cacheLife()`, `cacheTag()` are the invalidation primitives
- `revalidateTag(tag, profile)` 2-arg form; `updateTag(tag)` for read-your-writes inside Server Actions
- `@tiptap/*@^3.27.1`, `zod@^4.4.3`, `drizzle-orm@^0.45.2` (NOT 1.x)
- `images.qualities` defaults to `[75]` — declare `[50,75,100]` if serving multiple tiers
- Use legacy `@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0` — `@dnd-kit/react@0.5.0` is pre-1.0 beta

### Expected Features

v1 = authoring + public-site MVP, aligned to PROJECT.md "Active" scope. See FEATURES.md for the full prioritization matrix and competitor analysis.

**Must have (table stakes — P1 for launch):**
- Posts CRUD + Tiptap editor storing ProseMirror JSON; statuses `draft` / `pending_review` / `published`
- Author → submit-for-review → editor/admin-approve → publish workflow **enforced server-side**
- Categories (one per post) + tags (many) + tag archive pages; slugs (Bangla-aware)
- R2 media library: presigned upload, sharp server-side resize, `next/image` with CDN loader, alt text, media browser
- Three roles (`admin`/`editor`/`author`) via Better Auth `admin` plugin; permission check on **every** mutating Server Action; middleware/proxy gate on `(admin)`
- Public frontend (ISR/Cache Components-first): home + `/blog` feed, full archive, `/category/[slug]`, `/tag/[slug]`, single post (PPR + Suspense), search, About (hard-coded TSX/MDX), Contact (managed page + form → SMTP, honeypot + rate-limit), T&C/Privacy (dashboard-managed `pages`), 404
- SEO basics: `generateMetadata` per route, dynamic `sitemap.ts`, JSON-LD `BlogPosting`, canonical, OG/Twitter cards, `robots.ts`
- `revalidatePath`/`revalidateTag` on publish/update; lean dashboard initial load (lazy-load Tiptap/charts); staging on Coolify

**Should have (differentiators — executing table stakes unusually well):**
- Near-zero client JS on public site (Core Web Vitals advantage over WordPress/Ghost)
- Self-hosted, no paid-API lock-in (R2 egress-free + VPS via Coolify)
- Proper review workflow enforced server-side (most lightweight CMSes bolt roles on as afterthought)
- Postgres FTS search with no external dep (upgrade path to Meilisearch when relevance matters)
- Editorial media pipeline (sharp + R2 CDN + next/image)

**Defer (v2+ or fast-follow per PROJECT.md Out of Scope):**
- Menu builder (`[fast-follow]` — tables exist in schema, UI deferred)
- Header/footer custom-code injection (`[fast-follow]` — security-sensitive, needs proven sanitization story)
- Redirects manager UI (`[fast-follow]` — table can ship in v1 schema, UI deferred; greenfield DB means no urgent continuity)
- Autosave / draft revision history, scheduled publish, Meilisearch, newsletter, analytics dashboard
- **Anti-features (deliberately NOT built):** comments / reader discussion, reader-facing auth, full i18n routing, paid third-party APIs, Vercel-specific tooling, content migration, ecommerce demos

### Architecture Approach

One Next.js process with two physically disjoint route groups — `app/(site)` (public, Server Components by default, Cache Components + `<Suspense>`) and `app/(admin)` (TailAdmin shell, client-heavy, TanStack Query) — that **never import each other**. Both depend on shared `actions/`, `lib/` (auth, permissions, db, r2, seo, sanitize), and `db/` modules sitting outside `app/`. `proxy.ts` runs first on every request for optimistic cookie redirect; authoritative RBAC happens in Server Actions. See ARCHITECTURE.md for the system diagram, project structure, and five named patterns.

**Major components:**
1. **`app/(site)`** — public blog (Server Components, Cache Components, `<Suspense>` for dynamic holes); Tiptap body rendered server-side via `generateHTML` + DOMPurify
2. **`app/(admin)`** — dashboard chrome (TailAdmin UI kit, RHF+Zod forms, TanStack Query mutations, Tiptap editor lazy-loaded)
3. **`proxy.ts`** — cookie-existence redirect on `(admin)` + redirects-table check; **never the sole auth gate**; Node runtime (stable in 16)
4. **`actions/`** — all mutations; every exported `"use server"` function starts with `requireCan(...)` + ownership check
5. **`lib/auth` + `lib/permissions` + `lib/sanitize`** — Better Auth instance, `requireRole`/`requireCan`/`assertOwnsPost` helpers, shared DOMPurify config (write + render)
6. **`lib/r2` + `next/image` custom loader** — sharp resize at upload → R2 `putObject` → CDN-served via `cdn.anydiscussion.com`
7. **`db/schema.ts` + `db/migrations/`** — `pgTable` source of truth (incl. new `pages` table for legal/contact content); `drizzle-kit generate` only, committed in same PR as schema change

**Key architectural patterns:** (1) Cache Components — static shell + streaming dynamic via `<Suspense>`; (2) Server Action mutation with mandatory RBAC prelude; (3) Double-sanitization at the trust boundary (write + render, one shared config); (4) R2 media pipeline behind `next/image` custom loader; (5) Better Auth — proxy for redirect, Server Action for enforcement. **Anti-patterns to forbid:** cross-group import leakage (ESLint `no-restricted-imports` + bundle budget), trusting UI hide for permissions, single-pass sanitization, using old middleware/PPR/revalidateTag APIs, doing real auth work in proxy.

### Critical Pitfalls

Top pitfalls from PITFALLS.md — failure modes are HIGH confidence even where exact API names are MEDIUM.

1. **Missing server-side auth on a mutating Server Action (CRITICAL)** — every mutation starts with `getSession` + role + ownership check (on the fetched row, not client-supplied ID); add CI grep test on `actions/`. UI hiding is not security.
2. **Unsanitized custom-code / raw-HTML injection (CRITICAL)** — sanitize at write AND render with one shared DOMPurify config; prefer Tiptap JSON storage; **defer freeform code injection past v1** entirely (PROJECT.md Out of Scope); payload-test every HTML field with `<img src=x onerror=...>`.
3. **`revalidatePath`/`revalidateTag` silently no-op'ing (stale content)** — call from inside the publish Server Action with concrete paths derived from the row + tagged fetches; never in a render path; never with `[slug]` template strings; set `dynamicParams=true`; test publish→visible end-to-end on the real Coolify/Cloudflare stack.
4. **Better Auth RBAC — relying on middleware/proxy role checks that can't run** — proxy = `getSessionCookie` cookie-existence only; real RBAC (`auth.api.getSession` + `userHasPermission`) in Server Components/Actions; `admin()` vs `access()` plugin split (add `access()` if fine-grained permissions needed).
5. **Drizzle migration drift** — never hand-edit generated SQL/snapshots/journal; `drizzle-kit generate` only, committed in same PR as schema; pick `migrate` (SQL files) as canonical, `push` for local scratch only; clean-room migration test (empty Postgres + all migrations == schema).
6. **Self-hosted ISR cache is per-instance (scales to multiple replicas)** — non-issue at single-instance MVP; document as known scaling cliff; adopt shared Redis cache handler before adding a second Coolify replica.
7. **R2/sharp CPU and operation-count cost** — resize at upload (not per-request); aggressive CDN caching; track Class A/B operation metrics; egress itself is free.

## Implications for Roadmap

Based on combined research, the dependency spine is unambiguous: Foundation unblocks everything; Auth + RBAC unblocks all dashboard actions; Content engine unblocks the public site; SEO + Public frontend depend on content existing; Performance/deploy is the closing slice. The phase grouping mirrors PROJECT.md's high-level reference and ARCHITECTURE.md's suggested build order, pruned to the v1 MVP.

### Phase 1: Foundation
**Rationale:** Everything hangs on the Drizzle schema and R2 pipeline; establish conventions (drizzle-kit workflow, no-cross-import ESLint rule) before feature tables exist.
**Delivers:** Next.js 16 config (`cacheComponents:true`, custom image loader, `output:"standalone"`), Drizzle schema (users, posts, post_seo, categories, tags, post_tags, media, settings, **pages**), first migration, R2 client + sharp resize pipeline (`lib/r2`).
**Addresses:** Foundation requirements (PROJECT.md Active).
**Avoids:** Pitfall 5 (Drizzle drift) — establish generate-then-commit-in-same-PR + clean-room test on day one.

### Phase 2: Auth + RBAC
**Rationale:** Every subsequent dashboard action needs the permission helpers; the middleware-vs-action split is hard to retrofit. Ship RBAC + status enum together (a status column without role/ownership checks is decoration, not a workflow).
**Delivers:** Better Auth + `admin` plugin with custom editor/author roles; `nextCookies()` (last); `/api/auth/[...all]` handler; `proxy.ts` (cookie-existence redirect); `lib/permissions` (`requireCan`, `assertOwnsPost`); signin/signup pages.
**Addresses:** Auth + RBAC requirements; the review workflow's enforcement primitives.
**Avoids:** Pitfalls 1 and 4 — get the "proxy does cookie-check, action does real check" split right on day one; CI grep test on `actions/` for `getSession`/`requireRole`.

### Phase 3: Content Engine
**Rationale:** Posts CRUD is the spine of the product; the Tiptap SSR round-trip (JSON → `generateHTML` → sanitized HTML → render) is MEDIUM-confidence and must be validated here before wiring all rendering.
**Delivers:** Tiptap v3 editor + extensions (dashboard only, lazy-loaded); Server Actions for posts (with full status workflow enforced server-side), categories, tags, media; `lib/sanitize` (double-sanitize) + `@tiptap/html` `generateHTML`; media library UI wired to R2 pipeline; `revalidatePath`/`revalidateTag(tag,'max')` wired into publish/update actions.
**Addresses:** Content engine requirements (posts, Tiptap, categories+tags, R2 media).
**Avoids:** Pitfalls 2 (double-sanitization + Tiptap JSON storage), 3 (revalidation in the publish action), 7 (upload-time sharp resize).

### Phase 4: Dashboard Chrome
**Rationale:** Can overlap with Phase 3; wires TailAdmin to real data once the actions exist. Removes dead `ecommerce/` demos.
**Delivers:** TailAdmin posts/categories/tags/media/users/pages wired to real data; RHF + Zod (shared server-side); TanStack Query mutations; user management UI (admin only); dashboard-managed `pages` (legal + contact content).
**Addresses:** Dashboard chrome requirements; user management.
**Avoids:** Cross-group import leakage (bundle-budget check on public chunk); dashboard bloat (lazy-load heavy editor/charts).

### Phase 5: SEO Basics
**Rationale:** Depends on content existing; standard `generateMetadata` patterns are low research risk.
**Delivers:** `generateMetadata` per route from `post_seo`/`settings`; dynamic `sitemap.ts` (posts+pages); JSON-LD `BlogPosting`; canonical handling; OG/Twitter cards; `robots.ts`. (Redirects manager UI is fast-follow — proxy checks the table but v1 ships it empty.)
**Addresses:** SEO basics requirements.
**Avoids:** Bangla meta-length validation (byte/char, not Latin assumptions); sitemap not updating without rebuild.

### Phase 6: Public Frontend
**Rationale:** Depends on SEO + content. **Highest-complexity phase** — the single post page (Cache Components + `<Suspense>` boundary placement) is the most likely place to need a spike.
**Delivers:** Home + `/blog` feed, full archive (filterable), `/category/[slug]`, `/tag/[slug]`, single post (PPR + Suspense: static body + dynamic related/views), search (Postgres FTS), About (hard-coded), Contact (managed page + form → SMTP, honeypot + rate-limit), T&C/Privacy from `pages`, `not-found.tsx`.
**Addresses:** All public frontend requirements.
**Avoids:** Pitfall 3 (test publish→visible end-to-end); cross-group leakage.

### Phase 7: Performance & Deploy
**Rationale:** Closing v1 slice — the perf bar (PROJECT.md) is non-negotiable and must be verified on the real Coolify/Cloudflare stack.
**Delivers:** Lighthouse pass; bundle-budget check (no TailAdmin leak); `revalidatePath`/`revalidateTag` audit on every action; rate limiting on auth endpoints; DB backups scheduled; staging on Coolify (git-push, SSL).
**Addresses:** Performance + deploy requirements.
**Avoids:** Pitfalls 3 (publish→visible on real stack), 6 (document single-replica ISR cliff), R2 cost surprises (billing alerts), Coolify build-vs-runtime env secrets.

### Phase Ordering Rationale

- **Foundation first** because the schema + R2 pipeline unblock every content/auth feature. Drizzle conventions must be established before any feature tables exist (Pitfall 5).
- **Auth + RBAC second** because every dashboard Server Action needs the permission helpers, and the proxy-vs-action split is hard to retrofit. RBAC and the status enum ship together because a workflow needs both (FEATURES.md dependency note).
- **Content engine third** because Posts CRUD + Tiptap is the spine; the SSR round-trip is MEDIUM-confidence and must be validated here before all rendering depends on it.
- **Dashboard chrome can overlap Phase 3** — both depend on the actions existing but don't block each other.
- **SEO after content** — `post_seo` and `settings` must exist for `generateMetadata` to source from.
- **Public frontend after SEO + content** — the single post page is the highest-complexity surface (Cache Components + Suspense), hence the explicit research flag.
- **Performance/deploy last** because the perf bar must be verified on the real self-hosted stack, and several pitfalls (publish→visible, multi-instance ISR, R2 cost) only manifest there.

### Research Flags

Phases likely needing deeper research during planning (`/gsd-plan-phase --research-phase <N>`):
- **Phase 1 (Foundation):** LOW risk — standard Drizzle + R2 patterns. Re-verify `getTableColumns` vs `getColumns` and the sharp postinstall `pnpm approve-builds` flow.
- **Phase 2 (Auth + RBAC):** MEDIUM — re-verify Better Auth `admin` plugin API (`createAccessControl`, `userHasPermission`), `nextCookies()` placement, and the exact `proxy.ts` matcher against current docs.
- **Phase 3 (Content Engine):** MEDIUM — validate Tiptap v3 SSR round-trip (`@tiptap/html` `generateHTML` with the chosen extensions array) before wiring all rendering; confirm `revalidateTag(tag,'max')` 2-arg form on a real publish action.
- **Phase 6 (Public Frontend):** HIGHEST — Cache Components + `<Suspense>` boundary placement on `/[slug]` is the single most likely place to need a spike; confirm `cacheLife`/`cacheTag` profile behavior before building all archive routes.
- **Phase 7 (Performance & Deploy):** MEDIUM — Coolify + self-hosted Postgres backup/ops strategy needs its own ops check (not architecture research).

Phases with standard patterns (skip research-phase):
- **Phase 4 (Dashboard Chrome):** TailAdmin wiring + RHF/Zod + TanStack Query are well-documented.
- **Phase 5 (SEO Basics):** `generateMetadata` + `sitemap.ts` + JSON-LD are standard Next.js Metadata API patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against npm registry + official docs on 2026-07-01. Better Auth pins Drizzle to 0.45.x; Tiptap v3 / Zod v4 / Next 16 confirmed. |
| Features | HIGH | PROJECT.md is authoritative for scope; competitor analysis corroborates. MEDIUM only on external specs not re-fetched live (FTS, OG). |
| Architecture | HIGH | Stack-level decisions cross-verified against Next.js 16.2.9 + Better Auth docs. MEDIUM on Tiptap SSR specifics (docs restructured). |
| Pitfalls | HIGH (failure modes) / MEDIUM (exact API names) | The pitfalls themselves are documented, version-stable behaviors. Re-verify exact method names (`getSessionCookie`, `userHasPermission`, `cacheLife`/`cacheTag`, sharp loader config) in implementing phases. |

**Overall confidence:** HIGH — the stack, scope, and architectural spine are well-verified; the open questions are narrow API-name confirmations in two phases (Auth, Content engine) and one architectural spike (Cache Components on `/[slug]`).

### Gaps to Address

- **Tiptap SSR round-trip:** confirm `@tiptap/html` `generateHTML` produces correct HTML with the chosen extensions array (JSON → HTML → sanitized HTML → render) before wiring all post rendering. Address in Phase 3.
- **Better Auth RBAC access API:** confirm `createAccessControl` + `userHasPermission` exact signatures and whether the `access` plugin is needed for fine-grained permissions beyond the three roles. Address in Phase 2.
- **Cache Components / `<Suspense>` semantics on `/[slug]`:** confirm `cacheLife`/`cacheTag` profile behavior and where to place Suspense boundaries for related-posts/view-count. Address via a Phase 6 spike.
- **Postgres FTS Bangla quality:** `to_tsvector('english', ...)` works for mixed content but doesn't stem Bangla; acceptable for v1, revisit if Bangla search quality matters. Note for v2.
- **Multi-instance ISR:** out of scope for single-instance v1, but document as a known scaling cliff before adding a second Coolify replica. Address in Phase 7 documentation.
- **Autosave / draft persistence:** not explicitly in PROJECT.md Active — flag for requirements confirmation (minimum: manual save; recommended: debounced autosave of JSON).
- **Password reset / email verification:** likely covered by Better Auth defaults + SMTP reuse; confirm during requirements.
- **Exact R2 pricing numbers:** structural claim (free egress, cost in op counts + sharp CPU) is HIGH-confidence; exact $/M figures MEDIUM — verify on Cloudflare's pricing page before locking cost assumptions.

## Sources

### Primary (HIGH confidence)
- **npm registry** (`registry.npmjs.org`) — versions and peerDependencies for next@16.2.9, react@19, drizzle-orm@0.45.2, drizzle-kit@0.31.10, better-auth@1.6.23, @tiptap/*@3.27.1, zod@4.4.3, react-hook-form@7.80.0, @hookform/resolvers@5.4.0, @tanstack/react-query@5.101.2, @aws-sdk/client-s3@3.1076.0, sharp@0.35.2, @dnd-kit/core@6.3.1, @dnd-kit/sortable@10.0.0, isomorphic-dompurify@3.18.0, pg@8.22.0
- **Next.js 16 upgrade guide** (`vercel/next.js@canary/docs/01-app/02-guides/upgrading/version-16.mdx`) — proxy rename, async APIs, revalidateTag 2-arg, cacheComponents PPR, Turbopack default, next/image changes
- **Next.js 16 docs** — proxy.js, Caching/Cache Components, revalidatePath, revalidateTag, images (loader/remotePatterns)
- **Better Auth docs** — Admin plugin (RBAC, `createAccessControl`, `userHasPermission`), Next.js integration (`proxy.ts` for Next 16, `toNextJsHandler`, `auth.api.getSession`, `nextCookies()` last, `getSessionCookie` insecure)
- **Drizzle docs** — Migrations (`generate` vs `push`), PostgreSQL full-text search (`tsvector`/GIN/`websearch_to_tsquery`/`ts_rank`)
- **Project context (authoritative for scope):** `.planning/PROJECT.md` (Active/Out of Scope/Key Decisions) and `CLAUDE.md` (locked stack, schema reference, "What NOT to do")
- **Coolify GitHub Releases** — `coollabsio/coolify` v4.1.2 (2026-06-04)

### Secondary (MEDIUM confidence)
- **Tiptap** — `@tiptap/html` `generateHTML`/`generateJSON` (docs restructured; canonical API stable and long-established)
- **Cloudflare R2 + AWS SDK presigned-URL pattern** — R2 docs + `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` (stable, widely-used)
- **schema.org `BlogPosting`** + Google rich-results docs (stable spec)
- **OpenGraph protocol** (`ogp.me`) + X/Twitter Card docs (stable)
- **Next.js `generateMetadata`** (official, verified) cross-checked with community SEO guide
- **sharp** — Node ≥20.9.0, resize/webp API (official README)
- **isomorphic-dompurify** — jsdom pin known issue, `clearWindow()` (official README)
- **Better Auth dynamic roles feature request** (GitHub issue #4557) — dynamic role creation not built-in; fixed-enum pattern recommended

### Tertiary (LOW confidence — needs validation in implementing phases)
- Exact Better Auth `access` plugin API and whether fine-grained permissions need it beyond the 3 roles
- Exact `cacheLife`/`cacheTag` profile names and Suspense boundary semantics on a real `/[slug]` page
- Tiptap v3 extension round-trip behavior with the specific extensions chosen
- Coolify UI/feature specifics (build-vs-runtime env vars, backup config) — verify against current Coolify docs
- Exact Cloudflare R2 pricing figures — verify on Cloudflare's pricing page

> Note: Context7 MCP and the brave/exa search providers were unavailable during research (rate-limited / unconfigured). Version data was sourced directly from the npm registry, which is more authoritative than search results. Re-running with Context7 available would strengthen the MEDIUM-confidence items.

---
*Research completed: 2026-07-01*
*Ready for roadmap: yes*
