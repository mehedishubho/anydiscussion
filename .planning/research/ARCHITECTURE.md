# Architecture Research

**Domain:** Self-hosted blog CMS — single Next.js 16 app serving a public ISR/PPR site + an auth-gated RBAC admin dashboard, backed by PostgreSQL, Cloudflare R2 media, and Server-Action mutations.
**Researched:** 2026-07-01
**Confidence:** HIGH (stack-level decisions cross-verified against Next.js 16.2.9 + Better Auth official docs; MEDIUM on Tiptap SSR specifics — Tiptap's docs site restructured and the canonical page 404'd, but the `@tiptap/html` `generateHTML`/`generateJSON` API is stable and long-established)

---

## ⚠️ Critical version findings (read before building)

Verified against current (2026) docs — these supersede older blog posts and any training-data assumptions:

1. **`middleware.ts` is deprecated → renamed `proxy.ts` in Next.js 16.** Better Auth's Next.js integration doc explicitly says: *"Next.js 16 replaces middleware with proxy. Migration from middleware: Rename middleware.ts → proxy.ts and middleware → proxy function."* The Node.js runtime in proxy is now **stable** (was experimental pre-16), so a full DB-backed `auth.api.getSession` check works in proxy. Confidence: HIGH (Next.js + Better Auth cross-verified).

2. **PPR is now "Cache Components", not `experimental.ppr`.** Enable via `next.config.ts` → `cacheComponents: true`. The invalidation primitives are the `'use cache'` directive, `cacheLife()` profiles, `cacheTag()`, and `revalidatePath`/`revalidateTag(tag, 'max')`. Confidence: HIGH.

3. **`revalidateTag` single-arg form is deprecated in 16.** Use `revalidateTag(tag, 'max')` for stale-while-revalidate, or migrate to the new `updateTag`. Both functions only run in Server Functions / Route Handlers — **never** in Client Components or proxy. Confidence: HIGH.

These three are the highest-leverage things the roadmap must internalize. Older scaffolding patterns (`middleware.ts`, `experimental.ppr`, `revalidateTag('posts')`) will silently break or emit deprecation warnings on the 16.1.6 install already in this repo.

---

## Standard Architecture

### System Overview

```
┌─────────────────────────── NEXT.JS 16 APP (one process) ───────────────────────────┐
│                                                                                      │
│   proxy.ts  ◄── runs first on EVERY request (auth redirect + redirects table)        │
│       │                                                                              │
│       ▼                                                                              │
│   ┌────────────────────────────┐        ┌─────────────────────────────────────┐     │
│   │   app/(site)  PUBLIC        │        │   app/(admin)  DASHBOARD (auth-gated)│     │
│   │   ISR / Cache Components    │        │   TailAdmin shell, client-heavy     │     │
│   │   Server Components default │        │   TanStack Query + RHF/Zod          │     │
│   │   <Suspense> for dynamic    │        │   Tiptap editor (lazy-loaded)       │     │
│   │   minimal client JS         │        │                                     │     │
│   └─────────────┬───────────────┘        └──────────────────┬──────────────────┘     │
│                 │                                              │                        │
│                 │   both groups import from shared, app-level modules:             │
│                 ▼                                              ▼                        │
│   ┌──────────────────────────────────────────────────────────────────────────┐      │
│   │  actions/   Server Actions (every mutation starts with RBAC check)        │      │
│   │  lib/auth   lib/permissions   lib/db   lib/r2   lib/seo   lib/sanitize    │      │
│   │  db/schema.ts + db/migrations/  (drizzle-kit generated)                   │      │
│   └──────────────────────────────────────────────────────────────────────────┘      │
│                          │            │             │                               │
│                          ▼            ▼             ▼                               │
│                   ┌──────────┐  ┌──────────┐  ┌──────────────┐                       │
│                   │ Postgres │  │ R2/CDN   │  │ /api/auth/   │ (Better Auth handler) │
│                   │ (Drizzle)│  │ cdn.anyd.│  │   [...all]   │                       │
│                   └──────────┘  └──────────┘  └──────────────┘                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

The two route groups never import each other. The `(site)` group must not transitively pull any TailAdmin client component — see Anti-Patterns.

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `app/(site)` | Public blog: home, `/blog` feed, full archive, single post, category/tag archives, search, About (hardcoded TSX/MDX), Contact (managed page + form), T&C/Privacy (managed), 404 | Server Components by default; `cacheComponents:true`; Tiptap body rendered server-side via `generateHTML` + DOMPurify |
| `app/(admin)` | Dashboard chrome: posts list/new/edit, categories, tags, media library, users+roles, pages (legal/contact) | TailAdmin UI kit; client components allowed; RHF+Zod forms; TanStack Query for optimistic mutations |
| `app/(full-width-pages)/(auth)` | signin/signup pages | Better Auth React client; `nextCookies()` plugin wired |
| `proxy.ts` | (1) Redirect-unauth away from `(admin)`; (2) check `redirects` table before 404; (3) optimistic cookie redirect only — never the sole auth gate | Node.js runtime (stable in 16); `auth.api.getSession` or `getSessionCookie` |
| `actions/` | All mutations: posts, categories, tags, media, users, settings, menus, pages, contact-form | `"use server"`; **every** exported action starts with permission check (`lib/permissions`) |
| `lib/auth` | Better Auth instance, `auth.api`, RBAC role/permission definitions | `betterAuth()` + `admin()` plugin + `nextCookies()` (last); custom `editor`/`author` roles via access-control statements |
| `lib/permissions` | `requireRole(role)`, `requireCan(action)`, `assertOwnsPost(...)` helpers | Driven by Better Auth session + RBAC; throw on denial (Server Actions) |
| `lib/db` | Drizzle client instance, query helpers | `drizzle-orm/postgres-js`; exported `db` |
| `lib/r2` | `uploadAndResize(buffer)`, `putToR2()`, signed/permanent URL helpers; `next/image` loader | `@aws-sdk/client-s3` pointed at R2 endpoint (`forcePathStyle:true`); `sharp` resize |
| `lib/seo` | `generateMetadata` builders, JSON-LD Article builder, canonical resolver | Pure functions over `post_seo`/`settings` rows |
| `lib/sanitize` | `sanitizeHtml()` — single DOMPurify config reused at write + read | `isomorphic-dompurify` |
| `db/schema.ts` | Source of truth: users, posts, post_seo, categories, tags, post_tags, media, pages, settings (+ redirects/menus fast-follow) | `pgTable` builders; relations; extended via `drizzle-kit generate` only |
| `/api/auth/[...all]` | Better Auth HTTP handler mount | `toNextJsHandler(auth)` |

## Recommended Project Structure

(inherits from `CLAUDE.md` / `PROJECT.md` — only the load-bearing additions shown)

```
src/
├── proxy.ts                       ← RENAMED from middleware.ts (Next.js 16)
├── next.config.ts                 ← cacheComponents:true, images.custom loader
├── app/
│   ├── (site)/
│   │   ├── [slug]/page.tsx        ← post: 'use cache' body + <Suspense> related/views
│   │   ├── category/[slug]/page.tsx
│   │   ├── tag/[slug]/page.tsx
│   │   ├── search/page.tsx
│   │   ├── about/page.tsx         ← hard-coded TSX/MDX (no schema row)
│   │   ├── contact/page.tsx       ← managed content + <ContactForm/>
│   │   ├── blog/page.tsx          ← latest/featured feed
│   │   ├── archive/page.tsx       ← full chronological + filterable
│   │   ├── sitemap.ts · robots.ts
│   ├── (admin)/
│   │   ├── posts/ · categories/ · tags/ · media/ · users/ · pages/
│   │   └── settings/
│   ├── (full-width-pages)/(auth)/{signin,signup}
│   └── api/auth/[...all]/route.ts ← Better Auth handler
├── actions/
│   ├── posts.ts                   ← requireRole('author') then own-or-higher check
│   ├── categories.ts · tags.ts · media.ts · users.ts · settings.ts · pages.ts
│   └── contact.ts                 ← honeypot + rate-limit + SMTP send
├── components/
│   ├── site/                      ← PostCard, SiteHeader/Footer, ContactForm (client)
│   ├── editor/                    ← Tiptap wrapper + extensions (dashboard only)
│   └── ...existing TailAdmin kits
├── lib/
│   ├── auth/ · permissions/ · db/ · r2/ · seo/ · sanitize/
│   └── r2/image-loader.ts         ← 'use client', default export → CDN URL
└── db/
    ├── schema.ts                  ← pgTable source of truth (incl. `pages`)
    └── migrations/                ← drizzle-kit generated, committed
```

### Structure Rationale

- **`(site)` vs `(admin)` are physically disjoint.** The build traces imports from the route group's tree; if a `(site)` page ever imports from `components/dashboard/*` or `components/editor/*`, TailAdmin's client JS leaks into the public bundle. Enforce with an ESLint `no-restricted-imports` rule and a bundle-budget check on the public chunk.
- **`actions/`, `lib/`, `db/` sit outside `app/`** so both route groups share one implementation. Server Actions are NOT colocated with `(site)` pages (a public page must not own mutation logic).
- **`pages` table is new** (extends the CLAUDE.md schema). It backs T&C, Privacy, and the Contact page body. About is hardcoded because it changes rarely and needs no SEO/routing overhead.

## Architectural Patterns

### Pattern 1: Cache Components (PPR) — static shell + streaming dynamic

**What:** With `cacheComponents:true`, a page is prerendered at build time. Anything wrapped in `'use cache'` is frozen; anything dynamic is wrapped in `<Suspense>` so the static shell streams immediately and dynamic content streams in.

**When to use:** Every `(site)` content page. The post body is cacheable; "related posts" and "view count" are not.

**Trade-offs:** Adds an extra mental model (`use cache` vs `<Suspense>` vs neither). Worth it for the perf bar in `PROJECT.md`. Do NOT sprinkle `'use cache'` on dynamic data — that caches it incorrectly.

**Example:**
```tsx
// app/(site)/[slug]/page.tsx
import { Suspense } from 'react';
import { ViewCount } from '@/components/site/ViewCount';
import { RelatedPosts } from '@/components/site/RelatedPosts';

export default async function PostPage({ params }) {
  const post = await getPost(params.slug); // 'use cache' inside, cacheTag(`post:${slug}`)
  return (
    <article>
      {/* static, prerendered body — sanitized HTML from Tiptap JSON */}
      <div dangerouslySetInnerHTML={{ __html: post.sanitizedHtml }} />
      <Suspense fallback={<RelatedSkeleton/>}>
        <RelatedPosts categoryId={post.categoryId} excludeId={post.id} />
      </Suspense>
      <Suspense fallback={null}>
        <ViewCount postId={post.id} />
      </Suspense>
    </article>
  );
}
```

### Pattern 2: Server Action mutation with mandatory RBAC prelude

**What:** Every exported `"use server"` function begins with a permission check that throws on denial — before any DB write. UI hiding is convenience only.

**When to use:** Always. No exceptions for "obviously safe" actions.

**Trade-offs:** Slightly more boilerplate; eliminates an entire class of privilege-escalation bugs.

**Example:**
```ts
// actions/posts.ts
'use server';
import { requireCan } from '@/lib/permissions';
import { getSession } from '@/lib/auth';
import { revalidatePath, revalidateTag } from 'next/cache';

export async function publishPost(postId: string) {
  const session = await getSession();           // server-side session
  await requireCan(session, 'post.publish');    // RBAC: editor+ or author-on-own
  const isOwn = await assertOwnsPost(session.user.id, postId); // author ⇒ own only
  if (!isOwn && session.user.role === 'author') throw new ForbiddenError();

  await db.update(posts).set({ status: 'published', publishedAt: new Date() })
    .where(eq(posts.id, postId));

  revalidatePath(`/blog/${postId}`);            // specific page
  revalidatePath('/blog'); revalidatePath('/'); // lists
  revalidateTag(`post:${postId}`, 'max');       // SWR for cached fetches (2-arg form)
}
```

### Pattern 3: Double-sanitization at the trust boundary

**What:** Any field that can carry raw HTML/JS is sanitized **before storage** (defense against later rendering bypass) **and before render** (defense against stored XSS that slipped past earlier sanitization or arrived via import). One shared config in `lib/sanitize`.

**When to use:** Post body (Tiptap→HTML), custom-code-injection fields (fast-follow), embeds.

**Trade-offs:** Cheap insurance; the only cost is keeping one canonical sanitizer config.

**Example:**
```ts
// actions/posts.ts (write path)
import { generateHTML } from '@tiptap/html';
import { sanitizeHtml } from '@/lib/sanitize';
import { extensions } from '@/components/editor/extensions';

const rawHtml = generateHTML(postJson, extensions); // JSON → HTML, no DOM needed
post.sanitizedHtml = sanitizeHtml(rawHtml);          // store BOTH json + sanitized html

// render path (defense in depth — never trust stored)
<div dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.sanitizedHtml) }} />
```

### Pattern 4: R2 media pipeline behind `next/image` custom loader

**What:** Upload → server-side `sharp` resize → S3 `putObject` to R2 → write `media` row → serve every image through a `next/image` loader that builds a `cdn.anydiscussion.com` URL.

**When to use:** All content images, everywhere.

**Trade-offs:** `next/image` with a custom loader means the loader itself doesn't optimize at the CDN (R2 isn't an image transformer) — so resize on upload with `sharp`, then `next/image` handles responsive `srcset` widths against pre-resized variants or the CDN's on-the-fly sizing if enabled.

**Example:**
```ts
// lib/r2/image-loader.ts  ('use client')
export default function r2ImageLoader({ src, width, quality }) {
  const q = quality || 75;
  return `https://cdn.anydiscussion.com/${src}?w=${width}&q=${q}`;
}

// next.config.ts
const nextConfig = {
  cacheComponents: true,
  images: {
    loader: 'custom',
    loaderFile: './src/lib/r2/image-loader.ts',
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.anydiscussion.com' }],
  },
};
```

### Pattern 5: Better Auth — proxy for redirect, Server Action for enforcement

**What:** `proxy.ts` does an optimistic cookie check (`getSessionCookie`) to bounce unauthed users; the authoritative RBAC check happens in the Server Action via `auth.api.getSession` + `lib/permissions`.

**When to use:** Always. The cookie-only check is explicitly insecure (Better Auth warning); it's a redirect optimization, not a gate.

**Trade-offs:** Two checks per mutation — that's the cost of correctness on a self-hosted, RBAC-enforced CMS.

## Data Flow

### 1. Read — public post (ISR + Cache Components)
```
Request → proxy.ts (redirects table? auth? skip) → (site)/[slug]/page.tsx
  → 'use cache' getPost(slug)            [static shell: body + meta]
  → <Suspense> ViewCount, RelatedPosts   [streamed at request time]
Response (shell first, dynamic streams in)
```

### 2. Write — editor publishes a post
```
Dashboard (RHF + Zod) → Server Action publishPost(postId)
  → getSession() → requireCan('post.publish') → assertOwnsPost   [RBAC gate]
  → db.update(posts) → revalidatePath(...) → revalidateTag(tag,'max')
Next visit to /[slug]: stale shell served, fresh data regenerated SWR
```

### 3. Media upload
```
Dashboard DropZone → Server Action uploadMedia(file, alt)
  → sharp.resize(variants) → S3 putObject(R2, key) → db.insert(media)
  → revalidatePath('/media') (dashboard) + return CDN key
Dashboard <Image src={media.key} .../> → loader → cdn.anydiscussion.com/key?w=...
```

### 4. Auth session
```
signin → /api/auth/[...all] (Better Auth) → Set-Cookie
  (Server Action path needs nextCookies() plugin to actually set the cookie)
Subsequent (admin) request → proxy.ts getSessionCookie → redirect-or-pass
Server Action → auth.api.getSession({headers}) → authoritative
```

### 5. Contact form
```
/site/contact → <ContactForm> (client) → Server Action submitContact(values)
  → honeypot check → rate-limit (IP-keyed, in-memory or Postgres)
  → nodemailer.sendMail(SMTP)  [no DB row — PROJECT.md decision]
```

### Key Data Flows

1. **Revalidation is the single source of freshness.** No client polling, no full rebuilds. Every write action ends with `revalidatePath` + `revalidateTag(tag,'max')`. Tag-based revalidation scales better than enumerating every path.
2. **Sanitization happens twice** (write + render) on the same shared config — defense in depth at the trust boundary.
3. **Auth is checked twice** (proxy redirect + Server Action) by design — neither alone is sufficient.

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| v1 (tens of thousands/mo) | One Next.js process on a Coolify VPS; Postgres + R2 + CDN absorb the read load. ISR + CDN edge caching dominate. This is the PROJECT.md target — no premature splitting. |
| Growth (100k+/mo) | Watch R2 egress ($); add Cloudflare cache rules in front of `cdn.anydiscussion.com`. Consider a read-replica for Postgres if dashboard queries contend with public reads. Move rate-limit from in-memory to Redis. |
| High traffic | Split dashboard onto its own deployable (it's already a separate route group — the boundary is preserved). Public site goes multi-zone. |

### Scaling Priorities

1. **First bottleneck: image bytes.** Pre-resize aggressively with `sharp` on upload; serve via CDN with long `Cache-Control`. `next/image` responsive widths prevent over-serving.
2. **Second bottleneck: R2 egress cost.** Cold-cache misses cost money; tune CDN TTLs and `cacheLife` profiles so the same image isn't refetched.

## Anti-Patterns

### Anti-Pattern 1: Cross-group import leakage
**What people do:** A `(site)` page imports a `components/dashboard/*` helper (or transitively pulls Tiptap/TailAdmin) because "it's just one component."
**Why it's wrong:** TailAdmin's client JS (and Tiptap) ships to the public bundle, destroying the Core Web Vitals goal. The route-group boundary exists precisely to prevent this.
**Do this instead:** Shared logic lives in `lib/` or `components/common/` (server-safe, no `'use client'` dashboard deps). Add an ESLint `no-restricted-imports` rule forbidding `app/(site)/**` from importing `components/{dashboard,editor}/**`. Add a bundle-size budget on the public chunk.

### Anti-Pattern 2: Trusting the UI hide for permissions
**What people do:** Hide the "Publish" button for `author` role and call it a permission check.
**Why it's wrong:** Trivially bypassed via a crafted request to the Server Action. PROJECT.md mandates server-side checks.
**Do this instead:** Every Server Action starts with `requireCan(...)` + resource-ownership check. UI hiding is cosmetic.

### Anti-Pattern 3: Single-pass sanitization (or none)
**What people do:** Sanitize only at render (`dangerouslySetInnerHTML` with DOMPurify) or only at write, then trust the stored value forever.
**Why it's wrong:** A stored XSS payload (from an import, a buggy editor extension, or a future migration) bypasses a write-only policy; a render-only policy breaks if anyone ever reads the raw field directly.
**Do this instead:** Sanitize at write **and** render using one shared `lib/sanitize` config.

### Anti-Pattern 4: Using the old middleware / old PPR / old revalidateTag APIs
**What people do:** Copy `middleware.ts`, `experimental.ppr`, or `revalidateTag('posts')` from a 2024 blog post.
**Why it's wrong:** All three are deprecated/renamed in Next.js 16. `middleware` still works with a deprecation warning; the other two misbehave silently (PPR won't enable; tag form blocks instead of SWR).
**Do this instead:** `proxy.ts`, `cacheComponents:true`, `revalidateTag(tag,'max')`.

### Anti-Pattern 5: Doing real auth work in proxy
**What people do:** Put RBAC permission logic (can this user edit posts?) in proxy.
**Why it's wrong:** Proxy runs on every request including static assets (unless matcher excludes them); it's a redirect layer, not an enforcement layer. Better Auth explicitly says handle auth checks in each route/Server Action.
**Do this instead:** Proxy = session-cookie existence check → redirect. Server Action = authoritative RBAC.

## Integration Points

### External Services

| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| Cloudflare R2 | `@aws-sdk/client-s3` with `region:'auto'`, `endpoint:https://<account>.r2.cloudflarestorage.com`, `forcePathStyle:true` | One bucket; CDN domain `cdn.anydiscussion.com` fronts it. Egress is the cost to watch. |
| Postgres | `drizzle-orm/postgres-js` connection pool | Self-hosted on same VPS via Coolify. Use a pooled connection string for the app. |
| SMTP (contact form) | `nodemailer` with self-hosted SMTP | No paid API (PROJECT.md hard constraint). Configure in env, not code. |
| Better Auth | `/api/auth/[...all]` handler + `auth.api` in RSC/Actions | `nextCookies()` must be the last plugin for Server-Action cookie writes. |

### Internal Boundaries

| Boundary | Communication | Considerations |
|----------|---------------|----------------|
| `(site)` ↔ `(admin)` | **None directly.** Both depend on `actions/`+`lib/`+`db/` | Enforce no cross-import via ESLint rule + bundle budget |
| Server Action ↔ DB | Direct Drizzle queries inside actions | RBAC prelude is non-negotiable on every action |
| proxy ↔ redirects table | DB read on unmatched path | Keep query indexed (`old_path`); cache aggressively; this is fast-follow per PROJECT.md, not v1 |
| Dashboard ↔ Server Actions | TanStack Query `useMutation` → action invocation | Optimistic UI in dashboard only; never on public site |

## Suggested Build Order (v1-MVP-aligned)

Aligned to `PROJECT.md`'s 9-step reference, but pruned to the v1 scope (authoring + public-site MVP). Each step lists what unblocks it.

```
1. Foundation              → unblocks everything
   • next.config.ts: cacheComponents, images custom loader, pnpm
   • Drizzle schema (users, posts, post_seo, categories, tags, post_tags, media, pages, settings)
   • drizzle-kit generate → first migration
   • R2 client + sharp pipeline (lib/r2)

2. Auth + RBAC             → unblocks all dashboard actions
   • Better Auth + admin plugin; custom editor/author roles via access-control statements
   • nextCookies() plugin; /api/auth/[...all] handler
   • proxy.ts (NOT middleware.ts): getSessionCookie redirect on (admin)
   • lib/permissions: requireCan + ownership helpers

3. Content engine          → unblocks public site
   • Tiptap editor + extensions (dashboard only)
   • Server Actions: posts (with full status workflow enforced server-side), categories, tags, media
   • lib/sanitize (double-sanitize) + @tiptap/html generateHTML
   • Media library UI wired to R2 pipeline

4. Dashboard chrome        → parallel to 3, can overlap
   • TailAdmin posts/categories/tags/media/users/pages wired to real data
   • RHF + Zod (shared with Server Action input parsing); TanStack Query mutations
   • Remove ecommerce/ demo folder; trim unused chart demos

5. SEO basics              → after content engine exists
   • generateMetadata per route from post_seo/settings
   • sitemap.ts (posts+pages), JSON-LD Article, canonical, OG images
   • NOTE: redirects manager is fast-follow per PROJECT.md — proxy checks the table but v1 ships empty

6. Public frontend         → after SEO + content
   • Home, /blog feed, full archive, category/tag archives, single post (Cache Components + Suspense)
   • Search page, About (hardcoded TSX/MDX)
   • Contact: managed page body + <ContactForm> → Server Action → SMTP (honeypot + rate-limit)
   • T&C/Privacy from pages table; not-found.tsx

7. Performance + deploy    → final v1 slice
   • Lighthouse pass; bundle-budget check on public chunk (no TailAdmin leak)
   • revalidatePath/revalidateTag(tag,'max') audit on every action
   • Staging on Coolify (git-push, SSL)
```

**Out of v1 (fast-follow, do NOT scope into MVP):** menu builder, header/footer custom-code injection, redirects manager UI (table exists, checked in proxy, but no admin UI yet). These are PROJECT.md-confirmed Out of Scope for v1.

**Research flags for downstream phases:**
- **Phase 6 (Public frontend):** Cache Components + `<Suspense>` boundary placement is the single most likely place to need a spike. Confirm `cacheLife`/`cacheTag` profile behavior on a real `/[slug]` page before building all archive routes.
- **Phase 3 (Content engine):** Tiptap SSR (`@tiptap/html`) confidence is MEDIUM — validate the extensions array round-trips (JSON → HTML → sanitized HTML → render) correctly with the specific extensions chosen before wiring all post rendering.
- **Phase 5 (SEO):** standard `generateMetadata` patterns — low research risk.
- **Phase 7 (Deploy):** Coolify + self-hosted Postgres backup strategy needs its own ops check (not architecture research).

## Sources

- Next.js 16.2.9 docs — *proxy.js* (middleware renamed): `https://nextjs.org/docs/app/api-reference/file-conventions/proxy` — confidence HIGH (current, lastUpdated 2026-05-13)
- Next.js 16.2.9 docs — *Caching / Cache Components* (PPR successor, `cacheComponents:true`, `'use cache'`, `cacheLife`/`cacheTag`): `https://nextjs.org/docs/app/getting-started/caching` — HIGH
- Next.js 16.2.9 docs — *revalidatePath*: `https://nextjs.org/docs/app/api-reference/functions/revalidatePath` — HIGH (2026-03-03)
- Next.js 16.2.9 docs — *revalidateTag* (single-arg deprecated; `revalidateTag(tag,'max')`; `updateTag`): `https://nextjs.org/docs/app/api-reference/functions/revalidateTag` — HIGH (2026-03-03)
- Next.js docs — *images* (`loader:'custom'` + `loaderFile`, `remotePatterns`): `https://nextjs.org/docs/app/api-reference/config/next-config-js/images` — HIGH (2025-06-16)
- Better Auth docs — *Admin plugin* (RBAC, `setRole`, access-control statements, custom roles): `https://www.better-auth.com/docs/plugins/admin` — HIGH
- Better Auth docs — *Next.js integration* (`toNextJsHandler`, `auth.api.getSession`, `nextCookies()`, `proxy.ts` for Next 16, `getSessionCookie` insecure): `https://www.better-auth.com/docs/integrations/next` — HIGH (explicit "Next.js 16 replaces middleware with proxy")
- Drizzle ORM docs — *Migrations* (`drizzle-kit generate` vs `push`): `https://orm.drizzle.team/docs/migrations` — HIGH
- Tiptap — *`@tiptap/html` `generateHTML`/`generateJSON`* (Node-side JSON↔HTML, same extensions required): `https://tiptap.dev/docs/editor/concepts/guides/rendering` (page restructured; canonical API stable) — MEDIUM
- Repo: `package.json` confirms `next@^16.1.6`, `react@^19.2.0` already installed; no middleware file present (greenfield for `proxy.ts`).

---
*Architecture research for: self-hosted Next.js 16 blog CMS (public site + RBAC dashboard)*
*Researched: 2026-07-01*
