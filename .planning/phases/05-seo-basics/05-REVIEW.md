---
phase: 05-seo-basics
reviewed: 2026-08-25T10:45:31Z
depth: standard
files_reviewed: 48
files_reviewed_list:
  - __tests__/middleware.test.ts
  - next.config.ts
  - package.json
  - src/actions/__tests__/posts.test.ts
  - src/actions/__tests__/seo-settings.test.ts
  - src/actions/posts-schema.ts
  - src/actions/posts.ts
  - src/actions/seo-settings-schema.ts
  - src/actions/settings.ts
  - src/app/(admin)/AdminShell.tsx
  - src/app/(admin)/dashboard/pages/PageForm.tsx
  - src/app/(admin)/dashboard/posts/PostForm.tsx
  - src/app/(admin)/dashboard/posts/[id]/edit/page.tsx
  - src/app/(admin)/dashboard/posts/components/PostRowActions.tsx
  - src/app/(admin)/dashboard/posts/new/page.tsx
  - src/app/(admin)/dashboard/posts/page.tsx
  - src/app/(admin)/dashboard/settings/seo/SeoSettingsForm.tsx
  - src/app/(admin)/dashboard/settings/seo/page.tsx
  - src/app/(admin)/dashboard/settings/seo/schema-client.ts
  - src/app/(site)/layout.tsx
  - src/app/(site)/page.tsx
  - src/app/(site)/preview/[token]/page.tsx
  - src/app/not-found.tsx
  - src/app/robots.ts
  - src/app/rss.xml/route.ts
  - src/app/sitemap.ts
  - src/components/dashboard/posts/SeoPanel.tsx
  - src/components/editor/TiptapEditor.tsx
  - src/components/editor/__tests__/round-trip.test.ts
  - src/components/editor/__tests__/tiptap-editor-surface.test.tsx
  - src/components/editor/extensions.ts
  - src/components/editor/toolbar/Toolbar.tsx
  - src/db/migrations/0004_gigantic_black_tom.sql
  - src/db/schema.ts
  - src/instrumentation.ts
  - src/layout/AppSidebar.tsx
  - src/lib/seo/__tests__/jsonld.test.ts
  - src/lib/seo/__tests__/metadata.test.ts
  - src/lib/seo/__tests__/robots.test.ts
  - src/lib/seo/__tests__/rss.test.ts
  - src/lib/seo/__tests__/shared-fixtures.ts
  - src/lib/seo/__tests__/sitemap.test.ts
  - src/lib/seo/__tests__/validation.test.ts
  - src/lib/seo/jsonld.ts
  - src/lib/seo/metadata.ts
  - src/lib/seo/settings.ts
  - src/lib/seo/validation.ts
  - src/lib/storage/seed.ts
  - src/middleware.ts
findings:
  critical: 3
  warning: 9
  info: 7
  total: 19
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-08-25T10:45:31Z
**Depth:** standard
**Files Reviewed:** 48
**Status:** issues_found

## Summary

The SEO-basics surface (SEO settings snapshot + builders, sitemap/robots/RSS, post-editor SEO panel, Node-runtime redirects middleware, WordPress-classic editor, role-aware publish UI) is broadly well-structured, and the permission-check-first discipline in the Server Actions is real (verified against `@/lib/permissions` and `post-transitions.ts`). However, three blockers surfaced:

1. **Canonical URLs on post pages point at the wrong path** (`/{slug}` instead of `/blog/{slug}`), contradicting the sitemap, RSS, revalidatePath literals, and JSON-LD `mainEntityOfPage` — the exact duplicate-content failure this phase exists to prevent.
2. **Every edit-save of an existing post wipes `publishedAt` to NULL** (`savePost` update sets `publishedAt: data.publishedAt ?? null` while `PostForm` never registers the field) — data loss on every published post edit; `transitionPost` also never sets `publishedAt` on publish.
3. **Stored XSS via JSON-LD `<script>` injection** — `JSON.stringify` output containing user-controlled `post.title`/`post.excerpt` is injected via `dangerouslySetInnerHTML` without escaping `<`, so a title containing `</script><img src=x onerror=...>` executes on the public post page (author-supplied, then published by an editor).

Additionally, the `upsertSetting` insert fallback in `settings.ts` is dead code under the node-postgres driver (verified against installed drizzle types: `await db.update(...)` resolves to pg's `QueryResult` object, never an array), so `saveSeoSettings` silently no-ops when the seed rows are missing.

Positive notes: the sanitize pipeline (storage-time body walker + render-time DOMPurify with iframe domain allowlist) is correctly ordered and shared; middleware's redirect status mapping (301 to 308 / 302 to 307) is consistent with the not-found fallback; the grapheme-based SEO validation is genuinely Bangla-aware.

## Critical Issues

### CR-01: Post canonical URLs derived as `/{slug}` — actual post route is `/blog/[slug]`

**File:** `src/lib/seo/metadata.ts:94` (consumed by `src/app/(site)/blog/[slug]/page.tsx:90`, `src/app/(site)/preview/[token]/page.tsx:60-76`)
**Issue:** `buildPostMetadata` derives the canonical as `seo?.canonicalUrl || \`/${post.slug}\``. The public single-post route is `src/app/(site)/blog/[slug]/page.tsx` (URL `/blog/{slug}`) — confirmed by the sitemap (`${base}/blog/${slug}`), RSS item links (`${base}/blog/${post.slug}`), `publishPost`'s `revalidatePath(\`/blog/${post.slug}\`)`, the 404 page's suggested-post links, and the JSON-LD `canonicalRel = \`/blog/${post.slug}\`` computed in the very same route file (line 163). Result: every published post emits `<link rel="canonical">` and `og:url` pointing at `https://base/{slug}` — a URL that 404s — while the page itself lives at `/blog/{slug}` and its JSON-LD `mainEntityOfPage` claims `/blog/{slug}`. Search engines get three contradictory signals per post; canonical points at a 404. `metadata.test.ts:64-73` pins the wrong path, so the tests encode the bug.
**Fix:**
```ts
// src/lib/seo/metadata.ts — buildPostMetadata
// D-04 — canonical override: respect post_seo.canonicalUrl else derive from the
// /blog/[slug] route (matches sitemap.ts, rss.xml, publishPost revalidatePath).
const canonical = seo?.canonicalUrl || `/blog/${post.slug}`;
```
Also update `src/lib/seo/__tests__/metadata.test.ts:64-73` to expect `/blog/${fakePost.slug}` (and add a cross-check that `buildPostMetadata`'s derived path matches `buildPostSitemapEntry`'s URL prefix so the two can never drift again).

### CR-02: `savePost` update path nulls `publishedAt` on every edit — publish-date data loss

**File:** `src/actions/posts.ts:133` (with `src/app/(admin)/dashboard/posts/PostForm.tsx:83-95` and `src/lib/permissions/post-transitions.ts:80-83`)
**Issue:** The update branch unconditionally writes `publishedAt: data.publishedAt ?? null`. `PostForm` never registers/defaults a `publishedAt` field (props don't even accept one — see `PostFormProps`), so `values.publishedAt` is always `undefined` on submit. Consequence: every "Save" of an existing post — including a published post being copy-fixed — silently sets `publishedAt = NULL`. Downstream damage: the visible date disappears from the post page (`post.publishedAt ? ...` guard), `og:publishedTime` is dropped, RSS `pubDate` falls back to `new Date()` (misleading readers), and `listPublished`/`listFeatured`/RSS ordering (`order by published_at desc`) degrades (Postgres sorts NULLS FIRST on DESC, so wiped posts jump to the top of the feed). Compounding: `transitionPost(postId, "published")` never sets `publishedAt` either, so a publish without a prior manual schedule leaves it NULL forever.
**Fix:**
```ts
// src/actions/posts.ts — update branch: preserve publishedAt when the client
// didn't send one (PostForm never does).
if (input.id) {
  await db.update(schema.posts).set({
    title: data.title,
    slug: data.slug,
    body: sanitizedBody,
    excerpt,
    categoryId: data.categoryId,
    featureImage: data.featureImage ?? null,
    ...(data.publishedAt !== undefined ? { publishedAt: data.publishedAt } : {}),
    updatedAt: new Date(),
  }).where(eq(schema.posts.id, input.id));
```
And in `src/lib/permissions/post-transitions.ts`, when `target === "published"` and the post's `publishedAt` is null, set it (`publishedAt: new Date()`) in the same UPDATE so publishing always stamps the date.

### CR-03: Stored XSS via unescaped JSON-LD `<script>` injection (author-controlled title/excerpt)

**File:** `src/app/(site)/blog/[slug]/page.tsx:176-193` (same pattern in `src/app/(site)/layout.tsx:89-112`)
**Issue:** `JSON.stringify(blogPostingJsonLd({ title: post.title, description: post.excerpt || ..., ... }))` is injected with `dangerouslySetInnerHTML`. `JSON.stringify` does NOT escape `<` or `>`, so a post whose title is `Breaking</script><img src=x onerror=alert(document.cookie)>` terminates the `<script type="application/ld+json">` element early and executes the injected markup on the public post page. `post.title`/`post.excerpt` are author-role inputs (Zod only checks non-empty/length — no HTML sanitization), and the Tiptap body-sanitize pipeline never touches the title. An author can plant the payload; an editor publishing it exposes every reader. The site-layout variant (siteTitle/siteDescription — admin-controlled) is the same class but admin-only; the blog-page variant crosses a privilege boundary (author to public). This is the classic reason Next.js docs require escaping `<` in JSON-LD payloads.
**Fix:** Add a shared safe-stringify helper in `src/lib/seo/jsonld.ts` and use it at every JSON-LD injection site. The helper must escape the less-than char (and the Unicode line separators U+2028/U+2029, written below as their six-character backslash-u escapes):
```ts
// src/lib/seo/jsonld.ts
export function jsonLdScript(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\\u2028/g, "\\\\u2028")   // regex literal: backslash-u-2028 escape
    .replace(/\\u2029/g, "\\\\u2029");  // regex literal: backslash-u-2029 escape
}
// consumers:
// <script type="application/ld+json"
//   dangerouslySetInnerHTML={{ __html: jsonLdScript(blogPostingJsonLd({ ... })) }} />
```
(The escape sequences are valid inside JSON strings, so the emitted JSON-LD remains semantically identical.)

## Warnings

### WR-01: `upsertSetting` insert fallback is dead code under node-postgres — `saveSeoSettings` can silently no-op

**File:** `src/actions/settings.ts:68-79`
**Issue:** The guard `if (!updated || (Array.isArray(updated) && updated.length === 0))` never triggers with this stack. Verified against the installed `drizzle-orm/node-postgres` types (`NodePgQueryResultHKT.type = QueryResult<...>`): `await db.update(...)...where()` resolves to pg's `QueryResult` object — truthy and not an array — even when 0 rows matched. So when a settings key does not yet exist, the UPDATE matches nothing and the INSERT fallback is skipped: `saveSeoSettings` returns `{ ok: true }`, revalidates, and persists nothing. The boot seed (`seedSeoSettings`) usually pre-creates the five keys, masking the bug — but the seed is fire-and-forget at boot (see WR-09), so any environment where boot seeding failed gets a silently non-functional SEO settings page. The unit test masks it too (`updateSetWhereMock.mockResolvedValue(undefined)` makes `!updated` true, so the fallback is exercised only under the mock). The identical bug is copied from `storage-settings.ts:83-96`.
**Fix:**
```ts
// Option A (driver-correct check):
const updated = await db
  .update(schema.settings)
  .set({ value, updatedAt: new Date() })
  .where(eq(schema.settings.key, key));
// node-postgres resolves to pg QueryResult — use rowCount.
if (!updated || updated.rowCount === 0) {
  await db.insert(schema.settings).values({ key, value }).onConflictDoNothing();
}
// Option B (driver-proof, simpler):
await db.insert(schema.settings)
  .values({ key, value })
  .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
```

### WR-02: `autosavePost` stores the body without `sanitizeBodyHtml` — violates the sanitize-before-storage invariant

**File:** `src/actions/posts.ts:274-296`
**Issue:** `savePost` walks the body and runs raw-HTML strings through `sanitizeBeforeStore` (Pitfall #2 site #1), but `autosavePost` writes `body` verbatim (`db.update(...).set({ body, ... })`). It is an exported Server Action, so any authenticated owner can invoke it directly through the action RPC (no UI wiring needed — nothing in the client imports it, which also makes it currently dead UI-wise). Render-time `sanitizeBeforeRender` still gates the output, so this is defense-in-depth erosion rather than a live XSS (and the `html` node type isn't in the extensions array, so `generateHTML` drops those nodes today) — but the project invariant is "sanitize before storage AND before render", and any future embed extension would turn this into the bypass.
**Fix:** Apply the same walker: `const sanitized = sanitizeBodyHtml(body); ... .set({ body: sanitized, updatedAt: new Date() })`.

### WR-03: RSS CDATA breakout — a body containing `]]>` produces a malformed feed

**File:** `src/app/rss.xml/route.ts:115`
**Issue:** `renderedBody` is interpolated directly inside `<![CDATA[...]]>`. DOMPurify-serialized HTML escapes `<` in text but leaves `>` literal, so a code block (or any text) containing the literal sequence `]]>` survives sanitization, terminates the CDATA section early, and everything after it becomes raw XML markup — the entire feed fails to parse for every subscriber until the post is edited. Standard fix is to split the terminator.
**Fix:**
```ts
const cdataSafe = renderedBody.replaceAll("]]>", "]]]]><![CDATA[>");
// ... <content:encoded><![CDATA[${cdataSafe}]]></content:encoded>
```

### WR-04: `post_seo.post_id` lacks a UNIQUE constraint — racy upsert can create duplicate rows and nondeterministic SEO joins

**File:** `src/db/schema.ts:112-120` with `src/actions/posts.ts:208-221`
**Issue:** `upsertPostSeo` implements one-to-one via SELECT-then-INSERT/UPDATE. Two concurrent saves of the same post (double-click, two tabs) can both see "no existing row" and both INSERT — nothing prevents duplicates (`post_id` is a plain FK, not unique). `getPostForPublic` (`src/lib/queries/posts.ts:36-48`) left-joins `postSeo` with `.limit(1)` and no ordering, so duplicates yield arbitrary/nondeterministic SEO values per request, and subsequent saves update only whichever row the SELECT found first.
**Fix:** `postId: integer("post_id").notNull().unique().references(() => posts.id)` + regenerate the migration via `drizzle-kit generate` (never hand-write SQL); optionally switch the upsert to `insert(...).onConflictDoUpdate({ target: schema.postSeo.postId, ... })`.

### WR-05: `listPosts` is not author-scoped — authors see every other author's drafts

**File:** `src/actions/posts.ts:247-253`
**Issue:** The doc comment says "authors see only their own", but the implementation is `select().from(posts).limit(50)` gated only by `post:read`. Authors hold `post:read` (they need it for their own posts), so the dashboard posts list exposes all users' drafts and pending-review posts to the author role. `getPost` scopes correctly via `assertOwnsPost`; the list path does not. CLAUDE.md's role table says authors can "create/edit only their own posts" — reading others' unpublished work is an authorization gap (mild — same trust boundary as the dashboard, but unpublished content is the sensitive part).
**Fix:** After `requireCan`, use the returned session and, when `session.user.role === "author"`, add `.where(eq(schema.posts.authorId, session.user.id))` (`requireCan` already returns the session).

### WR-06: `savePost` update path has no existence check — nonexistent id yields FK error or silent no-op

**File:** `src/actions/posts.ts:123-137`
**Issue:** For admin/editor callers, `assertOwnsPost` bypasses without verifying the post exists. Updating a nonexistent id: the `UPDATE` matches 0 rows silently, then `upsertPostSeo` INSERTs a `post_seo` row for the ghost id — Postgres FK violation surfaces as a raw driver error to the client (internal error leak). If the SEO input fails safeParse, the action instead returns `{ id }` as if it saved. Contrast with `getPost`/`publishPost`, which throw `NOT_FOUND`.
**Fix:** Use `.returning({ id: schema.posts.id })` on the update; if empty, `throw new Error("NOT_FOUND")` before the SEO upsert.

### WR-07: Selected tags are silently discarded — nothing writes `post_tags`

**File:** `src/actions/posts.ts:99-165` (with `PostForm.tsx:259` / `TaxonomyPicker`)
**Issue:** `postSchema` validates `tagIds` (cap 8), the edit page even pre-fetches them via `getPostTagIds`, and the picker UI lets authors select tags — but `savePost` never writes `post_tags` (grep confirms no insert into `postTags` anywhere in `src/actions`). User input is accepted then dropped with a success toast. All tag-driven features (`listPublished({ tagId })`, `/tag/[slug]` archives, tag fill in `listRelated`) read a table nothing populates.
**Fix:** In `savePost` (update path), delete existing `postTags` for the post and insert the validated `tagIds` (ideally in a transaction with the posts update), or block the UI until a `setPostTags` action is wired.

### WR-08: Editing a published post never revalidates the public page/lists

**File:** `src/actions/posts.ts:99-165`
**Issue:** `savePost` contains no `revalidatePath`/`revalidateTag` calls (they exist only in `publishPost`). An editor fixing a typo on a live post and hitting Save updates the DB but leaves `getPostForPublic` (`post-${id}` tag, default cache profile) and `listPublished` (`posts-list`, `cacheLife("hours")`) serving stale content for up to their TTLs. CLAUDE.md performance mandate: "Use `revalidatePath`/`revalidateTag` on publish/update". The post remains `status='published'` through this path, so no publish-transition revalidation fires later.
**Fix:** At the end of the update branch (when the post's pre-update status is `published`), run the same concrete revalidation block as `publishPost` (`/blog/{slug}`, `/`, `/blog`, category path, sitemap/RSS paths, `post-${id}`/`author-`/`category-`/`posts-list` tags with the 2-arg form).

### WR-09: Instrumentation seeds run sequentially without per-seed error isolation — one failure aborts the rest

**File:** `src/instrumentation.ts:54-62`
**Issue:** `seedStorageSettings()` through `seedPublicFrontendSettings()` are plain sequential awaits with no try/catch. The comment claims "a failure here is logged inside the seeders but does not block server startup" — but the seeders don't catch, so the first failure throws out of `register()` and skips every later seed AND the storage-provider registration below it. If the DB is briefly unavailable at boot, `site.*`/`seo.*` rows never get created — which then chains into WR-01's dead insert fallback making `saveSeoSettings` a silent no-op.
**Fix:** Wrap each seed in its own try/catch (log + continue), or use `Promise.allSettled([...])`.

## Info

### IN-01: Cancel buttons in PostForm/PageForm do nothing

**File:** `src/app/(admin)/dashboard/posts/PostForm.tsx:336-340`, `src/app/(admin)/dashboard/pages/PageForm.tsx:244-249`
**Issue:** Both forms render a Cancel button with no `onClick`/router navigation — a dead affordance that looks interactive.
**Fix:** Wire to `router.back()` / a fixed list URL, or remove until routing is decided.

### IN-02: `postSchema.status` is parsed but never consumed

**File:** `src/actions/posts-schema.ts:36` with `src/actions/posts.ts:106,123-154`
**Issue:** The schema accepts `status` (including `"published"`) from the client, but `savePost` never reads `data.status` — status changes funnel through `transitionPost` by design. A client sending `status: "published"` gets it silently ignored (correct outcome, misleading contract).
**Fix:** Drop `status` from the save schema (transitions own status), or strip it explicitly to document intent.

### IN-03: Unreachable localhost fallback in the SEO settings page

**File:** `src/app/(admin)/dashboard/settings/seo/page.tsx:58-64`
**Issue:** The `initial ? {...} : { canonicalBaseUrl: "http://localhost:3000", ... }` else-branch can never execute: `getSeoSettings` either returns a snapshot or throws (and the throw renders the `loadError` branch instead of the form). If it ever did run, it would pre-fill the admin form with `http://localhost:3000` for the canonical base — a footgun.
**Fix:** Delete the fallback branch (or make it render an error state).

### IN-04: `post_seo.slug` column is never written or read

**File:** `src/db/schema.ts:115` with `src/actions/posts.ts:178-222`
**Issue:** The schema carries `slug` on `post_seo` (per CLAUDE.md's reference shape) but `upsertPostSeo` never sets it and no reader uses it (`buildPostMetadata` uses `posts.slug`). Dead column.
**Fix:** Remove it in the next generated migration, or start writing it if a per-SEO-row slug is planned.

### IN-05: Round-trip iframe test cannot fail — asserts an evil iframe that was never in the input

**File:** `src/components/editor/__tests__/round-trip.test.ts:141-176`
**Issue:** The A5 test feeds a YouTube iframe, swallows any throw, then asserts `html` does not contain `<iframe src="https://evil.com"` — a string never present in the input. The test is vacuous (it passes even if generateHTML preserved the raw YouTube iframe unsanitized) and the `catch {}` hides real errors, giving false confidence in the "embeds are gated" claim.
**Fix:** Assert on the actual input: `expect(html).not.toContain("youtube.com/embed")` (documents the drop), and remove the blanket catch or fail on unexpected throws.

### IN-06: Sitemap draft/soft-delete "exclusion" tests are tautological

**File:** `src/lib/seo/__tests__/sitemap.test.ts:133-143`
**Issue:** The DB query (which performs the `status='published' AND deleted_at IS NULL` filter) is fully mocked to return only the two published fixtures, so `DRAFT_POST_SLUG`/`SOFT_DELETED_POST_SLUG` were never in the input — the tests cannot fail and don't exercise the exclusion they claim to prove (T-05-05).
**Fix:** Add the draft/soft-deleted rows to the mocked result and assert the sitemap filters them (or extract the filter into a pure helper and test that).

### IN-07: Redirects table accepts arbitrary `newPath`/`statusCode` values with no validation

**File:** `src/middleware.ts:120-133`, `src/app/not-found.tsx:93-99`, `src/db/schema.ts:197-207`
**Issue:** `new URL(match.newPath, request.url)` happily accepts an absolute URL (`https://evil.com`) — an external redirect from your domain (open redirect, admin-seeded only — no admin UI exists yet, v2 SETT-03). Likewise any `statusCode` other than 302 silently becomes 308 (e.g., a future 410 Gone row would permanent-redirect). Bounded impact today, but the v2 redirects manager will write these rows.
**Fix:** When the manager UI lands, validate `newPath` is a site-relative path (starts with `/`) and `statusCode` is one of 301/302 at write time (Zod, like every other action input).

---

_Reviewed: 2026-08-25T10:45:31Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
