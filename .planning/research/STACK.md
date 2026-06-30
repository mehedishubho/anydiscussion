# Technology Stack

**Project:** Any Discussion — self-hosted full-stack blog CMS (public blog + admin dashboard, one Next.js app, one Postgres)
**Researched:** 2026-07-01
**Stack status:** LOCKED by project (see `.planning/PROJECT.md` "Constraints"). This file verifies **current 2026 versions and API specifics**, not whether to use each tool.

> **Source confidence:** Versions verified against the **npm registry** (primary, authoritative) and **GitHub raw docs** (Better Auth, Drizzle, Next.js upgrade guide) on 2026-07-01. API specifics verified against official docs fetched from the canonical repos. Overall confidence: **HIGH**. Web search and the context7/exa MCP providers were unavailable in this environment (rate-limited / unconfigured), so version data comes from the registry directly — which is more authoritative than search results anyway.

---

## TL;DR — what changed vs. training-data / CLAUDE.md assumptions

Several "locked" entries have version-specific realities a 2026 build MUST account for. If planners use stale (pre-2025) memory, they will write non-compiling code.

| Locked entry | Stale assumption | VERIFIED 2026 reality | Impact |
|---|---|---|---|
| Next.js 16 | "use `middleware.ts` + `experimental.ppr`" | **`proxy.ts`** (renamed), PPR via **`cacheComponents:true`**, `revalidateTag` needs 2 args, async params/searchParams | Every auth-gate & ISR file |
| Tiptap | "v2 (ProseMirror)" | **v3.27.1** is latest; v2 is maintenance-only | Use `@tiptap/*@3` |
| Zod | "v3" | **v4.4.3** | Schema API diffs; `@hookform/resolvers@5` |
| Drizzle | "latest" | **0.45.2** is `latest`; **1.0 is RC but NOT adopted** — Better Auth pins it to ^0.45.2 | Do NOT install drizzle 1.x |
| dnd-kit | "`@dnd-kit/core` + `@dnd-kit/sortable`" | Legacy pkgs frozen Dec-2024; new arch `@dnd-kit/react@0.5.0` is pre-1.0 | Use **legacy stable** |

---

## Recommended Stack (verified versions)

### Core framework

| Technology | Version | Purpose | Why (verified) | Conf. |
|---|---|---|---|---|
| **next** | **16.2.9** | App Router framework (public + admin) | Stable; 16.0 canaries shipped 2025-10-10, `latest` is now 16.2.9 (16.3 in preview). Node ≥20.9.0, React 19.2 peers. | HIGH |
| **react** / **react-dom** | **19.x** | UI runtime | Next 16 peers `^19.0.0` (also accepts 18.2). React 19.2 ships View Transitions, `useEffectEvent`, Activity. | HIGH |
| **typescript** | **≥5.1** (use latest 5.x) | Type safety | Next 16 minimum 5.1.0. | HIGH |
| Node.js (runtime) | **20.19+ LTS** (or 22/24) | Server runtime | Next 16 min 20.9.0; sharp requires ≥20.9.0; isomorphic-dompurify@3 requires `^20.19.0 \|\| ^22.13.0 \|\| >=24.0.0`. Use the **Node 20.19 LTS** (or 22 LTS) base image. | HIGH |

### Database & ORM

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **PostgreSQL** | 16 (or 17) | Primary DB | Self-hosted via Coolify managed service. PG FTS (`tsvector`/`websearch_to_tsquery`) powers `/search`. | HIGH |
| **drizzle-orm** | **0.45.2** | ORM | `latest` dist-tag. **Pinned here by Better Auth's peer (`^0.45.2`)** — Drizzle 1.0 is in RC (`1.0.0-rc.4`, 2026-06-27) but Better Auth does not yet accept it. Do **not** adopt 1.0 until Better Auth bumps its peer. | HIGH |
| **drizzle-kit** | **0.31.10** | Migrations / config | `latest` dist-tag. `defineConfig`, `generate`, `migrate`, `push`. | HIGH |
| **pg** (node-postgres) | **8.22.0** | PG driver | Drizzle's recommended driver (`drizzle-orm/node-postgres`). `postgres` (postgres.js 3.4.9) is the alternative. | HIGH |
| `@types/pg` | latest (dev) | Types | — | HIGH |

### Auth & RBAC

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **better-auth** | **1.6.23** | Auth + session | Published 2026-06-29. Peers explicitly support `next ^16.0.0` and `drizzle-orm ^0.45.2`. | HIGH |
| better-auth **`admin` plugin** | (built-in) | RBAC + user management | The `admin` plugin **is** the RBAC plugin — provides roles, permissions, `createAccessControl`, ban/impersonate. | HIGH |
| better-auth **`nextCookies` plugin** | (built-in) | Server-Action cookie setting | Add **last** in the plugins array so cookie-setting Server Actions work. | HIGH |

> Better Auth's **`admin` plugin = RBAC plugin**. There is no separate `rbac` plugin to install. Custom roles (admin/editor/author) are defined via `createAccessControl` from `better-auth/plugins/access` + `ac.newRole({...})`.

### Editor & content

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **@tiptap/core**, **@tiptap/react**, **@tiptap/starter-kit**, **@tiptap/html** | **3.27.1** (all aligned) | Rich text editor + server serialization | **Tiptap is v3, not v2.** v3.0.0 shipped 2024-07-14; v2 (2.27.2) is maintenance-only on a `v2-latest` dist-tag. Use `@tiptap/*@3`. `@tiptap/html` provides `generateHTML`/`generateJSON`. | HIGH |

> Server-side serialization: `import { generateHTML, generateJSON } from "@tiptap/html"`. Store ProseMirror JSON (jsonb) in Postgres; render server-side via `generateHTML(json, extensions)` reusing the **same** extensions array as the editor.

### Forms & validation

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **zod** | **4.4.3** | Schema validation (shared client+server) | **Zod is v4** (4.0.0 shipped 2025-07-09). v3 is maintenance. Same schema reused for RHF client parsing and Server Action input parsing. | HIGH |
| **react-hook-form** | **7.80.0** | Dashboard forms | Peers `react ^16.8 \|\| ^17 \|\| ^18 \|\| ^19`. | HIGH |
| **@hookform/resolvers** | **5.4.0** | RHF ↔ Zod bridge | v5 supports Zod 4 (`zodResolver`). | HIGH |
| **@tanstack/react-query** | **5.101.2** | Dashboard mutations / optimistic UI | Peers `react ^18 \|\| ^19`. Use `useMutation` + `onMutate`/context for optimistic updates in client components. | HIGH |

### Media pipeline

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **@aws-sdk/client-s3** | **3.1076.0** | R2 (S3-compatible) uploads/gets | R2 config: `{ region: "auto", endpoint, credentials, forcePathStyle: true }`. | HIGH |
| `@aws-sdk/s3-request-presigner` | latest (3.x) | Presigned GET URLs | For any private/bypass-CDN access; public assets served via CDN domain instead. | HIGH |
| **sharp** | **0.35.2** | Server-side image resize on upload | Node ≥20.9.0. Ships prebuilt binaries (run `pnpm approve-builds` for the postinstall). Also used by Next.js's image optimizer. | HIGH |
| **Cloudflare R2** | (SaaS, no paid API) | Object storage for media | Served via custom domain `cdn.anydiscussion.com` so `next/image` can fetch via `remotePatterns`. | HIGH |

### Drag-and-drop

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **@dnd-kit/core** | **6.3.1** | DnD context (legacy/stable) | **Use the legacy stable packages**, not the new `@dnd-kit/react`. See "dnd-kit decision" below. | HIGH |
| **@dnd-kit/sortable** | **10.0.0** | Sortable lists (legacy/stable) | `SortableContext` + `useSortable` + `onDragEnd` reordering. | HIGH |
| ~~@dnd-kit/react~~ | (0.5.0) | New architecture | **Pre-1.0, beta as of 2026-06-27.** Skip until 1.0. Sparse docs, no migration from legacy yet. | HIGH |

> Fast-follow scope only (menu builder deferred per PROJECT.md), so this is non-blocking — but when it comes, target the legacy stable API.

### Sanitization

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **isomorphic-dompurify** | **3.18.0** | Isomorphic HTML/JS sanitization | Wraps `dompurify@^3.4.11` + `jsdom@^29`. Same `DOMPurify.sanitize(dirty, config)` API on server & client. | HIGH |

### Deployment

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **Coolify** | **v4.1.2** | Self-hosted PaaS on the VPS | Released 2026-06-04. Git-push deploys, managed SSL (Caddy/Traefik proxy), managed Postgres service, staging env. | HIGH |
| Docker (multi-stage) | — | Container build | Next.js `output: "standalone"` + node:20-alpine. See "Deployment shape" below. | HIGH |
| pnpm | latest | Package manager | **Mandatory** per project constraint. Never npm/yarn. | HIGH |

---

## Alternatives explicitly NOT used (locked exclusion, confirmed)

| Category | Excluded | Why not (verified) |
|---|---|---|
| Auth | NextAuth / Auth.js | Locked out. Better Auth chosen: ships RBAC (`admin` plugin), Drizzle adapter, native Next.js 16 `proxy.ts` support, 1.6.x is actively maintained. |
| ORM | Prisma | Locked out. Drizzle is SQL-first, lighter, no generated client step; Better Auth officially supports it. |
| Object storage | Vercel Blob | Locked out (Vercel-specific, paid). R2 is S3-compatible, generous egress, no paid API. |
| KV / cache | Vercel KV | Locked out. Not needed — Next 16 `cacheComponents` + Postgres + R2 cover caching. |
| Search | Algolia / paid search API | Locked out (paid). PG FTS on the `posts` table is sufficient for v1 traffic. |
| Bundler fallback | Webpack | Don't opt out of Turbopack unless a plugin truly requires it. Next 16 ships Turbopack-as-default. |
| UI kit | Anything other than TailAdmin | Locked. TailAdmin is a UI kit, not a scaffolding framework. |

---

## Installation

```bash
# Core
pnpm add next@^16.2.9 react@^19 react-dom@^19

# Database
pnpm add drizzle-orm@^0.45.2 pg@^8.22.0
pnpm add -D drizzle-kit@^0.31.10 @types/pg

# Auth (Better Auth + admin/RBAC plugin is built-in)
pnpm add better-auth@^1.6.23

# Editor (v3 — note the major)
pnpm add @tiptap/core@^3.27.1 @tiptap/react@^3.27.1 @tiptap/starter-kit@^3.27.1 @tiptap/html@^3.27.1

# Forms + validation (Zod v4)
pnpm add react-hook-form@^7.80.0 @hookform/resolvers@^5.4.0 zod@^4.4.3

# Dashboard data layer
pnpm add @tanstack/react-query@^5.101.2

# Media pipeline (R2 + sharp)
pnpm add @aws-sdk/client-s3@^3.1076.0 @aws-sdk/s3-request-presigner sharp@^0.35.2

# DnD (legacy stable — fast-follow menu builder)
pnpm add @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0

# Sanitization
pnpm add isomorphic-dompurify@^3.18.0

# Dev
pnpm add -D typescript@latest @types/node @types/react @types/react-dom
```

> If pnpm warns "Ignored build scripts" for `sharp` / `unrs-resolver` / native binaries, run `pnpm approve-builds`, select the legitimate packages, and commit the allowlist so it persists across clones and Coolify deploys.

---

## Current API specifics & code shapes (anti-stale-memory)

### Next.js 16 — ISR / PPR / revalidation

```ts
// next.config.ts — enable Partial Prerendering the Next-16 way
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",                 // required for Coolify/Docker
  cacheComponents: true,                // = PPR opt-in (NOT experimental.ppr, which is removed)
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.anydiscussion.com" }],
    qualities: [50, 75, 100],           // default is now [75] only — declare variants you use
    // minimumCacheTTL default is now 14400 (4h), up from 60s — fine for content images
  },
  // turbopack: { ... } is now top-level (not experimental.turbopack)
};
export default nextConfig;
```

```ts
// Server Action: revalidation in Next 16
"use server";
import { revalidateTag, revalidatePath } from "next/cache";

export async function publishPost(id: string) {
  // ...DB write...
  // revalidatePath still works with a single path arg.
  revalidatePath(`/blog/${slug}`);
  revalidatePath("/blog");

  // revalidateTag NOW REQUIRES a 2nd cacheLife profile arg (single-arg is deprecated + TS error)
  revalidateTag(`post-${id}`, "default");   // stale-while-revalidate
  // For read-your-writes inside a Server Action, use the new updateTag() instead:
  //   import { updateTag } from "next/cache";  updateTag(`post-${id}`);
}
```

```tsx
// Dynamic route params & searchParams are now Promises (Next 16 removed sync access entirely)
export default async function PostPage(props: PageProps<"/[slug]">) {
  const { slug } = await props.params;          // await!
  const q = await props.searchParams;           // await!
  // ...
}

// generateStaticParams is still: () => Promise<{ slug: string }[]>
```

> **Bundling caveat:** Next 16 `next build` uses Turbopack by default. If a custom `webpack` config is present, the build **fails** to prevent misconfiguration. Don't carry over a webpack config from the TailAdmin scaffold — port it to `turbopack` options or remove it.

### Next.js 16 — auth gate is `proxy.ts`, not `middleware.ts`

```ts
// proxy.ts  (root of project, next to app/)
// Next 16 renamed middleware -> proxy. Runtime is nodejs (NOT edge) — required for Better Auth DB calls.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL("/sign-in", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!sign-in|sign-up|api|_next|static|favicon|robots|sitemap).*)"],
};
// ↑ matcher gates only the (admin) dashboard. Public (site) routes stay un-gated.
```

> Faster-but-insecure variant for optimistic redirects: `getSessionCookie(request)` from `better-auth/cookies` checks cookie **existence only** — never treat it as the security boundary. Always re-validate via `auth.api.getSession` (or per-action `userHasPermission`) on the server.

### Better Auth RBAC — admin/editor/author roles

```ts
// lib/auth/permissions.ts
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

const statement = {
  ...defaultStatements,                       // user + session resources from admin plugin
  post: ["create", "update", "delete", "publish"],   // app-specific resource
  settings: ["read", "update"],
} as const;

export const ac = createAccessControl(statement);

export const admin  = ac.newRole({ ...adminAc.statements, post: ["create","update","delete","publish"], settings: ["read","update"] });
export const editor = ac.newRole({ post: ["create","update","delete","publish"] });   // no user/settings
export const author = ac.newRole({ post: ["create","update"] });                       // no publish; enforce own-only in action
```

```ts
// lib/auth.ts
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import { ac, admin, editor, author } from "@/lib/auth/permissions";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  plugins: [
    admin({ ac, roles: { admin, editor, author }, defaultRole: "author" }),
    nextCookies(),                           // MUST be last — enables cookie-setting Server Actions
  ],
});

// Server-side permission gate at the top of EVERY mutating Server Action:
// await auth.api.userHasPermission({ body: { userId: session.user.id, permissions: { post: ["publish"] } } });
```

> Schema impact: the `admin` plugin adds `role` (string), `banned`, `banReason`, `banExpires` to the `user` table and `impersonatedBy` to `session`. After `auth generate` / migration, the `role` column holds `"admin" | "editor" | "author"` (multiple roles comma-separated if ever needed).

### Drizzle — config, client, migration, full-text search

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";
import "dotenv/config";
export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

```ts
// src/lib/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
export const db = drizzle({
  connection: { connectionString: process.env.DATABASE_URL!, ssl: true },
});
```

```bash
# Migrations (pnpm only)
pnpm dlx drizzle-kit generate      # create SQL from schema changes
pnpm dlx drizzle-kit migrate       # apply migrations
pnpm dlx drizzle-kit push          # rapid prototyping without migration files
```

```ts
// Full-text search for /search — schema with weighted GIN index across title + body
import { sql } from "drizzle-orm";
import { index, pgTable, text, jsonb } from "drizzle-orm/pg-core";

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: jsonb("content"),            // Tiptap ProseMirror JSON
  // store a plain-text excerpt column for FTS, OR index a generated text expression
  bodyText: text("body_text"),          // denormalized plaintext for search
}, (t) => [
  index("posts_search_idx").using("gin", sql`
    ( setweight(to_tsvector('english', ${t.title}), 'A')
    || setweight(to_tsvector('english', ${t.bodyText}), 'B') )
  `),
]);

// Query (search page): use websearch_to_tsquery so users can type `foo or bar`
import { desc, sql, getTableColumns } from "drizzle-orm";   // getTableColumns on 0.45.x (getColumns is 1.0-only!)

export async function searchPosts(q: string) {
  return db.select({ ...getTableColumns(posts),
      rank: sql<number>`ts_rank(setweight(to_tsvector('english', ${posts.title}),'A')
                         || setweight(to_tsvector('english', ${posts.bodyText}),'B'),
                         websearch_to_tsquery('english', ${q}))`,
    })
    .from(posts)
    .where(sql`setweight(to_tsvector('english', ${posts.title}),'A')
              || setweight(to_tsvector('english', ${posts.bodyText}),'B')
              @@ websearch_to_tsquery('english', ${q})`)
    .orderBy(desc(sql`ts_rank(...)`));   // repeat the rank expression; or use a subquery
}
```

> Bangla content caveat: PG `to_tsvector('english', ...)` stemmes Latin text. Bangla (Bengali) has no built-in PG dictionary until PG 17's partial support; for mixed-content search, FTS will match Bangla tokens as bare lexemes (still works, just no stemming). Acceptable for v1 traffic. If Bangla search quality matters later, store a `simple`-config tsvector alongside the English one and OR the matches.

### Tiptap v3 — store JSON, render HTML server-side

```tsx
// components/editor/extensions.ts — shared by editor (client) and renderer (server)
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
export const extensions = [StarterKit, Image, Link /*, custom extensions */];

// On save (client editor): const json = editor.getJSON();  -> send to Server Action -> store as jsonb
// On render (Server Component):
import { generateHTML } from "@tiptap/html";
import { extensions } from "@/components/editor/extensions";
import DOMPurify from "isomorphic-dompurify";

export function PostBody({ json }: { json: unknown }) {
  const html = generateHTML(json as any, extensions);   // JSON -> HTML, server-side
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }); // defense-in-depth
  return <div className="prose" dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

> Re-use the **same `extensions` array** on client and server so node types serialize consistently. Sanitize after `generateHTML` (and again before any raw-HTML/custom-code field renders).

### R2 upload + sharp resize + next/image CDN loader

```ts
// src/lib/r2.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  forcePathStyle: true,
});

export async function uploadImage(file: Buffer, key: string, contentType: string) {
  // server-side resize: max 1600px wide, webp, q80
  const webp = await sharp(file).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key, Body: webp, ContentType: "image/webp" }));
  return `${process.env.NEXT_PUBLIC_CDN_URL}/${key}`;   // served via cdn.anydiscussion.com
}
```

```tsx
// next/image custom loader pointed at the CDN domain
import type { ImageLoaderProps } from "next/image";
const cdnLoader = ({ src, width, quality }: ImageLoaderProps) =>
  `${process.env.NEXT_PUBLIC_CDN_URL}${src}?w=${width}&q=${quality || 75}`;
// <Image loader={cdnLoader} src="/posts/abc.webp" ... />
// (OR a single global loader via next.config images.loader + a `loaderFile`)
```

### isomorphic-dompurify — jsdom pin (Known Issue)

`isomorphic-dompurify@3.x` pulls `jsdom@29` which is fine, but older 3.0–3.3 pulled `jsdom@28` whose ESM-only dep broke `require()` in some bundler outputs (Vercel). On Next 16 with Turbopack this is generally resolved, but if you hit `ERR_REQUIRE_ESM`, add a pnpm override:

```jsonc
// package.json — only if you hit the ERR_REQUIRE_ESM error
"pnpm": { "overrides": { "jsdom": "25.0.1" } }
```

Also, in long-running Node processes (the Next standalone server), call `clearWindow()` periodically to release jsdom state.

---

## dnd-kit decision (legacy vs new architecture)

dnd-kit is mid-major-rewrite. Two parallel package lines exist:

| Line | Packages | Status | API | Docs |
|---|---|---|---|---|
| **Legacy (recommended)** | `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0` | Stable, frozen Dec-2024, ubiquitous | `DndContext` + `SortableContext` + `useSortable` + `onDragEnd` | Mature, every tutorial |
| New architecture | `@dnd-kit/react@0.5.0`, `@dnd-kit/dom@0.5.0` | **Pre-1.0, beta as of 2026-06-27** | Multi-framework, restructured | Sparse, in flux |

**Use the legacy packages.** The project's dnd use case (menu builder, content reordering) is a fast-follow, not v1. The legacy API is stable, well-documented, and has no security/maintenance risk for a small-team dashboard. Revisit `@dnd-kit/react` only after it ships 1.0.

---

## Deployment shape (Coolify / self-hosted)

```dockerfile
# Dockerfile (multi-stage) — Coolify auto-detects this
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build                       # Next 16: Turbopack, output: "standalone"

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

Coolify: create a resource from the git repo, set port `3000`, add env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `R2_*`, `NEXT_PUBLIC_CDN_URL`, `NEXT_PUBLIC_SITE_URL`), attach a managed Postgres service, deploy with auto-SSL. Staging = a second Coolify service pointed at a staging branch/domain.

> `HOSTNAME=0.0.0.0` is mandatory so Coolify's proxy can reach the container. `sharp` must be a **runtime** (not dev-only) dependency because it runs in the runner stage during upload.

---

## Version-verification gotchas (flag for planners)

1. **Next 16 `proxy.ts` not `middleware.ts`.** Any plan step describing "middleware" must say `proxy.ts` + function `proxy()` + `nodejs` runtime. The Better Auth Next.js integration doc explicitly documents this rename.
2. **`revalidateTag(tag, profile)` needs 2 args** in Next 16 (single-arg is deprecated + TS error). Use `updateTag(tag)` inside Server Actions for read-your-writes.
3. **PPR opt-in is `cacheComponents: true`**, not `experimental.ppr` (removed) or `experimental.dynamicIO`/`useCache` (deprecated).
4. **Tiptap is v3.** Pin `@tiptap/*@^3.27.1`. Do not write v2 API code.
5. **Zod is v4.** Pair with `@hookform/resolvers@^5`. Don't copy v3 `zodResolver` snippets blindly — most are still fine, but check error-format and `.brand()`/`.transform()` differences.
6. **Drizzle is pinned to 0.45.x by Better Auth's peer.** Do NOT install `drizzle-orm@1` / `drizzle-kit@1` (RC) until Better Auth bumps its peer range. Use `getTableColumns()`, not `getColumns()` (which is 1.0-only).
7. **`images.qualities` defaults to `[75]` only** in Next 16 — declare `[50,75,100]` if you serve multiple quality tiers.
8. **`minimumCacheTTL` default is now 4h** (was 60s). Fine for content; only lower it if feature-image updates must appear within minutes.
9. **dnd-kit: use legacy `@dnd-kit/core` + `@dnd-kit/sortable`**, not the pre-1.0 `@dnd-kit/react`.
10. **isomorphic-dompurify `ERR_REQUIRE_ESM`** — pin `jsdom@25.0.1` via pnpm overrides if it surfaces.
11. **Node 20.9+ minimum** (sharp + Next + isomorphic-dompurify all agree). Use a 20.19 LTS (or 22 LTS) base image.
12. **`pnpm approve-builds`** for `sharp` and native-binary packages, committed to the repo, so the approval persists into Coolify deploys.

---

## Sources (all fetched 2026-07-01)

**Primary (npm registry — authoritative for versions):**
- `registry.npmjs.org`: next@16.2.9, react@19, drizzle-orm@0.45.2, drizzle-kit@0.31.10, better-auth@1.6.23, @tiptap/*@3.27.1, zod@4.4.3, react-hook-form@7.80.0, @hookform/resolvers@5.4.0, @tanstack/react-query@5.101.2, @aws-sdk/client-s3@3.1076.0, sharp@0.35.2, @dnd-kit/core@6.3.1, @dnd-kit/sortable@10.0.0, @dnd-kit/react@0.5.0, isomorphic-dompurify@3.18.0, pg@8.22.0 (dist-tags + publish timestamps + peerDependencies).

**Primary (official docs, raw GitHub):**
- Next.js 16 upgrade guide: `vercel/next.js@canary/docs/01-app/02-guides/upgrading/version-16.mdx` (1257 lines — Turbopack default, proxy rename, async APIs, revalidateTag 2-arg, updateTag/refresh, cacheComponents PPR, next/image changes, removals).
- Better Auth: `better-auth/better-auth@main/docs/content/docs/plugins/admin.mdx` (RBAC = admin plugin, createAccessControl, userHasPermission) + `docs/content/docs/integrations/next.mdx` (proxy.ts pattern, Next 16 compatibility).
- Drizzle: `drizzle-team/drizzle-orm-docs@main/src/content/docs/guides/postgresql-full-text-search.mdx` (tsvector/GIN/websearch_to_tsquery/ts_rank recipe) + `src/mdx/get-started/{postgresql/ConnectPostgreSQL,SetupConfig,ApplyChanges}.mdx` (config, client, generate/migrate/push).
- sharp: `lovell/sharp@main/README.md` (Node ≥20.9.0, resize/webp API).
- isomorphic-dompurify: `kkomelin/isomorphic-dompurify@master/README.md` (jsdom pin known issue, clearWindow).
- dnd-kit: `clauderic/dnd-kit@main/README.md` (new arch package list — confirms rewrite).
- @aws-sdk/client-s3: `aws/aws-sdk-js-v3@main/clients/client-s3/README.md` (S3Client + command pattern).

**GitHub Releases API:**
- Coolify: `coollabsio/coolify` latest = `v4.1.2` (2026-06-04).

**Environment/tooling notes (verified during research):**
- The `gsd-tools` research seam's `brave` provider was unavailable (`BRAVE_API_KEY not set`); built-in `WebSearch` was rate-limited; `context7`/`exa` MCP tools were not in the available toolset. Version verification therefore used the **npm registry directly** (`registry.npmjs.org/<pkg>/latest` and dist-tags), which is a more authoritative source than search results.
