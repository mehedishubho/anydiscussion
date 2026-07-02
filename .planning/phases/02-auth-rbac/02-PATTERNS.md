# Phase 2: Auth + RBAC - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 11 (8 new, 3 modified)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/auth/index.ts` (NEW) | config/service | request-response | `src/lib/db/index.ts` | exact (singleton module pattern) |
| `src/lib/auth/permissions.ts` (NEW) | config | transform | `src/db/schema.ts` | role-match (declarative config export) |
| `src/lib/auth/client.ts` (NEW) | config/provider | request-response | `src/lib/db/index.ts` + `src/components/auth/SignInForm.tsx` | role-match (client-side entry consumed by forms) |
| `src/lib/auth/server.ts` (NEW) | service | request-response | `src/lib/db/index.ts` | exact (server-only re-export barrel) |
| `src/lib/permissions/index.ts` (NEW) | middleware/utility | request-response | `src/lib/log/index.ts` + `src/lib/db/index.ts` | role-match (server-only helper importing `@/lib/*`) |
| `src/lib/permissions/post-transitions.ts` (NEW) | service | CRUD | `src/lib/r2/index.ts` | role-match (thin domain-logic helper over shared infra) |
| `src/lib/email/index.ts` (NEW) | provider/utility | request-response | `src/lib/log/index.ts` + `src/lib/r2/index.ts` | exact (thin wrapper around external SDK) |
| `src/app/api/auth/[...all]/route.ts` (NEW) | route | request-response | `src/app/(full-width-pages)/(auth)/signin/page.tsx` (route-handler shape) + RESEARCH.md Pattern (toNextJsHandler) | role-match (no existing API route — see "No Analog") |
| `src/actions/users.ts` (NEW) | service | CRUD | `src/lib/r2/index.ts` + `scripts/test-migrations.mjs` | role-match (no existing `src/actions/` dir — action-first convention is new this phase) |
| `proxy.ts` (NEW, repo root) | middleware | request-response | NONE in repo (Next 16 rename of middleware.ts; no predecessor) | no-analog (use RESEARCH.md Pattern 4) |
| `src/db/schema.ts` (MODIFIED) | model | CRUD | `src/db/schema.ts` itself + `src/db/migrations/0000_*.sql` | exact (extend existing file) |
| `scripts/test-migrations.mjs` (MODIFIED) | test | batch | `scripts/test-migrations.mjs` itself | exact (update expected-table-count assertion 8 → 12) |
| `src/app/(full-width-pages)/(auth)/signup/page.tsx` (MODIFIED) | component | request-response | `src/app/(full-width-pages)/(auth)/signup/page.tsx` + `src/components/auth/SignUpForm.tsx` | exact (repurpose existing page per D-07) |
| `src/components/auth/SignInForm.tsx` (MODIFIED) | component | request-response | `src/components/auth/SignInForm.tsx` itself | exact (wire existing form to Better Auth client) |
| `.env.example` (NEW) | config | n/a | `drizzle.config.ts` (env-reading convention) + `src/lib/r2/index.ts` (env-var-with-dev-default pattern) | role-match |

## Pattern Assignments

### `src/lib/auth/index.ts` (config/service, request-response)

**Analog:** `src/lib/db/index.ts` (lines 1-19) — the canonical singleton module pattern. Both are server-only, env-driven, single-instance exports that the rest of the app imports from.

**Imports + singleton pattern** (`src/lib/db/index.ts` lines 1-19):
```typescript
// src/lib/db/index.ts
// [VERIFIED: drizzle-orm/node-postgres + pg driver API — RESEARCH.md Pattern 2 lines 381-393]
// The single Drizzle ORM client singleton. All DB access in the app flows through
// this entry point (T-01-05 mitigation: Drizzle parameterizes every query).
//
// Server-only — NO "use client" directive. Reads DATABASE_URL from env (never
// hardcoded — ASVS V8). Real secrets live in gitignored .env.local; staging/prod
// via Coolify injection.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export { schema };
```

**What to copy into `src/lib/auth/index.ts`:**
- The header comment block format (file path + `[VERIFIED: ...]` citation + role description).
- The `// Server-only — NO "use client" directive` convention.
- The env-reading pattern (`process.env.X` never hardcoded).
- The single named export (`export const auth = betterAuth({...})`) — mirrors `export const db`.
- The `export { schema }` re-export style for things consumers need (re-export `getSession`).

**Concrete target shape** (from RESEARCH.md Pattern 1, lines 304-376): `betterAuth({...})` with `drizzleAdapter(db, {provider, schema})`, `nextCookies()` LAST in plugins, `emailAndPassword.requireEmailVerification: true`, hooks calling `sendEmail` from `@/lib/email`.

---

### `src/lib/auth/permissions.ts` (config, transform)

**Analog:** `src/db/schema.ts` (lines 15-32) — declarative configuration exported as named constants. Both are pure-data modules consumed by a sibling module.

**Declarative-export pattern** (`src/db/schema.ts` lines 15-32):
```typescript
import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  varchar,
  pgEnum,
  primaryKey,
} from "drizzle-orm/pg-core";

// Enums
export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "pending_review",
  "published",
]);
```

**What to copy into `src/lib/auth/permissions.ts`:**
- Header citation block `[CITED: better-auth/better-auth@main/docs/.../admin.mdx]`.
- Named-export-of-constant style: `export const ac = createAccessControl(statement)`, `export const adminRole = ac.newRole({...})`, etc. (RESEARCH.md Pattern 1, lines 264-302).
- The `as const` assertion on the statement object (matches TS-strict convention).

---

### `src/lib/auth/client.ts` (config/provider, request-response)

**Analog (structure):** `src/lib/db/index.ts` (singleton factory export).
**Analog (consumer):** `src/components/auth/SignInForm.tsx` lines 1-8 (the client component that will call `authClient.signIn.email(...)`).

**Client-component consumer pattern** (`src/components/auth/SignInForm.tsx` lines 1-8):
```typescript
"use client";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import React, { useState } from "react";
```

**What to copy into `src/lib/auth/client.ts`:**
- NO `"use client"` directive at the module top (it's a factory, not a component) — but the file is browser-only (imports `better-auth/react`).
- `export const authClient = createAuthClient({ plugins: [adminClient({ac, roles})] })` — RESEARCH.md Code Examples lines 914-930.
- The `@/` path alias (matches `@/lib/db`, `@/icons` convention).

---

### `src/lib/auth/server.ts` (service, request-response)

**Analog:** `src/lib/db/index.ts` (re-export barrel) + `src/lib/log/index.ts` (thin wrapper).

**Thin-wrapper + re-export pattern** (`src/lib/log/index.ts` lines 1-16):
```typescript
// Dependency-free, server-safe structured log wrapper (D-17).
// NO "use client" directive — must be safe for Server Components.
// Swappable to pino later (Phase 7) — keep the interface minimal.

type LogContext = Record<string, unknown>;

export const log = {
  info(msg: string, ctx?: LogContext): void {
    console.info(JSON.stringify({ level: "info", msg, ...ctx }));
  },

  error(msg: string, ctx?: LogContext): void {
    console.error(JSON.stringify({ level: "error", msg, ...ctx }));
  },
};
```

**What to copy into `src/lib/auth/server.ts`:**
- `// NO "use client" directive` header (server-safe).
- Re-export `getSession` from `./index.ts` and the permission helpers from `@/lib/permissions` so Server Actions / RSC have ONE import surface (`import { getSession, requireRole, requireCan } from "@/lib/auth/server"`).
- Minimal surface — like `log`, keep it a thin pass-through.

---

### `src/lib/permissions/index.ts` (middleware/utility, request-response)

**Analog:** `src/lib/log/index.ts` (server-only helper module) + `src/lib/db/index.ts` (imports `@/db/schema`, `@/lib/*`).

**Server-only helper pattern** (`src/lib/log/index.ts` full file, 16 lines):
- Header comment naming the decision tag (e.g. `// (Pitfall #1 + #4)`).
- No `"use client"`.
- Named function exports with JSDoc (`/** ... */` — see `src/lib/r2/index.ts` lines 41-50 for the JSDoc convention).

**JSDoc convention to mirror** (`src/lib/r2/index.ts` lines 41-50):
```typescript
/**
 * Upload 3 sharp-derived WebP variants of an image buffer to S3-compatible
 * storage. Produces variants at widths 640 (sm), 1024 (md), 1920 (lg), each at
 * quality 80 with `fit: "inside"` and `withoutEnlargement: true`.
 *
 * @param buffer  Source image buffer (any sharp-supporting format).
 * @param baseKey Object key prefix, server-generated e.g. "posts/2026/07/my-image".
 *                produces keys `${baseKey}-sm.webp`, `${baseKey}-md.webp`, `${baseKey}-lg.webp`.
 * @returns Array of UploadedVariant metadata (key, dimensions, format, sizeBytes).
 */
```

**What to copy into `src/lib/permissions/index.ts`:**
- Imports: `import { auth } from "@/lib/auth"; import { headers } from "next/headers"; import { db, schema } from "@/lib/db"; import { eq } from "drizzle-orm"; import { log } from "@/lib/log";` (all `@/` aliased — matches `src/lib/r2/index.ts` import style).
- JSDoc on every exported helper (`requireRole`, `requireCan`, `assertOwnsPost`, `getSessionOrThrow`).
- Error handling: throw `new Error("UNAUTHORIZED" | "FORBIDDEN")` + `log.error(...)` before throwing (mirrors `log` usage). See RESEARCH.md Pattern 3, lines 423-483 for the exact function bodies.

---

### `src/lib/permissions/post-transitions.ts` (service, CRUD)

**Analog:** `src/lib/r2/index.ts` (thin domain-logic helper that composes shared infra: `db` + `schema` + the permission helpers). Same file does: validate input → call external/infra → return metadata.

**Infra-composition pattern** (`src/lib/r2/index.ts` lines 51-91):
```typescript
export async function uploadImageVariants(
  buffer: Buffer,
  baseKey: string,
): Promise<UploadedVariant[]> {
  const variants: UploadedVariant[] = [];
  const sizes = [
    { width: 640, suffix: "sm" },
    { width: 1024, suffix: "md" },
    { width: 1920, suffix: "lg" },
  ];

  for (const size of sizes) {
    const { data, info } = await sharp(buffer)
      .resize(size.width, undefined, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    // ... write to S3, push variant metadata
  }
  return variants;
}
```

**What to copy into `post-transitions.ts`:**
- Header comment citing the decision tags: `// [CITED: project-specific — D-13/D-14/D-15; built on postStatusEnum from src/db/schema.ts]`.
- A `TRANSITIONS` record constant (like `sizes` above) declared at module top, then a single exported `transitionPost(postId, target)` function that composes `assertOwnsPost` + `requireCan` + `db.update`. See RESEARCH.md Pattern 6, lines 585-643.

---

### `src/lib/email/index.ts` (provider/utility, request-response)

**Analog:** `src/lib/log/index.ts` (thin wrapper, fire-and-forget) + `src/lib/r2/index.ts` (thin wrapper around an external SDK with env-driven config).

**Thin-wrapper-around-external-SDK pattern** (`src/lib/r2/index.ts` lines 13-31):
```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

// Env-driven config — MinIO locally, R2 in staging/prod (D-12).
// Defaults match .env.example (shipped in Plan 01 Task 1c) for zero-config local dev.
const endpoint = process.env.S3_ENDPOINT || "http://localhost:9000";
const region = process.env.S3_REGION || "us-east-1";
const accessKeyId = process.env.S3_ACCESS_KEY_ID || "minioadmin";
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "minioadmin";
const bucket = process.env.S3_BUCKET || "anydiscussion-media";

export const s3Client = new S3Client({
  region,
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle,
});
```

**What to copy into `src/lib/email/index.ts`:**
- `import { Resend } from "resend";` + `const resend = new Resend(process.env.RESEND_API_KEY);` (mirrors `s3Client` singleton).
- Env-driven `EMAIL_FROM` default: `process.env.EMAIL_FROM ?? "onboarding@resend.dev"` (mirrors the `endpoint || "http://localhost:9000"` dev-default pattern).
- Single exported async function `sendEmail({to, subject, text, html?})` — fire-and-forget on error (`return;` not `throw`, to avoid timing attacks per RESEARCH.md Pattern 7 lines 654-683).
- `// Server-only — NO "use client" directive` header (Resend key must never reach client — ASVS V8, matches `src/lib/db/index.ts` convention).
- Header citation `[CITED: resend npm README]` (matches `src/lib/r2/index.ts` citation style).

---

### `src/app/api/auth/[...all]/route.ts` (route, request-response)

**Analog:** No existing API route in the repo (`src/app/api/` does not exist — verified via Glob). This is the FIRST API route in the project.

**Closest structural analog:** `src/app/(full-width-pages)/(auth)/signin/page.tsx` (lines 1-11) — shows the Next.js route-file convention: default export + named metadata/config exports + thin delegation to a handler.

**Route-file convention** (`src/app/(full-width-pages)/(auth)/signin/page.tsx` lines 1-11):
```typescript
import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Next.js SignIn Page | TailAdmin - Next.js Dashboard Template",
  description: "This is Next.js Signin Page TailAdmin Dashboard Template",
};

export default function SignIn() {
  return <SignInForm />;
}
```

**What to copy into `route.ts`:**
- The thin-delegation style: import the handler, export named bindings, no logic in the route file itself.
- Target shape (RESEARCH.md Code Examples lines 903-909):
```typescript
// src/app/api/auth/[...all]/route.ts
// [CITED: next.mdx — Create API Route]
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```
- Header citation block format (matches the `[VERIFIED: ...]` / `[CITED: ...]` convention used in every `src/lib/*` file).

---

### `src/actions/users.ts` (service, CRUD)

**Analog:** `src/lib/r2/index.ts` (thin domain-logic service over shared infra) + `scripts/test-migrations.mjs` (the only existing file using `db` queries directly, showing the `Pool`/`drizzle`/`pg` query pattern). The `src/actions/` directory does NOT exist yet — this file ESTABLISHES the action-first convention.

**DB-query pattern** (`scripts/test-migrations.mjs` lines 33-40 — the project's only existing example of querying via the pool):
```javascript
const result = await pool.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name;
`);
const tables = result.rows.map((r) => r.table_name);
```

**Drizzle query-builder pattern** (from RESEARCH.md Pattern 3 lines 472-477, which composes `@/lib/db`):
```typescript
const [post] = await db
  .select({ authorId: schema.posts.authorId })
  .from(schema.posts)
  .where(eq(schema.posts.id, postId))
  .limit(1);
```

**What to copy into `src/actions/users.ts`:**
- Top directive: `"use server";` (mandatory for Server Actions).
- Header comment citing decision tags: `// [CITED: admin.mdx — createUser; D-08 self-disable is project-specific]`.
- Imports via `@/` alias: `import { auth } from "@/lib/auth"; import { db, schema } from "@/lib/db"; import { eq, count } from "drizzle-orm"; import { log } from "@/lib/log";`.
- The security-critical `createFirstAdmin` MUST lead with the `count(admins)===0` check BEFORE any Better Auth call (RESEARCH.md Pattern 5, lines 547-576). Mirror the `log.error(...) + throw` error pattern from `src/lib/log/index.ts` usage.
- Other actions (`createUser`, `banUser`, `unbanUser`, `revokeSessions`) each start with `requireCan(...)` — RESEARCH.md Code Examples lines 883-898.

---

### `proxy.ts` (middleware, request-response) — NEW at repo root

**Analog:** NONE in repo. Verified via Glob: no `middleware.ts` and no `proxy.ts` exist anywhere. Next 16 renamed `middleware.ts` → `proxy.ts`, and this project never had either.

**Use RESEARCH.md Pattern 4 (lines 487-527) as the canonical template.** No codebase pattern to mirror — this file establishes the convention.

**Nearest stylistic analog for the header comment + config export:** `eslint.config.mjs` (lines 1-4) and `drizzle.config.ts` (lines 1-14) — both are repo-root config files with a header comment + a named config export.

**Repo-root config-file convention** (`drizzle.config.ts` lines 1-14):
```typescript
// drizzle.config.ts (repo root)
// [VERIFIED: drizzle-kit 0.31.10 defineConfig API + CLI test]
// Schema source of truth: src/db/schema.ts. Migration output: src/db/migrations/.
// Forward-only (D-11) — no down/rollback migrations anywhere.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**What to copy into `proxy.ts`:**
- Header comment block: file path, `[CITED: better-auth/.../next.mdx — Next.js 16+ (Proxy)]`, and the Pitfall #4 callout (`// *** UX-ONLY — NOT authoritative RBAC ***`).
- `export const config = { matcher: [...] }` at the bottom (mirrors the named-config-export style of `drizzle.config.ts`).
- The `matcher` must target resolved URL paths (`/dashboard/:path*`, `/signin`, `/signup`), NOT the literal `(admin)` route-group string — route groups in parens don't appear in URLs. See RESEARCH.md Pattern 4 lines 520-526.

---

### `src/db/schema.ts` (MODIFIED — model, CRUD)

**Analog:** itself. This is an in-place extension of the existing 8-table schema.

**Current FK pattern to extend** (`src/db/schema.ts` lines 43-44 — the Phase-1 deferred-FK columns):
```typescript
  authorId: integer("author_id"), // plain column now; FK added Phase 2 (D-07)
  categoryId: integer("category_id"), // plain column; FK added Phase 2 (matches D-07 deferred-FK posture)
```

**Existing `.references()` pattern already in the same file** (lines 85-87 — `postTags` join table):
```typescript
  postTags = pgTable("post_tags", {
    postId: integer("post_id").notNull().references(() => posts.id),
    tagId: integer("tag_id").notNull().references(() => tags.id),
  }, ...)
```

**What to change in `schema.ts`:**
- Add the Better-Auth-CLI-generated `user`/`session`/`account`/`verification` tables (from `npx @better-auth/cli generate`). Place them ABOVE the existing `posts` table so the `posts.authorId` FK reference resolves (or rely on TS hoisting — Drizzle allows forward references via arrow funcs regardless of order, matching the `postTags` pattern).
- Change `authorId` to `integer("author_id").references(() => user.id)` — mirrors the `postTags.postId` `.references(() => posts.id)` pattern exactly.
- Change `categoryId` to `integer("category_id").references(() => categories.id)` — same pattern.
- Add `role`/`banned`/`banReason`/`banExpires` (admin-plugin) + `bio`/`avatar` (additionalFields) on `user`. RESEARCH.md Pattern 2 lines 380-417.
- Update the header comment block to reference the new decision tags (D-24/D-25 for bio/avatar).

---

### `scripts/test-migrations.mjs` (MODIFIED — test, batch)

**Analog:** itself. One-line assertion update.

**The assertion to change** (`scripts/test-migrations.mjs` lines 42-51):
```javascript
    const expected = [
      "posts",
      "post_seo",
      "categories",
      "tags",
      "post_tags",
      "media",
      "settings",
      "pages",
    ];
```

**What to change:** extend `expected` to include the 4 new auth tables (`user`, `session`, `account`, `verification`) — count goes 8 → 12. Update the header comment `// asserts all 8 expected tables` → `12`. Everything else (the `migrate()` call, the `information_schema` query, the pool lifecycle) is unchanged.

---

### `src/app/(full-width-pages)/(auth)/signup/page.tsx` (MODIFIED — repurposed as first-run setup per D-07)

**Analog:** itself + `src/components/auth/SignUpForm.tsx`.

**Current page** (`src/app/(full-width-pages)/(auth)/signup/page.tsx` lines 1-12):
```typescript
import SignUpForm from "@/components/auth/SignUpForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Next.js SignUp Page | TailAdmin - Next.js Dashboard Template",
  description: "This is Next.js SignUp Page TailAdmin Dashboard Template",
};

export default function SignUp() {
  return <SignUpForm />;
}
```

**What to change:**
- The page becomes a Server Component that checks `count(admins)===0` before rendering — if admins exist, redirect to `/signin`. RESEARCH.md Pattern 5 + D-06/D-07/D-08.
- Update `metadata.title` to reflect the setup-wizard purpose (e.g. "Create Admin Account").
- The `SignUpForm` component gets a `action={createFirstAdmin}` prop (Server Action binding) — the existing form structure (name/email/password fields) is reused, social-auth buttons removed.
- Keep the existing import paths (`@/components/auth/SignUpForm`, `next`) — matches the project's `@/` alias convention.

---

### `src/components/auth/SignInForm.tsx` (MODIFIED — wire to Better Auth client)

**Analog:** itself.

**Current form** (`src/components/auth/SignInForm.tsx` lines 87-136): a plain `<form>` with no `onSubmit`/`action`. The "Keep me logged in" `Checkbox` (lines 117-122) already maps to Better Auth's `rememberMe` param (D-18).

**What to change:**
- Add `import { authClient } from "@/lib/auth/client";` at the top (keeps the existing `@/` alias import style).
- Bind the form's `onSubmit` to call `authClient.signIn.email({ email, password, rememberMe: isChecked, callbackURL })`.
- The existing `Checkbox` state (`isChecked`) wires directly to `rememberMe`.
- Remove the Google/X social buttons (out of scope — locked exclusion) OR leave them inert (planner discretion). Keep the rest of the TailAdmin markup intact to preserve the design.

---

### `.env.example` (NEW — config)

**Analog:** `drizzle.config.ts` (env-reading convention `process.env.DATABASE_URL!`) + `src/lib/r2/index.ts` (env-with-dev-default pattern).

**Env-default pattern** (`src/lib/r2/index.ts` lines 18-24):
```typescript
const endpoint = process.env.S3_ENDPOINT || "http://localhost:9000";
const region = process.env.S3_REGION || "us-east-1";
const accessKeyId = process.env.S3_ACCESS_KEY_ID || "minioadmin";
```

**What to put in `.env.example`:** the exact var list from RESEARCH.md "Env Var Checklist" lines 960-981 — `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `RESEND_API_KEY`, `EMAIL_FROM`, plus the existing `DATABASE_URL` / `TEST_DATABASE_URL`. Use inline `#` comments documenting the dev default (matches `src/lib/r2/index.ts`'s `// Defaults match .env.example ... for zero-config local dev` ethos).

---

## Shared Patterns

### Server-only module convention
**Source:** `src/lib/db/index.ts` line 6, `src/lib/log/index.ts` line 2, `src/lib/r2/index.ts` line 10.
**Apply to:** `src/lib/auth/index.ts`, `src/lib/auth/server.ts`, `src/lib/permissions/*`, `src/lib/email/index.ts`, `src/actions/users.ts`, `src/app/api/auth/[...all]/route.ts`.
```typescript
// Server-only — NO "use client" directive.
```
Every server-only module in this project opens with this comment. It is the single most consistent cross-cutting convention. Client-touching code (`src/lib/auth/client.ts`, the auth form components) DOES carry `"use client"`.

### Env-driven config with dev defaults
**Source:** `src/lib/r2/index.ts` lines 18-24, `src/lib/image-loader.ts` line 15, `drizzle.config.ts` line 12.
**Apply to:** `src/lib/auth/index.ts` (BETTER_AUTH_SECRET/URL/TRUSTED_ORIGINS), `src/lib/email/index.ts` (RESEND_API_KEY, EMAIL_FROM).
```typescript
const cdnBase = process.env.NEXT_PUBLIC_CDN_URL || "http://localhost:9000";
```
Pattern: `process.env.X || "<dev-default>"`. Secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`) have NO default (fail loud); infra endpoints (`S3_ENDPOINT`, `EMAIL_FROM`) get a dev default. `.env.example` documents both.

### Header citation block
**Source:** every `src/lib/*` file and `src/db/schema.ts`.
**Apply to:** ALL 8 new files.
```typescript
// src/lib/<name>/index.ts
// [CITED: <doc path / RESEARCH.md Pattern N lines X-Y>]
// <one-line role description>. <decision tag (D-NN)>.
```
This project cites upstream docs/decisions in every source file header. New files must follow suit — the planner should embed the relevant `[CITED: ...]` tag and decision tags (D-08, D-09, Pitfall #1/#4, etc.) into each new file's header.

### `@/` path alias
**Source:** `tsconfig.json` `paths` (referenced in `src/lib/db/index.ts` `import * as schema from "@/db/schema"`), used everywhere.
**Apply to:** all new imports. Never use relative paths that cross module boundaries (`../../..`) — use `@/lib/auth`, `@/lib/db`, `@/lib/log`, `@/actions/users`. Matches the ESLint `no-restricted-imports` message text ("Use shared @/lib, @/db, or @/actions instead").

### Structured logging via `@/lib/log`
**Source:** `src/lib/log/index.ts` (the `log.info` / `log.error` JSON wrapper).
**Apply to:** `src/lib/permissions/*` (log permission denials before throwing), `src/actions/users.ts` (log `createFirstAdmin` self-disable trigger, ban/unban events).
```typescript
log.error("permission denied", { requiredRole: role, userRole: session.user.role });
throw new Error("FORBIDDEN");
```
Always `log` THEN `throw` — the error path emits structured context before propagating. See RESEARCH.md Pattern 3 lines 447-465 for the exact idiom.

### Route-group isolation (ESLint-enforced)
**Source:** `eslint.config.mjs` lines 17-54.
**Apply to:** placement of new files. Auth helpers MUST live under `src/lib/auth/` + `src/lib/permissions/` (outside `app/`), so `(admin)` can import them without `(site)` accidentally pulling dashboard/auth code. NEVER place auth code inside `src/app/(site)/`. The `no-restricted-imports` rule message explicitly names `@/lib`, `@/db`, `@/actions` as the sanctioned shared boundaries.

---

## No Analog Found

| File | Role | Data Flow | Reason | Fallback |
|------|------|-----------|--------|----------|
| `proxy.ts` | middleware | request-response | No `middleware.ts` or `proxy.ts` exists anywhere in the repo (Glob-verified). Next 16 renamed the file; this project has never had one. | Use **RESEARCH.md Pattern 4 (lines 487-527)** verbatim. Mirror the repo-root config-file *style* from `drizzle.config.ts` (header comment + named config export). |
| `src/app/api/auth/[...all]/route.ts` | route | request-response | `src/app/api/` does not exist — this is the project's first API route (Server Actions are the default mutation path per CLAUDE.md; API routes are only for external/webhook needs, and Better Auth's handler is exactly that). | Use **RESEARCH.md Code Examples (lines 903-909)** — 4-line file, thin delegation to `toNextJsHandler(auth)`. Mirror the route-file *style* from `signin/page.tsx` (thin import + named exports). |
| `src/actions/users.ts` | service | CRUD | `src/actions/` directory does not exist — this file ESTABLISHES the Server Actions convention for the project (Phase 2 is action-first per CONTEXT.md "Established Patterns"). | Compose `src/lib/r2/index.ts`'s infra-composition style + `scripts/test-migrations.mjs`'s DB-query idiom + RESEARCH.md Patterns 3 & 5 for the bodies. |

---

## Metadata

**Analog search scope:** `src/lib/**`, `src/db/**`, `src/app/**`, `src/components/auth/**`, `scripts/**`, repo root (`*.config.ts`, `eslint.config.mjs`, `package.json`).
**Files scanned:** ~18 source files read; Glob over `src/**/*.{ts,tsx}`, `*.ts`, `*.mjs`.
**Pattern extraction date:** 2026-07-02
