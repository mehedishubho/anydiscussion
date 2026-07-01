# Phase 1: Foundation - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 22 (new + modified + deleted)
**Analogs found:** 12 / 17 implementable (5 have no in-repo analog — use RESEARCH.md code shapes)

This is a greenfield-on-scaffold phase. The repo is the stock TailAdmin `free-nextjs-admin-dashboard` — there is **no existing `lib/`, `db/`, `actions/`, or `scripts/` directory** and no Drizzle/R2/Postgres infrastructure. Where an in-repo structural analog exists (config files, route-group layouts, hook conventions), it is mapped below. Where none exists, the planner MUST use the verified code shapes in `01-RESEARCH.md` (Patterns 1-5 + Code Examples) as the authoritative pattern.

## File Classification

Legend — Match quality:
- **exact** = same role + same data flow in-repo
- **structural** = different purpose, same file shape/conventions (config object, layout export, hook export)
- **none** = no in-repo analog; RESEARCH.md code shape is authoritative

### NEW files

| New File | Role | Data Flow | Closest Analog | Match |
|------------------|------|-----------|----------------|-------|
| `src/db/schema.ts` | model | CRUD (schema def) | — | none → RESEARCH.md Pattern 2 |
| `src/db/index.ts` | model (barrel) | CRUD | — | none → new `export *` barrel |
| `src/db/migrations/` (generated) | migration | batch | — | none → `drizzle-kit generate` output |
| `src/lib/db/index.ts` | service (client) | request-response | — | none → RESEARCH.md Pattern 2 |
| `src/lib/r2/index.ts` | service | file-I/O / transform | — | none → RESEARCH.md Pattern 4 |
| `src/lib/log/index.ts` | utility | request-response | `src/hooks/useModal.ts` (small named-export util) | structural |
| `src/app/error.tsx` | component (boundary) | event-driven (error) | `src/app/not-found.tsx` | structural |
| `src/app/(site)/layout.tsx` | route (layout) | request-response | `src/app/(admin)/layout.tsx` + `(full-width-pages)/layout.tsx` | structural |
| `src/app/(site)/page.tsx` | route (page) | request-response | `src/app/(admin)/page.tsx` | structural |
| `src/lib/image-loader.ts` | utility (config) | request-response | — | none → RESEARCH.md Pattern 1 |
| `drizzle.config.ts` | config | request-response | — | none → RESEARCH.md Pattern 2 |
| `docker-compose.yml` | config (infra) | batch | — | none → RESEARCH.md Pattern 5 |
| `.env.example` | config | request-response | `.gitignore` (lines 29-30 show env-file convention) | structural |
| `scripts/setup.mjs` | utility (script) | batch | — | none → RESEARCH.md (script conventions below) |
| `scripts/verify.mjs` | utility (script) | batch | — | none → RESEARCH.md |
| `scripts/test-migrations.mjs` | test (script) | batch | — | none → RESEARCH.md Code Examples |
| `.eslint-planted-test/` (planted cross-group import fixture) | test | request-response | — | none → RESEARCH.md Pattern 3 |

### MODIFIED files

| Modified File | Role | Data Flow | Closest Analog | Match |
|------------------|------|-----------|----------------|-------|
| `next.config.ts` | config | request-response | itself (existing) | exact |
| `eslint.config.mjs` | config | request-response | itself (existing) | exact |
| `package.json` | config | request-response | itself (existing) | exact |
| `src/app/layout.tsx` (optional — extend root layout) | route (layout) | request-response | itself (existing) | exact |

### DELETED files

| Deleted File | Reason |
|------------------|--------|
| `.eslintrc.json` | D-13 / D-18 — ESLint 9 flat-config only; legacy file conflicts with `eslint.config.mjs` |
| `package-lock.json` | D-18 — pnpm-only constraint; replaced by existing `pnpm-lock.yaml` |
| `src/components/ecommerce/` (directory) | D-18 — CLAUDE.md marks out-of-scope demo scaffolding |

---

## Pattern Assignments

### `next.config.ts` (config — MODIFY)

**Analog:** itself (existing file at repo root). **Excerpt — current shape (lines 1-24):**
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
};

export default nextConfig;
```

**What to preserve:** the `NextConfig` typed const + default export pattern; the existing SVG webpack + turbopack rules (used across `GridShape`, `not-found.tsx`, etc.).
**What to add (per RESEARCH.md Pattern 1):** `cacheComponents: true`, `output: "standalone"`, `images.qualities`, `images.remotePatterns` (CDN + MinIO localhost), and `images.loader: "custom"` + `images.loaderFile` pointing at `src/lib/image-loader.ts`.
**Authoritative code shape:** `01-RESEARCH.md` Pattern 1 (lines 303-338) — verified against `node_modules/next/dist/server/config-shared.d.ts`.

---

### `eslint.config.mjs` (config — MODIFY)

**Analog:** itself (existing). **Excerpt — current shape (lines 1-18):**
```javascript
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
```

**What to preserve:** the `defineConfig([...])` flat-config array spread, the `globalIgnores` call.
**What to add (per RESEARCH.md Pattern 3, lines 528-570):** two `files`-scoped config objects (one for `src/app/(site)/**/*`, one for `src/app/(admin)/**/*`) each carrying a `no-restricted-imports` `["error", { patterns: [...] }]` rule. Use **literal glob patterns** (`@/app/(admin)/*`) — NOT regex (Pitfall 4 in RESEARCH.md).
**Verified:** ESLint 9.39.4 `no-restricted-imports` flags `@/app/(admin)/posts/page` while allowing `@/lib/db` (RESEARCH.md Sources).

---

### `package.json` (config — MODIFY)

**Analog:** itself (existing). **Excerpt — scripts block (lines 5-10):**
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint ."
},
```

**What to preserve:** existing `dev`/`build`/`start`/`lint` scripts.
**What to add:**
1. New deps — `drizzle-orm@^0.45.2`, `pg@^8.22.0`, `@aws-sdk/client-s3@^3.1077.0`, `sharp@^0.35.2`; dev: `drizzle-kit@^0.31.10`, `@types/pg@^8.20.0`. Exact install commands in RESEARCH.md "Installation" (lines 146-157).
2. New scripts — `"setup"`, `"verify"`, `"test:migrations"`, `"db:generate"`. Convention: invoke `.mjs` files in `scripts/` via `node scripts/setup.mjs` (cross-platform/Windows-safe per D-04 — never bare `bash`).
3. `"pnpm": { "onlyBuiltDependencies": ["sharp"] }` — persisted by `pnpm approve-builds` (Pitfall 2).
4. Remove `package-lock.json` (D-18) — `pnpm-lock.yaml` already present at repo root.

---

### `src/app/(site)/layout.tsx` (route layout — NEW)

**Analog:** `src/app/(full-width-pages)/layout.tsx` (minimal pass-through) AND `src/app/(admin)/layout.tsx` (full feature layout). **Excerpts:**

`src/app/(full-width-pages)/layout.tsx` (lines 1-7) — the minimal pass-through shape to copy:
```tsx
export default function FullWidthPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div>{children}</div>;
}
```

`src/app/(admin)/layout.tsx` (lines 1-39) — the "use client" + provider + layout-class pattern (reference only; the `(site)` layout should stay **server-component** and lean per CLAUDE.md "public site fast/server-first").

**Convention to follow:**
- Default-export a named function (`export default function XLayout(...)`).
- Typed `{ children }: { children: React.ReactNode }` signature (universal across all 4 existing layouts).
- Server Component by default (NO `"use client"` directive) — the public site must stay server-first per CLAUDE.md.
- Import shared components via `@/components/site/*` alias (D-16: `@/*` → `src/*`).

---

### `src/app/(site)/page.tsx` (route page — NEW)

**Analog:** `src/app/(admin)/page.tsx` (lines 1-42). **Excerpt — the `Metadata` export + default-export-page pattern:**
```tsx
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "...",
  description: "...",
};

export default function Ecommerce() {
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      {/* ... */}
    </div>
  );
}
```

**What to copy:** the `export const metadata: Metadata` pattern for SEO (CLAUDE.md mandates `generateMetadata` per route — for a Phase-1 placeholder, static `metadata` is fine; dynamic `generateMetadata` arrives in later phases). The `export default function PageName()` default export.
**What to avoid:** do NOT import `@/components/ecommerce/*` (that directory is being deleted, D-18) — use a placeholder.

---

### `src/app/error.tsx` (component — global error boundary — NEW)

**Analog:** `src/app/not-found.tsx` (lines 1-47). **Excerpt — the server-component page pattern with `next/image` + Tailwind classes:**
```tsx
import GridShape from "@/components/common/GridShape";
import Image from "next/image";
import Link from "next/link";
import React from "react";

export default function NotFound() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen p-6 overflow-hidden z-1">
      {/* ... */}
    </div>
  );
}
```

**Convention to follow:** default-export function, `next/image` (never raw `<img>`), Tailwind utility classes from the existing `globals.css` theme tokens.
**Required `error.tsx` shape (Next.js 16 mandate):** MUST be a Client Component (`"use client"` — Next.js requirement for error boundaries) and accept `{ error, reset }` props:
```tsx
"use client";
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) { ... }
```
This is the one place where `"use client"` is mandatory despite the server-first preference.

---

### `src/db/schema.ts` (model — NEW)

**Analog:** NONE in repo. **Authoritative pattern:** `01-RESEARCH.md` Pattern 2, "src/db/schema.ts" block (lines 396-495). The full 8-table schema (posts, post_seo, categories, tags, post_tags, media, settings, pages) is already written out verbatim with verified `drizzle-orm/pg-core` builders.
**Key conventions encoded in that excerpt:**
- `pgTable("snake_case_name", { ... })` — table names snake_case, column names snake_case in `serial("id")` form.
- `pgEnum` for status fields.
- Soft-delete via `deletedAt: timestamp("deleted_at")` on content tables (D-08); hard-delete tables (settings, post_tags, post_seo) omit it.
- `posts.authorId: integer("author_id")` is a **plain column now** — FK added in Phase 2 (D-07).
- `pages` carries its own SEO columns (D-06 — no polymorphic SEO table).

---

### `src/db/index.ts` (model barrel — NEW)

**Analog:** none. **Pattern:** standard barrel re-export — `export * from "./schema";`. Small, single-purpose. Keep consistent with the `@/db` import path used by `src/lib/db/index.ts` (RESEARCH.md Pattern 2, line 385: `import * as schema from "@/db/schema";`).

---

### `src/lib/db/index.ts` (service — DB client — NEW)

**Analog:** NONE in repo. **Authoritative pattern:** `01-RESEARCH.md` Pattern 2, "src/lib/db/index.ts" block (lines 381-393). Verified against `drizzle-orm/node-postgres` + `pg` driver APIs.
```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export { schema };
```
**Conventions:** singleton `pool` + `db` export; `@/db/schema` path alias (D-16); reads `DATABASE_URL` from env (never hardcoded — ASVS V8).

---

### `src/lib/r2/index.ts` (service — R2/sharp upload — NEW)

**Analog:** NONE in repo. **Authoritative pattern:** `01-RESEARCH.md` Pattern 4 (lines 579-644). Verified `@aws-sdk/client-s3@3.1077.0` + `sharp@0.35.2` pipeline.
**Key conventions from that excerpt:**
- Env-driven client config (`S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`, etc.) — MinIO locally, R2 in prod (D-12, Pitfall 3).
- `forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true"` — boolean from string env.
- `sharp(buffer).resize(width, undefined, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true })` — returns `{ data, info }`.
- Three WebP variants: 640/1024/1920 (sm/md/lg) per Open Question 2 recommendation.
- `PutObjectCommand` for writes; explicit `ContentType: "image/webp"`.
- Exported `uploadImageVariants(buffer, baseKey)` returns `UploadedVariant[]`.

---

### `src/lib/log/index.ts` (utility — structured log wrapper — NEW)

**Analog:** `src/hooks/useModal.ts` (small named-export utility module, dependency-free). **Excerpt — the compact util pattern (lines 1-12):**
```typescript
"use client";
import { useState, useCallback } from "react";

export const useModal = (initialState: boolean = false) => {
  const [isOpen, setIsOpen] = useState(initialState);
  // ...
  return { isOpen, openModal, closeModal, toggleModal };
};
```
**Convention to copy:** named exports, no default export, dependency-free, typed return shape.
**D-17 mandate:** dependency-free structured console wrapper (swappable to pino later). MUST be safe for Server Components (NO `"use client"` directive — unlike `useModal`). Shape:
```typescript
// Server-safe, dependency-free
export const log = {
  info(msg: string, ctx?: Record<string, unknown>) { console.info(JSON.stringify({ level: "info", msg, ...ctx })); },
  error(msg: string, ctx?: Record<string, unknown>) { console.error(JSON.stringify({ level: "error", msg, ...ctx })); },
};
```

---

### `src/lib/image-loader.ts` (utility — next/image custom loader — NEW)

**Analog:** NONE in repo. **Authoritative pattern:** `01-RESEARCH.md` Pattern 1, image-loader block (lines 342-356). Env-driven `NEXT_PUBLIC_CDN_URL` (D-12). Default-export function with `{ src, width, quality }` signature (Next.js loader contract).

---

### `drizzle.config.ts` (config — NEW)

**Analog:** NONE in repo. **Authoritative pattern:** `01-RESEARCH.md` Pattern 2, config block (lines 366-378). Verified `drizzle-kit@0.31.10` `defineConfig` API.
**Conventions:** repo-root location; `schema: "./src/db/schema.ts"`; `out: "./src/db/migrations"` (per Claude's discretion note); `dialect: "postgresql"`; `dbCredentials.url` from `process.env.DATABASE_URL!`.

---

### `docker-compose.yml` (config — infra — NEW)

**Analog:** NONE in repo. **Authoritative pattern:** `01-RESEARCH.md` Pattern 5 (lines 652-697). Three services: `postgres` (16-alpine, port 5432, healthcheck), `postgres-test` (16-alpine, port 5433, no volume — throwaway for FOUND-06), `minio` (latest, ports 9000/9001, default creds `minioadmin`/`minioadmin`). Named volumes `pgdata`, `miniodata`.
**Convention:** YAML at repo root (D-19) — Docker auto-discovers.

---

### `.env.example` (config — NEW)

**Analog (structural):** `.gitignore` lines 29-30 confirm the layered env-file convention:
```
# local env files
.env*.local
```
This proves `.env.local` is already gitignored — `.env.example` is the committed, documented counterpart (D-03).
**Required vars (per RESEARCH.md Patterns 1-5):** `DATABASE_URL`, `TEST_DATABASE_URL`, `NEXT_PUBLIC_CDN_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`. Ship with **working MinIO defaults** (D-03) so local dev is zero-config.

---

### `scripts/setup.mjs` / `scripts/verify.mjs` / `scripts/test-migrations.mjs` (utility scripts — NEW)

**Analog:** NONE in repo (no `scripts/` directory exists). **Authoritative patterns:**
- `test-migrations.mjs` → `01-RESEARCH.md` "Clean-Room Migration Test Script" (lines 784-829) — complete verbatim implementation using `drizzle-orm/node-postgres/migrator.migrate` + `pg.Pool`, querying `information_schema.tables` to assert all 8 tables exist.
- `verify.mjs` → orchestrates the 5 success-criterion checks per D-15 (next.config validation, drift gate, clean-room test, ESLint planted-import test, `next build`, R2 upload smoke). Uses the drift-gate pattern from RESEARCH.md lines 834-840: `drizzle-kit generate --name ci-drift-check` + `git diff --exit-code src/db/migrations/` (NOT `drizzle-kit check` alone — Pitfall 1).
- `setup.mjs` → D-04 sequence: `pnpm install` → `pnpm approve-builds` (sharp) → `docker compose up -d` → run migrations → confirm MinIO bucket.

**Conventions (derived from project constraints):**
- `.mjs` extension (ESM — matches `eslint.config.mjs` and `prettier.config.js` CommonJS-adjacent style; `.mjs` is the cross-platform Windows-safe choice per D-04).
- `process.exitCode = 1` on failure (NOT `process.exit(1)`) — allows finally blocks to run (see RESEARCH.md line 822).
- Console output with `✓` / `✗` markers (matches RESEARCH.md test script style).
- Cross-platform: shell out via `node:child_process` `execFileSync` or use `execa`-free raw `child_process` — avoid `bash`-isms (primary dev OS is Windows).

---

### `.eslint-planted-test/` (test fixture — NEW)

**Analog:** NONE. **Pattern:** a throwaway `.ts`/`.tsx` file under a `.eslintignore`-excluded or temp directory that contains `import x from "@/app/(admin)/posts/page"` while living in a `(site)` tree, used by `scripts/verify.mjs` to prove the isolation rule fires. RESEARCH.md Pattern 3 + Wave 0 Gaps (line 941) specify this must NOT break the real build — keep it outside `src/app/` or in a path the Next build ignores.

---

## Shared Patterns

### Path Alias (D-16)
**Source:** `tsconfig.json` (lines 25-29) — already correct, no change needed.
**Apply to:** every new file under `src/`.
```json
"paths": {
  "@/*": ["./src/*"]
}
```
Use `@/db/schema`, `@/lib/db`, `@/lib/r2`, `@/lib/log`, `@/components/site/*`. No additional aliases.

### Default-Export Route Convention
**Source:** all 4 existing layouts + `(admin)/page.tsx` + `not-found.tsx`.
**Apply to:** all new `src/app/(site)/**` pages/layouts and `src/app/error.tsx`.
- Layouts: `export default function XLayout({ children }: { children: React.ReactNode })`.
- Pages: `export default function PageName()` + optional `export const metadata: Metadata`.
- Error boundary: `export default function GlobalError({ error, reset })` + mandatory `"use client"`.

### Server-Component-First
**Source:** CLAUDE.md "public site fast/server-first" + `(admin)/layout.tsx` is the only `"use client"` layout (because it uses sidebar state).
**Apply to:** all `src/app/(site)/**` files and `src/lib/db`, `src/lib/r2`, `src/lib/log`.
- NO `"use client"` directive unless strictly necessary (only `error.tsx` mandates it in Phase 1).
- Server Actions and server-only utilities must stay server-side.

### Env-Driven Config (never hardcode secrets — ASVS V8)
**Source:** RESEARCH.md Patterns 1, 2, 4, 5 + `.gitignore` lines 29-30.
**Apply to:** `next.config.ts`, `drizzle.config.ts`, `src/lib/db/index.ts`, `src/lib/r2/index.ts`, `.env.example`.
- Read `process.env.X` with a MinIO default fallback (local-dev zero-config per D-03).
- Only `NEXT_PUBLIC_CDN_URL` is client-exposed (safe).
- Real secrets live in gitignored `.env.local`; staging/prod via Coolify injection.

### Soft-Delete Convention (D-08)
**Source:** RESEARCH.md Pattern 2 schema.
**Apply to:** every content table in `src/db/schema.ts`.
- `deletedAt: timestamp("deleted_at")` on: posts, pages, media, categories, tags.
- Omit on: settings, post_tags, post_seo (hard-delete).
- All later-phase queries filter `WHERE deleted_at IS NULL`.

### Migration Hygiene (D-09, D-10, D-11)
**Source:** RESEARCH.md Pitfall 1 + Code Examples.
**Apply to:** `scripts/verify.mjs`, `scripts/test-migrations.mjs`, CI workflow.
- Drift gate = `drizzle-kit generate` + `git diff --exit-code` (NOT `drizzle-kit check` alone).
- Clean-room test = throwaway `postgres-test` service + `migrate()` + table-count assertion.
- Forward-only: no down-migrations (D-11).

### pnpm-Only + sharp Build Allowlist
**Source:** CLAUDE.md + RESEARCH.md Pitfall 2.
**Apply to:** `package.json`, `scripts/setup.mjs`, all generated docs/commands.
- Every script/command uses `pnpm` (`pnpm add`, `pnpm dlx`, `pnpm run`).
- `package.json` carries `"pnpm": { "onlyBuiltDependencies": ["sharp"] }` so the native-binary postinstall persists across clones.

---

## No Analog Found

Files with no in-repo match — planner uses `01-RESEARCH.md` verified code shapes as the authoritative pattern:

| File | Role | Data Flow | Authoritative Reference |
|------|------|-----------|-------------------------|
| `src/db/schema.ts` | model | CRUD | `01-RESEARCH.md` Pattern 2 (lines 396-495) — full 8-table schema written out |
| `src/db/migrations/` | migration | batch | `drizzle-kit generate` output (RESEARCH.md line 500) |
| `src/lib/db/index.ts` | service | request-response | `01-RESEARCH.md` Pattern 2 (lines 381-393) |
| `src/lib/r2/index.ts` | service | file-I/O | `01-RESEARCH.md` Pattern 4 (lines 579-644) |
| `src/lib/image-loader.ts` | utility | request-response | `01-RESEARCH.md` Pattern 1 (lines 342-356) |
| `drizzle.config.ts` | config | request-response | `01-RESEARCH.md` Pattern 2 (lines 366-378) |
| `docker-compose.yml` | config (infra) | batch | `01-RESEARCH.md` Pattern 5 (lines 652-697) |
| `scripts/setup.mjs` | utility (script) | batch | D-04 + RESEARCH.md (no single excerpt — compose from Patterns 2, 4, 5) |
| `scripts/verify.mjs` | utility (script) | batch | D-15 + RESEARCH.md drift-gate (lines 834-840) + Code Examples |
| `scripts/test-migrations.mjs` | test (script) | batch | `01-RESEARCH.md` Code Examples (lines 784-829) — verbatim |
| `.eslint-planted-test/` | test fixture | request-response | `01-RESEARCH.md` Pattern 3 + Wave 0 Gaps |

**Reason all are "none":** the repo is the stock TailAdmin `free-nextjs-admin-dashboard` scaffold — no DB/ORM/storage/scripting infrastructure existed before this phase. This is expected for a Foundation phase; RESEARCH.md was written to fill exactly this gap with runtime-verified code shapes.

---

## Metadata

**Analog search scope:**
- `D:\Devsroom-Work\anydiscussion\src\app\**` (4 layouts, 2 pages, not-found, globals.css)
- `D:\Devsroom-Work\anydiscussion\src\{components,context,hooks,layout}\**`
- Repo root config: `next.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `package.json`, `.eslintrc.json`, `.gitignore`, `postcss.config.js`, `prettier.config.js`, `svg.d.ts`
- Confirmed empty: `scripts/`, `src/lib/`, `src/db/`, `src/actions/`, `docker-compose.yml`, `drizzle.config.ts`, `.env*`

**Files scanned:** 18 (config + route + component + hook + context files)
**Pattern extraction date:** 2026-07-01
**Source of truth for greenfield code:** `01-RESEARCH.md` Patterns 1-5 + Code Examples (all verified against npm registry + runtime tests on 2026-07-01)
