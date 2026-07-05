# Phase 4: Dashboard Chrome - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 44 new/modified/moved/deleted files
**Analogs found:** 41 / 44 (3 novel — Node `crypto` helper, Cloudinary/push-CDN provider internals, test-connection probe)

## File Classification

Legend for the Role column: NEW = create from scratch, MODIFY = edit existing, EXTEND = add to existing, MOVE = relocate existing under `/dashboard/*`, DEL = delete.

### Route pages (D-01, D-04, DASH-01/02/03/04/05)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/(admin)/dashboard/page.tsx` | MODIFY | request-response (server-rendered stats) | `src/app/(admin)/dashboard/page.tsx` (current placeholder) + `src/app/(admin)/posts/page.tsx` (action reads) | exact (self) + role-match |
| `src/app/(admin)/dashboard/posts/page.tsx` | MOVE+MODIFY | request-response (server list) | `src/app/(admin)/posts/page.tsx` | exact (self) |
| `src/app/(admin)/dashboard/posts/new/page.tsx` | MOVE | request-response (server shell + lazy editor) | `src/app/(admin)/posts/new/page.tsx` | exact (self) |
| `src/app/(admin)/dashboard/posts/[id]/edit/page.tsx` | MOVE | request-response (server shell) | `src/app/(admin)/posts/[id]/edit/page.tsx` | exact (self) |
| `src/app/(admin)/dashboard/posts/PostForm.tsx` | MOVE+MODIFY | form-submit (RHF+Zod) → server action | `src/app/(admin)/posts/PostForm.tsx` | exact (self) |
| `src/app/(admin)/dashboard/posts/schema-client.ts` | MOVE | transform (Zod bridge) | `src/app/(admin)/posts/schema-client.ts` | exact (self) |
| `src/app/(admin)/dashboard/categories/page.tsx` | NEW | request-response (server table over actions) | `src/app/(admin)/posts/page.tsx` | role-match (table-over-action) |
| `src/app/(admin)/dashboard/tags/page.tsx` | NEW | request-response (server table) | `src/app/(admin)/posts/page.tsx` | role-match |
| `src/app/(admin)/dashboard/media/page.tsx` | NEW | request-response (grid/list browser) | `src/app/(admin)/posts/page.tsx` + `src/app/(admin)/(ui-elements)/images/page.tsx` | role-match |
| `src/app/(admin)/dashboard/users/page.tsx` | NEW | request-response (admin-only table + drawer) | `src/app/(admin)/posts/page.tsx` (table) + `src/components/example/ModalExample/DefaultModal.tsx` (drawer/modal) | role-match |
| `src/app/(admin)/dashboard/pages/page.tsx` | NEW | request-response (server list) | `src/app/(admin)/posts/page.tsx` | role-match |
| `src/app/(admin)/dashboard/pages/[id]/edit/page.tsx` | NEW | request-response (server shell + PageForm) | `src/app/(admin)/posts/new/page.tsx` | role-match |
| `src/app/(admin)/dashboard/pages/PageForm.tsx` | NEW | form-submit (slimmed Tiptap + RHF) | `src/app/(admin)/posts/PostForm.tsx` (slimmed) | role-match |
| `src/app/(admin)/dashboard/profile/page.tsx` | MOVE+MODIFY | request-response + form-submit (real data) | `src/app/(admin)/(others-pages)/profile/page.tsx` | exact (self) |
| `src/app/(admin)/dashboard/settings/storage/page.tsx` | NEW | form-submit (admin-only) + RHF | `src/app/(admin)/posts/PostForm.tsx` (form pattern) | role-match |

### Shell / nav / providers (D-01, D-02, D-05, D-28)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/layout/AppSidebar.tsx` | MODIFY | event-driven (UI nav) | `src/layout/AppSidebar.tsx` (current TailAdmin default) | exact (self) |
| `src/app/(admin)/AdminShell.tsx` | MODIFY | provider wrap | `src/app/(admin)/AdminShell.tsx` | exact (self) |
| `src/app/(admin)/QueryProvider.tsx` | NEW | provider (client) | RESEARCH.md Pattern 3 (TanStack `QueryClientProvider` shape) | role-match (no codebase analog — first client provider in `(admin)`) |
| `middleware.ts` | MODIFY (likely none — matcher already correct) | request-response (UX gate) | `middleware.ts` (current) | exact (self) |
| `scripts/test-auth-gate.mjs` | MODIFY | batch (structural + HTTP check) | `scripts/test-auth-gate.mjs` (current) | exact (self) |

### Server Actions (D-07, D-11, D-17, D-18, D-23, D-26, Pitfall 0)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/actions/users.ts` | EXTEND (add `listUsers` + `updateUser`) | CRUD + permission-check-first | `src/actions/users.ts` (existing primitives) + `src/actions/categories.ts` (`listX`/`updateX`) | exact (self) |
| `src/actions/pages.ts` | NEW | CRUD + permission-check-first | `src/actions/categories.ts` (CRUD shape) + `src/actions/posts.ts` (body sanitize + revalidation) | role-match |
| `src/actions/pages-schema.ts` | NEW | transform (Zod schema, shared client+server) | `src/actions/posts-schema.ts` | role-match (near-exact) |
| `src/actions/storage-settings.ts` | NEW | CRUD (admin-gated save) + encryption | `src/actions/settings.ts` (read shape) + `src/actions/categories.ts` (mutating template) + RESEARCH.md Pattern 2 (encrypt/redact) | role-match |
| `src/actions/media.ts` (L172 `deleteMedia`) | MODIFY | CRUD (Pitfall 0 row-routed delete) | `src/actions/media.ts` (current broken) + `src/lib/storage/registry.ts` (`getProviderByName`) | exact (self) |

### Storage + crypto (D-21, D-22, D-25, Pitfall 0)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/storage/types.ts` | EXTEND (widen `name` union) | interface | `src/lib/storage/types.ts` (current `StorageProvider`) | exact (self) |
| `src/lib/storage/registry.ts` | EXTEND (add `getProviderByName`) | factory (provider selector) | `src/lib/storage/registry.ts` (current `getActiveProvider`) | exact (self) |
| `src/lib/storage/cloudinary.ts` | NEW | provider (file I/O via SDK) | `src/lib/storage/r2.ts` (interface impl) + RESEARCH.md Example 1 | role-match (interface same, internals novel) |
| `src/lib/storage/push-cdn.ts` | NEW | provider (file I/O via S3Client + CDN overlay) | `src/lib/storage/r2.ts` (S3Client + `uploadImageVariants` pattern) + RESEARCH.md Example 2 | role-match |
| `src/lib/crypto/index.ts` | NEW | transform (encrypt/decrypt/redact) | **NO codebase analog** — use RESEARCH.md Pattern 2 (Node `crypto` AES-256-GCM) | none (novel) |
| `src/instrumentation.ts` | MODIFY | boot registration | `src/instrumentation.ts` (current `register()` body) | exact (self) |

### Components (D-13)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/dashboard/media/MediaPicker.tsx` | NEW | event-driven (modal + upload-in-place) | `src/components/ui/modal/index.tsx` + `src/hooks/useModal.ts` + `src/components/example/ModalExample/DefaultModal.tsx` | role-match |
| `src/components/editor/toolbar/Toolbar.tsx` | MODIFY | event-driven (replace `window.prompt` L50-55) | `src/components/editor/toolbar/Toolbar.tsx` (current) | exact (self) |
| `src/app/(admin)/dashboard/posts/PostForm.tsx` feature-image field | MODIFY (D-13 wiring) | form event (open picker) | `src/app/(admin)/posts/PostForm.tsx` (current URL input) | exact (self) |

### Config / migration / env (D-25, D-29, Pitfall 4)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `next.config.ts` | MODIFY (remotePatterns) | config | `next.config.ts` (current) | exact (self) |
| `.env.example` | MODIFY (add `SETTINGS_ENCRYPTION_KEY`) | config | `.env.example` (current) | exact (self) |
| `db/migrations/<new>` | NEW (seed) | batch (`drizzle-kit generate`) | prior Phase-3 seed migration | role-match |
| `src/db/schema.ts` | VERIFY only (no change expected — D-29) | — | — | — |

### Tests (Wave 0)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/storage/__tests__/cloudinary.test.ts` | NEW | unit | `src/lib/storage/__tests__/registry.test.ts` (mock shape) | role-match |
| `src/lib/storage/__tests__/push-cdn.test.ts` | NEW | unit | `src/lib/storage/__tests__/registry.test.ts` (mock shape) | role-match |
| `src/lib/crypto/__tests__/crypto.test.ts` | NEW | unit (round-trip + tamper) | `src/lib/storage/__tests__/registry.test.ts` (Vitest structure) | role-match |
| `src/actions/__tests__/storage-settings.test.ts` | NEW | unit (permission + encrypt + redact) | `src/actions/__tests__/users.test.ts` (permission-first pattern) | role-match |
| `src/actions/__tests__/pages.test.ts` | NEW | unit (CRUD + permission) | `src/actions/__tests__/taxonomy.test.ts` (CRUD test shape) | role-match |
| `src/actions/__tests__/users.test.ts` | EXTEND (`listUsers`/`updateUser`) | unit | `src/actions/__tests__/users.test.ts` (current) | exact (self) |
| `src/actions/__tests__/media.test.ts` | EXTEND (row-routed delete) | unit | `src/actions/__tests__/media.test.ts` (current) | exact (self) |

### Demo cleanup (D-03) — deletions

| File | Role | Reason |
|------|------|--------|
| `src/app/(admin)/(others-pages)/{charts,forms,tables,blank}/**` | DEL | TailAdmin demos, not used in CMS |
| Their now-unused component files | DEL | Drop unused chart/form/table demos |
| KEEP: `(others-pages)/calendar` + `profile` (profile → moved to `/dashboard/profile` per D-09) | — | Real features |
| KEEP: `(ui-elements)/**` | — | D-02 collapsed "Components" reference group |

---

## Pattern Assignments

### `src/lib/storage/cloudinary.ts` (NEW provider, D-22)

**Analog:** `src/lib/storage/r2.ts` — same `StorageProvider` interface, different backend.

**The interface contract** (`src/lib/storage/types.ts` L29-83) — implement exactly:
```typescript
export interface StorageProvider {
  readonly name: "local" | "r2"; // Phase-4 DASH-09 adds "cloudinary" | "push-cdn"
  upload(buffer: Buffer, baseKey: string, mimeType: string): Promise<{
    variants: UploadedVariant[];
    primary: { key: string; width?: number; height?: number; sizeBytes?: number; };
  }>;
  getPublicUrl(key: string, variant?: "sm" | "md" | "lg"): string;
  delete(key: string): Promise<void>;
}
```

**The r2 provider export shape to clone** (`src/lib/storage/r2.ts` L24-77):
```typescript
export const r2Provider: StorageProvider = {
  name: "r2",
  async upload(buffer, baseKey, mimeType) { /* ... */ return { variants, primary: { key, width, height, sizeBytes } }; },
  getPublicUrl(key) { return `${cdn}/${key}`; },
  async delete(key) { /* idempotent — catch and swallow per contract */ },
};
```

**Key differences for Cloudinary (from RESEARCH.md Example 1 + D-22):**
- `name: "cloudinary"` (widens the union in `types.ts`)
- `upload()` returns `variants: []` — Cloudinary owns transforms at delivery URL time (sharp bypassed; D-22)
- `getPublicUrl(key, variant)` produces transform URLs via `cloudinary.url(key, { transformation: [...] })`
- `delete()` calls `cloudinary.uploader.destroy(key)` — idempotent `.catch(() => {})` (matches r2's swallow pattern)
- Upload uses `cloudinary.v2.uploader.upload_stream()` piped from `Readable.from(buffer)` (Pitfall 3 — RESEARCH.md L509-513)

**Imports pattern** (`src/lib/storage/r2.ts` L16-18):
```typescript
import { uploadImageVariants, s3Client } from "@/lib/r2";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { StorageProvider } from "./types";
```
Cloudinary equivalent: `import { v2 as cloudinary } from "cloudinary";` + `import type { StorageProvider } from "./types";` + dynamic `import("node:stream")` for `Readable`.

---

### `src/lib/storage/push-cdn.ts` (NEW provider, D-21)

**Analog:** `src/lib/storage/r2.ts` (S3 origin pattern) + `src/lib/storage/local.ts` (3-variant sharp pipeline).

**The local provider sharp pipeline to clone** (`src/lib/storage/local.ts` L66-100):
```typescript
if (mimeType.startsWith("image/")) {
  const variants: UploadedVariant[] = [];
  for (const size of IMAGE_SIZES) {  // [{width:640,suffix:"sm"},{width:1024,suffix:"md"},{width:1920,suffix:"lg"}]
    const { data, info } = await sharp(buffer)
      .resize(size.width, undefined, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    // write each variant — for push-cdn, s3Client.send(new PutObjectCommand({...}))
    variants.push({ key, width: info.width, height: info.height, format: "webp", sizeBytes: info.size });
  }
  const md = variants[1]; // 1024px primary
  return { variants, primary: { key: md.key, width: md.width, height: md.height, sizeBytes: md.sizeBytes } };
}
```

**The `IMAGE_SIZES` constant** (`src/lib/storage/local.ts` L38-42):
```typescript
const IMAGE_SIZES = [
  { width: 640, suffix: "sm" },
  { width: 1024, suffix: "md" },
  { width: 1920, suffix: "lg" },
] as const;
```

**R2 S3Client pattern to reuse** (`src/lib/storage/r2.ts` L45-58 + L67-76) — `PutObjectCommand` for upload, `DeleteObjectCommand` for idempotent delete:
```typescript
await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: baseKey, Body: buffer, ContentType: mimeType }));
// delete:
await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
```

**push-CDN-specific (from RESEARCH.md Example 2):**
- A module-level `configurePushCdn(creds)` initializes a custom `S3Client({ region, endpoint, credentials, forcePathStyle })` + `cdnBaseUrl`
- `getPublicUrl(key)` overlays: `return `${cdnBaseUrl}/${key}`;`
- Credentials come from encrypted settings (registry reads + decrypts at boot)

---

### `src/lib/storage/registry.ts` (EXTEND with `getProviderByName` — Pitfall 0 fix)

**Analog:** current `getActiveProvider` (`src/lib/storage/registry.ts` L69-78) + the existing `providers` map (L32-35).

**Current `getActiveProvider` pattern to clone** for the new lookup:
```typescript
const providers: Record<string, StorageProvider> = {
  local: localProvider,
  r2: r2Provider,
};

export async function getActiveProvider(): Promise<StorageProvider> {
  const [row] = await db.select().from(schema.settings)
    .where(eq(schema.settings.key, "storage.active_provider")).limit(1);
  const name = (row?.value as string | null | undefined) ?? "local";
  return providers[name] ?? providers.local; // default-safe fallback
}
```

**Pitfall 0 fix** — add synchronous lookup (the `providers` map already exists, just expose it):
```typescript
// NEW — planner copies this shape:
export function getProviderByName(name: string | null | undefined): StorageProvider {
  return providers[name ?? "local"] ?? providers.local;
}
```

Then `actions/media.ts` L172 changes from `const provider = await getActiveProvider();` to `const provider = getProviderByName(row.provider);` — routing by the ROW's stored provider (Pitfall 0 root cause).

---

### `src/lib/storage/types.ts` (EXTEND name union)

**Analog:** current L31 of `types.ts`.

**Single-line edit** — widen the discriminator:
```typescript
readonly name: "local" | "r2"; // Phase-4 DASH-09 adds "cloudinary" | "push-cdn"
// becomes:
readonly name: "local" | "r2" | "cloudinary" | "push-cdn";
```

---

### `src/actions/pages.ts` + `src/actions/pages-schema.ts` (NEW CRUD action + Zod schema)

**Analog (action):** `src/actions/categories.ts` (CRUD shape) + `src/actions/posts.ts` (body sanitize + status transitions).

**Permission-check-first template** (`src/actions/categories.ts` L15-19 + L28-44):
```typescript
"use server";
import { db, schema } from "@/lib/db";
import { asc, eq, isNull } from "drizzle-orm";
import { log } from "@/lib/log";
import { requireCan } from "@/lib/permissions";

export async function createCategory(input: CategoryInput) {
  await requireCan({ taxonomy: ["create"] }); // FIRST (Pitfall #1)
  // ... validate, write
}
```
Pages action variant: `await requireCan({ page: ["create"] })` (or whichever permission keys the Phase-2 RBAC statement set defines — verify against `src/lib/permissions/index.ts` `requireCan({ page: [...] })`).

**Body sanitize pattern** (clone from `src/actions/posts.ts` L57-83 + L110-113) — pages body is also Tiptap JSON with raw-HTML embed nodes:
```typescript
function sanitizeBodyHtml(body: unknown): unknown { /* walks JSON, sanitizeBeforeStore on HTML strings */ }
const sanitizedBody = sanitizeBodyHtml(data.body);
```
Import: `import { sanitizeBeforeStore } from "@/lib/sanitize";` (same config as posts — D-18 slimmed editor reuses the render pipeline; CLAUDE.md "sanitize before storage AND render").

**Page status — D-20 says draft/published only** (no `pending_review`). `pageStatusEnum` already in `schema.ts` L44: `pgEnum("page_status", ["draft", "published"])`. So `pages-schema.ts`:
```typescript
status: z.enum(["draft", "published"]).optional(),
```

**Analog (schema):** `src/actions/posts-schema.ts` L13-37 — same module shape (Zod v4, `SLUG_REGEX` reused, schema-as-shared-client-server per CLAUDE.md). Pages schema drops `categoryId`, `tagIds`, `excerpt`, `featureImage`, `publishedAt` schedule complexity; adds `metaTitle`/`metaDescription`/`canonical` (already on `pages` table — `schema.ts` L139-141).

---

### `src/actions/storage-settings.ts` (NEW admin-gated save + test connection)

**Analog (admin role gate):** `requireRole('admin')` from `src/lib/permissions/index.ts` L40-47:
```typescript
export async function requireRole(role: "admin" | "editor" | "author") {
  const session = await getSessionOrThrow();
  if (session.user.role !== role && session.user.role !== "admin") {
    log.error("permission denied", { requiredRole: role, userRole: session.user.role });
    throw new Error("FORBIDDEN");
  }
  return session;
}
```

**Analog (settings read):** `src/actions/settings.ts` L26-33 — current `getSetting(key)`:
```typescript
export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(schema.settings)
    .where(eq(schema.settings.key, key)).limit(1);
  return row?.value ?? null;
}
```

**Analog (settings write/upsert):** no existing setSetting — model on `categories.ts` L35-43 `db.insert(...).values(...).returning(...)` but for upsert use `db.insert(schema.settings).values([...]).onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } })` (mirrors `seed.ts` L26-35 on-conflict idiom, switched from DoNothing to DoUpdate for save).

**Encryption (NO codebase analog — use RESEARCH.md Pattern 2):**
```typescript
import { encrypt, decrypt, redactCredentials } from "@/lib/crypto";
// Save: const blob = encrypt(JSON.stringify(creds));
// Read for client: return redactCredentials(JSON.parse(decrypt(blob)));
```
**D-25 anti-leak:** every read crossing the client boundary MUST run through `redactCredentials` — secret fields return `""` (Pitfall 7).

---

### `src/actions/users.ts` (EXTEND with `listUsers` + `updateUser`)

**Analog:** existing primitives in the same file (`src/actions/users.ts` L80-96 `createUser`, L104-117 `banUser`).

**Permission-check-first template to follow** (L86, L108, L125, L142):
```typescript
export async function createUser(input: {...}) {
  await requireCan({ user: ["create"] }); // FIRST
  return auth.api.createUser({ body: {...} });
}
```

**`listUsers` analog:** `listCategories` / `listTags` in `src/actions/categories.ts` L46-56 / `src/actions/tags.ts` L41-48 — read is open to the dashboard (no `requireCan` for listX; the proxy + layout gate are sufficient per the established pattern). Filter `banned = false` rows for active users.

**`updateUser` analog:** `updateCategory` (`categories.ts` L58-76) — `await requireCan({ user: ["update"] })` first; `auth.api.updateUser({ body: { userId, ...changes } })` for the actual write. **D-11 security-critical:** role-change MUST hit the server-side `requireCan({ user: ["update"] })` re-check (Pitfall — UI hiding is not enough; `src/lib/permissions/index.ts` is the authoritative RBAC boundary).

---

### `src/actions/media.ts` L172 (MODIFY `deleteMedia` — Pitfall 0 fix)

**Analog (current broken code):** `src/actions/media.ts` L154-181.

**The bug** — L172 uses `getActiveProvider()` instead of routing by `row.provider`:
```typescript
// CURRENT (broken under DASH-09 multi-provider):
const provider = await getActiveProvider();
await provider.delete(row.providerKey);
```

**The fix** — use the new `getProviderByName` from `registry.ts` (per the row's stored provider):
```typescript
import { getProviderByName } from "@/lib/storage/registry";
// ...
const provider = getProviderByName(row.provider);
await provider.delete(row.providerKey);
```
This honors the contract documented in the comment at L26-27 of `types.ts` ("a row stored with provider='r2' is deleted via r2Provider even if the active setting has since switched").

---

### `src/lib/crypto/index.ts` (NEW — NO codebase analog)

**Analog:** RESEARCH.md Pattern 2 (L353-391) — Node `node:crypto` AES-256-GCM canonical pattern. This is the *only* file in Phase 4 with no codebase precedent (the project has no existing crypto helper — verified by the absence of any `lib/crypto/` or `cipher`/`decipher` references elsewhere).

**Canonical shape** (from RESEARCH.md L357-391):
```typescript
import crypto from "node:crypto";

const KEY_B64 = process.env.SETTINGS_ENCRYPTION_KEY;
if (!KEY_B64) throw new Error("SETTINGS_ENCRYPTION_KEY missing");
const KEY = Buffer.from(KEY_B64, "base64");
if (KEY.length !== 32) throw new Error("SETTINGS_ENCRYPTION_KEY must be 32 bytes");

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12); // fresh 96-bit IV per encryption (CRITICAL for GCM)
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decrypt(envelope: string): string { /* reverse — throws on tamper */ }

export function redactCredentials<T extends Record<string, unknown>>(creds: T): T { /* zero secret fields */ }
```
Server-only — NO `"use client"`. `SETTINGS_ENCRYPTION_KEY` is a runtime env var (NOT `NEXT_PUBLIC_*`).

---

### `src/instrumentation.ts` (MODIFY — register new providers at boot)

**Analog:** current `src/instrumentation.ts` L25-30.

**Current pattern** (gate on Node runtime, dynamic-import server-only modules):
```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/schedule");
    startScheduler();
  }
}
```

**Extension** — register the new providers in the same `if (process.env.NEXT_RUNTIME === "nodejs")` block:
```typescript
const { registerStorageProvider } = await import("@/lib/storage/registry");
const { cloudinaryProvider } = await import("@/lib/storage/cloudinary");
const { pushCdnProvider } = await import("@/lib/storage/push-cdn");
registerStorageProvider("cloudinary", cloudinaryProvider);
registerStorageProvider("push-cdn", pushCdnProvider);
```
The dynamic-import pattern keeps the Cloudinary SDK + S3 deps out of the Edge bundle (mirrors the scheduler import).

---

### `src/app/(admin)/dashboard/posts/PostForm.tsx` (MOVE + TanStack Query retrofit, D-26)

**Analog:** `src/app/(admin)/posts/PostForm.tsx` L38-67 (current).

**Current RHF + Zod wiring to preserve** (L40-58):
```typescript
const { register, handleSubmit, control, watch,
  formState: { errors, isSubmitting } } = useForm<PostSchemaInput>({
  resolver: zodResolver(postSchema),
  defaultValues: { /* initial* props */ },
});
const onValid = async (values: PostSchemaInput) => {
  setSubmitError(null);
  try { await savePost(values as Parameters<typeof savePost>[0]); }
  catch (err) { setSubmitError(err instanceof Error ? err.message : "Save failed"); }
};
```

**TanStack Query retrofit** (RESEARCH.md Pattern 4 L437-444) — wrap `savePost` in `useMutation`:
```typescript
const mutation = useMutation({
  mutationFn: (values: PostSchemaInput) => savePost(values as Parameters<typeof savePost>[0]),
  // D-27: NOT optimistic on post save (high-stakes + revalidation) — server confirms.
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
});
const onValid = (values: PostSchemaInput) => mutation.mutate(values);
// isSubmitting → mutation.isPending; submitError → mutation.error
```
**D-27 explicit:** post publish/save is NOT optimistic (high-stakes + revalidatePath/revalidateTag).

**Feature-image field** (L126-136) — MODIFY for `<MediaPicker>` wiring (D-13). Replace the URL `<input>` with a button that opens `<MediaPicker onPick={(url) => setValue("featureImage", url)} />` + a "paste external URL" fallback (D-13 preserves the external-URL path).

---

### `src/app/(admin)/dashboard/{categories,tags,media,users,pages,settings/storage}/page.tsx` (NEW list pages)

**Analog:** `src/app/(admin)/posts/page.tsx` (Server Component list over an action).

**The list-page template** (`src/app/(admin)/posts/page.tsx` L25-107):
```typescript
import Link from "next/link";
import { listPosts } from "@/actions/posts";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Metadata } from "next";

export const metadata: Metadata = { title: "Posts | Any Discussion", description: "..." };

export default async function PostsListPage() {
  let posts = []; let loadError = null;
  try { posts = await listPosts(); }
  catch (err) { loadError = err instanceof Error ? err.message : "Failed to load posts"; }

  return (
    <div>
      <PageBreadcrumb pageTitle="Posts" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">All Posts</h3>
          <Link href="/posts/new" className="inline-flex ... bg-brand-500 ...">+ New Post</Link>
        </div>
        {loadError ? <ErrorBox /> : posts.length === 0 ? <EmptyState /> : <Table>...</Table>}
      </div>
    </div>
  );
}
```

**Per page:**
- Categories: `listCategories()` from `actions/categories.ts` (already exists).
- Tags: `listTags()` from `actions/tags.ts` (already exists).
- Media: `listMedia()` from `actions/media.ts` — render as grid (dominant per D-12) + list toggle; analog for grid layout = `(ui-elements)/images/page.tsx` (ComponentCard + image grids).
- Users: NEW `listUsers()` from extended `actions/users.ts` — table + drawer; drawer analog = `Modal` component (`src/components/ui/modal/index.tsx`) + `useModal` hook.
- Pages: NEW `listPages()` from `actions/pages.ts`.
- Settings/Storage: NEW form page (admin-only); analog form pattern = `PostForm.tsx` (RHF + Zod + TanStack Query).

**D-01 critical:** all `<Link href>`/`router.push` paths change from `/posts/*` → `/dashboard/posts/*` (and equivalents). Sidebar `href`s update too.

---

### `src/app/(admin)/dashboard/page.tsx` (MODIFY overview — D-04 lean real stats)

**Analog:** current `src/app/(admin)/dashboard/page.tsx` (placeholder) + the `listPosts` read pattern.

**Current placeholder** (L9-23) — replace with real stat reads:
```typescript
export default function DashboardOverview() {
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 ...">
          <h2>Dashboard</h2>
          <p>Dashboard content will be wired to real data in Phase 4.</p>
        </div>
      </div>
    </div>
  );
}
```

**D-04 spec:** server-rendered, no charts. Posts-by-status counts (draft / pending_review / published), a short list of pending-review drafts, media count, "New post" CTA. Add count queries (mirror `listPosts` action's `db.select().from(schema.posts)` with `count()` groupby — pattern from `users.ts` L49-52 `db.select({ n: count() }).from(...).where(...)`).

---

### `src/app/(admin)/AdminShell.tsx` (MODIFY — wrap QueryClientProvider, D-28)

**Analog:** current `src/app/(admin)/AdminShell.tsx` L34-49.

**Current shell** (L34-49):
```typescript
return (
  <div className="min-h-screen xl:flex">
    <AppSidebar />
    <Backdrop />
    <div className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}>
      <AppHeader />
      <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">{children}</div>
    </div>
  </div>
);
```

**D-28 wrap** (RESEARCH.md Pattern 3 L398-425) — wrap `{children}` with `<QueryProvider>`:
```typescript
import QueryProvider from "./QueryProvider";
// ...
<div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
  <QueryProvider>{children}</QueryProvider>
</div>
```

### `src/app/(admin)/QueryProvider.tsx` (NEW client component)

**Analog:** RESEARCH.md Pattern 3 — first client provider in `(admin)`. No codebase analog (this is the project's first QueryClientProvider).

```typescript
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
  }));
  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}
```
D-28 anti-pattern warning: NEVER wrap the root `app/layout.tsx` — must stay inside `(admin)` only (reinforces PERF-02). ESLint `no-restricted-imports` keeps `(site)` from importing it.

---

### `src/layout/AppSidebar.tsx` (MODIFY — CMS nav + Components ref, D-02/D-05)

**Analog:** current `src/layout/AppSidebar.tsx` L29-95 (NavItem structure).

**Current navItems/othersItems** (L29-95) — the unmodified TailAdmin default. D-02 fully replaces it.

**NavItem shape** to preserve (L22-27):
```typescript
type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};
```

**D-02 new top nav:** Posts, Categories, Tags, Media, Pages, Users, Settings, Profile, Calendar (paths under `/dashboard/*`). Plus a collapsed "Components" reference group (the `(ui-elements)` showcase). D-05 role-filter is UX-only — filter the array client-side using `session.user.role` (or a passed-in prop); the authoritative RBAC remains server-side in every action.

**D-01 path changes:** every `path:` field changes from `/posts` → `/dashboard/posts`, etc. The `+ New Post` button in `posts/page.tsx` L49-54 changes `href="/posts/new"` → `href="/dashboard/posts/new"`.

---

### `src/components/dashboard/media/MediaPicker.tsx` (NEW reusable modal, D-13)

**Analog (modal shell):** `src/components/ui/modal/index.tsx` + `src/hooks/useModal.ts` + `src/components/example/ModalExample/DefaultModal.tsx`.

**Modal usage pattern** (`DefaultModal.tsx` L9-15):
```typescript
"use client";
import { Modal } from "../../ui/modal";
import Button from "../../ui/button/Button";
import { useModal } from "@/hooks/useModal";

export default function DefaultModal() {
  const { isOpen, openModal, closeModal } = useModal();
  return (
    <>
      <Button onClick={openModal}>Open</Button>
      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[600px] p-5 lg:p-10">
        {/* children */}
      </Modal>
    </>
  );
}
```

**MediaPicker-specific (D-13):** props `{ onPick: (url: string) => void; allowExternal?: boolean }`. Internal layout = browse grid (calls `listMedia`) + upload-in-place (`uploadMedia` via TanStack mutation) + select + a "paste external URL" tab. Wiring points:
- Post feature-image field (`PostForm.tsx` L126-136 — replaces the URL `<input>`)
- Editor image button (`Toolbar.tsx` L50-55 — replaces `window.prompt`)
- Avatar field (users/profile — D-09)

**Upload UX (D-14):** drag-drop zone via `react-dropzone` (already installed at `^14.3.8` per package.json L54). 10MB cap (Phase 3 D-08) enforced both sides via `MEDIA_MAX_SIZE_BYTES`.

---

### `src/components/editor/toolbar/Toolbar.tsx` (MODIFY image button, D-13)

**Analog:** current `Toolbar.tsx` L50-55 + L131-136.

**Current `window.prompt` to replace** (L50-55):
```typescript
const promptImage = () => {
  const url = window.prompt("Image URL (CDN or external):");
  if (url) { editor.chain().focus().setImage({ src: url }).run(); }
};
// ...
<ToolbarButton label="🖼" title="Image (external URL — Phase 4 DASH-03 wires the library picker)" onClick={promptImage} />
```

**D-13 replacement** — open `<MediaPicker onPick={(url) => editor.chain().focus().setImage({ src: url }).run()} allowExternal />` instead of `window.prompt`. State management via `useModal` hook.

---

### `src/app/(admin)/dashboard/profile/page.tsx` (MOVE + wire to real data, D-09)

**Analog:** `src/app/(admin)/(others-pages)/profile/page.tsx` L13-28 (current TailAdmin demo using `UserMetaCard`/`UserInfoCard`/`UserAddressCard`).

**D-09 wiring:** read the Better Auth session (`getSession()` from `@/lib/auth/server` — pattern from `(admin)/layout.tsx` L30-39), expose `user.bio` + `user.avatar` (schema.ts L171-172) for edit via `actions/users.ts` (`updateUser` extension). Avatar uploads through the existing storage pipeline (Phase 2 D-25 — avatar stores provider object key, not binary). Admins can edit anyone (pass `userId` prop); self-service default.

---

### `next.config.ts` (MODIFY remotePatterns — Pitfall 4)

**Analog:** current `next.config.ts` L21-29.

**Current patterns** (L23-26):
```typescript
remotePatterns: [
  { protocol: "https", hostname: "cdn.anydiscussion.com" },
  { protocol: "http", hostname: "localhost", port: "9000" },
],
```

**Pitfall 4 fix** — add Cloudinary + push-CDN hostnames:
```typescript
{ protocol: "https", hostname: "res.cloudinary.com" },          // Cloudinary delivery
{ protocol: "https", hostname: "<push-cdn-base-url-hostname>" }, // generic push-CDN
```

---

### `middleware.ts` (VERIFY — likely no change)

**Analog:** current `middleware.ts` L56-62.

**Current matcher already targets `/dashboard/:path*`** (L57) — D-01's "simplify to a single `/dashboard/*` matcher" is already the case. **Pitfall 1 anti-pattern:** do NOT rename `middleware.ts` → `proxy.ts` (the 18-line comment at L11-25 documents the verified Next.js 16.2.9 + Turbopack defect).

---

### `scripts/test-auth-gate.mjs` (MODIFY for new routes — D-01/Pitfall 5)

**Analog:** current `scripts/test-auth-gate.mjs` (the structural-check + HTTP probe). Pitfall 5 (RESEARCH.md L521-525): after the route move, the test's `structuralCheck()` may need its dashboard-markers list or route-keys updated to cover the new `/dashboard/posts`, `/dashboard/categories`, etc. paths.

---

### `.env.example` (MODIFY — add `SETTINGS_ENCRYPTION_KEY`, D-25)

**Analog:** current `.env.example` (existing `S3_*`/`NEXT_PUBLIC_CDN_URL`/`STORAGE_LOCAL_ROOT` documentation).

**Add:**
```
# 32-byte base64 key for encrypting storage credentials at rest (D-25).
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
SETTINGS_ENCRYPTION_KEY=
```

---

## Shared Patterns

### Pattern A: Permission-check-first Server Action (Phase 2 Pitfall #1 — applies to ALL new/extended actions)

**Source:** `src/actions/categories.ts` L28-44 + `src/lib/permissions/index.ts` L23-68.

**Apply to:** `actions/pages.ts`, `actions/storage-settings.ts`, extended `actions/users.ts` (`listUsers`/`updateUser`).

```typescript
"use server";
import { requireCan, requireRole } from "@/lib/permissions";

export async function createPage(input: PageInput) {
  await requireCan({ page: ["create"] }); // FIRST — always. UI hiding is insufficient.
  // ... validate, write
}

export async function saveStorageSettings(input: StorageSettingsInput) {
  await requireRole("admin"); // D-23 admin-only — re-checks server-side
  // ... encrypt + write
}
```
**Sentinel errors:** `throw new Error("FORBIDDEN")` / `"UNAUTHORIZED"` / `"FILE_TOO_LARGE"` / `"NOT_FOUND"` — never leak stack traces to client.

---

### Pattern B: Zod schema shared client+server (CLAUDE.md convention)

**Source:** `src/actions/posts-schema.ts` L13-37 + `src/app/(admin)/posts/schema-client.ts`.

**Apply to:** `actions/pages-schema.ts` (NEW), and any per-feature schema under the new feature folder (e.g. `src/app/(admin)/dashboard/settings/storage/schema.ts`).

```typescript
// actions/pages-schema.ts — pure module, NO "use server"/"use client" directive
import { z } from "zod";
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const pageSchema = z.object({ /* ... */ });
export type PageSchemaInput = z.input<typeof pageSchema>;

// schema-client.ts (alongside the form) — re-export bridge
import { zodResolver } from "@hookform/resolvers/zod";
export { pageSchema, type PageSchemaInput } from "@/actions/pages-schema";
export { zodResolver };
```

---

### Pattern C: Test mock shape (Vitest + vi.hoisted + vi.mock server-only deps)

**Source:** `src/actions/__tests__/users.test.ts` L17-83 + `src/lib/storage/__tests__/registry.test.ts` L22-105.

**Apply to:** `cloudinary.test.ts`, `push-cdn.test.ts`, `crypto.test.ts`, `storage-settings.test.ts`, `pages.test.ts`, extended `users.test.ts`, extended `media.test.ts`.

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireCanMock, dbSelectMock } = vi.hoisted(() => ({
  requireCanMock: vi.fn(), dbSelectMock: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({ requireCan: (...a: unknown[]) => requireCanMock(...a) }));
vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: () => dbSelectMock() })) })) })),
  schema: { /* plain refs sufficient — eq() just reads column symbols */ },
}));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), error: vi.fn() } }));

import { createPage } from "../pages";

it("createPage throws FORBIDDEN before reaching db when requireCan denies", async () => {
  requireCanMock.mockImplementation(() => { throw new Error("FORBIDDEN"); });
  dbSelectMock.mockImplementation(() => { throw new Error("MUST_NOT_BE_REACHED"); });
  await expect(createPage({...})).rejects.toThrow("FORBIDDEN");
  expect(dbSelectMock).not.toHaveBeenCalled();
});
```
**Pitfall #1 testing idiom:** mock the downstream (`db`/`auth.api`/`provider.upload`) to throw `"MUST_NOT_BE_REACHED"` — proves the permission check fires *by execution order*, not just that refusal happens eventually.

---

### Pattern D: StorageProvider interface (the extension point for DASH-09)

**Source:** `src/lib/storage/types.ts` L29-83 + `src/lib/storage/r2.ts` L24-77 (cleanest impl to clone) + `src/lib/storage/local.ts` L60-124 (sharp pipeline reference).

**Apply to:** `lib/storage/cloudinary.ts`, `lib/storage/push-cdn.ts`.

Interface contract: `{ name, upload(buffer, baseKey, mimeType) → {variants, primary}, getPublicUrl(key, variant?) → string, delete(key) → Promise<void> }`. Idempotent delete (catch + swallow). `baseKey` is server-generated (T-03-13 — never user-supplied).

---

### Pattern E: Server-rendered dashboard list page

**Source:** `src/app/(admin)/posts/page.tsx` L25-107.

**Apply to:** all new `/dashboard/*` list pages (categories, tags, media, users, pages).

```typescript
export default async function XListPage() {
  let rows = []; let loadError = null;
  try { rows = await listX(); }
  catch (err) { loadError = err instanceof Error ? err.message : "Failed to load"; }
  return (<div>
    <PageBreadcrumb pageTitle="X" />
    <div className="rounded-2xl border ...">
      <div className="mb-5 flex items-center justify-between">
        <h3>All X</h3>
        <Link href="/dashboard/x/new" className="... bg-brand-500 ...">+ New</Link>
      </div>
      {loadError ? <ErrorBox/> : rows.length === 0 ? <EmptyState/> : <Table>...</Table>}
    </div>
  </div>);
}
```
Server Component — no `"use client"`. Mutations go through TanStack Query in client sub-components.

---

## No Analog Found

Files where the codebase has no precedent — the planner uses RESEARCH.md patterns instead:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/crypto/index.ts` | NEW (lib) | transform (AES-256-GCM encrypt/decrypt/redact) | No existing crypto helper anywhere in the codebase. Use RESEARCH.md Pattern 2 verbatim (Node `node:crypto` canonical). |
| `src/lib/storage/cloudinary.ts` (SDK internals) | NEW (provider) | file I/O via Cloudinary SDK | Interface has analogs (`r2.ts`/`local.ts`); the Cloudinary SDK call signatures (`upload_stream`, `cloudinary.url`) do not — use RESEARCH.md Example 1 (assumed, verify against installed `cloudinary@2.10.0` readme). |
| `src/actions/storage-settings.ts` `testConnection` probe body | NEW (action method) | network probe | No existing "test connection" pattern. Use RESEARCH.md Example 3 (per-provider `ListObjectsV2Command`/`HeadBucketCommand`/`cloudinary.v2.api.ping()`). |
| `src/app/(admin)/QueryProvider.tsx` | NEW (client provider) | provider | First `QueryClientProvider` in the project. Use RESEARCH.md Pattern 3. |

---

## Metadata

**Analog search scope:** `src/lib/storage/`, `src/lib/permissions/`, `src/actions/`, `src/actions/__tests__/`, `src/lib/storage/__tests__/`, `src/app/(admin)/`, `src/components/{ui,editor,dashboard,example}/`, `src/layout/`, `src/hooks/`, `src/db/schema.ts`, `src/instrumentation.ts`, `middleware.ts`, `next.config.ts`, `scripts/test-auth-gate.mjs`.

**Files scanned:** 28 source files read directly + 6 glob/category sweeps.

**Key load-bearing facts verified in code (planner can rely on these without re-reading):**
- `StorageProvider` interface signature (`types.ts` L29-83) — the extension contract.
- `registerStorageProvider` already exists (`registry.ts` L48-53) — the Phase-4 extension hook is in place.
- `media.provider` is **plain text, NOT a pgEnum** (`schema.ts` L117) — adding `"cloudinary"`/`"push-cdn"` needs NO schema migration.
- `settings.value` is a text column (`schema.ts` L147) — accommodates base64 ciphertext blobs directly.
- `actions/settings.ts` ships **only `getSetting`** — D-23's save action is a NEW action.
- `actions/users.ts` ships **no `listUsers` and no `updateUser`** — both must be added.
- `middleware.ts` matcher **already targets `/dashboard/:path*`** (L57) — D-01 needs no matcher change, only file moves.
- The `deleteMedia` bug is real (`actions/media.ts` L172) — L149-152 comment documents the row-routed intent that the implementation skipped.
- The 18-line comment in `middleware.ts` (L11-25) documents the verified Turbopack/`proxy.ts` defect — DO NOT rename.
- `react-dropzone@^14.3.8` (package.json L54), `@aws-sdk/client-s3@^3.1077.0` (L18), `@tanstack/react-query@5.101.2` (L30), `@hookform/resolvers@5.4.0` (L25) all installed — only `cloudinary` is a new install.

**Pattern extraction date:** 2026-07-05
