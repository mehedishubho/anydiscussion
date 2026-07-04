# Phase 3: Content Engine - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 35 (new + modified)
**Analogs found:** 28 / 35 (7 with no analog — listed in "No Analog Found")

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/actions/posts.ts` | controller (Server Action) | request-response / CRUD | `src/actions/users.ts` | **exact** |
| `src/actions/posts-schema.ts` | model (Zod schema) | validation | (new — zod regex per RESEARCH.md L819-834) | partial (zod idioms) |
| `src/actions/categories.ts` | controller (Server Action) | CRUD | `src/actions/users.ts` | **exact** |
| `src/actions/tags.ts` | controller (Server Action) | CRUD + join | `src/actions/users.ts` | **exact** |
| `src/actions/media.ts` | controller (Server Action) | file-I/O / upload | `src/actions/users.ts` + `src/lib/r2/index.ts` | **role-match** (composes both) |
| `src/lib/storage/types.ts` | utility (TS interface) | interface | `src/lib/r2/index.ts` (`UploadedVariant` L33-39) | **role-match** |
| `src/lib/storage/registry.ts` | service | settings-driven lookup | `src/lib/permissions/index.ts` (settings-style read) | **role-match** |
| `src/lib/storage/local.ts` | service | file-I/O | `src/lib/r2/index.ts` (mirror of `uploadImageVariants`) | **role-match** (same shape, fs backend) |
| `src/lib/storage/r2.ts` | service | wraps existing | `src/lib/r2/index.ts` (wrapped unchanged) | **exact** (thin wrapper) |
| `src/lib/sanitize/index.ts` | utility | transform (sanitize) | (new — DOMPurify config per RESEARCH.md L428-483) | no analog |
| `src/lib/slug/index.ts` | utility | validation | (new — zod regex per RESEARCH.md L826) | no analog |
| `src/lib/schedule/index.ts` | service | event-driven (cron) | (new — node-cron per RESEARCH.md L640-651) | no analog |
| `src/lib/schedule/system-publish.ts` | service | batch / CRUD | `src/lib/permissions/post-transitions.ts` (db.update pattern) | **partial** (D-12 documented exception) |
| `src/lib/excerpt/index.ts` | utility | transform | (new — Bangla-aware char count) | no analog |
| `src/components/editor/extensions.ts` | config (shared array) | shared module | (new — single source of truth per RESEARCH.md L352-385) | no analog |
| `src/components/editor/TiptapEditor.tsx` | component | client-only (DOM) | `src/components/form/form-elements/DropZone.tsx` (`"use client"`) | **role-match** (client component shape) |
| `src/components/editor/EditorProvider.tsx` | component (client wrapper) | context | `src/app/(admin)/AdminShell.tsx` (client wrapper shape) | **role-match** |
| `src/components/editor/toolbar/*` | component (UI buttons) | request-response | `src/components/ui/button/Button.tsx` | **role-match** |
| `src/app/(admin)/posts/page.tsx` | route (list) | request-response | `src/app/(admin)/(others-pages)/(tables)/basic-tables/page.tsx` + `src/components/ui/table/index.tsx` | **role-match** |
| `src/app/(admin)/posts/new/page.tsx` | route (form) | request-response | `src/app/(admin)/(others-pages)/(forms)/form-elements/page.tsx` | **role-match** |
| `src/app/(admin)/posts/[id]/edit/page.tsx` | route (form, dynamic) | request-response | `src/app/(admin)/(others-pages)/profile/page.tsx` (Server Comp form page) | **role-match** |
| `src/app/(site)/preview/[token]/page.tsx` | route (token-gated render) | request-response | `src/app/(admin)/layout.tsx` (gate-then-render pattern) | **partial** (token gate vs auth gate) |
| `src/app/api/media/[...path]/route.ts` | route (file streaming) | file-I/O | (new Route Handler per RESEARCH.md L576-619) | no analog |
| `src/instrumentation.ts` | config (boot hook) | event-driven (init) | (new — `register()` per RESEARCH.md L628-638) | no analog |
| `src/db/schema.ts` | model (modified) | schema | self (existing — modified in place) | **exact** (edit existing) |
| `next.config.ts` | config (modified) | config | self (existing — add `serverActions.bodySizeLimit`) | **exact** (edit existing) |
| `vitest.config.ts` | config (modified) | config | self (existing — confirm jsdom opt-in works) | **exact** (edit existing) |
| `src/actions/__tests__/posts.test.ts` | test | unit (mock deps) | `src/actions/__tests__/users.test.ts` | **exact** |
| `src/actions/__tests__/taxonomy.test.ts` | test | unit | `src/actions/__tests__/users.test.ts` | **exact** |
| `src/actions/__tests__/media.test.ts` | test | integration | `src/actions/__tests__/users.test.ts` | **exact** |
| `src/lib/sanitize/__tests__/sanitize.test.ts` | test | unit | `src/lib/permissions/__tests__/transitions.test.ts` (lib unit shape) | **role-match** |
| `src/lib/slug/__tests__/slug.test.ts` | test | unit | `src/lib/permissions/__tests__/transitions.test.ts` | **role-match** |
| `src/lib/schedule/__tests__/system-publish.test.ts` | test | integration (mock db) | `src/lib/permissions/__tests__/transitions.test.ts` | **role-match** |
| `src/lib/storage/__tests__/registry.test.ts` | test | unit | `src/lib/permissions/__tests__/transitions.test.ts` | **role-match** |
| `src/components/editor/__tests__/round-trip.test.ts` | test | unit (PRIMARY) | `src/lib/permissions/__tests__/transitions.test.ts` (pure-fn test) | **role-match** |

---

## Pattern Assignments

### `src/actions/posts.ts` (controller, request-response / CRUD)

**Analog:** `src/actions/users.ts` — the established Server Action template (the planner clones this file's shape for `categories.ts`, `tags.ts`, `media.ts` too).

**File directive + imports pattern** (lines 15-20):
```typescript
"use server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, count } from "drizzle-orm";
import { log } from "@/lib/log";
import { requireCan } from "@/lib/permissions";
```
Posts adds: `transitionPost` from `@/lib/permissions/post-transitions`, `sanitizeBeforeStore` from `@/lib/sanitize`, `revalidatePath`/`revalidateTag` from `next/cache`, and `postSchema` from `./posts-schema`.

**Permission-check-FIRST pattern (Pitfall #1)** — lines 86, 108, 125, 142 of users.ts. EVERY mutating action begins with `requireCan`/`assertOwnsPost` BEFORE any other call:
```typescript
export async function createUser(input: { ... }) {
  await requireCan({ user: ["create"] }); // FIRST — throws FORBIDDEN if denied
  return auth.api.createUser({ body: { ... } });
}
```
For posts: `await assertOwnsPost(postId)` on update/autosave; `await requireCan({ post: ["publish"] })` on publish (authors fail here — double enforcement); `await requireCan({ post: ["create"] })` / `["edit"]` on save.

**Error-handling / logging idiom** (lines 54-58):
```typescript
if (Number(row?.n ?? 0) > 0) {
  log.error("createFirstAdmin blocked — admin already exists");
  throw new Error("FORBIDDEN");
}
```
Pattern: `log.error(msg, ctx?)` THEN `throw new Error("FORBIDDEN" | "UNAUTHORIZED" | "NOT_FOUND" | "INVALID_TRANSITION:...")`. The `log` wrapper is `console.{info,error}(JSON.stringify(...))` — no throw inside log.

**DB query builder shape** (lines 49-52) — Drizzle chain, `[0]` index for first row:
```typescript
const [row] = await db
  .select({ n: count() })
  .from(schema.user)
  .where(eq(schema.user.role, "admin"));
```

**Publish funnel:** posts.ts calls `await transitionPost(postId, "published")` (R7 — single funnel). The scheduler (`system-publish.ts`) is the **documented D-12 exception** — it cannot call `transitionPost` (no session).

---

### `src/actions/categories.ts` + `src/actions/tags.ts` (controller, CRUD)

**Analog:** `src/actions/users.ts` (same template). Tags additionally writes the `post_tags` join (schema.ts L90-99 — composite PK, `db.insert(schema.postTags)`).

**CRUD verbs to mirror:** `createCategory`/`createTag` (requireCan create), `updateCategory`/`updateTag`, soft-delete (`set({ deletedAt: new Date() })` per D-08 — schema.ts L77/L86 carry `deletedAt`). The `assertOwnsPost` analog is NOT needed (taxonomy has no ownership); `requireCan({ taxonomy: ["create"] })` (or equivalent capability) gates every mutating action.

**Tag-cap enforcement (D-23):** server-side in the post-save action — `if (tagIds.length > 8) throw new Error("TOO_MANY_TAGS")` before the `postTags` insert.

---

### `src/actions/media.ts` (controller, file-I/O / upload)

**Analog (action shell):** `src/actions/users.ts` (permission-check-first + `log`/throw).
**Analog (upload pipeline):** `src/lib/r2/index.ts` — `uploadImageVariants()` (lines 51-91) is the proven buffer → sharp → write pipeline. `media.ts` delegates to the **registry** (`getActiveProvider().upload(...)`) instead of calling `uploadImageVariants` directly, so local/r2 are interchangeable.

**Composed pattern:**
```typescript
// 1. Permission check (Pitfall #1)
await requireCan({ media: ["upload"] });
// 2. Validate size/type (D-08 cap 10MB — enforced before processing)
// 3. provider = await getActiveProvider()  // settings-driven
// 4. const { variants, primary } = await provider.upload(buffer, baseKey, mimeType)
// 5. db.insert(schema.media).values({ providerKey: primary.key, provider: provider.name, ... })
```
**Schema gap to fix first** (schema.ts L102-113): `media.uploadedBy` is `integer` (broken — `user.id` is text UUID); `media.r2Key` → rename to `providerKey` + add `provider` column.

---

### `src/lib/storage/r2.ts` (service — wraps existing)

**Analog:** `src/lib/r2/index.ts` — wrapped **unchanged**. The R2 provider is a thin adapter implementing `StorageProvider` over the existing `uploadImageVariants` + `s3Client`.

**Reuse as-is** (lines 51-91): the 3-variant sharp→WebP→S3 pipeline (640 sm / 1024 md / 1920 lg, quality 80, `fit:"inside"`, `withoutEnlargement:true`). R2 provider routes image uploads through this; non-image types (D-07) skip sharp and `PutObjectCommand` directly with original mime.

**Env config to inherit** (lines 18-24): `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` (MinIO=true, R2=false).

**Public-URL resolution** — `process.env.NEXT_PUBLIC_CDN_URL` (image-loader.ts L11-13) builds the absolute CDN URL that `cdnImageLoader` passes through.

---

### `src/lib/storage/local.ts` (service — file-I/O)

**Analog (shape):** `src/lib/r2/index.ts` — mirror the same `uploadImageVariants` structure but write to `storage/local/` (gitignored, OUTSIDE `public/`) via `fs.writeFile` instead of `s3Client.send`. RESEARCH.md L584-619 has the concrete implementation.

**Critical constraint (Pitfall #4, RESEARCH.md L762-766):** do NOT write to `public/` — `output: "standalone"` (next.config.ts L7) does not include runtime `public/` writes; they 404 in the Coolify production build. Use a Route Handler (`app/api/media/[...path]/route.ts`) to stream from `storage/local/`.

**`getPublicUrl()` returns** `/api/media/<key>` (relative path → `cdnImageLoader` treats as app-origin, image-loader.ts L34-36).

---

### `src/lib/storage/registry.ts` (service — settings-driven)

**Analog (DB-read shape):** `src/lib/permissions/index.ts` L84-88 (the `assertOwnsPost` Drizzle select-where-limit pattern):
```typescript
const [post] = await db
  .select({ authorId: schema.posts.authorId })
  .from(schema.posts)
  .where(eq(schema.posts.id, postId))
  .limit(1);
```
Registry selects from `schema.settings` `.where(eq(schema.settings.key, "storage.active_provider"))` and switches on the value (`"local"` default → `localProvider`, `"r2"` → `r2Provider`). RESEARCH.md L521-545 has the full body.

---

### `src/lib/storage/types.ts` (utility — TS interface)

**Analog:** `src/lib/r2/index.ts` L33-39 — the existing `UploadedVariant` interface is the shape to reuse/extend:
```typescript
export interface UploadedVariant {
  key: string;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
}
```
Define `StorageProvider` with `upload`, `getPublicUrl`, `delete` (RESEARCH.md L496-519). Keep the interface server-only (no `"use client"`).

---

### `src/lib/sanitize/index.ts` (utility — transform, NO analog)

**No existing DOMPurify usage in the codebase.** Use RESEARCH.md Pattern 2 (L428-483) as the spec. Exports `sanitizeBeforeStore(html)` (site #1, called in `actions/posts.ts` before db.insert) and `sanitizeBeforeRender(html)` (site #2, called in SSR before `dangerouslySetInnerHTML`) — **same config, two functions** (Pitfall #2).

**Imports:** `import DOMPurify from "isomorphic-dompurify"` (v3.18.0). The `DOMPurify.addHook("uponSanitizeAttribute", ...)` IS the iframe-domain security gate (Pitfall #2 sub).

---

### `src/lib/slug/index.ts` (utility — validation, NO analog)

**No existing validator.** RESEARCH.md L826 gives the regex: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` (D-20 Latin + hyphens, manual entry). Combine with a DB uniqueness check (`db.select(...).where(eq(schema.posts.slug, slug))`) — mirror the `assertOwnsPost` select-limit shape. Apply the same validator to categories + tags (schema.ts L74, L84 — both have `slug varchar unique`).

---

### `src/lib/schedule/index.ts` (service — cron, NO analog)

**No existing background worker.** RESEARCH.md Pattern 5 (L640-651) is the spec. Imports `cron from "node-cron"` (v4.5.0). Exports `startScheduler()` which calls `cron.schedule("* * * * *", async () => { await publishDueScheduledPosts(); })` (every minute, D-11). v1 single-instance — no SKIP LOCKED (v2 concern).

---

### `src/lib/schedule/system-publish.ts` (service — D-12 exception)

**Analog (db.update shape):** `src/lib/permissions/post-transitions.ts` L80-83:
```typescript
await db
  .update(schema.posts)
  .set({ status: target, updatedAt: new Date() })
  .where(eq(schema.posts.id, postId));
```
**Critical divergence (D-12):** this module does NOT call `transitionPost()` — the scheduler has no session and `transitionPost` → `assertOwnsPost` → `getSessionOrThrow` → throws `UNAUTHORIZED`. This is the documented, auditable exception. Query `WHERE status='draft' AND published_at <= now()` (A6 recommendation — avoids an enum migration), then `db.update(...).set({ status: "published" })`, then `revalidatePath` + `revalidateTag` (same paths as the user-publish action). `log.info("system-publish", { postId })` for auditability. RESEARCH.md L654-683 has the full body.

---

### `src/lib/excerpt/index.ts` (utility — transform, NO analog)

**No existing excerpt utility.** D-21: `deriveExcerpt(bodyJson, maxChars=160)` — Bangla-aware (byte/reasonable-char count, NOT Latin character limit per CLAUDE.md "SEO requirements"). Walk the ProseMirror JSON `content[]` for text nodes, concatenate, slice. Returns a plain-text string. Author's manual `posts.excerpt` (schema.ts L46) takes precedence when non-empty.

---

### `src/components/editor/extensions.ts` (config — shared array, NO analog)

**No existing editor code.** This is the MEDIUM research-flag linchpin (Pattern 1, RESEARCH.md L352-385). ONE array imported by BOTH the client `Editor` and the server `generateHTML` — divergence silently drops nodes on SSR (Pitfall #1, RESEARCH.md L743-748).

**Imports:** `@tiptap/starter-kit`, `@tiptap/extension-table`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/extension-code-block` (all `@3.27.1`). **NO `"use client"`** — must be server-importable for `generateHTML`. D-04: CodeBlock WITHOUT lowlight (plain). D-05: Link with manual `target`/`rel`.

---

### `src/components/editor/TiptapEditor.tsx` (component — client-only)

**Analog (directive + shape):** `src/components/form/form-elements/DropZone.tsx` L1 (`"use client"` + React.FC). Uses `useEditor` + `EditorContent` from `@tiptap/react` and imports `editorExtensions` from `./extensions`. RESEARCH.md L388-402 has the body.

**Lazy-load boundary (critical, PERF-02):** the editor must NOT leak into the `(site)` bundle. The `(admin)/posts/new/page.tsx` imports it via `next/dynamic(() => import("@/components/editor/TiptapEditor"), { ssr: false })` (RESEARCH.md L838-847). ESLint `no-restricted-imports` is the static guard.

---

### `src/app/(admin)/posts/{,new,[id]/edit}/page.tsx` (routes — TailAdmin-quality, D-24)

**Analog (admin shell composition):** `src/app/(admin)/layout.tsx` + `AdminShell.tsx`. New/edit pages are Server Components rendering into the existing shell (AppSidebar/AppHeader via `AdminShell`).

**Form chrome analogs (reuse directly):**
- `src/components/form/Form.tsx` (L1-23) — onSubmit wrapper
- `src/components/form/input/InputField.tsx` (L20-84) — title/slug/excerpt inputs (`type="text"`, `error`/`success`/`hint` states)
- `src/components/form/Select.tsx` (L16-62) — category picker (single, D-23 required)
- `src/components/form/MultiSelect.tsx` — tag picker (cap ~8, D-23)
- `src/components/form/date-picker.tsx` (L18-60) — flatpickr-based; **adapt for datetime** (D-14: UTC store, Asia/Dhaka display). flatpickr `mode:"time"` exists; combine date+time or use `enableTime:true`.
- `src/components/form/form-elements/DropZone.tsx` (L6-20) — `react-dropzone` `useDropzone` for feature-image / inline upload (D-03/D-10). Already installed (`react-dropzone@^14.3.8` in package.json L41).

**List page analog:** `src/app/(admin)/(others-pages)/(tables)/basic-tables/page.tsx` + `src/components/ui/table/index.tsx` (Table/TableHeader/TableBody/TableRow/TableCell — L35-40). `src/components/tables/Pagination.tsx` for paging.

**RHF + Zod wiring (established here, formalized Phase 4):** `zodResolver(postSchema)` from `@hookform/resolvers@5.4.0` bridges the shared `posts-schema.ts` to `react-hook-form@7.80.0`. The same `postSchema` is `.parse()`-d server-side in the action (CLAUDE.md "Zod schemas live alongside their feature").

---

### `src/app/(site)/preview/[token]/page.tsx` (route — token-gated)

**Analog (gate-then-render):** `src/app/(admin)/layout.tsx` L30-39 — `AuthGate` does `await getSession(); if (!session) redirect(...)`. The preview route replaces the auth gate with a **token gate**: `const [post] = await db.select().from(schema.posts).where(eq(schema.posts.previewToken, token))`; if none → `notFound()` (D-19). Renders via `renderPostBody(post.body)` (`generateHTML` + `sanitizeBeforeRender`). NO auth required (D-19 — token IS the authorization).

**Server Component** (no `"use client"`); uses `dangerouslySetInnerHTML` after sanitize.

---

### `src/app/api/media/[...path]/route.ts` (route — file streaming, NO analog)

**No existing Route Handler.** RESEARCH.md Pattern 4 (L576-619). Streams files from `storage/local/` for the local provider's `getPublicUrl()` resolution. Sets `Cache-Control` headers. Use `fs.createReadStream` + `new Response(stream, { headers: { "Content-Type": mime } })`. Only active when `storage.active_provider === "local"`.

---

### `src/instrumentation.ts` (config — boot hook, NO analog)

**No existing instrumentation.** RESEARCH.md Pattern 5 (L628-638). Exports `register()` called once at server init; gate with `if (process.env.NEXT_RUNTIME === "nodejs")` (skip Edge). Dynamic-imports `@/lib/schedule` and calls `startScheduler()`.

**Note on file-naming convention:** the repo's existing auth-gate file is `middleware.ts` (NOT `proxy.ts`) — see `middleware.ts` L11-18 comment documenting a Turbopack/Next 16.2.9 manifest registration issue. `instrumentation.ts` does NOT have this issue (it's a different file convention with its own manifest entry) — name it `instrumentation.ts` as the docs specify.

---

### `src/db/schema.ts` (model — modified in place)

**Analog:** self (existing, L102-113 for `media`, L41-57 for `posts`, L132-136 for `settings`). Three deltas:

1. **`media.uploadedBy`** L106: `integer("uploaded_by")` → `text("uploaded_by").references(() => user.id)` (user.id is text UUID — currently broken).
2. **`media.r2Key`** L104: rename to `providerKey` + add `provider: text("provider")` (values `"local" | "r2"`; Cloudinary/push-CDN Phase 4).
3. **`posts.previewToken`** (new): `varchar("preview_token", { length: 255 }).unique()` (nullable, D-19). Add near L52.

**Settings seed (one migration, no schema change — settings is key-value):** insert `storage.active_provider='local'`, `site.timezone='Asia/Dhaka'`, `site.feature_image_default=<tbd>`. Generated via `pnpm db:generate` (drizzle-kit) — NEVER hand-write SQL (CLAUDE.md).

**Open question (A6):** whether "scheduled" is a new `post_status` enum value or `status='draft' AND publishedAt<=now()`. RESEARCH.md recommends the latter (no enum migration).

---

### `next.config.ts` (config — modified)

**Analog:** self (existing, L1-40). Add `experimental.serverActions.bodySizeLimit: "10mb"` (D-08). **RESEARCH correction:** the default is **1MB** (not 4.5MB as CONTEXT.md speculated) per installed Next.js 16.2.9 `serverActions.md`. Without this, uploads >1MB silently fail (Pitfall #3, RESEARCH.md L756-759).

Existing relevant config: `cacheComponents: true` (L5, PPR), `output: "standalone"` (L7, Coolify), `images.loaderFile: "src/lib/image-loader.ts"` (L17, custom loader). The custom loader bypasses the optimizer for absolute URLs → SSRF (D-03) is a **non-issue** (browser fetches external images directly; `remotePatterns` L12-15 is inert for custom-loader images).

---

### `vitest.config.ts` (config — modified)

**Analog:** self (existing, L1-23). Node environment default; component tests opt into jsdom via `// @vitest-environment jsdom` pragma (already used in `src/components/auth/__tests__/SignInForm.test.tsx` L2). Confirm the round-trip test (`src/components/editor/__tests__/round-trip.test.ts`) does NOT need jsdom — `generateHTML` is pure (no DOM) — so it runs in the default node env. No structural change likely needed; verify the include globs (L12-15) already cover the new `src/**/__tests__/**` paths (they do).

---

### Test files — analog patterns

**Action tests** (`posts.test.ts`, `taxonomy.test.ts`, `media.test.ts`): **clone `src/actions/__tests__/users.test.ts`**.
- `vi.hoisted(() => ({ ...mocks }))` (L18-34) — spies exist when `vi.mock` factories run.
- `vi.mock("@/lib/db", ...)` (L57-68) — chainable Drizzle builder stub: `select().from().where()` returns the controlled array.
- `vi.mock("@/lib/permissions", ...)` (L72-75) — `requireCan`/`assertOwnsPost` default DENY.
- `vi.mock("@/lib/log", ...)` (L78-80) — no-op `{ info: vi.fn(), error: vi.fn() }`.
- **Permission-check-first assertion** (L162-174): mock the capability to throw FORBIDDEN, mock the downstream (`auth.api.*` / `db.insert`) to throw `"MUST_NOT_BE_REACHED"` — proves the check fires before the mutation. Posts tests additionally mock `next/cache` (`revalidatePath`/`revalidateTag` as `vi.fn()`) and assert the concrete paths + 2-arg tag form (D-25).

**Lib unit tests** (`sanitize`, `slug`, `schedule/system-publish`, `storage/registry`): **clone `src/lib/permissions/__tests__/transitions.test.ts`**.
- Mock `@/lib/db` (L16-29) + `@/lib/permissions` (L10-13) the same way.
- `system-publish.test.ts`: assert the due-post query + status flip + revalidate calls. **Do NOT assert `transitionPost` was called** (D-12 exception — the scheduler bypasses it).
- `registry.test.ts`: mock `db.select().from(settings).where()` to return `"local"` / `"r2"` and assert `getActiveProvider()` returns the right singleton.

**Component test** (`round-trip.test.ts`): pure-function test, default node env (no jsdom). Asserts `generateHTML(sampleJson, editorExtensions)` contains `<table>`, `<img>`, `<pre><code>`, `<a>`, and a raw-HTML `<iframe>` sample (closes the A5 assumption + MEDIUM research flag).

---

## Shared Patterns

### RBAC — permission-check-first (Pitfall #1)
**Source:** `src/lib/permissions/index.ts` (L57-68 `requireCan`, L78-94 `assertOwnsPost`)
**Apply to:** EVERY mutating action in `posts.ts`, `categories.ts`, `tags.ts`, `media.ts` (the autosave action too — D-17).
```typescript
export async function requireCan(permission: Permission) {
  const session = await getSessionOrThrow();
  const result = await auth.api.userHasPermission({
    body: { userId: session.user.id, permissions: permission },
  });
  if (!result || (typeof result === "object" && "ok" in result && !result.ok)) {
    log.error("permission denied", { permission, userRole: session.user.role });
    throw new Error("FORBIDDEN");
  }
  return session;
}
```
Import via `@/lib/permissions` (or `@/lib/auth/server` barrel — `server.ts` L10 re-exports both).

### Status-transition funnel (R7)
**Source:** `src/lib/permissions/post-transitions.ts` (L50-84 `transitionPost`)
**Apply to:** the user-facing publish/submit/unpublish actions in `posts.ts`. The scheduler's `system-publish.ts` is the **sole documented exception** (D-12).
```typescript
await db.update(schema.posts).set({ status: target, updatedAt: new Date() }).where(eq(schema.posts.id, postId));
```

### Error / logging idiom
**Source:** `src/lib/log/index.ts` + `actions/users.ts` L54-58
**Apply to:** all new actions + lib modules.
```typescript
log.error("permission denied", { reason: "no session" });
throw new Error("UNAUTHORIZED"); // or FORBIDDEN | NOT_FOUND | INVALID_TRANSITION:...
```
Error vocabulary already in use: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_TRANSITION:from→to`. Add `TOO_MANY_TAGS` (D-23) and any storage-specific ones consistently.

### DB client + schema barrel
**Source:** `src/lib/db/index.ts` (L17-18: `export const db`, `export { schema }`)
**Apply to:** every server module. Import as `import { db, schema } from "@/lib/db"`. Single pool — never instantiate a second `Pool`.

### Image URL resolution (custom loader)
**Source:** `src/lib/image-loader.ts` (L28-30: absolute URLs pass through; L34-36: local paths → app origin)
**Apply to:** media library + feature image + body images. **No change needed** (D-03 mechanically supported). The local provider returns `/api/media/<key>` (relative → app origin); R2 returns `${NEXT_PUBLIC_CDN_URL}/<key>` (absolute → pass-through).

### Server-only module convention
**Source:** every `lib/` file — no `"use client"` directive; comment `NO "use client" directive` at top (r2/index.ts L10, permissions/index.ts L7, db/index.ts L6).
**Apply to:** all new `lib/storage`, `lib/sanitize`, `lib/slug`, `lib/schedule`, `lib/excerpt` modules. The ONE exception is `src/components/editor/extensions.ts` — also server-safe but no directive (must import from both client `Editor` and server `generateHTML`).

### Migration discipline
**Source:** `package.json` L11 `"db:generate": "drizzle-kit generate"` + `scripts/test-migrations.mjs`
**Apply to:** the single Phase-3 migration (media type/provider rename + previewToken + settings seeds). Generate, never hand-write. Extend `test-migrations.mjs` to cover the new migration (RESEARCH.md L958).

---

## No Analog Found

Files with no close match in the codebase — the planner uses RESEARCH.md patterns instead:

| File | Role | Data Flow | Reason | RESEARCH.md spec |
|------|------|-----------|--------|------------------|
| `src/lib/sanitize/index.ts` | utility | transform | No DOMPurify usage exists | Pattern 2 (L428-483) |
| `src/lib/slug/index.ts` | utility | validation | No validator exists | L826 (zod regex) |
| `src/lib/excerpt/index.ts` | utility | transform | No excerpt utility | D-21 (Bangla-aware) |
| `src/lib/schedule/index.ts` | service | cron | No background worker exists | Pattern 5 (L640-651) |
| `src/instrumentation.ts` | config | boot hook | No instrumentation file exists | Pattern 5 (L628-638) |
| `src/app/api/media/[...path]/route.ts` | route | file streaming | No Route Handler exists | Pattern 4 (L576-619) |
| `src/components/editor/extensions.ts` | config | shared module | No editor code exists | Pattern 1 (L352-385) — PRIMARY research flag |

---

## Metadata

**Analog search scope:** `src/actions/`, `src/lib/` (r2, permissions, db, log, auth, image-loader), `src/db/`, `src/app/(admin)/`, `src/components/{form,ui,tables,auth}/`, repo root config (`next.config.ts`, `vitest.config.ts`, `middleware.ts`, `package.json`).
**Files scanned:** 22 source files + 4 config files + 3 existing test files.
**Pattern extraction date:** 2026-07-04
**Key reuse insight:** Phase 3 is overwhelmingly a **composition of existing Phase-1/2 primitives** — `actions/users.ts` (action template), `lib/r2` (upload pipeline), `lib/permissions` (RBAC + transition funnel), `lib/image-loader` (URL resolution), `lib/db` + `lib/log` + `lib/auth` (infra). The genuinely novel surfaces are 7 files (sanitize, slug, excerpt, schedule×2, instrumentation, route-handler, extensions) — all fully specified in RESEARCH.md with concrete code.
