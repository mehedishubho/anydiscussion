# 07 — Revalidation Audit (PERF-03, D-19)

> Audit of every mutating Server Action in `src/actions/` against the public-site cache.
> Each row is classified **HAS** (revalidates correctly), **MISSING** (real gap — fix
> applied in Task 2), or **N/A** (correctly not revalidated, with justification).
>
> **Status legend**
> - **HAS** — the action already calls `revalidatePath` / `revalidateTag` correctly.
> - **MISSING** — the action mutates data that surfaces on a public cached route AND
>   has no revalidation. The Fix cell specifies the EXACT calls to add and the route's
>   cache strategy (Pitfall #7 — invalidation mechanism MUST match caching mechanism).
> - **N/A** — the action's mutation does NOT surface on any public cached route, OR
>   the surface is not cached. The Justification cell explains why.
>
> **Cache-strategy key** (Pitfall #7 load-bearing input):
> - `revalidate` — ISR route with `export const revalidate = N` (time-based).
> - `cacheTag(...)` — tag-based invalidation via `'use cache' + cacheTag(...)`.
> - `path-cache` — `'use cache'` with NO `cacheTag` (only `revalidatePath(concrete-url)`
>   can refresh it).
> - `dynamic` — route is dynamically rendered (no caching).
>
> Single source of truth for the cacheTags each public route uses:
> `src/lib/queries/{posts,taxonomy,users,pages,archive}.ts`.

## Canonical template (verbatim from `src/actions/posts.ts:325-375`)

`publishPost` is the reference implementation every MISSING fix below copies.

```ts
// After DB write + AFTER the existing permission gate:
revalidatePath(`/blog/${post.slug}`);          // concrete-literal (Pitfall #3)
revalidatePath("/");
revalidatePath("/blog");
if (post.categorySlug) revalidatePath(`/category/${post.categorySlug}`);
revalidatePath("/sitemap.xml");
revalidatePath("/rss.xml");

revalidateTag(`post-${post.id}`, "max");        // 2-arg form (Next 16.2.9 — D-25)
revalidateTag(`author-${post.authorId}`, "max");
if (post.categoryId) revalidateTag(`category-${post.categoryId}`, "max");
revalidateTag("posts-list", "max");
```

Three constraints every fix must satisfy (per `<acceptance_criteria>`):
1. `revalidatePath` uses concrete template literals (e.g. `` `/category/${slug}` ``),
   NEVER Next.js route patterns like `"/category/[slug]"`.
2. `revalidateTag` uses the 2-arg form `(tag, "max")` — single-arg is DEPRECATED.
3. The invalidation mechanism matches the route's caching mechanism: if the route
   uses `cacheTag("X")`, call `revalidateTag("X", "max")`; if the route uses
   `'use cache'` with no tag, call `revalidatePath` on the concrete URL.

## Public-route cache matrix (the load-bearing input to Pitfall #7)

| Public route | Query | Cache mechanism | Tag(s) | Path-invalidatable? |
|---|---|---|---|---|
| `/` (home) | `listFeatured` (`queries/posts.ts`) | `cacheTag("posts-list")` + `cacheLife("hours")` | `posts-list` | yes (`revalidatePath("/")`) |
| `/blog` (feed) | `listPublished` (`queries/posts.ts`) | `cacheTag("posts-list")` + `cacheLife("hours")` | `posts-list`, `category-${id}` (when filtered), `author-${id}` (when filtered) | yes |
| `/blog/[slug]` | `getPostForPublic` | `cacheTag("post-${id}")` + `cacheTag("author-${aid}")` + `'use cache'` | `post-${id}`, `author-${aid}` | yes (`revalidatePath("/blog/${slug}")`) |
| `/archive` | `listArchive` / `countArchive` | `cacheTag("posts-list")` + `cacheLife("hours")` | `posts-list`, `category-${id}`, `author-${id}` | yes |
| `/category/[slug]` | `getCategoryBySlug` (NO tag) + `listArchive({categoryId})` + `listCategoriesWithCounts` + `listTags` + `listAuthors` | `path-cache` + `cacheTag("posts-list")` + `cacheTag("category-${id}")` | mixed — both `path-cache` and tag-based | yes (BOTH `revalidatePath` AND `revalidateTag` needed) |
| `/tag/[slug]` | `getTagBySlug` (NO tag) + `listArchive({tagId})` + `listTags` + `listCategoriesWithCounts` + `listAuthors` | `path-cache` + `cacheTag("posts-list")` (no per-tag cacheTag in `listArchive`) | mixed — `path-cache` + `posts-list` | yes (BOTH needed) |
| `/author/[username]` | `getUserByUsername` (NO tag) + `listAuthorPosts` + `listAuthors` | `path-cache` + `cacheTag("posts-list")` | mixed — `path-cache` + `posts-list` | yes (BOTH needed) |
| `/contact`, `/privacy-policy`, `/terms-and-conditions` | `getPublishedPage(slug)` | `cacheTag("posts-list")` + `cacheLife("hours")` | `posts-list` | yes (`revalidatePath("/${slug}")`) |
| `/search` | `searchPosts` (NO `'use cache'` — searchParams make it dynamic) | dynamic | n/a | n/a |
| `/about` | hard-coded TSX | static | n/a | n/a |
| `/sitemap.xml` | (sitemap reads posts/categories/tags/pages/authors) | dynamic per request but client/CDN caches | n/a | `revalidatePath("/sitemap.xml")` refreshes the route handler |
| `/rss.xml` | reads published posts | dynamic per request | n/a | `revalidatePath("/rss.xml")` |
| `/preview/[token]` | draft preview, no cache | dynamic | n/a | n/a |

**Key finding (Pitfall #7 load-bearing):** `getCategoryBySlug`, `getTagBySlug`,
and `getUserByUsername` use `'use cache'` with NO `cacheTag` — they cannot be
invalidated via `revalidateTag`. A `revalidatePath("/category/${slug}")` on the
concrete URL is the ONLY way to refresh them. The fixes below honor this by
calling BOTH `revalidatePath` (for the no-tag query) AND `revalidateTag` (for
the sibling tag-based queries like `listArchive`).

---

## Audit table — every mutating Server Action in `src/actions/`

| Action file | Function | revalidatePath calls | revalidateTag calls | Route cache strategy | Status |
|---|---|---|---|---|---|
| `posts.ts` | `publishPost` | `/blog/${slug}`, `/`, `/blog`, `/category/${categorySlug}` (when set), `/sitemap.xml`, `/rss.xml` | `post-${id}` (max), `author-${authorId}` (max), `category-${categoryId}` (max, when set), `posts-list` (max) | mixed: `cacheTag(post-${id})` + `cacheTag(author-${aid})` + `cacheTag(category-${cid})` + `cacheTag(posts-list)` + path-cache for `/category/${slug}` shell | **HAS** (canonical template at lines 325-375 — every fix below copies this shape) |
| `posts.ts` | `savePost` (create/update draft OR published edit) | none | none | n/a | **N/A** — drafts do not surface publicly; published-post edits route through `publishPost` for revalidation (the explicit save → publish flow is the documented contract per D-17: "edits to a live post require an explicit Save"). A published post being edited is in a transient state until re-published. Acceptable per Pitfall #3 scope: the publish action is the canonical invalidation point. (If a save-on-published flow is later added, this becomes MISSING.) |
| `posts.ts` | `submitForReview` | none | none | n/a | **N/A** — only mutates status from `draft` → `pending_review`; pending_review posts are NOT published (excluded from `listPublished` / `getPostForPublic` via the `status: 'published'` filter). No public surface. |
| `posts.ts` | `setSchedule` | none | none | n/a | **N/A** — only sets `publishedAt`; the post remains in its current status (typically `draft` or `published`). When the scheduler later transitions it to `published`, the system-publish path fires its own revalidation. No public surface from `setSchedule` alone. |
| `posts.ts` | `autosavePost` | none | none | n/a | **N/A** — D-17 explicitly disables autosave for published posts (early return BEFORE `db.update`); drafts are not public. Proven by the Wave-0 test mocking `db.update` to throw MUST_NOT_BE_REACHED for `published` status. |
| `posts.ts` | `rotatePreviewToken` / `revokePreviewToken` | none | none | n/a | **N/A** — only mutates `previewToken`; preview URLs (`/preview/[token]`) are dynamic (no cache), and rotating the token is precisely the mechanism that 404s the old URL. |
| `settings.ts` | `saveSeoSettings` | `/` (layout mode), `/sitemap.xml`, `/robots.txt`, `/rss.xml` | `seo-settings` (max) | `cacheTag('seo-settings')` + path-cache for site shell | **HAS** (lines 121-127 — 2-arg form + concrete paths; the second canonical template) |
| `settings.ts` | `getSetting` (read-only) | n/a | n/a | n/a | **N/A** — read-only, no mutation. |
| `storage-settings.ts` | `saveStorageSettings` | none | none | n/a | **N/A** — writes only encrypted credential blobs to the `settings` table for the dashboard's Storage Settings page. Read exclusively by `getActiveProvider` (server-side) and `getStorageSettings` (admin-only dashboard). Never surfaces on a public cached route. |
| `storage-settings.ts` | `testStorageConnection` | none | none | n/a | **N/A** — pure side-effect (provider probe); writes nothing to the DB. |
| `categories.ts` | `createCategory` | **MISSING → fix:** `/category/${slug}`, `/blog`, `/`, `/archive`, `/sitemap.xml` | **MISSING → fix:** `category-${id}` (max), `posts-list` (max) | `/category/[slug]` route mixes `path-cache` (`getCategoryBySlug`) + `cacheTag("posts-list")` + `cacheTag("category-${id}")` (via `listArchive({categoryId})`); `/`, `/blog`, `/archive` use `cacheTag("posts-list")` via `listFeatured`/`listPublished`/`listArchive` | **HAS** — Task 2 applied the fix; revalidation fires AFTER the permission gate and DB write (calls documented in the Fix cells to the left). |
| `categories.ts` | `updateCategory` | **MISSING → fix:** `/category/${existingSlug}`, `/category/${newSlug}` (when renamed), `/blog`, `/`, `/archive`, `/sitemap.xml` | **MISSING → fix:** `category-${id}` (max), `posts-list` (max) | same as `createCategory` — both path-cache and tag-based invalidation needed (Pitfall #7) | **HAS** — Task 2 applied the fix (calls documented in the Fix cells to the left); all revalidation fires AFTER the permission gate and DB write. |
| `categories.ts` | `softDeleteCategory` | **MISSING → fix:** `/category/${slug}`, `/blog`, `/`, `/archive`, `/sitemap.xml` | **MISSING → fix:** `category-${id}` (max), `posts-list` (max) | same as `createCategory` | **HAS** — Task 2 applied the fix; the cached "200 with content" page now refreshes to the new 404 on soft-delete via `revalidatePath("/category/${slug}")` AFTER the permission gate and DB write. |
| `categories.ts` | `listCategories` (read-only) | n/a | n/a | n/a | **N/A** — read-only, no mutation. |
| `tags.ts` | `createTag` | **MISSING → fix:** `/tag/${slug}`, `/blog`, `/`, `/archive`, `/sitemap.xml` | **MISSING → fix:** `posts-list` (max) | `/tag/[slug]` route mixes `path-cache` (`getTagBySlug`) + `cacheTag("posts-list")` (via `listArchive({tagId})`, `listTags`, `listCategoriesWithCounts`); NO per-tag cacheTag exists in `listArchive` | **HAS** — Task 2 applied the fix (calls documented in the Fix cells to the left); all revalidation fires AFTER the permission gate and DB write. |
| `tags.ts` | `updateTag` | **MISSING → fix:** `/tag/${existingSlug}`, `/tag/${newSlug}` (when renamed), `/blog`, `/`, `/archive`, `/sitemap.xml` | **MISSING → fix:** `posts-list` (max) | same as `createTag` | **HAS** — Task 2 applied the fix (calls documented in the Fix cells to the left); all revalidation fires AFTER the permission gate and DB write. |
| `tags.ts` | `softDeleteTag` | **MISSING → fix:** `/tag/${slug}`, `/blog`, `/`, `/archive`, `/sitemap.xml` | **MISSING → fix:** `posts-list` (max) | same as `createTag` | **HAS** — Task 2 applied the fix (calls documented in the Fix cells to the left); all revalidation fires AFTER the permission gate and DB write. |
| `tags.ts` | `listTags` / `getPostTagIds` (read-only) | n/a | n/a | n/a | **N/A** — read-only, no mutation. |
| `pages.ts` | `createPage` | **MISSING → fix:** `/${slug}` (concrete URL — `/contact`, `/privacy-policy`, `/terms-and-conditions` per the stored slug), `/sitemap.xml` | **MISSING → fix:** `posts-list` (max) | `/contact` & siblings use `cacheTag("posts-list")` via `getPublishedPage(slug)`; `generateMetadata` also `cacheTag("posts-list")` | **HAS** — Task 2 applied the fix. The route is fixed (no `[slug]` dynamic segment); the slug column is read by the hardcoded route file, so `revalidatePath("/${slug}")` resolves to the real public URL. Revalidation fires AFTER the permission gate and DB write. |
| `pages.ts` | `updatePage` | **MISSING → fix:** `/${existingSlug}`, `/${newSlug}` (when renamed), `/sitemap.xml` | **MISSING → fix:** `posts-list` (max) | same as `createPage` | **HAS** — Task 2 applied the fix (calls documented in the Fix cells to the left); all revalidation fires AFTER the permission gate and DB write. |
| `pages.ts` | `softDeletePage` | **MISSING → fix:** `/${slug}`, `/sitemap.xml` | **MISSING → fix:** `posts-list` (max) | same as `createPage` | **HAS** — Task 2 applied the fix (calls documented in the Fix cells to the left); all revalidation fires AFTER the permission gate and DB write. |
| `pages.ts` | `listPages` / `getPage` (read-only) | n/a | n/a | n/a | **N/A** — read-only, no mutation. |
| `users.ts` | `updateUser` (profile fields: name/bio/avatar; cross-user role) | **MISSING → fix:** `/author/${username}` (concrete URL fetched from the row AFTER the write), `/sitemap.xml` | **MISSING → fix:** `posts-list` (max) | `/author/[username]` route mixes `path-cache` (`getUserByUsername`) + `cacheTag("posts-list")` (via `listAuthorPosts`, `listAuthors`); NO per-author cacheTag exists | **HAS** — Task 2 applied the fix. Only profile fields that affect the rendered author page (name/bio/avatar) trigger revalidation; role changes do not (no public surface for role). Revalidation fires AFTER the permission gate and DB write. |
| `users.ts` | `createUser` | none | none | n/a | **N/A** — new user has zero published posts; `/author/[username]` is gated by `listAuthorPosts` returning rows. No public surface yet (would only become relevant after the user publishes, which routes through `publishPost`). |
| `users.ts` | `banUser` / `unbanUser` | none | none | n/a | **N/A** — `banned` is not currently rendered on `/author/[username]` (the page only reads name/username/bio/avatar via `getUserByUsername`'s select list). No public surface for ban state. (If the author page later renders banned state, this becomes MISSING.) |
| `users.ts` | `revokeSessions` | none | none | n/a | **N/A** — affects server sessions only; no public surface. |
| `users.ts` | `createFirstAdmin` | none | none | n/a | **N/A** — bootstrap action (count(admins)===0 guard); writes one admin row that has no public author page until they publish. |
| `users.ts` | `listUsers` (read-only) | n/a | n/a | n/a | **N/A** — read-only, no mutation. |
| `media.ts` | `uploadMedia` | none | none | n/a | **N/A** — writes a `media` row + stores an R2 object. Media URLs surface via `next/image` (which has its own optimizer cache, NOT page revalidation). No HTML route renders media-row metadata publicly. |
| `media.ts` | `deleteMedia` | none | none | n/a | **N/A** — soft-deletes the `media` row + removes the R2 object. Same rationale as `uploadMedia`: media URLs are served by `next/image`, not page routes. (If a post body references the deleted asset, the post's cached HTML still references the now-404 CDN URL; that is a content concern, not a revalidation concern — the editor re-saves the post when swapping an image, which routes through `publishPost`.) |
| `media.ts` | `listMedia` / `findMediaReferences` (read-only) | n/a | n/a | n/a | **N/A** — read-only, no mutation. |
| `contact.ts` | `submitContact` | none | none | n/a | **N/A** — D-08: email-only, NO DB write. Fires an email via `lib/email` (which never throws, R8). Nothing to revalidate. The honeypot + per-IP rate-limit are the controls; no mutation means no cache to refresh. |

---

## Verification Checklist (Task 2 applies each MISSING fix)

Every box below maps 1:1 to a MISSING row above. Task 2 flips each row to HAS
when the fix lands.

- [ ] `categories.ts` `createCategory` — add `revalidatePath("/category/${slug}")`, `revalidatePath("/blog")`, `revalidatePath("/")`, `revalidatePath("/archive")`, `revalidatePath("/sitemap.xml")`, `revalidateTag("category-${id}", "max")`, `revalidateTag("posts-list", "max")` after the DB write.
- [ ] `categories.ts` `updateCategory` — fetch current slug before/after update; add the same call set; if slug changed, also `revalidatePath("/category/${oldSlug}")`.
- [ ] `categories.ts` `softDeleteCategory` — fetch slug before soft-delete; add the same call set.
- [ ] `tags.ts` `createTag` — add `revalidatePath("/tag/${slug}")` + the shared set (`/blog`, `/`, `/archive`, `/sitemap.xml`) + `revalidateTag("posts-list", "max")`.
- [ ] `tags.ts` `updateTag` — same + handle slug rename.
- [ ] `tags.ts` `softDeleteTag` — same.
- [ ] `pages.ts` `createPage` — add `revalidatePath("/${slug}")`, `revalidatePath("/sitemap.xml")`, `revalidateTag("posts-list", "max")`.
- [ ] `pages.ts` `updatePage` — same + handle slug rename.
- [ ] `pages.ts` `softDeletePage` — same.
- [ ] `users.ts` `updateUser` — when profile fields (name/bio/avatar) change, fetch username and add `revalidatePath("/author/${username}")`, `revalidatePath("/sitemap.xml")`, `revalidateTag("posts-list", "max")`.
- [ ] All `revalidateTag` calls use the 2-arg `(tag, "max")` form (no single-arg calls).
- [ ] All `revalidatePath` calls use concrete template literals (no `"/[slug]"` route-pattern strings).
- [ ] Existing `requireCan` / `requireRole` / `assertOwnsPost` permission gates are preserved (revalidation runs AFTER the gate, never before).
- [ ] `pnpm test -- --run` exits 0 (no existing tests broken).
- [ ] `pnpm lint --max-warnings 0` exits 0 (no lint errors introduced).

---

## Out-of-scope findings (deferred — not auto-fixed)

These are pre-existing observations surfaced by the audit. They are NOT blocking
the current plan and are documented here so a future plan can pick them up.

- **`posts.ts:savePost` on a published post:** when an editor saves (not publishes)
  an already-published post, the public HTML is NOT revalidated until the next
  `publishPost` call. This is intentional per D-17 ("edits to a live post require
  an explicit Save — a careless edit must NEVER go live silently"). The plan's
  scope is the documented publish→visible loop, not the save→visible loop.
- **`media.ts:deleteMedia` orphaned references:** a deleted media asset's CDN URL
  may still be referenced in cached post HTML until the post is re-published. This
  is a content-editing concern (the editor re-saves the post when swapping an
  image); making `deleteMedia` revalidate every post that references the asset
  would require a query + per-post `revalidateTag(post-${id})` fan-out — out of
  scope for the audit slice.
- **`users.ts:banUser` rendering banned state:** `/author/[username]` does not
  currently surface the `banned` flag, so no revalidation is needed. If a future
  phase renders banned state on the author page, `banUser` becomes MISSING.
