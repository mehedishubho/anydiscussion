# Phase 6: Public Frontend - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 45 (new + modified)
**Analogs found:** 42 / 45 (3 have no analog — new patterns, listed in "No Analog Found")

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/(site)/[slug]/page.tsx` | route (page) | request-response + streaming | `src/app/(site)/preview/[token]/page.tsx` | **exact** (PPR + Suspense + generateMetadata + renderPostBody + prose) |
| `src/app/(site)/blog/page.tsx` | route (page) | request-response (cached list) | `src/app/(site)/page.tsx` + `src/app/sitemap.ts` | role-match (cached list-query pattern is NEW; `'use cache'`+`cacheTag` from `lib/seo/settings.ts`) |
| `src/app/(site)/blog/page/[pageNumber]/page.tsx` | route (page) | request-response (paginated) | `src/app/(site)/blog/page.tsx` (this phase) | role-match (same template + URL pagination) |
| `src/app/(site)/archive/page.tsx` | route (page) | request-response (filterable) | `src/app/(site)/blog/page.tsx` (this phase) | role-match |
| `src/app/(site)/category/[slug]/page.tsx` | route (page) | request-response | `src/app/(site)/blog/page.tsx` (this phase) | role-match (reuses ArchiveList) |
| `src/app/(site)/tag/[slug]/page.tsx` | route (page) | request-response | `src/app/(site)/blog/page.tsx` (this phase) | role-match |
| `src/app/(site)/author/[username]/page.tsx` | route (page) | request-response | `src/app/(site)/preview/[token]/page.tsx` | role-match (single-record + list-of-posts; needs `username` slug) |
| `src/app/(site)/search/page.tsx` | route (page) | request-response (FTS) | `src/app/sitemap.ts` (URL searchParams consumption) | partial-match (FTS query is NEW; params parsing from sitemap's filter pattern) |
| `src/app/(site)/about/page.tsx` | route (page) | static | `src/app/(site)/page.tsx` | role-match (hard-coded TSX, minimal) |
| `src/app/(site)/contact/page.tsx` | route (page) | request-response | `src/app/(admin)/dashboard/settings/seo/page.tsx` | partial-match (server page wrapping a client RHF form) |
| `src/app/(site)/terms-and-conditions/page.tsx` | route (page) | request-response | `src/app/(site)/preview/[token]/page.tsx` | role-match (render a stored body via `renderPostBody` — pages row, not posts row) |
| `src/app/(site)/privacy-policy/page.tsx` | route (page) | request-response | `src/app/(site)/preview/[token]/page.tsx` | role-match |
| `src/app/(site)/page.tsx` (REPLACE) | route (page) | cached | `src/app/(site)/page.tsx` (current skeletal form) | exact (the file itself; the `'use cache'`+`buildSiteMetadata` pattern is already there) |
| `src/app/(site)/layout.tsx` (EXTEND) | route (layout) | cached chrome | `src/app/(site)/layout.tsx` (current) | exact (add SiteHeader/SiteFooter/analytics/no-flash script around existing `<main>`) |
| `src/app/(site)/preview/[token]/page.tsx` (POLISH) | route (page) | request-response | itself | exact (verify only, do NOT rebuild per D-19/SITE-15) |
| `src/components/site/ViewCount.tsx` | component (async server) | streaming write | `src/app/not-found.tsx` `RedirectChecker` | **exact** (async component doing per-request DB work inside `<Suspense>`) |
| `src/components/site/RelatedPosts.tsx` | component (async server) | cached read | `src/app/(site)/page.tsx` + `src/lib/seo/settings.ts` | role-match (`'use cache'` + `cacheTag('posts-list')`+`cacheTag('category-N')`) |
| `src/components/site/PostCard.tsx` | component (pure) | transform | (TailAdmin card components in `src/components/`) | partial-match (pure presentational; no analog in `site/` — first one) |
| `src/components/site/ArchiveList.tsx` | component (server) | transform | `src/components/tables/*` (TailAdmin) | partial-match (list rendering; first site-specific one) |
| `src/components/site/Toc.tsx` | component (client island) | transform | `src/components/site/ThemeToggle.tsx` (this phase) | partial-match (`"use client"` minimal component) |
| `src/components/site/ShareButtons.tsx` | component (client) | request-response (share URLs) | `src/context/ThemeContext.tsx` | role-match (minimal `"use client"`) |
| `src/components/site/ReadProgress.tsx` | component (client) | event-driven (scroll) | `src/context/ThemeContext.tsx` | role-match (minimal `"use client"` w/ `useEffect`) |
| `src/components/site/ThemeToggle.tsx` | component (client) | event-driven | `src/context/ThemeContext.tsx` | **role-match — model but DO NOT import** (D-13 isolation) |
| `src/components/site/SearchForm.tsx` | component (server GET form) | request-response | (no analog — progressive-enhancement server form is novel) | no-match |
| `src/components/site/ContactForm.tsx` | component (client) | form-submit | `src/app/(admin)/dashboard/settings/seo/SeoSettingsForm.tsx` | **exact** (RHF + zodResolver + Server Action mutation; minus TanStack per D-28) |
| `src/components/site/SiteHeader.tsx` | component (server) | cached read | `src/app/(site)/layout.tsx` (current) + `src/layout/AppHeader.tsx` | partial-match (dashboard header is TailAdmin-styled; site header is brand-new) |
| `src/components/site/SiteFooter.tsx` | component (server) | cached read | `src/layout/SidebarWidget.tsx` (server component pattern) | partial-match |
| `src/components/site/skeletons.tsx` | component (pure) | transform | `src/app/(site)/preview/[token]/page.tsx` `<Suspense fallback>` | role-match (fallback shapes already used inline) |
| `src/lib/queries/posts.ts` | service (read + 1 write) | CRUD | `src/actions/posts.ts` + `src/actions/media.ts` | role-match (adapt admin `getPost`/`listPosts` to published-only + slug; add `'use cache'`+`cacheTag`; FTS via `sql` template) |
| `src/lib/queries/taxonomy.ts` | service (read) | request-response (cached) | `src/actions/categories.ts` `listCategories` | role-match (drop the `requireCan` gate; published-only) |
| `src/lib/queries/users.ts` | service (read) | request-response (cached) | `src/actions/posts.ts` `listPosts` (author scoping pattern) | role-match |
| `src/lib/queries/pages.ts` | service (read) | request-response (cached) | `src/actions/pages.ts` `getPage` | role-match (published-only filter + slug lookup) |
| `src/lib/queries/archive.ts` | service (read) | request-response (filterable) | `src/actions/media.ts` `listMedia` (filter accumulation) | role-match (param-driven where-clause accumulation) |
| `src/lib/reading-time/index.ts` | utility | transform | `src/lib/excerpt/index.ts` | **exact** (reuse `collectText` + `Intl.Segmenter` per D-15) |
| `src/lib/toc/index.ts` | utility | transform | `src/lib/excerpt/index.ts` (ProseMirror walker) | role-match (same recursive walk; targets `heading` nodes not `text`) |
| `src/lib/rate-limit/index.ts` | utility | event-driven | **NO ANALOG** (no `new Map()`-based cache or rate-limit in `src/`) | none — new pattern |
| `src/actions/contact.ts` | server-action | request-response (email) | `src/actions/pages.ts` + `src/lib/email/index.ts` | role-match (`"use server"` + Zod + `lib/email`; honeypot + rate-limit are NEW additions) |
| `src/actions/contact-schema.ts` | schema (pure) | transform | `src/actions/seo-settings-schema.ts` | **exact** (pure-schema sibling; `"use server"` files can only export async fns) |
| `src/db/schema.ts` (EXTEND) | model | — | itself | exact (add columns to existing `posts`/`user` tables) |
| `src/lib/storage/seed.ts` (EXTEND) | seeder | batch | itself | exact (add `seedPublicFrontendSettings()` mirroring `seedSeoSettings`) |
| `src/instrumentation.ts` (EXTEND) | hook | boot | itself | exact (add one `await seedPublicFrontendSettings()` call) |
| `src/lib/seo/jsonld.ts` (EXTEND) | utility (pure) | transform | itself | exact (add `personJsonLd` + `breadcrumbListJsonLd` builders alongside existing `blogPostingJsonLd`) |
| `src/app/sitemap.ts` (EXTEND) | route (special) | cached | itself | exact (append category/tag/author entries — Phase 5 D-05 seam is already commented at line 59) |
| `src/app/not-found.tsx` (EXTEND) | route (404) | streaming | itself | exact (add a SECOND `<Suspense>` for suggested-posts; keep the existing `<RedirectChecker>` Suspense) |
| `src/lib/excerpt/index.ts` (EXTEND) | utility | transform | itself | exact (export `collectText` for reuse — tiny refactor per RESEARCH A4) |

---

## Pattern Assignments

### `src/app/(site)/[slug]/page.tsx` (route, request-response + streaming)

**Analog:** `src/app/(site)/preview/[token]/page.tsx` (lines 24-134)

This is the HIGHEST-complexity surface and the analog is a near-perfect template. Differences: published `/[slug]` uses `'use cache'` on the post fetch (vs. preview's per-request fetch — drafts are revocable). Otherwise identical PPR shape.

**Imports pattern** (lines 24-31):
```typescript
import { Suspense } from "react";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { renderPostBody } from "@/lib/post-render";
import type { Metadata } from "next";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildPostMetadata } from "@/lib/seo/metadata";
```
Phase 6 adds to this: `cacheTag` from `next/cache`, `connection` from `next/server`, `blogPostingJsonLd` from `@/lib/seo/jsonld`, the new `getPostForPublic`/`incrementViewCount`/`listRelated` from `@/lib/queries/posts`, `deriveReadingTime` + `buildToc`, and the new `<ViewCount>`/`<RelatedPosts>` components + skeleton fallbacks.

**`generateMetadata` pattern** (lines 45-77) — adapt to slug + cached fetch:
```typescript
export async function generateMetadata({
  params,
}: PreviewPageProps): Promise<Metadata> {
  const { token } = await params;
  const [post] = await db.select().from(schema.posts)
    .where(eq(schema.posts.previewToken, token)).limit(1);
  if (!post) {
    return { title: "Not Found", robots: { index: false, follow: false } };
  }
  const s = await getSeoSettings();
  return {
    ...buildPostMetadata(
      { id: post.id, title: post.title, /* ...PostLike fields */ } ,
      null, // preview — pass data.seo for published posts
      s,
    ),
    robots: { index: false, follow: false }, // DROP for published
  };
}
```

**PPR + `<Suspense>` body pattern** (lines 79-94 + 96-134):
```typescript
export default function PreviewPage({ params }: PreviewPageProps) {
  return (
    <Suspense fallback={/* loading UI */}>
      <PreviewContent params={params} />
    </Suspense>
  );
}

async function PreviewContent({ params }: PreviewPageProps) {
  const { token } = await params;
  const [post] = await db.select().from(schema.posts)
    .where(eq(schema.posts.previewToken, token)).limit(1);
  if (!post) { notFound(); }
  const renderedHtml = renderPostBody(post.body); // Pitfall #2 gate
  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      {/* ... */}
      <div
        className="prose prose-lg max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </article>
  );
}
```

**Phase 6 deviation (CRITICAL — from RESEARCH §"HIGHEST Spike — RESOLVED"):** for `/[slug]`, the body is rendered SYNCHRONOUSLY (NOT wrapped in `<Suspense>` — it's the LCP). Instead, add TWO separate `<Suspense>` boundaries at the bottom for view-count and related-posts:

```tsx
{/* BODY — synchronous from cached fetch. NO Suspense. */}
<div className="prose prose-lg max-w-none dark:prose-invert"
     dangerouslySetInnerHTML={{ __html: renderPostBody(post.body) }} />

{/* STREAMING HOLE #1 — view count */}
<Suspense fallback={<ViewCountSkeleton />}>
  <ViewCount postId={post.id} />
</Suspense>

{/* STREAMING HOLE #2 — related posts */}
<Suspense fallback={<RelatedPostsSkeleton />}>
  <RelatedPosts postId={post.id} categoryId={post.categoryId} />
</Suspense>
```

**Anti-pattern (do NOT carry over from preview):** preview wraps the WHOLE content in one Suspense. For `/[slug]`, the body must NOT be in Suspense (it's the LCP) — see RESEARCH Pitfalls 1/2.

---

### `src/components/site/ViewCount.tsx` (component, streaming write)

**Analog:** `src/app/not-found.tsx` `RedirectChecker` (lines 47-81)

Both are async server components doing per-request DB work inside `<Suspense>`. `RedirectChecker` reads + redirects; `ViewCount` writes +1 + reads.

**Async-component-with-per-request-DB pattern** (lines 47-63):
```typescript
async function RedirectChecker(): Promise<null> {
  let redirectMatch: { newPath: string; statusCode: number } | null = null;
  try {
    const headerList = await headers();
    const incomingPath = headerList.get("x-invoke-path");
    if (incomingPath) {
      const [match] = await db
        .select().from(schema.redirects)
        .where(eq(schema.redirects.oldPath, incomingPath)).limit(1);
      if (match) { redirectMatch = { newPath: match.newPath, statusCode: match.statusCode }; }
    }
  } catch { /* graceful degradation */ }
  // ...
  return null;
}
```

**Phase 6 shape (from RESEARCH Pattern 1 lines 516-523):**
```typescript
// NO 'use cache' — connection() makes this per-request.
import { connection } from "next/server";
import { incrementViewCount } from "@/lib/queries/posts";

export async function ViewCount({ postId }: { postId: number }) {
  await connection(); // ← Pitfall #1: the per-request signal; FIRST line
  const views = await incrementViewCount(postId);
  return <span className="text-sm text-gray-500">{views.toLocaleString()} views</span>;
}
```

**Pitfall to avoid:** omitting `await connection()` → build hangs / silent caching (RESEARCH Pitfall 1).

---

### `src/lib/queries/posts.ts` (service, CRUD — published-only reads + 1 atomic write)

**Analogs (composite):**
- `src/actions/posts.ts` lines 229-253 (`getPost`/`listPosts`) — the admin query shapes to adapt
- `src/actions/media.ts` lines 243-255 — the Drizzle `sql` template-literal pattern (for the FTS query + the atomic `+1`)
- `src/lib/seo/settings.ts` lines 60-83 — the `'use cache'` + `cacheTag` profile to copy

**Published-only filter pattern** — derive from `src/app/sitemap.ts` lines 41-45 (already does this exactly):
```typescript
const publishedPosts = await db
  .select({ slug: schema.posts.slug, updatedAt: schema.posts.updatedAt })
  .from(schema.posts)
  .where(and(eq(schema.posts.status, "published"), isNull(schema.posts.deletedAt)))
  .orderBy(desc(schema.posts.publishedAt));
```

**`'use cache'` + `cacheTag` profile** — copy from `src/lib/seo/settings.ts` lines 60-83:
```typescript
export async function getSeoSettings(): Promise<SeoSettings> {
  "use cache";
  cacheTag("seo-settings");
  // ... Drizzle reads ...
}
```

**`cacheTag` per-post (RESEARCH Pattern 1 lines 495-512):**
```typescript
export async function getPostForPublic(slug: string) {
  "use cache";
  const [post] = await db.select().from(schema.posts)
    .leftJoin(schema.postSeo, eq(schema.postSeo.postId, schema.posts.id))
    .leftJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
    .where(and(
      eq(schema.posts.slug, slug),
      eq(schema.posts.status, "published"),
      isNull(schema.posts.deletedAt),
    )).limit(1);
  if (!post) return null;
  cacheTag(`post-${post.posts.id}`);          // matches publishPost revalidateTag(`post-${id}`, "max")
  if (post.posts.authorId) cacheTag(`author-${post.posts.authorId}`);
  return post;
}
```

**Drizzle `sql` template pattern (atomic increment + FTS)** — from `src/actions/media.ts` lines 252-254:
```typescript
sql`${schema.posts.body}::text ILIKE ${`%${publicUrl}%`}`,
```
Adapt for the atomic view-count `+1` (RESEARCH Pattern 1 lines 527-538):
```typescript
export async function incrementViewCount(postId: number): Promise<number> {
  const [row] = await db
    .update(schema.posts)
    .set({ views: sql`${schema.posts.views} + 1` })
    .where(eq(schema.posts.id, postId))
    .returning({ views: schema.posts.views });
  return row?.views ?? 0;
}
```

And for FTS search (RESEARCH Pattern 3 lines 572-596) — same `sql` template, parameterized:
```typescript
const tsquery = sql`websearch_to_tsquery('simple', ${query})`;
// .where(sql`${schema.posts.searchVector} @@ ${tsquery}`)
// .orderBy(desc(sql`ts_rank(${schema.posts.searchVector}, ${tsquery})`))
```

**Key distinction from admin actions:** `lib/queries/*` has NO `requireCan`/`assertOwnsPost` gate (published content is public). The ONLY write is `incrementViewCount`, which is unauthenticated by design (D-01).

---

### `src/lib/queries/{taxonomy,users,pages,archive}.ts` (service, cached reads)

**Analog:** `src/actions/categories.ts` `listCategories` (lines 46-56) — adapt by dropping the `requireCan` gate + adding `'use cache'` + `cacheTag('posts-list')` (or `cacheTag('category-N')`).

**`listCategories` pattern to adapt** (lines 46-56):
```typescript
export async function listCategories() {
  // Phase 6: DROP the next line — published reads are public.
  // await requireCan(...);  ← REMOVE
  return await db.select().from(schema.categories)
    .where(isNull(schema.categories.deletedAt))
    .orderBy(asc(schema.categories.name));
}
```

**`getPage` pattern to adapt** — `src/actions/pages.ts` lines 167-179 (drop `requireCan`, filter `status='published'` + `deletedAt IS NULL`, switch to slug lookup).

**Filterable list (archive.ts)** — model the where-clause accumulation on `src/actions/media.ts` `listMedia` lines 122-140:
```typescript
const conditions = [isNull(schema.media.deletedAt)];
if (parsed.mimeType) {
  conditions.push(eq(schema.media.mimeType, parsed.mimeType));
}
return db.select().from(schema.media)
  .where(and(...conditions))
  .orderBy(desc(schema.media.createdAt))
  .limit(parsed.limit).offset(parsed.offset);
```

---

### `src/lib/reading-time/index.ts` (utility, transform)

**Analog:** `src/lib/excerpt/index.ts` (lines 25-82) — the EXACT model per RESEARCH D-15/A4.

**`collectText` walker to reuse** (lines 25-43):
```typescript
function collectText(node: ProseMirrorNode | undefined | null, blocks: string[] = [""]): string[] {
  if (!node) return blocks;
  if (typeof node.text === "string") {
    blocks[blocks.length - 1] += node.text;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (child.type === "text") { collectText(child, blocks); }
      else { blocks.push(""); collectText(child, blocks); }
    }
  }
  return blocks;
}
```

**Required change to `src/lib/excerpt/index.ts`:** export `collectText` (currently a private function — RESEARCH A4). Add `export` to line 25.

**Phase 6 reading-time body** (RESEARCH Code Examples lines 719-737):
```typescript
import { collectText } from "@/lib/excerpt"; // after exporting it
const DEFAULT_WPM = 200;
export function deriveReadingTime(bodyJson: unknown, wpm = DEFAULT_WPM): number {
  const blocks = collectText(bodyJson as any, [""]);
  const text = blocks.map((b) => b.trim()).filter(Boolean).join(" ");
  if (!text) return 1;
  const segmenter = new Intl.Segmenter("en", { granularity: "word" });
  let words = 0;
  for (const _ of segmenter.segment(text)) words++;
  return Math.max(1, Math.round(words / wpm));
}
```

---

### `src/lib/toc/index.ts` (utility, transform)

**Analog:** `src/lib/excerpt/index.ts` (recursive ProseMirror walker — same shape, different target nodes).

There is NO existing TOC analog. The walker pattern in `excerpt/index.ts` lines 25-43 is the structural model — replace `typeof node.text === "string"` with `node.type === "heading" && [2,3].includes(node.attrs?.level)`.

**RESEARCH-provided body** (Code Examples lines 744-766):
```typescript
interface TocItem { id: string; text: string; level: 2 | 3; }
export function buildToc(bodyJson: unknown): TocItem[] {
  const items: TocItem[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (node.type === "heading" && (node.attrs?.level === 2 || node.attrs?.level === 3)) {
      const text = (node.content ?? []).map((c: any) => c.text ?? "").join("");
      if (text) items.push({ id: slugifyHeading(text), text, level: node.attrs.level });
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(bodyJson);
  return items;
}
```

**Note on `slugifyHeading`:** the existing `src/lib/slug/index.ts` `validateSlug` rejects non-Latin text (D-20 — slugs are Latin-only). Heading text may be Bangla. The TOC needs a NEW slugifier that handles arbitrary Unicode (e.g. `text.toLowerCase().replace(/\s+/g, "-")` + a dedupe counter). Do NOT reuse `validateSlug`. Also: RESEARCH Open Question 2 — verify whether `src/components/editor/extensions.ts` (lines 41-64) emits heading `id`s. It does NOT (the extensions array has no heading-ID extension — confirmed lines 35-64). Plan post-processes `renderPostBody`'s HTML to inject matching `id`s, or adds a heading extension. RESEARCH recommends post-processing for v1.

---

### `src/lib/rate-limit/index.ts` (utility, event-driven)

**NO ANALOG.** Confirmed via `Grep` for `new Map()` / `rate.?limit` / `RateLimit` across `src/` — zero source-code matches (only planning docs). This is a genuinely new pattern.

**Mental model (RESEARCH §"Don't Hand-Roll" + D-07):** a single-instance in-memory Map keyed by IP, with sliding-window or fixed-window accounting. v2 swaps for Redis (SCALE-01). The planner has full discretion on the store shape — recommend a thin `Map<string, { count: number; resetAt: number }>` with a `tryConsume(ip, limit, windowMs): boolean` API. The ONLY consumer this phase is `src/actions/contact.ts`.

---

### `src/actions/contact.ts` + `src/actions/contact-schema.ts` (server-action, request-response email)

**Composite analogs:**
- `src/actions/pages.ts` (the `"use server"` + Zod-parse + body-sanitize shape — minus the `requireCan` gate, since Contact is unauthenticated)
- `src/lib/email/index.ts` (the `sendEmail` wrapper — fire-and-forget, never throws)

**`"use server"` + Zod parse pattern** — from `src/actions/pages.ts` lines 23-29 + 91-112:
```typescript
"use server";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
// NOTE: no requireCan — contact is unauthenticated.
import { contactSchema } from "./contact-schema"; // pure-schema sibling (required: "use server" files can ONLY export async fns — see src/actions/settings.ts lines 58-60)
```

**Suggested Phase 6 shape (RESEARCH §"Don't Hand-Roll" + D-07/D-08):**
```typescript
"use server";
import { headers } from "next/headers";
import { contactSchema } from "./contact-schema";
import { sendEmail } from "@/lib/email";
import { tryConsume } from "@/lib/rate-limit";
import { getSetting } from "@/actions/settings";

export async function submitContact(input: unknown): Promise<{ ok: true }> {
  // NO 'use cache' (Pitfall 7). NO requireCan (public form).
  const data = contactSchema.parse(input); // includes honeypot field in the schema

  // Honeypot — silent succeed WITHOUT sending (D-07).
  if (data.website) { // honeypot field name per CONTEXT.md discretion
    return { ok: true };
  }

  // Rate-limit — per-IP, in-memory.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!tryConsume(ip, /* limit */, /* windowMs */)) {
    throw new Error("RATE_LIMITED");
  }

  // Fire-and-forget email — lib/email NEVER throws (R8).
  const recipient = await getSetting("contact.recipient_email");
  await sendEmail({
    to: recipient ?? "admin@anydiscussion.com",
    subject: `Contact form: ${data.subject ?? "(no subject)"}`,
    text: `From: ${data.name} <${data.email}>\n\n${data.message}`,
  });
  return { ok: true };
}
```

**`contact-schema.ts` analog** — `src/actions/seo-settings-schema.ts` (pure Zod schema + `zodResolver` re-export, sibling to the `"use server"` file). Pattern documented at `src/actions/settings.ts` lines 58-60.

**`lib/email` reuse** — `src/lib/email/index.ts` lines 40-72 (`sendEmail` returns `undefined` on error, NEVER throws — R8). The `from` field has a dev-default fallback (`onboarding@resend.dev`).

---

### `src/components/site/ContactForm.tsx` (component, form-submit)

**Analog:** `src/app/(admin)/dashboard/settings/seo/SeoSettingsForm.tsx` (lines 1-180)

This is the RHF + zodResolver baseline. Differences: (1) the ContactForm is in `(site)` so it CANNOT import from `(admin)` — copy the SHAPE, not the import; (2) D-28 forbids TanStack Query in `(site)` — use plain `useState` + direct `startTransition` Server Action invocation instead of `useMutation`.

**RHF + Zod shape to copy** (SeoSettingsForm lines 15-49):
```typescript
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactSchema, type ContactInput } from "./contact-schema"; // shared with server

export default function ContactForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", message: "", website: "" /* honeypot */ },
  });
  // ... submit handler calls submitContact via useTransition (NOT useMutation — D-28)
}
```

**Field helper + Tailwind classes** — copy the `INPUT_CLASS`/`LABEL_CLASS`/`Field` helpers from SeoSettingsForm lines 24-25 + 151-180 verbatim (they're already used across all dashboard forms).

**Honeypot field** — a visually-hidden `<input {...register("website")} tabIndex={-1} autoComplete="off" />` (the field name is a CONTEXT.md discretion item).

---

### `src/db/schema.ts` (EXTEND — model)

**Analog:** itself. Add columns to the existing `posts` (lines 47-66) and `user` (lines 171-188) tables.

**Current `posts` table (lines 47-66) — the exact extension points:**
```typescript
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  body: jsonb("body"),
  excerpt: text("excerpt"),
  status: postStatusEnum("status").default("draft").notNull(),
  authorId: text("author_id").references(() => user.id),
  categoryId: integer("category_id").references(() => categories.id),
  featureImage: text("feature_image"),
  previewToken: varchar("preview_token", { length: 255 }).unique(),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  // ↓ ADD (D-04 + D-01):
  // featured: boolean("featured").default(false).notNull(),
  // views: integer("views").default(0).notNull(),
});
```

**Current `user` table (lines 171-188) — `username` is verified NEW (no slug field exists):**
```typescript
export const user = pgTable("user", {
  id: text("id").primaryKey(),     // ← UUID; why D-11 adds `username` for public URLs
  name: text("name").notNull(),    // display name, NOT a slug
  email: text("email").notNull().unique(),
  // ... Better Auth fields ...
  bio: text("bio"),                // D-24 — already present (AUTH-08 byline)
  avatar: text("avatar"),          // D-25 — already present (R2 key)
  // ↓ ADD (D-11):
  // username: varchar("username", { length: 255 }).unique(), // nullable
});
```

**FTS column (RESEARCH Open Question 1 — RESOLVED HERE):** `vector` IS exported from `drizzle-orm/pg-core`. Verified via the barrel chain `pg-core/index.d.ts` → `columns/index.d.ts` (line 33: `export * from "./vector_extension/vector.js";`). `generatedAlwaysAs` is a method on `PgColumnBuilder` (`columns/common.cjs` line 52). `customType` is also exported. The planner can use:

```typescript
import { vector, index as pgIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
// inside posts table:
searchVector: vector("search_vector").generatedAlwaysAs(
  sql`to_tsvector('simple', coalesce(${title}, '') || ' ' || coalesce(${excerpt}, ''))`
),
// in the table's 3rd arg (table config fn):
// searchIdx: pgIndex("posts_search_vector_idx").using("gin", t.searchVector),
```
**Note:** the existing `posts` table uses the 2-arg form of `pgTable` (no config callback). Adding a GIN index requires switching to the 3-arg form `(t) => ({ ... })` — see `postTags` (lines 99-108) and `session` (lines 190-208) for the 3-arg form already in use in this file.

---

### `src/lib/storage/seed.ts` (EXTEND) + `src/instrumentation.ts` (EXTEND)

**Analogs:** themselves.

**`seed.ts` pattern to mirror** (lines 79-96 — `seedSeoSettings`):
```typescript
export async function seedSeoSettings(): Promise<void> {
  await db.insert(schema.settings).values([
    { key: "site.title", value: "Any Discussion" },
    // ...
  ]).onConflictDoNothing();
}
```

**Phase 6 adds `seedPublicFrontendSettings()`** with keys: `contact.recipient_email`, `analytics.script` (or `analytics.umami_id`), footer social-link keys. Exact key names are CONTEXT.md discretion; the SHAPE is exact-copy of `seedSeoSettings`.

**`instrumentation.ts` call site** (lines 48-55) — add ONE line after `await seedSeoSettings();`:
```typescript
const { seedStorageSettings, seedPages, seedSeoSettings, seedPublicFrontendSettings } = await import("@/lib/storage/seed");
await seedStorageSettings();
await seedPages();
await seedSeoSettings();
await seedPublicFrontendSettings(); // ← Phase 6 ADD
```

---

### `src/lib/seo/jsonld.ts` (EXTEND — utility, pure)

**Analog:** itself — `blogPostingJsonLd` (lines 52-77) is the structural model for `personJsonLd` + `breadcrumbListJsonLd`.

**`blogPostingJsonLd` shape to mirror** (lines 18-77):
```typescript
export interface BlogPostingInput { /* ...typed input... */ }
export function blogPostingJsonLd(i: BlogPostingInput) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    // ...fields...
  };
}
```

Phase 6 adds two sibling builders following the SAME shape:
- `personJsonLd(i: PersonJsonLdInput)` for `/author/[username]` (SITE-06 — closes Phase 5 D-03).
- `breadcrumbListJsonLd(i: BreadcrumbListJsonLdInput)` for `/category/[slug]` + `/tag/[slug]` (SITE-04/05 — closes Phase 5 D-03).

These are PURE builders — no DB access, trivially unit-testable alongside the existing `__tests__/jsonld.test.ts`.

---

### `src/app/sitemap.ts` (EXTEND — special route)

**Analog:** itself — the seam is already commented at line 59:
```typescript
// Phase 6 TODO: append category/tag/author archive entries here (D-05).
return [home, ...postEntries, ...pageEntries];
```

The builder helpers `buildPostSitemapEntry` (lines 79-90) + `buildPageSitemapEntry` (lines 95-106) are the exact template for `buildCategorySitemapEntry` / `buildTagSitemapEntry` / `buildAuthorSitemapEntry`. Add 3 sibling builders + 3 new DB queries (mirroring the `publishedPosts` query at lines 41-45).

---

### `src/app/not-found.tsx` (EXTEND — 404)

**Analog:** itself. The current single-`<Suspense>` shape (lines 89-95) is the template.

**Current shape (lines 89-95):**
```typescript
export default function NotFound() {
  return (
    <div className="...">
      <Suspense fallback={null}>
        <RedirectChecker />
      </Suspense>
      {/* 404 UI */}
    </div>
  );
}
```

Phase 6 adds a SECOND `<Suspense>` boundary for the "suggested posts" DB read (D-16) — see RESEARCH Pitfall 6. Do NOT inline the suggested-posts query in the static 404 shell (build error: "Uncached data was accessed outside of <Suspense>").

```tsx
<Suspense fallback={null}><RedirectChecker /></Suspense>
{/* existing 404 UI */}
<Suspense fallback={<CardGridSkeleton />}><SuggestedPosts /></Suspense> {/* ← Phase 6 ADD */}
```

---

### `src/components/site/ThemeToggle.tsx` (component, client) — DARK MODE (D-13)

**Analog:** `src/context/ThemeContext.tsx` (lines 1-58) — **MODEL but DO NOT IMPORT.**

D-13 forbids sharing the dashboard theme setting with `(site)` (route-group isolation + PERF-02). The dashboard `ThemeContext` lives in `src/context/` (not `app/(admin)/`), so the ESLint `no-restricted-imports` rule (lines 21-36 of `eslint.config.mjs`) may NOT flag a cross-import — this is a Pitfall (RESEARCH Pitfall 5). Build a SEPARATE minimal hook with its OWN localStorage key (`site-theme` vs the dashboard's `theme`).

**Class-strategy pattern to mirror** (ThemeContext lines 21-39):
```typescript
useEffect(() => {
  if (theme === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}, [theme]);
```

**localStorage key — SEPARATE per route group (D-13):**
- Dashboard: `localStorage.getItem("theme")` (line 23 of ThemeContext)
- Public site: `localStorage.getItem("site-theme")` (NEW — do not reuse `"theme"`)

**No-flash `<head>` script (RESEARCH Pattern 4 lines 606-620):** inline `<Script id="site-no-flash" strategy="beforeInteractive">` reading `site-theme`, applied to `document.documentElement.classList` BEFORE first paint. The dashboard has NO equivalent (it tolerates a flash). This is genuinely new for `(site)`.

---

### `src/app/(site)/layout.tsx` (EXTEND) + `SiteHeader.tsx` + `SiteFooter.tsx`

**Analog:** `src/app/(site)/layout.tsx` (current, lines 1-85) — extend the existing skeletal shell.

**Current `<main>`-only shell (lines 51-84):**
```typescript
return (
  <div className="min-h-screen bg-white dark:bg-gray-900">
    {/* site-wide JSON-LD scripts (keep) */}
    <main>{children}</main>
  </div>
);
```

Phase 6 wraps `<main>` with header/footer + adds the no-flash script + analytics `<script>` (ANAL-01). The JSON-LD scripts (lines 58-81) and `generateMetadata` (lines 38-42) stay unchanged.

**Analytics `<script>` injection (RESEARCH §"Analytics injection specific guidance"):** the settings-stored value must be a **URL + site ID** (validated `https://`), NOT a freeform HTML blob (XSS vector). The layout reads `getSetting("analytics.script")`, validates the URL scheme, and emits `<script async src={url} data-website-id={id} />` only. Never inject arbitrary inline script.

---

## Shared Patterns

### Public read-query module (cross-cutting for all `lib/queries/*`)
**Source:** `src/lib/seo/settings.ts` lines 60-83 + `src/actions/categories.ts` lines 46-56 + `src/app/sitemap.ts` lines 41-45
**Apply to:** `lib/queries/posts.ts`, `lib/queries/taxonomy.ts`, `lib/queries/users.ts`, `lib/queries/pages.ts`, `lib/queries/archive.ts`

```typescript
// 1. NO requireCan (published content is public).
// 2. Filter: and(eq(.status, "published"), isNull(.deletedAt)) — from sitemap.ts.
// 3. 'use cache' + cacheTag matching publishPost's revalidateTag calls:
//    cacheTag(`post-${id}`)      ← matches revalidateTag(`post-${id}`, "max")
//    cacheTag(`author-${aid}`)   ← matches revalidateTag(`author-${aid}`, "max")
//    cacheTag(`category-${cid}`) ← matches revalidateTag(`category-${cid}`, "max")
//    cacheTag('posts-list')      ← matches revalidateTag('posts-list', "max")
//    cacheLife('hours')          ← ISR-friendly for list routes
// 4. cacheTag('seo-settings') stays on getSeoSettings only.
```

### Sanitization gate (security boundary — Pitfall #2)
**Source:** `src/lib/post-render.ts` lines 39-45
**Apply to:** EVERY `dangerouslySetInnerHTML` on a post/page body in Phase 6 (`/[slug]`, `/[slug]`-style pages routes for T&C/Privacy/Contact).

```typescript
// renderPostBody = generateHTML(json, editorExtensions) → sanitizeBeforeRender(html)
// NEVER raw dangerouslySetInnerHTML without this gate.
const html = renderPostBody(post.body);
<div className="prose ..." dangerouslySetInnerHTML={{ __html: html }} />
```

### Cache Components + Suspense (cross-cutting for `/[slug]`, `/not-found`, list routes)
**Source:** `src/app/(site)/preview/[token]/page.tsx` + `src/app/not-found.tsx` + `src/lib/seo/settings.ts`
**Apply to:** `[slug]/page.tsx` (2 Suspense holes), `not-found.tsx` (second Suspense), any route mixing static + dynamic.

The three rendering categories under `cacheComponents:true` (from RESEARCH §"HIGHEST Spike"):
1. `'use cache'` → part of static shell (revalidated by `cacheTag`/`revalidateTag`)
2. `<Suspense>`-wrapped async WITHOUT `'use cache'` → fallback in shell, content streams per-request
3. Deterministic sync ops → static shell

```typescript
// Pattern A — cached read (static shell):
async function getCached(slug: string) {
  "use cache";
  cacheTag(`post-${id}`);
  return await db.select()...
}

// Pattern B — per-request slot (streams):
async function ViewCount({ postId }) {
  await connection(); // FIRST line — the per-request signal (Pitfall 1)
  // ...write + read...
}
// Usage: <Suspense fallback={<Skeleton />}><ViewCount /></Suspense>
```

### ESLint route-group isolation (enforced)
**Source:** `eslint.config.mjs` lines 17-54
**Apply to:** ALL new `(site)` files + the new `lib/queries` + `components/site`.

```javascript
// (site)/**/* cannot import from @/app/(admin)/*, ../(admin)/*, ../../(admin)/*
// (admin)/**/* cannot import from @/app/(site)/*, ../(site)/*, ../../(site)/*
// NEW lib/queries + components/site live OUTSIDE app/ (in @/lib, @/components) so they
// can be shared — but must NOT import (admin) code transitively.
```

**Pitfall (RESEARCH #5):** the dashboard `ThemeContext` lives in `src/context/` (NOT `app/(admin)/`), so the ESLint rule may not catch a cross-import. D-13 forbids it anyway — build a separate public-site hook.

### Server Action shape (for `actions/contact.ts`)
**Source:** `src/actions/pages.ts` (lines 23-29) + `src/actions/settings.ts` (lines 58-60 sibling-schema note)
**Apply to:** `actions/contact.ts` + `actions/contact-schema.ts`.

```typescript
// actions/contact.ts
"use server";                              // top directive mandatory
import { contactSchema } from "./contact-schema"; // pure-schema sibling
// NO requireCan — contact is unauthenticated (the ONLY mutating Server Action without a permission gate)
// NO 'use cache' — Server Actions are mutations, never cached (Pitfall 7)
```

```typescript
// actions/contact-schema.ts — pure module (re-export zodResolver + schema)
import { z } from "zod";
export const contactSchema = z.object({ /* ... */ });
export type ContactInput = z.infer<typeof contactSchema>;
export { zodResolver } from "@hookform/resolvers/zod";
// "use server" files can ONLY export async functions — the schema MUST live here.
```

### Seed + instrumentation (for `seedPublicFrontendSettings`)
**Source:** `src/lib/storage/seed.ts` lines 79-96 + `src/instrumentation.ts` lines 48-55
**Apply to:** the new settings seeds.

```typescript
// seed.ts — idempotent insert with onConflictDoNothing (admin-edited values NEVER overwritten)
export async function seedPublicFrontendSettings(): Promise<void> {
  await db.insert(schema.settings).values([
    { key: "contact.recipient_email", value: "" },
    { key: "analytics.script", value: "" },
    // footer socials...
  ]).onConflictDoNothing();
}
// instrumentation.ts — add ONE call after seedSeoSettings(), same fire-and-forget shape.
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/rate-limit/index.ts` | utility | event-driven | No `new Map()`-based cache or rate-limit utility exists anywhere in `src/` (Grep confirmed — all matches were in `.planning/` docs). Genuinely new pattern. The planner has full discretion on the store shape per D-07; recommend `Map<string, { count, resetAt }>` + `tryConsume(ip, limit, windowMs)`. v2 swaps for Redis (SCALE-01). |
| `src/components/site/SearchForm.tsx` | component (server GET form) | request-response | No progressive-enhancement server-rendered `<form action="/search" method="GET">` exists in the repo. Dashboard uses RHF + Server Actions (mutation path). Build a plain HTML `<form>` whose `q` input name drives `searchParams` on `/search/page.tsx`. |
| `src/components/site/SiteHeader.tsx` + `SiteFooter.tsx` | component (server) | cached read | The dashboard `AppHeader.tsx`/`AppSidebar.tsx` are TailAdmin-styled and live in `src/layout/` (dashboard-only per CLAUDE.md folder structure). The public chrome is brand-new and must NOT reuse them. Structure follows `src/app/(site)/layout.tsx` (server component reading `getSeoSettings()`). |

---

## RESEARCH Open Questions Resolved Here (for the planner)

| OQ | Resolution | Evidence |
|----|------------|----------|
| **#1 / A1: Drizzle `vector` export in 0.45.2** | **RESOLVED — `vector` IS exported.** | Barrel chain: `drizzle-orm/pg-core/index.d.ts` line 12 (`export * from "./columns/index.js"`) → `pg-core/columns/index.d.ts` line 33 (`export * from "./vector_extension/vector.js"`). `generatedAlwaysAs` is a method on `PgColumnBuilder` (`columns/common.cjs` line 52). `customType` is also exported (fallback if ever needed). The planner can write `import { vector } from "drizzle-orm/pg-core"` directly — NO fallback path needed. |
| **#2 / A2: TOC heading IDs** | **RESOLVED — editor does NOT emit heading IDs.** | `src/components/editor/extensions.ts` lines 35-64 — the `editorExtensions` array has StarterKit, TableKit, Image, Link, CodeBlock. NO heading-ID extension. `@tiptap/html` `generateHTML` therefore emits `<h2>`/`<h3>` without `id` attributes. Per RESEARCH recommendation (b): post-process `renderPostBody`'s HTML in a thin wrapper local to Phase 6 (don't touch the editor config — single source of truth). |
| **#3 / A4: `collectText` export** | **CONFIRMED private — needs export.** | `src/lib/excerpt/index.ts` line 25 — `function collectText(...)` (no `export` keyword). Phase 6 adds `export` (one keyword) per RESEARCH A4. Tiny refactor; the excerpt module's invariants are not affected. |
| **D-11: `user.username` is NEW** | **CONFIRMED — no reusable slug.** | `src/db/schema.ts` lines 171-188 — `user` has `id` (text UUID), `name` (display, not slug), `email`. No `username`/`slug` column. `user.id` is a UUID (bad for `/author/{id}` URLs). Adding `username varchar(255) unique()` (nullable) is correct. |

---

## Metadata

**Analog search scope:**
- `src/app/(site)/**` (layout, page, preview route)
- `src/app/{sitemap,not-found}.tsx`
- `src/actions/{posts,pages,categories,media,settings}.ts`
- `src/lib/{seo,excerpt,post-render,email,storage,slug,db}/**`
- `src/db/schema.ts`
- `src/components/editor/extensions.ts`
- `src/context/ThemeContext.tsx`
- `src/instrumentation.ts`
- `eslint.config.mjs`
- `src/app/(admin)/dashboard/settings/seo/{page,SeoSettingsForm}.tsx`
- `node_modules/drizzle-orm/pg-core/{index,columns/index,columns/common,columns/vector_extension/vector}` (Open Question 1 verification)

**Files scanned:** 22 source files + 4 node_modules barrel/type files for the drizzle-orm verification.

**Pattern extraction date:** 2026-07-07
