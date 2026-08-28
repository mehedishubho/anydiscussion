# Quick Task 260827-se8: Dashboard Functional Gaps — Research

**Researched:** 2026-08-27
**Domain:** Dashboard list filtering/pagination (Next 16 App Router + Drizzle), header global search + notifications, storage settings form
**Confidence:** HIGH (all claims verified by direct codebase reads or installed next@16.3.3 docs; no new packages)

<user_constraints>
## User Constraints (from 260827-se8-CONTEXT.md)

### Locked Decisions
- **Header search** — Global dropdown: grouped live results (Posts, Users, Categories, Tags) rendered as the admin types; clicking a result opens that entity's edit page. Works across all dashboard pages.
- **Notifications** — Content events: author submits for review → notifies editors/admins; publish/return-for-revision → notifies the author; new subscriber → notifies admins. Requires a notifications DB table + bell UI with unread count in the dashboard header.
- **List page mechanics** — Server-side URL-driven: filters/search/page number live in the URL (searchParams → Drizzle WHERE + count + limit/offset), deep-linkable, back-button correct. Client components only write the URL; the Server Component re-queries. Applies to posts, categories, media, and users list pages.
- **Storage page** — All providers visible: show all four provider config sections (local / R2 / Cloudinary / Push CDN, per src/lib/storage/) simultaneously, active provider highlighted — configure several without flipping the selector. (Backend already supports all 4; the form currently renders only the active section.)

### Claude's Discretion
- Page size for lists (suggest 20/page), debounce timing for the header-search dropdown, per-page filter fields (posts: status/category/author; users: role/ban/verified state; media: kind; categories: search only), pagination control styling (TailAdmin), and the notifications table shape/migration specifics — all following existing conventions (Drizzle generate, Zod, Server Actions, permission checks first).
- Whether categories/tags need pagination vs. simple search (row counts are typically small) — implement consistently anyway.

### Deferred Ideas (OUT OF SCOPE)
- None listed in CONTEXT.md.
</user_constraints>

## Summary

All four list pages are already Server Components that call permission-checked `list*` Server Actions and already carry `export const instant = false` — adding URL-driven filtering means extending the existing actions with WHERE/count/limit-offset and teaching the pages to `await searchParams` (a Promise in Next 16, same shape the public `/search` page already uses). The header is a client component (`AppHeader.tsx`) whose search input (with ⌘K focus handling) and notification bell are pure TailAdmin demo markup — both become functional by mounting client islands that call new session-gated Server Actions; the identity prop chain from 260827-869 stays untouched. The storage change is genuinely form-only: the Zod schema, save action, per-provider test-connection, and boot registration already handle all four providers; only `StorageSettingsForm.tsx`'s conditional rendering needs to flip to render-all-with-highlight.

The one functional gap the CONTEXT implies but the codebase lacks: **no "return for revision" action exists**. `TRANSITIONS` allows editor/admin `pending_review → draft` (`src/lib/permissions/post-transitions.ts:30-37`) but no Server Action wraps that path, so wiring the "return-for-revision → notify author" event requires a small new action (plus a PostRowActions button). Fan-out notification inserts must follow the established swallowed-error pattern (awaited `try/catch` + log, as in `createUser`'s verification-email send) — never fail the parent mutation.

**Primary recommendation:** Extend `listPosts`/`listUsers`/`listCategories`/`listMedia` in place (permission check still first), reuse the public site's `parseSearch` coercion helpers and `buildPageHref` filter-preserving `?page=N` logic, use plain `ILIKE` (not PG FTS) for admin search, and drive the bell + search dropdown from TanStack Query actions rather than extending the AuthGate prop chain.

## Current State Map (verified)

### List pages — how rows load today

| Page | Loader | Current query | instant export |
|---|---|---|---|
| `src/app/(admin)/dashboard/posts/page.tsx` | `listPosts()` (L49) | `db.select().from(posts).limit(50)` — opts `{status, authorId, limit}` accepted but **ignored** (`src/actions/posts.ts:252-258`) | `instant = false` (L31) |
| `.../users/page.tsx` | `listUsers()` (L65) | full-table select, no filters/order (`src/actions/users.ts:258-279`) | L42 |
| `.../categories/page.tsx` | `listCategories()` (L33) | `deletedAt IS NULL`, name asc (`src/actions/categories.ts:74-84`) | L27 |
| `.../media/page.tsx` | `listMedia({limit:100})` (L33) | already has `limit/offset/mimeType` exact-eq (`src/actions/media.ts:122-140`; `mediaListSchema` caps limit at 100, `src/actions/media-schema.ts:35-39`) | L27 |

Page shells: posts renders its table inline (server rows + `PostRowActions` client cells); users/categories/media pass rows as props to client tables (`UsersTable`/`CategoriesTable`/`MediaGrid`) which own optimistic mutations via TanStack Query `["posts"]`-style invalidation. All four catch load errors into a friendly banner — keep that shape.

### Header — what exists

- `src/layout/AppHeader.tsx` is `"use client"` (L1), receives `user: HeaderUser` (260827-869 chain: `(admin)/layout.tsx` AuthGate L69-75 → `AdminShell.tsx` L73 → AppHeader L162 → UserDropdown).
- Search: static `<form>` with input + `⌘K` focus handler (`AppHeader.tsx:31-44, 113-146`) — no submit behavior, no results UI. The click target for a dropdown mounts right here.
- Bell: `src/components/header/NotificationDropdown.tsx` — hardcoded demo users, `useState(false)` "notifying" dot, "View All Notifications" links to `/` (L375-380). Props-free; to be replaced/rewired.
- `QueryProvider` is already mounted inside `AdminShell` (AdminShell.tsx L76) — TanStack Query is available to any header island on every dashboard page.

### Notification event sources (existing actions to hook)

| Event | Hook point | Recipients |
|---|---|---|
| Submit for review | `submitForReview` — `src/actions/posts.ts:265-269` (funnels via `transitionPost`) | all editors + admins, excluding the actor |
| Publish | `publishPost` — `src/actions/posts.ts:330-380` | the post's `authorId`, excluding the actor |
| Return for revision | **ACTION DOES NOT EXIST** — `TRANSITIONS` permits editor/admin `pending_review→draft` (`post-transitions.ts:30-37`) but nothing wraps it | the post's `authorId` |
| New subscriber | `subscribeNewsletter` — `src/actions/newsletter.ts:164-226` (D-01 `onConflictDoUpdate` upsert) | all admins |

### Storage — backend already 4-provider

- `StorageSettingsForm.tsx:168-255` renders exactly one section via `{activeProvider === X && ...}`; `watch("activeProvider")` (L94) already tracks the selector.
- Schema + actions fully support all four: `PROVIDER_NAMES = ["local","r2","cloudinary","push-cdn"]` (`src/actions/storage-settings-schema.ts:21-26`); `saveStorageSettings` persists **every** section whose secrets are non-empty (empty = "no change", Pitfall 7); `testStorageConnection(provider, creds)` probes any provider; `getStorageSettings` returns redacted values for all. All four providers registered at boot (`src/instrumentation.ts:79-80`).

## Key Technical Findings

### 1. Next 16 searchParams — Promise, await it [VERIFIED: installed next@16.3.3 docs]

`node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md:256-263`:

```tsx
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = (await searchParams).filters
}
```

In-repo precedent: `src/app/(site)/search/page.tsx:120-144` — same type, awaited, then parsed.

### 2. `instant = false` convention is already satisfied — no `connection()` needed [VERIFIED]

All four list pages + the storage page already export `instant = false` (260826-oif). Per the installed route-segment-config doc (`.../02-route-segment-config/instant.md:66-88`), `false` = allowed-to-block + opts the route out of validation; the layout-level `false` covers the static-shell check for descendants. Adding `await searchParams` at the top of the page component **is itself a dynamic access** — it postpones the prerender and does not introduce the 260826-pqg `blocking-prerender-current-time` class (that bug was `new Date()` running *before* any dynamic access inside AuthGate, already fixed with `await connection()` at `(admin)/layout.tsx:52`). Do not add `connection()` to the list pages.

### 3. Reuse these two public-site assets verbatim [VERIFIED]

- **parseSearch coercion helpers** — `src/app/(site)/search/page.tsx:41-95`: `firstValue` (string|string[]→string), `bounded` (trim + length-cap), `clampPage` (≥1, ≤1000 — bounds prevent offset abuse). Copy or extract to a shared dashboard helper; the manual (non-Zod) parsing is the established V5/V8 input-validation pattern with rationale documented in-file.
- **`buildPageHref(n, basePath, searchParams)`** — `src/components/site/Pagination.tsx:31-56`, exported and unit-tested: builds `?page=N` while preserving all other filter params. Pure function — import from either side of the tree.

For the visible control, TailAdmin's own `src/components/tables/Pagination.tsx` exists (callback-based `onPageChange`, TailAdmin chip styling, currently unused) — wrap it in a tiny client component whose `onPageChange` does `router.push(buildPageHref(n, basePath, currentParams))`. That satisfies the "TailAdmin styling" discretion while keeping URLs authoritative. Alternative: render the site `Pagination` (Link-based) directly — server-rendered links, zero client JS; both are correct, pick one and apply to all four pages.

### 4. Admin search: ILIKE, not PG FTS [VERIFIED + RECOMMENDATION]

`posts.searchVector` FTS exists (`src/db/schema.ts:101-108`, GIN-indexed) but `searchPosts` filters `status = 'published'` (`src/lib/queries/posts.ts:338`) — wrong for the dashboard, where drafts/pending must be findable, and it only covers posts (not users/categories/tags/media). Admin tables are small. Use Drizzle `ilike()` — **verified exported by installed drizzle-orm 0.45.2** (alongside `count`, `or`, `and`):

- posts: `ilike(posts.title, '%q%')` (optionally `or` slug)
- users: `or(ilike(user.name, …), ilike(user.email, …))`
- categories/tags: `ilike(name, …)`
- media: `or(ilike(media.altText, …), ilike(media.providerKey, …))`

All search values flow through parameterized Drizzle templates (same as `searchPosts` L334 — no string concat).

### 5. Header search island — mount + data flow [RECOMMENDATION]

- Keep AppHeader's input; replace the inert `<form>` with a controlled input + absolutely-positioned results dropdown (the `Dropdown` primitive in `src/components/ui/dropdown/` is available, but a bespoke panel is fine — grouped sections don't fit `DropdownItem` semantics well).
- New action `src/actions/search.ts` → `globalSearch(q: string)`: `getSessionOrThrow()` FIRST; posts leg visible per `post:read` (authors get their own scoping later — see A3), users leg only when `session.user.role === "admin"` (mirrors `listUsers`' admin-only `requireCan({user:["read"]})`; deriving from the session, never client input); categories/tags open (matches `listCategories`' ungated dashboard read). Cap each group at ~5, `q` length-bounded (reuse `bounded(q, 100)`), minimum 2 chars client-side.
- Fetch via TanStack `useQuery({ queryKey: ["global-search", q] })` with ~300ms debounce (discretion) — QueryProvider is already in scope; keyed queries naturally discard stale responses.
- Click-through targets (verified routes): posts → `/dashboard/posts/${id}/edit`; **users/categories/tags have no per-entity edit route** (CRUD lives in client tables with drawers) → link to their list page with `?q=<identifying value>` prefilled — a free synergy with the new URL-driven search. Media group is not in the CONTEXT's locked grouping — skip it.

### 6. Notifications — table, fan-out, UI [RECOMMENDATION]

**Table** (Claude's discretion per CONTEXT; follows existing schema conventions — serial PK, text FK to `user.id`, pgEnum-or-text type, jsonb payload, soft-delete NOT needed):

```
notifications: id serial PK, userId text NOT NULL REFERENCES user.id (cascade),
  type text, payload jsonb (postId/postTitle/subscriberEmail…), 
  readAt timestamp (NULL = unread), createdAt timestamp defaultNow
  + index on (userId, readAt)   — mirrors session_userId_idx pattern (schema.ts:290)
```

Generate via `pnpm db:generate` (drizzle-kit) — never hand-write. Adding a table to `db/schema.ts` triggers one migration; `generate` itself needs no live DB.

**Fan-out writes must never fail the parent mutation.** Established pattern (02-03 / `createUser` verification-email, `src/actions/users.ts:138-154` with the L143-146 rationale): **awaited `try/catch` + `log.error`, swallow after logging**. Do NOT use `void insert()` fire-and-forget inside Server Actions — the in-file comment explains it makes the catch dead code plus an unhandled rejection in the Server Action runtime. Extract a private `notify(userIds, type, payload)` helper per action file (or one shared `src/lib/notifications.ts` server module) that does the loop + try/catch.

**Subscriber event dedupe**: `subscribeNewsletter` is an iddo upsert (D-01) — re-subscribes are indistinguishable from first subscribes. Cheapest reliable gate: a pre-read `select status where email` before the upsert; only notify when no active row existed. A tiny race is acceptable — notifications are non-authoritative display data. [ASSUMED — planner may simplify to "notify on every successful upsert"; rate limiter (5/hr/IP) already bounds volume.]

**Bell UI**: do NOT thread an unread count through the AuthGate prop chain (the layout doesn't re-render on sibling page navigations, so it would go stale until `router.refresh()`). Instead the bell is a self-contained client island: `useQuery(["notifications-unread"])` → `countUnreadNotifications()` action (session-scoped: `where userId = session.user.id and readAt is null`), `refetchOnWindowFocus` + a modest `refetchInterval` (e.g. 60s, discretion). Open → render `listNotifications(page)` + fire `markNotificationsRead()` (update `readAt = now()` where own + unread) then invalidate the query. Both actions: `getSessionOrThrow()` first, **filter by `session.user.id` — never accept a userId parameter** (users.ts T-Q-869-01 self-service precedent).

### 7. Return-for-revision action is missing [VERIFIED gap]

To deliver "publish/return-for-revision → notifies the author" the task must add e.g. `returnForReview(postId)` in `src/actions/posts.ts`: `assertOwnsPost(postId)` FIRST (editor/admin bypass) → `transitionPost(postId, "draft")` (TRANSITIONS already legalizes `pending_review→draft` for editor/admin) → notify `authorId` (unless actor) → revalidate like `publishPost` does (concrete paths + 2-arg `revalidateTag`, template at posts.ts:356-373). UI: an editor/admin "Return" button in `PostRowActions` for `status === "pending_review"` (same non-optimistic mutation + toast + invalidate pattern, `PostRowActions.tsx:29-49`).

### 8. List-page extension shape [RECOMMENDATION]

One uniform pattern for all four pages:

```tsx
// page.tsx (Server Component) — instant=false already present
const sp = await searchParams;                      // Promise (Finding 1)
const f = parseListFilters(sp);                     // Finding 3 helpers: bounded/clampPage/firstValue
const [rows, total] = await Promise.all([           // countSubscribers shape (newsletter.ts:272-279)
  listPosts({ q: f.q, status: f.status, categoryId: f.category, page: f.page, pageSize: 20 }),
  countPosts({ ...f }),                             // sql<number>`count(*)` over the same WHERE
]);
```

- Actions keep permission check FIRST, then Zod-parse opts (extend the per-feature schema, e.g. `mediaListSchema` gains `q`/`kind`; `kind` = mimeType prefix — use `like(media.mimeType, 'image/%')` since the column stores full types).
- Filter bar = small client component receiving current values as **props** (avoids `useSearchParams` CSR-bailout concerns entirely) writing URLs via `router.push` (reset `page` to 1 on any filter change; debounce `q` ~300ms — discretion). Server re-queries; client tables keep receiving fresh rows as props and their optimistic mutations are unaffected.
- Page size 20 everywhere (CONTEXT suggestion; `mediaListSchema`'s limit cap of 100 comfortably admits it).
- Filters per CONTEXT discretion: posts `q`/status/category/author (author dropdown editor-admin-only — it needs a user list; a free-text author input is acceptable v1); users `q`/role/banned/verified; media `q`/kind; categories `q` only.
- `clampPage` upper bound + `totalPages = max(1, ceil(total/20))` prevents offset abuse; count runs once per URL change (never per keystroke — debounced URL writes already ensure this).

### 9. Storage form — the actual change [VERIFIED form-only]

In `StorageSettingsForm.tsx`: replace the four `{activeProvider === X && (...)}` blocks (L169-255) with all four sections rendered unconditionally; add an "Active" badge / `border-brand-500` ring on the section whose provider matches `watch("activeProvider")`. Everything else stays: selector semantics (uploads route through selected provider), secret fields still default `""` and never pre-filled (Pitfall 7), per-section Test connection buttons already work for any provider, `saveStorageSettings` already persists every non-empty section. No schema, action, registry, or migration change. Existing tests (`src/actions/__tests__/storage-settings.test.ts`) cover the action layer; add a render test asserting all four sections mount.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Filter-preserving page URLs | Custom querystring builder | `buildPageHref` (`components/site/Pagination.tsx:31`) | Already handles array values, page replacement, unit-tested |
| searchParams coercion | Ad-hoc `Number(...)` parsing | `firstValue`/`bounded`/`clampPage` pattern (`(site)/search/page.tsx:41-95`) | Handles `string[]` tampering, length caps, offset abuse |
| Count queries | `rows.length` on full select | `sql<number>`count(*)`` shape (`newsletter.ts:272-279`, `queries/posts.ts:190`) | Counts without materializing rows |
| Debounced async search state | `setTimeout` + AbortController plumbing | TanStack `useQuery` keyed by `q` | Stale-response discard for free; provider already mounted |

## Common Pitfalls

1. **Forgetting `await searchParams`** — it's a Promise in Next 16; destructuring it directly yields garbage/empty filters. Copy the `(site)/search/page.tsx` prop type verbatim.
2. **Permission check drift** — every extended/new action keeps `requireCan`/`requireRole`/`getSessionOrThrow` as the literal first statement (Pitfall #1; proven by MUST_NOT_BE_REACHED tests). New read actions for notifications/globalSearch are session-scoped by `session.user.id` — never a parameter.
3. **Breaking `instant = false`** — new top-level awaits are fine on pages that already export it; do NOT remove the export, do NOT add `connection()` (Finding 2), and any NEW page created (none expected) must carry the export per 260826-oif.
4. **Notification insert failing the parent mutation** — swallowed-error awaited try/catch (Finding 6); `void`-style fire-and-forget is explicitly rejected in-codebase for Server Actions.
5. **`revalidateTag` single-arg** — any revalidation added (returnForReview) must use the 2-arg form `revalidateTag(tag, "max")` with concrete literal paths (posts.ts:356-373 template).
6. **Actors notifying themselves** — every fan-out excludes `session.user.id` (self-publish, self-submit).
7. **Count per keystroke** — debounce writes the URL; count runs per URL change only.
8. **`useSearchParams` in client components during prerender** — pass filter values as props from the page instead; the pages are dynamic anyway but props sidestep the CSR bailout class entirely.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Subscriber "first-time" detection via pre-read of `subscribers.status` is acceptable (tiny race tolerable for display-only data) | Finding 6 | Duplicate admin notifications on rapid re-subscribes — cosmetic |
| A2 | Bell freshness via `refetchInterval`/`refetchOnWindowFocus` is acceptable (no push/websocket) | Finding 6 | Count lags up to the interval — cosmetic |
| A3 | `listPosts` currently does NOT scope authors to own posts despite its docblock (verified: select-all at posts.ts:256); globalSearch posts leg inherits this — author-scoping is out of task scope | Finding 5 | Authors see other authors' post titles in search — matches current dashboard behavior, no regression |
| A4 | 300ms debounce + 2-char minimum for header search (discretion) | Finding 5 | None — tunable |

## Open Questions

1. **Author filter widget on /dashboard/posts** — needs a user list to populate a dropdown (another admin-gated read). Free-text input vs dropdown is planner's choice; free-text is the low-risk default.
2. **"View all notifications" landing** — CONTEXT locks the bell dropdown; a full notifications page is not requested. The dropdown's footer link can be dropped or point at the dropdown itself — recommend dropping it (no page exists).

## Validation Architecture

- **Framework:** vitest (`pnpm test` = `vitest run`; config `vitest.config.ts`; 676 tests currently green). Tests colocated in `src/**/__tests__/`.
- **New tests to write (Wave 0):** `globalSearch` permission gating (non-admin → empty users leg, MUST_NOT_BE_REACHED for the user select), notification fan-out actor-exclusion + swallow-on-insert-failure, `markNotificationsRead` session scoping, extended `list*` filter/limit/offset SQL shape (mock-db pattern per existing action tests), storage form renders all four sections.
- **Manual-only:** bell dropdown UX, ⌘K focus, dropdown click-throughs — owner UAT step (dev server convention per 260826-pqg).

## Migration Note

One `drizzle-kit generate` run after adding `notifications` to `src/db/schema.ts` (`pnpm db:generate` — offline). Applying to the dev DB is the usual local step; no other schema changes anywhere in this task (media `q/kind` are action-level Zod additions, not columns).

## Sources

### Primary (HIGH confidence — read this session)
- `src/app/(admin)/dashboard/{posts,users,categories,media}/page.tsx` — list shells, `instant` exports, error banners
- `src/actions/{posts,users,categories,media,newsletter,storage-settings}.ts`, `src/actions/{media,storage-settings}-schema.ts` — action signatures, permission-first ordering, count/upsert patterns
- `src/lib/queries/posts.ts` (searchPosts FTS published-only), `src/lib/permissions/post-transitions.ts` (TRANSITIONS), `src/lib/permissions/index.ts` (requireCan/requireRole/assertOwnsPost)
- `src/db/schema.ts` — 13 tables, tsvector column, user/session index patterns
- `src/layout/AppHeader.tsx`, `src/components/header/NotificationDropdown.tsx`, `src/components/header/UserDropdown.tsx`, `src/app/(admin)/AdminShell.tsx`, `src/app/(admin)/layout.tsx` — header mount points, identity chain, QueryProvider scope
- `src/app/(site)/search/page.tsx`, `src/components/site/Pagination.tsx`, `src/components/tables/Pagination.tsx` — reusable parse/href/pagination assets
- `node_modules/next@16.3.3/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` (searchParams Promise), `.../03-file-conventions/02-route-segment-config/instant.md` (instant semantics)
- Runtime checks: drizzle-orm 0.45.2 exports `ilike`/`count`/`or`/`and` (node require); package.json scripts (`db:generate`, `test`)

### Metadata

**Confidence breakdown:** Standard approach HIGH (all in-repo, installed-docs, or runtime verified); notification UX details MEDIUM (recommended shapes, discretion per CONTEXT).
**Research date:** 2026-08-27 · **Valid until:** 2026-09-26 (stable internal surface)
