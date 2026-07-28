# Phase 7: Performance & Deploy - Pattern Map

**Mapped:** 2026-07-28
**Files analyzed:** 21 (11 new, 10 modified; plus 4 verification-only references)
**Analogs found:** 17 / 21 (4 have NO existing analog — Dockerfile, .dockerignore, lighthouserc.json, README/ADR docs)

> Phase 7 is a **verification-and-deployment** phase. The bulk of files are either
> (a) small new infrastructure/config files with no in-repo analog (Dockerfile, lighthouserc.json),
> (b) modifications to existing files where the file IS its own analog (auth config, rate-limit module), or
> (c) audit deliverables (revalidation table, ISR ADR) that follow the existing `.planning/` markdown convention.
> The only genuinely new application code is the ioredis singleton + the @upstash/ratelimit adapter (~30 lines).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `Dockerfile` (NEW) | config | build-pipeline | — (none in repo) | no analog |
| `.dockerignore` (NEW) | config | build-pipeline | — (none in repo) | no analog |
| `lighthouserc.json` (NEW) | config | batch (audit) | — (none in repo) | no analog |
| `docker-compose.yml` (MODIFY) | config | service-def | itself (extend existing services) | exact |
| `scripts/check-bundle-size.mjs` (NEW) | utility | file-I/O + transform | `scripts/verify.mjs` (Check 6 spawn+assert shape) | role-match |
| `scripts/test-publish-visible.mjs` (NEW) | utility | request-response | `scripts/test-auth-gate.mjs` (spawn next start + poll + assert) | role-match |
| `scripts/test-auth-ratelimit.mjs` (NEW) | utility | request-response | `scripts/test-auth-gate.mjs` (spawn server + HTTP assert) | role-match |
| `src/lib/redis/index.ts` (NEW) | service | singleton (stateful) | `src/lib/db/index.ts` (DB singleton) | role-match |
| `src/lib/rate-limit/upstash-ioredis-adapter.ts` (NEW) | service | adapter (transform) | `src/lib/email/index.ts` (thin SDK wrapper) | partial |
| `src/lib/rate-limit/index.ts` (MODIFY) | service | stateful (CRUD-like on counters) | itself + `src/lib/rate-limit/__tests__/rate-limit.test.ts` | exact |
| `src/lib/auth/index.ts` (MODIFY) | config/service | request-response (gate) | itself (add `rateLimit` block to existing `betterAuth()`) | exact |
| `.env.example` (MODIFY) | config | env | itself (add `REDIS_URL`) | exact |
| `package.json` (MODIFY) | config | scripts | itself (add `lint:gate`, `check-bundle`, deps) | exact |
| `src/actions/posts.ts` (MODIFY/audit) | service (Server Action) | CRUD + revalidation | itself — the revalidation template other actions copy | exact |
| `src/actions/settings.ts` (MODIFY/audit) | service (Server Action) | CRUD + revalidation | itself (audit existing `saveSeoSettings` block) | exact |
| `src/actions/categories.ts` (MODIFY/audit) | service (Server Action) | CRUD (missing revalidation) | `src/actions/posts.ts:publishPost` (copy revalidation shape) | role-match |
| `src/actions/tags.ts` (MODIFY/audit) | service (Server Action) | CRUD (missing revalidation) | `src/actions/posts.ts:publishPost` | role-match |
| `src/actions/pages.ts` (MODIFY/audit) | service (Server Action) | CRUD (missing revalidation) | `src/actions/posts.ts:publishPost` | role-match |
| `src/actions/users.ts` (MODIFY/audit) | service (Server Action) | CRUD (missing revalidation) | `src/actions/posts.ts:publishPost` | role-match |
| `docs/adr/0001-isr-single-instance-scaling.md` (NEW) | docs | n/a | — (no docs/ or ADR dir exists) | no analog |
| `README.md` (NEW) | docs | n/a | — (no README at repo root) | no analog |
| `.planning/phases/07-performance-deploy/07-REVALIDATION-AUDIT.md` (NEW) | docs | n/a | existing `.planning/**/*.md` markdown artifacts | role-match |

**Verification-only (referenced but NOT modified):** `eslint.config.mjs` (gate reuses existing rule), `next.config.ts` (verify only), `middleware.ts` (anti-pattern — rate limiting must NOT go here), `src/app/api/auth/[...all]/route.ts` (unaffected Better Auth mount).

---

## Pattern Assignments

### `src/lib/auth/index.ts` (MODIFY — add `rateLimit` block)

**Analog:** itself — the existing `betterAuth({...})` instantiation.
**Integration point:** Better Auth's built-in `rateLimit` config (NO plugin, NO middleware). This is the canonical path for D-01/D-03 — confirmed in RESEARCH.md Summary finding #1.

**Current imports + config head** (`src/lib/auth/index.ts` lines 10-20) — preserve, extend:
```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { schema } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { ac, adminRole, editorRole, authorRole } from "./permissions";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // ...existing config...
```

**New import to add:** `import { redisClient } from "@/lib/redis";` (the new singleton — see its own row below).

**Core pattern to insert** — sibling to the existing `emailAndPassword` / `session` / `plugins` blocks. 3 attempts / 900s (15 min) per D-02, on the 4 endpoints per D-03:
```typescript
  rateLimit: {
    enabled: true,
    window: 60,        // default for uncategorized routes
    max: 100,
    customRules: {
      "/sign-in/email":    { window: 900, max: 3 },  // D-02/D-03
      "/forget-password":  { window: 900, max: 3 },  // password reset request
      "/reset-password":   { window: 900, max: 3 },  // password reset consume
      "/verify-email":     { window: 900, max: 3 },  // email verification
    },
    customStorage: {  // ioredis-backed (D-01) — get/set shape per Better Auth docs
      get: async (key) => {
        const raw = await redisClient.get(`ratelimit:${key}`);
        return raw ? JSON.parse(raw) : null;
      },
      set: async (key, value) => {
        const ttlSec = Math.max(1, Math.ceil((value.expiresAt - Date.now()) / 1000));
        await redisClient.set(`ratelimit:${key}`, JSON.stringify(value), "EX", ttlSec);
      },
    },
  },
  advanced: {
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },  // trust Coolify proxy
  },
```

**Anti-pattern to avoid (documented at `middleware.ts` lines 1-18):** rate limiting MUST NOT be added to `middleware.ts`. That file is explicitly "UX-ONLY — NOT authoritative RBAC" and has no persistent state. The comment block at `middleware.ts:1-18` is the load-bearing reason — cite it.

**Existing handler mount (unaffected):** `src/app/api/auth/[...all]/route.ts` — `toNextJsHandler(auth)` automatically surfaces the 429 + `X-Retry-After` once `rateLimit` is configured. No change needed there.

---

### `src/lib/redis/index.ts` (NEW — ioredis singleton)

**Analog:** `src/lib/db/index.ts` (the Drizzle DB singleton) — same "server-only, env-driven, module-level singleton" convention.

**Convention to follow** (`src/lib/db/index.ts` lines 1-18):
```typescript
// Server-only — NO "use client" directive. Reads DATABASE_URL from env (never
// hardcoded — ASVS V8). Real secrets live in gitignored .env.local.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export { schema };
```

**Divergence (intentional):** The DB singleton uses a plain `const pool = new Pool()`. RESEARCH.md Example 4 recommends the **`globalThis` hot-reload-safe variant** for Redis, which is the standard Next.js dev-mode idiom (prevents connection spam across HMR). Use the globalThis pattern — it is strictly more robust than the existing DB singleton's plain const. Copy the header comment style (the `[CITED: ...]` + "Server-only" block) from `src/lib/db/index.ts`.

Canonical shape (from RESEARCH.md Example 4):
```typescript
import Redis from "ioredis";
declare global { // eslint-disable-next-line no-var
  var __redisClient: Redis | undefined;
}
globalThis.__redisClient ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: 3, enableReadyCheck: true, lazyConnect: false,
});
export const redisClient = globalThis.__redisClient;
```

**Header to copy:** the `// Server-only — NO "use client" directive. Reads ... from env (never hardcoded — ASVS V8). Real secrets live in gitignored .env.local; staging/prod via Coolify injection.` comment block verbatim from `src/lib/db/index.ts:2-8`, adapted for `REDIS_URL`.

---

### `src/lib/rate-limit/index.ts` (MODIFY — replace in-memory with Redis-backed `@upstash/ratelimit`)

**Analog:** itself — replace the module-level `Map` store with a Redis-backed `Ratelimit` instance. Keep the existing `tryConsume(ip, limit, windowMs)` signature SOLELY for backward compatibility OR migrate the one consumer (`src/actions/contact.ts`).

**Current implementation to replace** (`src/lib/rate-limit/index.ts` lines 14-53):
```typescript
interface RateLimitEntry { count: number; resetAt: number; }
const store = new Map<string, RateLimitEntry>();   // ← single-instance, lost on restart

export function tryConsume(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || now >= entry.resetAt) { store.set(ip, { count: 1, resetAt: now + windowMs }); return true; }
  if (entry.count < limit) { entry.count++; return true; }
  return false;
}
```

**Single existing consumer** — `src/actions/contact.ts` lines 28, 82:
```typescript
import { tryConsume } from "@/lib/rate-limit";
// ...
if (!tryConsume(ip, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
  throw new Error("RATE_LIMITED");
}
```

**Migration target:** export a `contactFormLimiter` (a configured `Ratelimit` instance) and update `contact.ts` to `await contactFormLimiter.limit(ip)`. The old `tryConsume` export can be removed once `contact.ts` is migrated.

**Existing test to update/replace** — `src/lib/rate-limit/__tests__/rate-limit.test.ts` (lines 1-68). It uses `vi.useFakeTimers` + `resetRateLimit()` against the in-memory store. After migration these tests must either (a) mock ioredis, or (b) move to the integration script `scripts/test-auth-ratelimit.mjs`. Copy the test header convention (`[CITED: ...]` block) from this file.

**Decision point (RESEARCH.md Open Question #2 / A7):** if the ioredis→@upstash/ratelimit adapter proves fragile, the planner may keep Contact in-memory and scope Redis only to auth endpoints. Flag for the planner — do not silently pick one.

---

### `src/lib/rate-limit/upstash-ioredis-adapter.ts` (NEW — ~30-line adapter)

**Analog (partial):** `src/lib/email/index.ts` — the established "thin wrapper around an external SDK" pattern. Copy its header + the `// Singleton ... mirrors ... pattern` comment style.

**Wrapper convention** (`src/lib/email/index.ts` lines 13-24):
```typescript
import { Resend } from "resend";
// Singleton Resend client — mirrors src/lib/r2's `s3Client` pattern.
// ... env-with-dev-default idiom (|| not ??) ...
const resend = new Resend(process.env.RESEND_API_KEY || "dev-placeholder");
```

**Key constraint (RESEARCH.md Pitfall 1):** `@upstash/ratelimit` v2.x is HTTP-only; it does NOT ship a native ioredis adapter. The adapter wraps ioredis to match the Upstash-Redis-like interface (`pipeline()`, `eval()`, etc.). Source is `github.com/upstash/ratelimit-js/issues/115`. NO `@upstash/redis` import (that's the cloud REST client — violates no-paid-API).

**Output shape** (from RESEARCH.md Pattern 3):
```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { redisClient } from "@/lib/redis";

class IoredisAdapter { /* pipeline(), eval(), ... per Issue #115 */ }

export const contactFormLimiter = new Ratelimit({
  redis: new IoredisAdapter(),
  limiter: Ratelimit.slidingWindow(5, "1 h"),   // existing Phase-6 Contact policy
  prefix: "ratelimit:contact",
  analytics: false,
});
```

---

### `scripts/check-bundle-size.mjs` (NEW — gzipped public-chunk gate)

**Analog:** `scripts/verify.mjs` — copy its header banner, `process.exitCode = 1` (NOT `process.exit(1)`), and the `run()`/results-summary conventions. This is a SMALLER script than verify.mjs (no orchestration, single check).

**Script conventions to copy** (`scripts/verify.mjs`):
- Header comment block (`// scripts/<name>.mjs` + `// [CITED: ...]` + purpose) — lines 1-15.
- `process.exitCode = 1` on failure (NOT `process.exit(1)`) so output flushes — line 68, 246.
- Windows-safe note if spawning — line 15.

**Core logic** — pure Node fs/zlib, reads `.next/static/chunks/*.js`, computes `gzipSync(contents).length`, sums, fails > threshold. Full sketch in RESEARCH.md Example 2 (lines 590-625). The `--max-gz-kb=100` flag is parsed from `process.argv`.

**Invocation point (documented for the Dockerfile):** runs AFTER `pnpm build` and BEFORE the runtime-stage copy. See Dockerfile row below.

---

### `scripts/test-publish-visible.mjs` (NEW — publish→visible HTTP verification)

**Analog:** `scripts/test-auth-gate.mjs` — the established "spawn server / poll / HTTP assert" pattern. This is the closest behavioral match (both boot a Next server and assert an HTTP property).

**Patterns to copy from `scripts/test-auth-gate.mjs`:**
- `waitForServer(maxWaitMs)` poll loop — lines 139-159.
- `fetch(url, { redirect: "manual" })` + status assertion — lines 187-205.
- Graceful SKIP when the server can't boot (env missing) — lines 180-184, 264-269. Use the same `status: "skipped"` shape for the local-dev case; for prod, point at `PROD_URL` and fail hard.
- `process.exit(process.exitCode || 0)` — line 287.
- Header banner `═══` block — lines 241-243.

**Divergence:** unlike test-auth-gate (which spawns `next start` locally), this script targets the **deployed prod URL** (per D-32 — no staging). `PROD_URL = process.env.PROD_URL ?? "https://anydiscussion.com"`. Sketch in RESEARCH.md Example 3 (lines 629-672).

---

### `scripts/test-auth-ratelimit.mjs` (NEW — 4th-attempt-returns-429)

**Analog:** `scripts/test-auth-gate.mjs` — identical spawn/poll/assert structure; the only difference is the assertion (4 requests to `/api/auth/sign-in/email`, assert the 4th is HTTP 429 + `X-Retry-After`).

**Pattern to copy:** the `httpCheck()` function at `scripts/test-auth-gate.mjs:161-236` — spawn server, `waitForServer`, fetch loop, status assertion, cleanup kill. Replace the single-redirect assertion with a 4-iteration loop.

**Validation target (RESEARCH.md Validation Architecture):** "4th attempt within 15min returns HTTP 429 with `X-Retry-After`; 4th attempt after 15min succeeds" + the fail-open/fail-closed-when-Redis-is-down dimension.

---

### `docker-compose.yml` (MODIFY — add Redis service)

**Analog:** itself — extend the existing dev-service list. Copy the existing service-block conventions exactly.

**Current structure** (`docker-compose.yml` lines 5-48) — preserve, append Redis as a sibling:
```yaml
services:
  postgres:        # lines 7-21 — image, ports, environment, volumes, healthcheck
  postgres-test:   # lines 24-31 — ephemeral, no volume
  minio:           # lines 34-44 — image, ports, environment, command, volumes
volumes:
  pgdata:
  miniodata:
```

**Convention to follow per block:** `image:` → `ports:` → `environment:` → `command:` (if needed) → `volumes:` (if persistent) → `healthcheck:` (array form `["CMD", ...]`, `interval/timeout/retries`). Redis gets NO volume (D-04 — ephemeral).

**Precise addition** (RESEARCH.md Example 4, lines 678-698):
```yaml
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command:
      - redis-server
      - --maxmemory 256mb
      - --maxmemory-policy allkeys-lru   # D-04 — NOT noeviction
      - --save ""                         # disable RDB (rate-limit data is ephemeral)
      - --appendonly no                   # disable AOF
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
```

**Prod note (Security Domain):** in Coolify prod, Redis binds to the internal network only — NOT exposed publicly. The dev port-mapping above is for local parity only.

---

### `Dockerfile` (NEW) + `.dockerignore` (NEW) — NO existing analog

**No in-repo analog.** This is the first Dockerfile. Use the canonical Next.js 16 standalone multi-stage pattern.

**Canonical pattern (RESEARCH.md Pattern 1, lines 302-357):** three stages — `deps` (pnpm via corepack) → `builder` (lint gate + `next build` + bundle gate) → `runner` (minimal `node:20-alpine`, standalone copy, non-root user).

**Project-specific constraints to encode:**
- **Node 20.19 LTS base** (`.claude/CLAUDE.md`): `FROM node:20-alpine`. (isomorphic-dompurify@3 requires Node ≥20.19.)
- **pnpm only** (`CLAUDE.md`): `RUN corepack enable && corepack prepare pnpm@latest --activate`. Use `pnpm fetch --prod || true` + `pnpm install --offline --frozen-lockfile` (RESEARCH.md Standard Stack note).
- **Build-time `NEXT_PUBLIC_*` only** (D-21): `ARG NEXT_PUBLIC_SITE_URL`, `ARG NEXT_PUBLIC_CDN_URL`. Runtime secrets (DATABASE_URL, BETTER_AUTH_SECRET, RESEND_API_KEY, S3 creds, SETTINGS_ENCRYPTION_KEY, REDIS_URL) are NOT `ARG`/`ENV` — injected at runtime via Coolify. (Pitfall: baking them leaks into image layers.)
- **Gate ordering (RESEARCH.md Pitfall 3):** Gate 1 (`pnpm lint --max-warnings 0`) → `pnpm build` → Gate 2 (`node scripts/check-bundle-size.mjs --max-gz-kb 100`) — all in the BUILDER stage, before the runtime copy.
- **output:"standalone"** already set in `next.config.ts:8` — Dockerfile copies `.next/standalone` + `.next/static` + `public/`.

**`.dockerignore`** — exclude `node_modules`, `.next`, `.git`, `.env*`, `docker-compose.yml`, coverage/lighthouseci outputs. Keeps build context small.

---

### `lighthouserc.json` (NEW) — NO existing analog

**No in-repo analog.** Use the standard `@lhci/cli` configuration shape.

**Canonical pattern (RESEARCH.md Example 1, lines 546-579):** `ci.collect` (urls, numberOfRuns, preset) + `ci.assert.assertions` (the threshold gate) + `ci.upload` (filesystem output).

**Project-specific thresholds (D-05/D-06, RESEARCH correction on INP):**
- `categories:performance` → `["error", { minScore: 0.9 }]` (D-05 Lighthouse 90+)
- `largest-contentful-paint` → `["error", { maxNumericValue: 2500 }]` (LCP ≤ 2.5s)
- **`interaction-to-next-paint`** → `["error", { maxNumericValue: 200 }]` (INP ≤ 200ms — NOT `max-potential-fid`; FID was replaced by INP March 2024, RESEARCH Pitfall 2)
- `cumulative-layout-shift` → `["error", { maxNumericValue: 0.1 }]`

**Invocation:** `pnpm dlx @lhci/cli autorun --config=./lighthouserc.json` — ad-hoc from dev machine against the prod URL (RESEARCH Open Question #3). NOT GitHub Actions (D-31) and NOT a build-stage step (Lighthouse needs a live URL).

---

### `src/actions/posts.ts` (MODIFY/audit) + `categories.ts` / `tags.ts` / `pages.ts` / `users.ts` (MODIFY — add missing revalidation)

**Analog (the revalidation template):** `src/actions/posts.ts:publishPost` lines 325-375 — the ONLY complete, correct revalidation block in the repo. Every action needing revalidation copies this shape.

**Imports to add** (from `src/actions/posts.ts` / `src/actions/settings.ts:21`):
```typescript
import { revalidatePath, revalidateTag } from "next/cache";
```

**Core pattern** (`src/actions/posts.ts` lines 351-368) — concrete literal paths + 2-arg `revalidateTag(tag, "max")`:
```typescript
// D-25 — concrete literal paths (Pitfall #3). NEVER template-string patterns.
revalidatePath(`/blog/${post.slug}`);
revalidatePath("/");
revalidatePath("/blog");
if (post.categorySlug) { revalidatePath(`/category/${post.categorySlug}`); }
revalidatePath("/sitemap.xml");
revalidatePath("/rss.xml");

// D-25 — 2-arg revalidateTag(tag, "max"). Single-arg form is DEPRECATED in Next 16.2.9.
revalidateTag(`post-${post.id}`, "max");
revalidateTag(`author-${post.authorId}`, "max");
if (post.categoryId) { revalidateTag(`category-${post.categoryId}`, "max"); }
revalidateTag("posts-list", "max");
```

**Audit targets confirmed missing revalidation** (verified by reading `src/actions/categories.ts:1-87` — no `next/cache` import, no revalidation calls):
- `categories.ts` createCategory/updateCategory/softDeleteCategory → likely MISSING `/category/{slug}`, `/blog`, `/`, `/sitemap.xml`
- `tags.ts`, `pages.ts`, `users.ts` (author pages) → same likely gap (RESEARCH.md Pattern 4 table, lines 455-471)

**CRITICAL — Pitfall 7 (RESEARCH.md lines 536-540):** the fix must use the SAME invalidation mechanism the route uses for caching. If `/category/[slug]` is rendered with `cacheTag("category-{id}")`, a `revalidatePath` call does nothing — use `revalidateTag`. The audit table must record both the call AND the route's cache strategy.

**`settings.ts:saveSeoSettings`** — already correct (audit only, no change). Reference its `revalidateTag("seo-settings","max")` + `revalidatePath("/", "layout")` block (described at `src/actions/settings.ts:46-49`).

**Permission-gate convention (preserve, do NOT touch during audit):** every mutating action begins with `await requireCan({...})` or `await requireRole(...)`. See `categories.ts:29,59,79`. The revalidation calls are appended AFTER the DB write, not before the gate.

---

### `package.json` (MODIFY — add scripts + deps)

**Analog:** itself. Current scripts block (`package.json` lines 5-16):
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "db:generate": "drizzle-kit generate",
  "test": "vitest run",
  "test:migrations": "node scripts/test-migrations.mjs",
  "test:auth-gate": "node scripts/test-auth-gate.mjs",
  "setup": "node scripts/setup.mjs",
  "verify": "node scripts/verify.mjs"
}
```

**Scripts to add (mirror the `node scripts/<name>.mjs` convention):**
```json
"check-bundle": "node scripts/check-bundle-size.mjs --max-gz-kb=100",
"test:publish-visible": "node scripts/test-publish-visible.mjs",
"test:auth-ratelimit": "node scripts/test-auth-ratelimit.mjs",
"lighthouse": "lhci autorun --config=./lighthouserc.json"
```
(`lint:gate` is NOT a new script — the Dockerfile runs `pnpm lint --max-warnings 0` directly per D-12.)

**Deps to add:** `@upstash/ratelimit@^2.0.8`, `ioredis@^5.11.1` (dependencies); `@lhci/cli@^0.15.1`, `@next/bundle-analyzer` (devDependencies). Note the `checkpoint:human-verify` flag on `@upstash/ratelimit` (SUS metadata gap — RESEARCH.md Package Legitimacy Audit).

---

### `.env.example` (MODIFY — add `REDIS_URL`)

**Analog:** itself. (File read was denied by permissions, but CONTEXT/RESEARCH document the current var list: DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, BETTER_AUTH_TRUSTED_ORIGINS, RESEND_API_KEY, EMAIL_FROM, S3_* credentials, CDN_URL, SETTINGS_ENCRYPTION_KEY.)

**Add (D-01/D-04):**
```
REDIS_URL=redis://localhost:6379   # dev default; prod = Coolify-injected internal URL
```
NO Umami-specific env vars go in the Next.js app's `.env.example` — Umami runs as a separate Coolify service with its own DATABASE_URL pointing at the `umami` database (D-25). The script URL it serves is stored in the `settings` table (D-26), not env.

---

### `docs/adr/0001-isr-single-instance-scaling.md` (NEW) + `README.md` (NEW) — NO existing analog

**No in-repo analog** — there is no `docs/` directory, no ADR directory, and NO `README.md` at repo root (verified via Glob — only node_modules READMEs exist). All three are created from scratch.

**ADR format (D-28 discretion item, RESEARCH Open Question #4):** create `docs/adr/` (industry-standard, discoverable). Use the standard ADR structure: Title + Status + Context + Decision + Consequences. Content covers D-29 (problem: single instance = ISR works, multi-replica = stale; solution: single Coolify instance; v2 path: Redis-backed `cacheHandler` — singular, stable since Next 14.1, RESEARCH State of the Art).

**README section (D-28):** document the scaling cliff in a dedicated section. Note the config key is `cacheHandler` (singular) NOT the deprecated `incrementalCacheHandlerPath` (RESEARCH State of the Art).

---

### `.planning/phases/07-performance-deploy/07-REVALIDATION-AUDIT.md` (NEW — audit deliverable)

**Analog:** the existing `.planning/**/*.md` markdown artifacts (e.g., `07-CONTEXT.md`, `06-VALIDATION.md`) — same directory + naming convention (`NN-TOPIC.md`).

**Format (D-19, RESEARCH Pattern 4 lines 455-471):** a markdown table — `| Action file | Function | revalidatePath calls | revalidateTag calls | Status |` — with each row marked HAS / MISSING (with fix) / N/A (with justification). Scope: every mutating action in `src/actions/` (posts, categories, tags, pages, media, settings, users, storage-settings, contact).

---

## Shared Patterns

### Server-only singleton modules
**Source:** `src/lib/db/index.ts`, `src/lib/email/index.ts`
**Apply to:** `src/lib/redis/index.ts`, `src/lib/rate-limit/index.ts`, `src/lib/rate-limit/upstash-ioredis-adapter.ts`
**Convention:**
- Header comment block with `[CITED: ...]` references + `// Server-only — NO "use client" directive. Reads <ENV> from env (never hardcoded — ASVS V8). Real secrets live in gitignored .env.local; staging/prod via Coolify injection.`
- Env-with-dev-default idiom: `process.env.X ?? "..."` or `process.env.X || "dev-placeholder"` (note: `||` is used in `email/index.ts` so empty-string falls back too).
- Module-level singleton export.

### Script tooling (`scripts/*.mjs`)
**Source:** `scripts/verify.mjs`, `scripts/test-auth-gate.mjs`, `scripts/test-migrations.mjs`
**Apply to:** `scripts/check-bundle-size.mjs`, `scripts/test-publish-visible.mjs`, `scripts/test-auth-ratelimit.mjs`
**Convention:**
- Header banner `// scripts/<name>.mjs` + `// [CITED: ...]` block stating what it verifies.
- `process.exitCode = 1` on failure (NOT `process.exit(1)`) — allows output to flush (verify.mjs:68).
- Windows-safe spawning when needed: `shell: process.platform === "win32"` (verify.mjs:57).
- Graceful SKIP (not FAIL) when an optional precondition is missing (test-auth-gate.mjs:180-184).
- Summary block with PASS/FAIL marks at the end (verify.mjs:307-327).

### Better Auth configuration
**Source:** `src/lib/auth/index.ts`
**Apply to:** the `rateLimit` block addition (same file).
**Convention:**
- `betterAuth({...})` is the single source of truth; plugins array ends with `nextCookies()` (MUST BE LAST — `src/lib/auth/index.ts:97-99`).
- Hooks are fire-and-forget via `void sendEmail(...)` (R8 timing-attack mitigation — `src/lib/auth/index.ts:55-61`).
- The route handler `src/app/api/auth/[...all]/route.ts` is a thin `toNextJsHandler(auth)` delegation — no logic, unaffected by config additions.

### Revalidation (the audit subject)
**Source:** `src/actions/posts.ts:publishPost` (lines 351-368) + `src/actions/settings.ts:saveSeoSettings`
**Apply to:** every mutating action in `src/actions/` (the PERF-03 audit).
**Convention:**
- Import from `next/cache`: `import { revalidatePath, revalidateTag } from "next/cache";`
- Paths are CONCRETE LITERALS (e.g. `/blog/hello-world`), NEVER template-string patterns like `/blog/[slug]` (posts.ts:320-322 comment).
- `revalidateTag` uses the 2-arg form `(tag, "max")` — single-arg is DEPRECATED in Next 16.2.9 (posts.ts:361-362).
- Revalidation calls come AFTER the DB write, AFTER the permission gate.

### Error handling in lib wrappers
**Source:** `src/lib/email/index.ts:56-70`
**Apply to:** `src/lib/redis/index.ts` (connection-error logging) and the ioredis adapter.
**Convention:** structured `console.error(JSON.stringify({ level, msg, ...error }))` — never throw from a fire-and-forget path. Mirrors the `src/lib/log` idiom.

---

## No Analog Found

Files with no close match in the codebase — the planner uses RESEARCH.md canonical patterns instead:

| File | Role | Data Flow | Reason | Canonical Reference |
|------|------|-----------|--------|---------------------|
| `Dockerfile` | config | build-pipeline | No Dockerfile exists in repo | RESEARCH.md Pattern 1 (lines 302-357) — Next.js 16 standalone multi-stage |
| `.dockerignore` | config | build-pipeline | No Docker context exists | Standard Next.js `.dockerignore` template |
| `lighthouserc.json` | config | batch | No LHCI/perf-config exists | RESEARCH.md Example 1 (lines 546-579) — `@lhci/cli` assert format |
| `docs/adr/0001-isr-single-instance-scaling.md` | docs | n/a | No `docs/` or ADR dir exists | Standard ADR format (Title/Status/Context/Decision/Consequences) |
| `README.md` | docs | n/a | No README at repo root | Created from scratch; ISR scaling section per D-28 |
| `src/lib/rate-limit/upstash-ioredis-adapter.ts` | service | adapter | No SDK-adapter pattern in repo; `email/index.ts` is only a partial match (thin wrapper, not interface-translation) | RESEARCH.md Pattern 3 + `github.com/upstash/ratelimit-js/issues/115` |

---

## Metadata

**Analog search scope:**
- Repo root: `docker-compose.yml`, `next.config.ts`, `package.json`, `eslint.config.mjs`, `middleware.ts`
- `src/lib/`: `db/`, `auth/`, `rate-limit/`, `email/`
- `src/actions/`: `posts.ts`, `settings.ts`, `contact.ts`, `categories.ts` (sampled for the audit gap)
- `src/app/api/auth/[...all]/route.ts`
- `scripts/`: `verify.mjs`, `test-migrations.mjs`, `test-auth-gate.mjs`
- `.planning/**/*.md` (artifact convention)
- Glob searches for `docs/`, `doc/`, `ADR`, `adr`, `.planning/adr`, `README.md` (all empty at repo root)

**Files scanned:** 14 source files + 3 scripts + 2 config files read in full; 4 verification-only files documented.
**Pattern extraction date:** 2026-07-28

**Notable findings for the planner:**
1. **Middleware is at repo ROOT (`middleware.ts`), NOT `src/middleware.ts`** — CONTEXT.md canonical_refs cites `src/middleware.ts` but the actual file is `middleware.ts`. The UX-only comment block (lines 1-18) is the load-bearing reason rate limiting must NOT be added there.
2. **The DB singleton (`src/lib/db/index.ts`) does NOT use the `globalThis` hot-reload-safe pattern** — it's a plain `const pool = new Pool()`. The Redis singleton should use the MORE robust `globalThis.__redisClient` variant per RESEARCH.md Example 4 (prevents connection spam in dev HMR).
3. **`categories.ts` confirmed missing revalidation** (no `next/cache` import) — the PERF-03 audit gap is real, not theoretical. Same likely true for `tags.ts`, `pages.ts`, `users.ts`.
4. **No README and no docs/ directory exist** — both the ISR ADR and the README are net-new files (D-28).
5. **`@upstash/ratelimit` SUS flag** — add a `checkpoint:human-verify` per RESEARCH.md Package Legitimacy Audit before pinning (verify npm publisher is the `upstash` scope owner).
