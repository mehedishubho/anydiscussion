# Phase 5: SEO Basics - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 22 (12 new + 9 modified + 1 generated migration)
**Analogs found:** 19 / 22 (3 greenfield — see "No Analog Found")

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/seo/metadata.ts` (NEW) | service/lib (pure builders) | transform | `src/lib/excerpt/index.ts` (pure data-shaping lib) | exact |
| `src/lib/seo/jsonld.ts` (NEW) | service/lib (pure builders) | transform | `src/lib/excerpt/index.ts` (pure data-shaping lib) | exact |
| `src/lib/seo/validation.ts` (NEW) | schema (Zod, shared client+server) | transform | `src/actions/pages-schema.ts` (SEO-field Zod pattern) | role-match |
| `src/lib/seo/settings.ts` (NEW) | service (cached DB read) | request-response | **NONE** — `'use cache'` + `cacheTag("seo-settings")` is a greenfield pattern in this repo | none |
| `src/app/sitemap.ts` (NEW) | route (special Route Handler) | request-response | **NONE** — no existing `sitemap.ts` / `MetadataRoute` consumer; closest DB-query analog: `src/app/(site)/preview/[token]/page.tsx` (async server-component DB read) | partial |
| `src/app/robots.ts` (NEW) | route (special Route Handler) | request-response | **NONE** — pure config route; defer to RESEARCH.md Pattern 3 | none |
| `src/app/rss.xml/route.ts` (NEW) | route (Route Handler, GET) | request-response | `src/app/api/media/[...path]/route.ts` (Route Handler pattern + headers) | role-match |
| `src/app/not-found.tsx` (MODIFY → add redirects check) | server component | request-response | `src/app/(site)/preview/[token]/page.tsx` (server-component DB lookup + `notFound()` branch) | role-match |
| `src/app/(admin)/dashboard/settings/seo/page.tsx` (NEW) | page (server component) | request-response | `src/app/(admin)/dashboard/settings/storage/page.tsx` | exact |
| `src/app/(admin)/dashboard/settings/seo/SeoSettingsForm.tsx` (NEW) | component (RHF + Zod client form) | form | `src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx` (RHF + useMutation + Field helper) | exact |
| `src/app/(admin)/dashboard/settings/seo/schema-client.ts` (NEW) | schema-bridge | transform | `src/app/(admin)/dashboard/settings/storage/schema-client.ts` | exact |
| `src/components/dashboard/posts/SeoPanel.tsx` (NEW) | component (collapsible SEO fields) | form | `src/app/(admin)/dashboard/pages/PageForm.tsx` (lines 185-237 — existing collapsible "SEO" section) | exact |
| `src/actions/posts.ts` (MODIFY — add `post_seo` writes) | server action | CRUD | `src/actions/pages.ts` (lines 91-145 — pages-metaTitle/MetaDescription/canonical writes) | exact |
| `src/actions/posts-schema.ts` (MODIFY — add `seoSchema`) | schema (Zod) | transform | `src/actions/pages-schema.ts` (lines 39-42 — metaTitle/metaDescription/canonical Zod fields) | exact |
| `src/actions/settings.ts` (MODIFY — add `saveSeoSettings`) | server action | CRUD | `src/actions/storage-settings.ts` (requireRole('admin') FIRST + upsertSetting helper + revalidateTag/revalidatePath) | exact |
| `src/app/(site)/layout.tsx` (MODIFY — site-wide generateMetadata + JSON-LD) | server component (layout) | request-response | `src/app/(site)/preview/[token]/page.tsx` (async server-component DB read + render) | role-match |
| `src/app/(site)/page.tsx` (MODIFY — convert static → `generateMetadata`) | server component | request-response | (itself — current static `metadata` export at lines 4-8) | exact (self) |
| `src/app/(site)/preview/[token]/page.tsx` (MODIFY — add async `generateMetadata`) | server component | request-response | (itself — current `metadata` export at lines 31-34) | exact (self) |
| `src/lib/storage/seed.ts` (MODIFY — add SEO settings seeds) | seed (idempotent DB seed) | batch | (itself — `seedStorageSettings` at lines 43-59) | exact (self) |
| `src/db/schema.ts` (MODIFY — add `redirects` table) | model (Drizzle schema) | — | (itself — `pages` table definition at lines 129-142, the closest sibling schema) | exact (self) |
| `src/db/migrations/0004_*.sql` (GENERATED) | migration | batch | `src/db/migrations/0003_phase3_schema_cleanup.sql` | exact |
| `src/lib/seo/__tests__/*.test.ts` (NEW × 6 + shared-fixtures.ts) | test (Vitest unit) | transform | `src/lib/slug/__tests__/slug.test.ts` (pure-lib unit test) + `src/actions/__tests__/storage-settings.test.ts` (mock scaffold) | exact |

---

## Pattern Assignments

### `src/lib/seo/metadata.ts` (service/lib, transform — pure builders)

**Analog:** `src/lib/excerpt/index.ts` (the closest existing pure-data-shaping lib)

**Imports pattern** (mirror `src/lib/excerpt/index.ts` lines 1-14 + add the Next type):
```typescript
// src/lib/excerpt/index.ts lines 1-14 — the pure-lib module header pattern:
// [CITED: 03-CONTEXT.md D-21 — excerpt: both (manual + auto-derive), Bangla-aware]
// [CITED: CLAUDE.md "SEO requirements" — byte/reasonable-char count, NOT Latin-character limits]
//
// Server-only — NO "use client" directive.

// metadata.ts adds: the Next.js Metadata type import.
import type { Metadata } from "next";
```

**Core pattern** (pure function — DB rows + settings snapshot IN, typed shape OUT):
```typescript
// Mirror excerpt/index.ts deriveExcerpt (lines 77-82) — pure signature, no DB access:
// export function deriveExcerpt(bodyJson: unknown, maxChars = 160): string {
//   if (!bodyJson || typeof bodyJson !== "object") return "";
//   ...
//   return safeSlice(joined, maxChars);
// }

// metadata.ts applies the same purity contract to builders:
export function buildPostMetadata(post: PostLike, seo: PostSeoLike | null, s: SeoSettings): Metadata {
  // Pure transform — no db, no fetch, no side effects. Trivially testable.
  // SEE RESEARCH.md Pattern 1 (lines 380-422) for the full verified body.
}
```

**Key landmine — input shape:** Read `RESEARCH.md` "Primary recommendation" (lines 126-127): builders take already-fetched DB rows + a settings snapshot. The DB fetch happens inside the route's `generateMetadata` and passes plain data in.

---

### `src/lib/seo/jsonld.ts` (service/lib, transform — pure builders)

**Analog:** `src/lib/excerpt/index.ts` (same pure-lib pattern as `metadata.ts`)

**Imports pattern:** No imports beyond TypeScript types (the builders return plain objects that the consumer `JSON.stringify`s). Mirror `excerpt/index.ts` line 15's interface-only preamble.

**Core pattern:** Pure functions returning schema.org-shaped objects. Verified shapes are in `RESEARCH.md` Pattern 4 (lines 511-570) — `blogPostingJsonLd`, `websiteJsonLd`, `organizationJsonLd`. **No `'use cache'`, no DB access, no `JSON.stringify` inside** — the consumer (page/layout) stringifies + injects via `dangerouslySetInnerHTML`.

**Critical landmine (Pitfall 2):** JSON-LD does NOT go through `metadata.other` (the Metadata API excludes `<script>`). It MUST be a real `<script type="application/ld+json" dangerouslySetInnerHTML>` in the page/layout body. The builder returns the OBJECT; the consumer does `JSON.stringify`.

---

### `src/lib/seo/validation.ts` (schema, transform — Bangla-aware Zod)

**Analog:** `src/actions/pages-schema.ts` (existing SEO-field Zod schema, lines 39-42)

**Existing pages-schema SEO-field pattern** (lines 39-42):
```typescript
// src/actions/pages-schema.ts
metaTitle: z.string().max(255).optional(),
metaDescription: z.string().max(500).optional(),
// canonical is optional URL OR empty string (mirrors posts-schema featureImage pattern).
canonical: z.string().url().optional().or(z.literal("")),
```

**How `validation.ts` extends it** — replace Latin `.max()` with grapheme `refine`:
```typescript
// From RESEARCH.md Code Examples Example 1 (lines 760-805):
import { z } from "zod";

export function graphemeCount(s: string, locale = "en"): number {
  const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
  return [...segmenter.segment(s)].length;
}

export const seoMetaSchema = z.object({
  metaTitle: z.string().max(255).refine(
    (v) => !v || graphemeCount(v) <= 80,
    "Title exceeds 80 grapheme clusters"
  ).optional(),
  metaDescription: z.string().max(600).refine(
    (v) => !v || graphemeCount(v) <= 200,
    "Description exceeds 200 grapheme clusters"
  ).optional(),
  // ... ogImage, canonicalUrl
});
```

**Model utility:** `src/lib/excerpt/index.ts` lines 46-68 (`safeSlice`) is the prior-phase Bangla-aware model — same reasoning (UTF-16 vs bytes vs graphemes), but here applied to validation not slicing.

---

### `src/lib/seo/settings.ts` (service — cached DB read) — **GREENFIELD, NO ANALOG**

**No existing analog.** This is the first `'use cache'` + `cacheTag(...)` site in the entire codebase. Verified by `Grep("use cache|cacheTag")` returning only planning-doc matches — zero hits in `src/`.

**Closest related pattern:** `src/app/(full-width-pages)/(auth)/signup/page.tsx` uses `<Suspense>`-wrapped async child as the existing Cache Components strategy (per `.planning/phases/02-auth-rbac/02-02-SUMMARY.md` line 44). That works for render-time data, but `generateMetadata` cannot be wrapped in Suspense — it needs the `'use cache'` directive instead.

**Verified shape** — defer to `RESEARCH.md` Pattern 1 (lines 350-378) + Pitfall 6 (lines 746-750):

```typescript
// From RESEARCH.md lines 354-378 (verified against installed next@16.2.9 types):
import { unstable_cacheTag as cacheTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function getSeoSettings() {
  "use cache";
  cacheTag("seo-settings"); // Pitfall 6 — without this tag, saveSeoSettings can't invalidate

  // Read the 5 keys: site.title, site.description, seo.default_og_image,
  // site.canonical_base_url, seo.twitter_handle.
  // Use the readSetting helper shape from src/actions/storage-settings.ts lines 69-76:
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  // ... compose snapshot, with NEXT_PUBLIC_SITE_URL env fallback when settings row is absent.
}
```

**Landmine — the planner MUST encode this:** `saveSeoSettings` (in `actions/settings.ts`) MUST call `revalidateTag("seo-settings", "max")` (2-arg form — Pitfall 6) AND `revalidatePath("/", "layout")` after writing, or settings changes are invisible until container restart.

---

### `src/app/sitemap.ts` (route — special Route Handler) — **PARTIAL ANALOG**

**Closest DB-read analog:** `src/app/(site)/preview/[token]/page.tsx` (lines 57-69) — async server-side Drizzle query.

**Existing DB-query pattern** to mirror (`src/app/(site)/preview/[token]/page.tsx` lines 60-66):
```typescript
const [post] = await db
  .select()
  .from(schema.posts)
  .where(eq(schema.posts.previewToken, token))
  .limit(1);
```

**Pattern to use:** `RESEARCH.md` Pattern 2 (lines 426-481) has the verified full body. **Critical:** filter `posts.status === "published"` + `isNull(posts.deletedAt)` + same for pages — mirror `src/actions/pages.ts` line 159 (`where(isNull(schema.pages.deletedAt))`).

**Cached-by-default behavior:** `sitemap.ts` is auto-cached; `revalidatePath("/sitemap.xml")` already wired in `src/actions/posts.ts` lines 284 + 285 (verified — no new work for D-13).

---

### `src/app/robots.ts` (route — special Route Handler) — **NO CLOSE ANALOG**

**No existing analog** for `MetadataRoute.Robots`. Defer to `RESEARCH.md` Pattern 3 (lines 484-503). It's pure config — short and well-verified.

**Imports pattern:**
```typescript
import type { MetadataRoute } from "next";
import { getSeoSettings } from "@/lib/seo/settings";
```

---

### `src/app/rss.xml/route.ts` (route — Route Handler, GET)

**Analog:** `src/app/api/media/[...path]/route.ts` (the only existing Route Handler in the repo)

**Imports + Route Handler signature pattern** (`src/app/api/media/[...path]/route.ts` lines 30-76):
```typescript
import fs from "node:fs";
import path from "node:path";
// ...
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await params;
  // ... business logic
  return new Response(body, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

**How RSS mirrors it:** Same `export async function GET()` + `new Response(feed, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", ... } })` shape. No `params` (RSS has none).

**Existing reutilization — full-text body** (`src/lib/post-render.ts` lines 39-45):
```typescript
export function renderPostBody(postBodyJson: unknown): string {
  const html = generateHTML(postBodyJson as JSONContent, editorExtensions);
  return sanitizeBeforeRender(html);
}
```
Reuse verbatim — D-07 mandates this; the sanitize pipeline is already security-reviewed.

**Verified RSS body:** `RESEARCH.md` Pattern 5 (lines 598-679). Includes the `escapeXml` helper (5 special chars) + CDATA wrapping for `<content:encoded>`.

---

### `src/app/not-found.tsx` (MODIFY — add redirects check before 404)

**Current state:** Pure presentational 404 page (`src/app/not-found.tsx` lines 1-47) — no DB access, no async, no `headers()`.

**Analog for the new behavior:** `src/app/(site)/preview/[token]/page.tsx` lines 57-69 (server-component DB lookup → `notFound()` branch).

**Existing lookup + notFound pattern** (`src/app/(site)/preview/[token]/page.tsx` lines 60-69):
```typescript
const [post] = await db
  .select()
  .from(schema.posts)
  .where(eq(schema.posts.previewToken, token))
  .limit(1);

if (!post) {
  notFound();
}
```

**How not-found.tsx adapts it:** Use `permanentRedirect(target, 'permanent')` from `next/navigation` instead of `notFound()` when the `redirects` table has a match. Read the request path via `headers()` from `next/headers`. Verified shape: `RESEARCH.md` "Architectural Responsibility Map" row "Redirects-table check" (line 141) + Pitfall 4 + Pitfall 5.

**Landmine (Pitfall 4):** Do NOT add the redirects lookup to `middleware.ts`. Middleware is edge-runtime; Drizzle/pg cannot run there. `not-found.tsx` is Node-runtime by default.

**Landmine (Pitfall 5):** Target `app/not-found.tsx` (Node runtime). Do NOT write tasks that touch `src/proxy.ts` — that file does not exist (the scout section was wrong).

**SCHEMA GAP — the planner MUST add the `redirects` table:** Grep confirms `src/db/schema.ts` has NO `redirects` table today. D-12 says "table ships EMPTY in v1" but the table itself does not exist yet. Add it to `schema.ts` (mirror the `pages` table lines 129-142 — same simple shape with `oldPath`/`newPath`/`statusCode` columns) and run `pnpm db:generate`. Schema fields per `CLAUDE.md`: `old_path`, `new_path`, `status_code` (301/302).

---

### `src/app/(admin)/dashboard/settings/seo/page.tsx` (page, request-response)

**Analog:** `src/app/(admin)/dashboard/settings/storage/page.tsx` (EXACT — sibling settings page)

**Pattern** (`src/app/(admin)/dashboard/settings/storage/page.tsx` lines 11-50):
```typescript
import { getStorageSettings } from "@/actions/storage-settings";
import StorageSettingsForm from "./StorageSettingsForm";

export const metadata = {
  title: "Storage Settings — Dashboard",
};

export default async function StorageSettingsPage() {
  let initial: Awaited<ReturnType<typeof getStorageSettings>> | null = null;
  let loadError: string | null = null;
  try {
    initial = await getStorageSettings();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6"> ... </header>
      {loadError ? (
        <div className="rounded-lg border border-error-300 ...">
          Failed to load ... settings: {loadError}
        </div>
      ) : (
        <StorageSettingsForm initial={initial ?? { activeProvider: "local" }} />
      )}
    </div>
  );
}
```

**SEO page mirrors verbatim** with `getSeoSettings` / `SeoSettingsForm` / `{ siteTitle: "" }` defaults. Server Component — NO `"use client"`.

---

### `src/app/(admin)/dashboard/settings/seo/SeoSettingsForm.tsx` (component, form)

**Analog:** `src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx` (EXACT)

**Key patterns to mirror** (`StorageSettingsForm.tsx`):
- `"use client";` directive (line 1)
- `useForm` + `zodResolver` (lines 59-66)
- `useMutation` (lines 99-102) — **NOT optimistic** (high-stakes; server confirms)
- `Field` helper component (lines 285-306)
- Tailwind `INPUT_CLASS` + `LABEL_CLASS` constants (lines 34-38)
- Submit/error/saved banners (lines 259-278)

**Difference:** NO secrets → fields ARE pre-filled (unlike storage where secrets stay empty per Pitfall 7). NO `Test connection` probe (no provider to ping).

**Existing reusable Bangla-aware pattern:** the `placeholder` text on `metaDescription` in `src/app/(admin)/dashboard/pages/PageForm.tsx` line 217 already documents the rule — mirror that UX copy.

---

### `src/app/(admin)/dashboard/settings/seo/schema-client.ts` (schema-bridge)

**Analog:** `src/app/(admin)/dashboard/settings/storage/schema-client.ts` (EXACT — verbatim shape)

**Pattern** (`src/app/(admin)/dashboard/settings/storage/schema-client.ts` lines 1-21):
```typescript
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
export {
  storageSettingsSchema,
  type StorageSettingsInput,
  // ... other types
} from "@/actions/storage-settings-schema";
export { zodResolver };
```

**SEO schema-client** re-exports `seoSettingsSchema` + `SeoSettingsInput` from a new `src/actions/seo-settings-schema.ts` (or inline in `actions/settings.ts` per RESEARCH Code Example 3 lines 870-884).

---

### `src/components/dashboard/posts/SeoPanel.tsx` (component, form)

**Analog:** `src/app/(admin)/dashboard/pages/PageForm.tsx` lines 185-237 (existing collapsible "SEO" section)

**Existing collapsible SEO-section pattern** (`PageForm.tsx` lines 185-237):
```tsx
<div className="border-t border-gray-200 pt-5 dark:border-gray-800">
  <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
    SEO
  </h4>
  <div className="space-y-5">
    <div>
      <label htmlFor="metaTitle" ...>Meta title</label>
      <input id="metaTitle" {...register("metaTitle")} placeholder="Overrides <title> when set (max 255 chars)" className={INPUT_CLASS} />
    </div>
    <div>
      <label htmlFor="metaDescription" ...>Meta description</label>
      <textarea id="metaDescription" {...register("metaDescription")} placeholder="... reasonable byte count, not Latin character limits)" rows={3} className={`${INPUT_CLASS} h-auto py-2.5`} />
    </div>
    <div>
      <label htmlFor="canonical" ...>Canonical URL</label>
      <input id="canonical" {...register("canonical")} placeholder="..." className={INPUT_CLASS} />
    </div>
  </div>
</div>
```

**How SeoPanel.tsx differs:** Extract as a standalone component receiving RHF `register`/`errors` via props (so it can be embedded in the existing `PostForm.tsx`). Add an `ogImage` field (4th field, D-08). Add the auto-derive UX cue (placeholder notes the fallback chain).

**Integration point — `PostForm.tsx`:** The existing `src/app/(admin)/dashboard/posts/PostForm.tsx` imports the new `<SeoPanel register={register} errors={errors} />` after the feature-image block (after line 226). No changes to existing fields.

---

### `src/actions/posts.ts` (MODIFY — add `post_seo` writes after the existing `db.update`/`db.insert`)

**Analog:** `src/actions/pages.ts` lines 91-145 (existing SEO-field writes in a Server Action)

**Existing pages SEO-write pattern** (`src/actions/pages.ts` lines 99-110):
```typescript
const [row] = await db
  .insert(schema.pages)
  .values({
    title: data.title,
    slug: data.slug,
    body: sanitizedBody,
    status: data.status ?? "draft",
    metaTitle: data.metaTitle ?? null,
    metaDescription: data.metaDescription ?? null,
    canonical: data.canonical || null,
  })
  .returning({ id: schema.pages.id });
return { id: row?.id };
```

**How `savePost` extends** — add an upsert block AFTER the existing posts-row write (after current line 147 in `posts.ts`). The shape: `RESEARCH.md` Code Example 2 (lines 812-854). Key points:
1. `postSeo` has no `deletedAt` (hard-delete per D-08; PK is `id`, not `postId`).
2. Use the existing `eq` import already at `posts.ts` line 21.
3. Use `seoMetaSchema.safeParse(...)` (NOT `.parse`) so a malformed SEO input doesn't fail the whole post save — log + continue.

**Existing imports to reuse** (`src/actions/posts.ts` lines 18-28):
```typescript
import { revalidatePath, revalidateTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { assertOwnsPost, requireCan } from "@/lib/permissions";
// ... etc.
```

**Add:** `import { seoMetaSchema } from "@/lib/seo/validation";` (or from the schema file the planner picks).

---

### `src/actions/posts-schema.ts` (MODIFY — add `seoSchema` sub-object)

**Analog:** `src/actions/pages-schema.ts` lines 39-42 (metaTitle/metaDescription/canonical Zod fields) + the existing `postSchema` shape in this file (lines 18-37).

**Existing `postSchema` shape to extend** (`src/actions/posts-schema.ts` lines 18-37):
```typescript
export const postSchema = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().min(1, "Title is required").max(255),
  slug: z.string()...,
  body: z.any().optional(),
  excerpt: z.string().max(500).optional(),
  categoryId: z.number().int().positive("Category is required"),
  tagIds: z.array(z.number().int().positive()).max(8, "TOO_MANY_TAGS"),
  featureImage: z.string().url().optional().or(z.literal("")),
  publishedAt: z.date().optional(),
  status: z.enum(["draft", "pending_review", "published"]).optional(),
});
```

**Add (4 optional fields):**
```typescript
metaTitle: z.string().max(255).optional(),         // D-08
metaDescription: z.string().max(600).optional(),   // grapheme count validated server-side via seoMetaSchema
ogImage: z.string().url().optional().or(z.literal("")),
canonicalUrl: z.string().url().optional().or(z.literal("")),
```

(Use simple `.max()` here for the dashboard form, then `seoMetaSchema.safeParse()` server-side for the grapheme `refine`. The alternative — embed `refine` directly — is fine too; planner's call.)

---

### `src/actions/settings.ts` (MODIFY — add `saveSeoSettings`)

**Analog:** `src/actions/storage-settings.ts` (the established admin-settings action pattern)

**Existing `upsertSetting` helper to mirror verbatim** (`src/actions/storage-settings.ts` lines 84-97):
```typescript
async function upsertSetting(key: string, value: string): Promise<void> {
  const updated = await db
    .update(schema.settings)
    .set({ value, updatedAt: new Date() })
    .where(eq(schema.settings.key, key));
  if (!updated || (Array.isArray(updated) && updated.length === 0)) {
    await db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoNothing();
  }
}
```

**Existing admin-gate pattern** (`src/actions/storage-settings.ts` lines 114-119):
```typescript
"use server";
// ... imports
export async function saveStorageSettings(input: ...): Promise<{ ok: true }> {
  // 1. Admin re-check FIRST
  await requireRole("admin");
  // 2. Validate via the shared Zod schema
  const data = storageSettingsSchema.parse(input);
  // 3. Persist + reconfigure
  ...
}
```

**SEO version mirrors verbatim** with these differences:
- NO encryption (SEO values are not secrets).
- Add `revalidateTag("seo-settings", "max")` + `revalidatePath("/", "layout")` + `revalidatePath("/sitemap.xml")` + `revalidatePath("/robots.txt")` + `revalidatePath("/rss.xml")` at the end (Pitfall 6).

**Verified shape:** `RESEARCH.md` Code Example 3 (lines 857-914).

**Existing `getSetting` action** in this file (`src/actions/settings.ts` lines 26-33) — keep it (used by `instrumentation.ts` line 75). The new `saveSeoSettings` is added alongside, NOT replacing it.

---

### `src/app/(site)/layout.tsx` (MODIFY — site-wide `generateMetadata` + JSON-LD)

**Current state** (`src/app/(site)/layout.tsx` lines 1-18): 18-line skeletal layout, no async, no metadata.

**Pattern for the new shape:** `RESEARCH.md` Pattern 1 (lines 354-378) + Pattern 4 (lines 572-594).

**Verified `generateMetadata` body** (`RESEARCH.md` lines 363-378):
```typescript
export async function generateMetadata(): Promise<Metadata> {
  "use cache"; // Pitfall 1 — REQUIRED under cacheComponents:true
  const s = await getSeoSettings();
  return {
    metadataBase: new URL(s.canonicalBaseUrl),
    title: { default: s.siteTitle, template: `%s | ${s.siteTitle}` },
    description: s.siteDescription,
    openGraph: { type: "website", siteName: s.siteTitle, images: [{ url: s.defaultOgImage }] },
    twitter: { card: "summary_large_image" },
  };
}
```

**Verified JSON-LD injection** (`RESEARCH.md` lines 577-593):
```tsx
export default async function SiteLayout({ children }: { children: React.ReactNode; }) {
  const s = await getSeoSettings();
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd(s)) }} />
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd(s)) }} />
      <main>{children}</main>
    </div>
  );
}
```

**Landmine (RESEARCH Pitfall 6 / `title.template` semantic):** A `title.template` defined here does NOT apply to THIS segment's own title — only to child segments. So the home page (a child) inheriting the template gets `"<home title> | Any Discussion"` only if home sets `title` (not `title.default`). The home route uses `title.default` here via the layout — that becomes the literal `<title>` for `/`. See RESEARCH Anti-Patterns line 687.

---

### `src/app/(site)/page.tsx` (MODIFY — convert static `metadata` → `generateMetadata`)

**Current state** (`src/app/(site)/page.tsx` lines 4-8): static `export const metadata`.

**Pattern:** Same as `(site)/layout.tsx` — async `generateMetadata` with `"use cache"` calling `getSeoSettings()` + `buildSiteMetadata(s)` from `lib/seo/metadata.ts`.

**Per RESEARCH.md** (line 20): home route is the canonical place where the `'use cache'` directive is needed (otherwise the build fails under `cacheComponents:true`).

---

### `src/app/(site)/preview/[token]/page.tsx` (MODIFY — convert static `metadata` → async `generateMetadata`)

**Current state** (`src/app/(site)/preview/[token]/page.tsx` lines 31-34):
```typescript
export const metadata: Metadata = {
  title: "Draft Preview | Any Discussion",
  robots: { index: false, follow: false },
};
```

**Pattern for async replacement** (preserves `robots: { index: false }`):
```typescript
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const [post] = await db.select().from(schema.posts).where(eq(schema.posts.previewToken, token)).limit(1);
  if (!post) return { title: "Not Found", robots: { index: false, follow: false } };
  const s = await getSeoSettings();
  return {
    ...buildPostMetadata(post, null, s), // preview — no post_seo needed
    robots: { index: false, follow: false }, // preserved
  };
}
```

NO `'use cache'` here — `params` makes it dynamic by default (RESEARCH Pitfall 1 alternative path).

---

### `src/lib/storage/seed.ts` (MODIFY — add SEO settings seeds)

**Existing seed function pattern** (`src/lib/storage/seed.ts` lines 43-59):
```typescript
export async function seedStorageSettings(): Promise<void> {
  await db
    .insert(schema.settings)
    .values([
      { key: "storage.active_provider", value: "local" },
      { key: "site.timezone", value: "Asia/Dhaka" },
      // ...
    ])
    .onConflictDoNothing();
}
```

**How to extend (two options):**
- **Option A (preferred):** Add a sibling `seedSeoSettings()` function in the same file, then call it from `instrumentation.ts` after `seedStorageSettings()` (mirror lines 48-49 of `instrumentation.ts`).
- **Option B:** Append the 5 SEO keys to the existing `values([...])` array (smaller diff, same effect).

**Keys to add** (from D-11 / RESEARCH Code Example 3 lines 878-884):
```typescript
{ key: "site.title", value: "Any Discussion" },
{ key: "site.description", value: "A fast, SEO-optimized blog from Any Discussion." },
{ key: "seo.default_og_image", value: "" },
{ key: "site.canonical_base_url", value: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000" },
{ key: "seo.twitter_handle", value: "" },
```

---

### `src/db/schema.ts` (MODIFY — add `redirects` table) — **LANDMINE: table does NOT exist today**

**Current state (verified):** `Grep("redirects", "src/db/schema.ts")` returns zero hits. D-12 implies the table exists ("ships EMPTY") but it does not.

**Existing table-definition analog** (`src/db/schema.ts` lines 129-142, the `pages` table — closest sibling shape):
```typescript
export const pages = pgTable("pages", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  title: text("title").notNull(),
  // ...
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  canonical: text("canonical"),
});
```

**Schema for `redirects`** (per `CLAUDE.md` "Database schema" reference: `redirects — old_path, new_path, status_code (301/302)`):
```typescript
export const redirects = pgTable("redirects", {
  id: serial("id").primaryKey(),
  oldPath: varchar("old_path", { length: 255 }).notNull().unique(),
  newPath: varchar("new_path", { length: 255 }).notNull(),
  statusCode: integer("status_code").default(301).notNull(), // 301 | 302
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

After editing `schema.ts`, run `pnpm db:generate` (the project's drizzle-kit command — verified via existing migration files in `src/db/migrations/`). The migration filename follows the existing `0000_`, `0001_`, `0002_`, `0003_` sequence → next is `0004_<drizzle-kit-generated-name>.sql`.

---

### `src/lib/seo/__tests__/*.test.ts` (NEW × 6 + shared-fixtures.ts)

**Analogs (two patterns to combine):**

1. **Pure-builder unit test** — `src/lib/slug/__tests__/slug.test.ts` (no DB mock needed when testing pure functions). Use this for `metadata.test.ts`, `jsonld.test.ts`, `validation.test.ts`, and the pure-builder portion of `sitemap.test.ts` / `robots.test.ts`.

2. **Action-with-DB-mock test** — `src/actions/__tests__/storage-settings.test.ts` for `rss.test.ts` (Route Handler reads DB) and the DB-touching portion of `sitemap.test.ts`.

**Vitest scaffold pattern** (`src/lib/slug/__tests__/slug.test.ts` lines 13-35):
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

// (For tests that touch DB — chainable mock:)
const slugWhereMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: (...args: unknown[]) => slugWhereMock(...args),
      })),
    })),
  },
  schema: { posts: { id: "id", slug: "slug" }, /* ... */ },
}));

import { validateSlug, assertUniqueSlug } from "../index";

describe("CONT-07 / D-20: validateSlug — ...", () => {
  it("accepts ...", () => { ... });
});
```

**Test fixtures pattern** (RESEARCH Validation Architecture lines 1023-1029): `shared-fixtures.ts` exports fake `PostLike`, `PostSeoLike`, `SeoSettings`, and the empirical 59-grapheme Bangla string verified in RESEARCH Pitfall 3 (lines 726-732).

---

## Shared Patterns

### Authentication (admin gate)
**Source:** `src/lib/permissions/index.ts` lines 40-47 (`requireRole`)
**Apply to:** `src/actions/settings.ts` (`saveSeoSettings`)
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
**Established call order** (`src/actions/storage-settings.ts` line 116): `await requireRole("admin");` is the FIRST line of the action. Proven by `MUST_NOT_BE_REACHED` test pattern in `src/actions/__tests__/storage-settings.test.ts` lines 165-188.

The post-editor SEO panel inherits `assertOwnsPost` / `requireCan` from the existing `savePost` action — no new auth check needed (it's already there).

---

### Error Handling (throw short codes; let the client surface the message)
**Source:** `src/lib/permissions/index.ts` (throws `"UNAUTHORIZED"` / `"FORBIDDEN"`); `src/actions/posts.ts` line 164 (throws `"NOT_FOUND"`)
**Apply to:** `saveSeoSettings`, the redirects-lookup in `not-found.tsx`, RSS handler errors.
```typescript
// Throw short uppercase codes; the dashboard form reads e.message via mutation.error?.message
throw new Error("FORBIDDEN");
```

---

### Revalidation (2-arg `revalidateTag`, concrete `revalidatePath`, no template strings)
**Source:** `src/actions/posts.ts` lines 277-294 (the proven Phase-3 revalidation block)
**Apply to:** `saveSeoSettings` action.
```typescript
// From src/actions/posts.ts lines 284-294:
revalidatePath("/sitemap.xml");
revalidatePath("/rss.xml");

// 2-arg form — single-arg is DEPRECATED in Next.js 16.2.9
revalidateTag(`post-${post.id}`, "max");
revalidateTag("posts-list", "max");
```
**SEO settings action adds:** `revalidateTag("seo-settings", "max")` (Pitfall 6 — invalidates the cached `getSeoSettings()` snapshot) + `revalidatePath("/", "layout")` (refreshes the `(site)/layout.tsx` shell).

**Carry-forward (D-13 — already wired):** `publishPost` already calls `revalidatePath("/sitemap.xml")` + `revalidatePath("/rss.xml")` (verified at `src/actions/posts.ts` lines 284-285). Phase 5 just builds the routes those paths point at — no new publish-action work.

---

### Settings upsert (idempotent write-or-insert)
**Source:** `src/actions/storage-settings.ts` lines 84-97 (`upsertSetting`)
**Apply to:** `saveSeoSettings` action.
```typescript
async function upsertSetting(key: string, value: string): Promise<void> {
  const updated = await db
    .update(schema.settings)
    .set({ value, updatedAt: new Date() })
    .where(eq(schema.settings.key, key));
  if (!updated || (Array.isArray(updated) && updated.length === 0)) {
    await db.insert(schema.settings).values({ key, value }).onConflictDoNothing();
  }
}
```
**Note:** Drizzle node-postgres returns rowcount on update; 0 means no row matched → fall back to insert. The `onConflictDoNothing` makes re-runs safe (matches the `seedStorageSettings` pattern in `src/lib/storage/seed.ts` line 58).

---

### Sanitization (RSS body — reuse the proven pipeline)
**Source:** `src/lib/post-render.ts` lines 39-45 (`renderPostBody`)
**Apply to:** `src/app/rss.xml/route.ts` (`<content:encoded>` body).
```typescript
export function renderPostBody(postBodyJson: unknown): string {
  const html = generateHTML(postBodyJson as JSONContent, editorExtensions);
  return sanitizeBeforeRender(html);
}
```
**Defense-in-depth for RSS:** Wrap the sanitized HTML in `<![CDATA[...]]>` so any residual HTML entity doesn't break the XML parser (RESEARCH Pattern 5 lines 666-676).

---

### Cache Components (`'use cache'` directive + `cacheTag`) — NEW PATTERN THIS PHASE
**Source:** NONE in `src/` — first introduction. Verify against `RESEARCH.md` Pattern 1 (lines 363-378) + Pitfall 1 (lines 707-711) + Pitfall 6 (lines 746-750).
**Apply to:**
- `src/lib/seo/settings.ts` → `getSeoSettings()` (the cached snapshot reader).
- `src/app/(site)/layout.tsx` → `generateMetadata()` (calls `getSeoSettings`).
- `src/app/(site)/page.tsx` → `generateMetadata()` (home — settings-driven, near-static).
- **NOT** `src/app/(site)/preview/[token]/page.tsx` (params makes it dynamic; no directive needed).
- **NOT** `src/app/sitemap.ts` / `robots.ts` / `rss.xml/route.ts` (these are special Route Handlers — cached by default, refreshed via `revalidatePath`; the `'use cache'` directive is for `generateMetadata` only).
```typescript
export async function getSeoSettings() {
  "use cache";                       // Pitfall 1 — required under cacheComponents:true
  cacheTag("seo-settings");          // Pitfall 6 — without this tag, saveSeoSettings can't invalidate
  // ... Drizzle read of the 5 settings keys
}
```
**Import:** `import { unstable_cacheTag as cacheTag } from "next/cache";` (export name as of Next.js 16.2.9 — verify against installed types at execution time; the alias may have stabilized to `cacheTag` without the `unstable_` prefix in newer canaries).

---

## No Analog Found

Files with no close match in the codebase (planner references `RESEARCH.md` shapes directly):

| File | Role | Data Flow | Reason | Reference |
|------|------|-----------|--------|-----------|
| `src/lib/seo/settings.ts` | service (cached DB read) | request-response | First `'use cache'` + `cacheTag` site in the repo. Existing Cache-Components pattern is `<Suspense>`-wrapped async child (signup page) — that works for render but NOT for `generateMetadata`. | `RESEARCH.md` Pattern 1 (lines 350-378) + Pitfall 1 + Pitfall 6 |
| `src/app/robots.ts` | route (special Route Handler) | request-response | No existing `MetadataRoute.Robots` consumer anywhere in `src/`. Pure config; short. | `RESEARCH.md` Pattern 3 (lines 484-503) |
| `src/app/sitemap.ts` | route (special Route Handler) | request-response | No existing `MetadataRoute.Sitemap` consumer. DB-query shape mirrors `preview/[token]/page.tsx`, but the return type + caching semantics are new. | `RESEARCH.md` Pattern 2 (lines 426-481) |

---

## Metadata

**Analog search scope:**
- `src/lib/**/*.ts` (33 files — pure-lib patterns)
- `src/app/**/*.{ts,tsx}` (60+ files — route + page patterns)
- `src/actions/**/*.ts` (10 files + 6 test files — Server Action patterns)
- `src/components/dashboard/**/*.tsx` (1 file — dashboard component patterns)
- `src/db/schema.ts` + `src/db/migrations/*.sql` (schema + migration patterns)
- `next.config.ts`, `middleware.ts`, `src/instrumentation.ts` (config + boot patterns)
- `Grep` searches: `redirects`, `generateMetadata`, `cacheTag|use cache` (gap verification)

**Files scanned:** ~120 source files
**Pattern extraction date:** 2026-07-07

**Landmines the planner MUST encode in plan tasks:**
1. **`src/proxy.ts` does NOT exist** (Pitfall 5). The redirects-check targets `app/not-found.tsx` (Node runtime) — NOT `middleware.ts` and NOT `src/proxy.ts`.
2. **JSON-LD does NOT go through `metadata.other`** (Pitfall 2). It MUST be `<script type="application/ld+json" dangerouslySetInnerHTML>` in the page/layout body.
3. **`'use cache'` + `cacheTag("seo-settings")` is mandatory** under `cacheComponents:true` for any `generateMetadata` that reads DB data on an otherwise-prerenderable route (Pitfall 1 + Pitfall 6). Build fails without it.
4. **The `redirects` table does NOT exist in `src/db/schema.ts` today.** The planner MUST add it (mirror the `pages` table lines 129-142) and run `pnpm db:generate` before `not-found.tsx` can query it.
5. **2-arg `revalidateTag(tag, "max")` only** — single-arg is DEPRECATED in Next.js 16.2.9 (already correct in `src/actions/posts.ts`).
6. **Bangla meta validation uses `Intl.Segmenter` graphemes** (NOT `.length` or bytes) — RESEARCH Code Example 1 + Pitfall 3.
7. **`title.template` does NOT apply to the segment that defines it** — only to child segments (RESEARCH Anti-Patterns line 687). The home page inherits via the layout's `title.default`.
