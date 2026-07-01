# Any Discussion — Project Context

This file is reference context only — tech stack, conventions, tools, and planning rationale. It does not track task state, phase progress, or execution steps; that's handled separately. Any Claude Code session should read this file first to understand *how* to build things correctly, then get *what* to build next from the execution workflow.

## What this project is

A full-stack blog CMS for anydiscussion.com. Custom-built (not WordPress) — a public-facing blog site plus an admin dashboard, sharing one Next.js app and one Postgres database. Public site must be extremely fast (ISR/PPR, minimal client JS). Dashboard is auth-gated, role-based, and can be more JS-heavy since it's not optimizing for public Core Web Vitals.

Brand identity: clean, fast, professional. Multi-language content support (English UI, Bangla content allowed) but no full i18n routing — this is not a multi-locale site.

## Package manager

**pnpm only.** Never use npm or yarn — not in commands, scripts, READMEs, or CI config. Use `pnpm add`, `pnpm dlx`, `pnpm run`. If a scaffolding tool defaults to npm, reconfigure it for pnpm immediately.

If pnpm blocks a postinstall script (e.g. `sharp`, `unrs-resolver`) with an "Ignored build scripts" warning, run `pnpm approve-builds`, select the legitimate native-binary packages, and commit the resulting allowlist so the approval persists across clones and deploys.

## Tech stack (locked decisions — don't suggest alternatives unless asked)

- **Framework**: Next.js 16, App Router, Server Components by default, Server Actions for mutations
- **Database**: PostgreSQL (self-hosted on VPS via Coolify)
- **ORM**: Drizzle ORM + drizzle-kit for migrations
- **Auth**: Better Auth, with the `admin`/RBAC plugin for roles and permissions
- **Dashboard UI**: TailAdmin components, used as a UI kit — not as a scaffolding framework. Pull individual components (tables, forms, sidebar, modals) rather than adopting its full page structure.
- **Editor**: Tiptap (ProseMirror) for post content
- **Forms**: React Hook Form + Zod (same Zod schema reused server-side for Server Action input validation)
- **Client data layer**: TanStack Query for dashboard mutations/optimistic UI
- **Media storage**: Cloudflare R2 (S3-compatible), served via a custom CDN domain (e.g. cdn.anydiscussion.com)
- **Image handling**: `next/image` with a custom loader pointed at R2/CDN; `sharp` for server-side resizing on upload
- **Drag-and-drop**: dnd-kit (menu builder, content reordering)
- **Sanitization**: isomorphic-dompurify (required for any custom-code-injection or raw HTML fields)
- **Deployment**: Self-hosted VPS, managed via Coolify (git-push deploys, SSL, staging environment)

Do not introduce NextAuth, Prisma, Vercel-specific APIs (e.g. Vercel Blob, Vercel KV), or any paid third-party API without explicit approval — this project avoids paid-API dependencies as a hard constraint.

## Folder structure

The dashboard is scaffolded from TailAdmin, so its route group is named `(admin)`, not `(dashboard)` — use that naming consistently everywhere (middleware matchers, imports, docs).

```
src/
├── app/
│   ├── layout.tsx                      ← root layout (minimal — html/body, providers only)
│   ├── globals.css
│   ├── not-found.tsx · favicon.ico
│   │
│   ├── (site)/                         ← public blog frontend
│   │   ├── layout.tsx                  ← public header/footer, fast/server-first
│   │   ├── page.tsx                    ← homepage
│   │   ├── [slug]/page.tsx             ← single post
│   │   ├── category/[slug]/page.tsx
│   │   ├── tag/[slug]/page.tsx
│   │   ├── search/page.tsx
│   │   ├── sitemap.ts
│   │   └── robots.ts
│   │
│   ├── (admin)/                        ← TailAdmin dashboard shell
│   │   ├── layout.tsx · page.tsx       ← dashboard overview
│   │   ├── posts/
│   │   │   ├── page.tsx                ← list/table
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/edit/page.tsx
│   │   ├── categories/ · tags/
│   │   ├── media/                      ← R2 media library browser
│   │   ├── users/                      ← user + role management
│   │   ├── settings/
│   │   │   ├── general/                ← logo, site title, default settings
│   │   │   ├── menus/                  ← menu builder
│   │   │   ├── header-footer/          ← header/footer content + custom code
│   │   │   └── seo/                    ← site-wide SEO defaults
│   │   ├── (others-pages)/             ← existing TailAdmin demo pages — keep calendar/profile, drop unused chart/table demos once real ones exist
│   │   └── (ui-elements)/              ← TailAdmin component showcase — safe to delete once confident in the kit
│   │
│   └── (full-width-pages)/
│       ├── layout.tsx
│       ├── (auth)/                     ← signin · signup (Better Auth wired in here)
│       └── (error-pages)/
│
├── components/
│   ├── site/                           ← PostCard, SiteHeader, SiteFooter, CategoryList, etc.
│   ├── dashboard/
│   │   ├── posts/ · categories/ · users/ · settings/ · menus/   ← feature-specific dashboard UI
│   ├── editor/                         ← Tiptap wrapper + extensions
│   ├── auth/ · calendar/ · charts/ · common/                    ← existing TailAdmin, reused
│   ├── form/ · header/ · tables/ · user-profile/ · ui/          ← existing TailAdmin, reused
│   └── ecommerce/                      ← TailAdmin demo components — remove, not used in this project
│
├── lib/
│   ├── auth/                           ← Better Auth config + server helpers
│   ├── permissions/                    ← role/permission check helpers
│   ├── db/                             ← Drizzle client instance
│   ├── r2/                             ← upload/signed-URL helpers
│   └── seo/                            ← generateMetadata helpers, JSON-LD builders
│
├── db/
│   ├── schema.ts
│   ├── migrations/
│   └── index.ts
│
├── actions/                            ← Server Actions grouped by feature
│   ├── posts.ts · categories.ts · users.ts · settings.ts · menus.ts
│
├── context/    SidebarContext.tsx · ThemeContext.tsx             ← existing, unchanged
├── hooks/      useGoBack.ts · useModal.ts · usePermission.ts
├── icons/      (existing, unchanged)
└── layout/     AppHeader.tsx · AppSidebar.tsx · Backdrop.tsx · SidebarWidget.tsx  ← existing, dashboard-only
```

Notes on this structure:
- `(site)` stays completely separate from `(admin)` so the public site never pulls in dashboard JS or TailAdmin's client-heavy components.
- `db/`, `lib/`, and `actions/` sit outside `app/` since both route groups depend on them.
- The `ecommerce/` component folder is TailAdmin's demo scaffolding for a sales dashboard — not part of this project's scope, remove it rather than working around it.
- New dashboard feature pages (posts, users, settings, etc.) live as siblings to TailAdmin's existing `(others-pages)` and `(ui-elements)` groups, not nested inside them.

## Roles & permissions

Three roles: `admin`, `editor`, `author`.

- **admin**: full access — content, users, all settings, custom code injection, menu/header/footer management, SEO settings
- **editor**: can create/edit/publish any post, manage categories/tags, cannot manage users or site settings
- **author**: can create/edit only their own posts, can submit for review, cannot publish directly (editor/admin approves), cannot access settings

Permission checks happen in two places: middleware (route-level gate on the `(admin)` route group) and inside Server Actions (resource-level gate). Never rely on UI hiding alone — always re-check permissions server-side, including on actions that look "obviously safe."

## Database schema (reference — `db/schema.ts` is the actual source of truth)

- `users` — managed by Better Auth, extended with `role` field
- `posts` — title, content (Tiptap JSON or HTML), status (draft/pending_review/published), author_id, category_id, feature_image, created_at, updated_at, published_at
- `post_seo` — post_id (FK), slug, meta_title, meta_description, og_image, canonical_url
- `categories`, `tags`, `post_tags` (join table)
- `media` — R2 object keys, alt text, uploaded_by
- `menus`, `menu_items` — nested structure for header/footer nav, ordered
- `settings` — key-value table for site-wide config (logo, default meta description, default OG image, header/footer custom code, analytics IDs, canonical base URL)
- `redirects` — old_path, new_path, status_code (301/302), for slug-change SEO continuity

Never hand-write SQL migrations — always generate via `drizzle-kit generate` after schema changes.

## SEO requirements (apply to every content-facing page)

- Use Next.js native `generateMetadata` per route, sourced from `post_seo` / `settings` tables — no `next-seo` package needed
- Dynamic `app/sitemap.ts` pulling published posts
- JSON-LD Article schema injected per post
- Respect `canonical_url` override when set; otherwise derive from slug
- Redirect manager (`redirects` table) must be checked in middleware before 404ing on unmatched paths
- Don't assume meta description length limits based on Latin character counts — Bangla text reads differently; validate by reasonable byte/character count, not arbitrary Latin-style limits

## Performance requirements (non-negotiable)

- Public site pages should be statically generated or ISR by default. Use `revalidatePath`/`revalidateTag` on publish/update — don't poll or fully rebuild.
- Use Partial Prerendering where a page mixes static content (post body) with dynamic content (related posts, view counts)
- No client-side data fetching on the public site for content that could be server-rendered
- Dashboard can use client components freely, but keep initial dashboard load lean — lazy-load heavy editor/chart components
- Images always go through `next/image` — never raw `<img>` tags for content images

## Code conventions

- TypeScript strict mode, no `any` without a comment justifying it
- Zod schemas live alongside their feature (e.g. `app/(admin)/posts/schema.ts`), reused for both form validation and Server Action input parsing
- Server Actions are the default mutation path — only use API routes for things that genuinely need to be hit externally (webhooks, etc.)
- Route groups `app/(site)` and `app/(admin)` keep public and dashboard code physically separate — see "Folder structure" below for the full layout
- Sanitize any field that allows raw HTML/JS (custom code injection, embeds) before storage and again before render
- Permission checks are never optional — every Server Action that mutates data starts with a role/permission check
- Always use pnpm-specific syntax in any script, README, or command generated

## High-level planning reference

This is context for sequencing decisions, not a task tracker — actual task breakdown and execution order is handled by your execution workflow, not this file.

1. Foundation — Next.js 16 init, Drizzle + Postgres connection, base schema migration
2. Auth + RBAC — Better Auth setup, role middleware, permission helpers
3. Content engine — posts CRUD, Tiptap integration, categories/tags, R2 media upload
4. SEO layer — post_seo fields, sitemap, JSON-LD, redirects manager
5. Dashboard chrome — TailAdmin components wired to real data, user management
6. Site settings — menu builder, header/footer manager, branding settings, custom code injection
7. Public frontend — homepage, single post, archive, search, built ISR/PPR-first
8. Performance pass — Lighthouse audit, image/font checks, caching headers
9. Deploy/harden — staging on Coolify, backups, rate limiting on auth endpoints

## What NOT to do

- Don't add i18n routing/locale switching — Bangla content support is just UTF-8 + font handling, not a translated UI
- Don't default to Vercel-specific tooling since this is self-hosted on a VPS
- Don't skip server-side permission checks even for "obviously safe" UI-gated actions
- Don't introduce a new UI kit or component library outside TailAdmin without discussion
- Don't store media files on local disk or in Postgres — R2 only