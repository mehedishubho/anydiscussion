---
phase: quick-260827-se8
plan: 260827-se8
subsystem: dashboard
tags: [notifications, search, pagination, url-driven-lists, storage-settings, header, rbac]
requires:
  - "260827-869 (session identity chain — AppHeader user prop, untouched)"
  - "Phase 3/4 posts+users+media+taxonomy actions (extended, not replaced)"
provides:
  - "notifications table + notifyUsers fan-out + 3 session-scoped notification actions + newsletter subscribe hook"
  - "URL-driven list mechanics (q/status/author filters + pagination) on posts, users, categories, media"
  - "returnForRevision workflow with notify hooks on submit/publish/return"
  - "globalSearch action + GlobalSearch header island (role-safe, live grouped results)"
  - "functional NotificationDropdown (live unread badge, mark-read-on-open)"
  - "storage settings form with all 4 provider sections + movable Active badge"
affects:
  - "src/actions/{posts,users,categories,media,notifications,newsletter,search}.ts"
  - "src/app/(admin)/dashboard/{page,posts,users,categories,media}.tsx"
  - "src/components/header/{GlobalSearch,NotificationDropdown}.tsx + src/layout/AppHeader.tsx"
  - "src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx"
tech-stack:
  added: []
  patterns:
    - "URL-driven dashboard lists: searchParams → manual parse (list-filters helpers) → Zod gate AFTER permission gate → ListFilterBar writes URLs only → site Pagination preserves filters"
    - "lazy-thenable vi.mock chains (terminal mocks fire only on await — eager promise evaluation breaks MUST_NOT_BE_REACHED proofs)"
    - "shared buildXListWhere builders so list + count queries carry identical filter graphs"
key-files:
  created:
    - src/lib/notifications.ts
    - src/actions/notifications.ts
    - src/lib/list-filters.ts
    - src/components/dashboard/lists/ListFilterBar.tsx
    - src/actions/search.ts
    - src/components/header/GlobalSearch.tsx
    - src/actions/__tests__/{notifications,search}.test.ts
    - src/db/migrations/<generated notifications migration>
  modified:
    - src/actions/{posts,posts-schema,users,users-schema,categories,taxonomy-schema,media,media-schema,newsletter}.ts
    - src/db/schema.ts (notifications table)
    - src/app/(admin)/dashboard/{page,posts/page,users/page,categories/page,media/page}.tsx
    - src/app/(admin)/dashboard/posts/components/PostRowActions.tsx
    - src/app/(admin)/dashboard/media/MediaGrid.tsx
    - src/components/dashboard/media/MediaPicker.tsx
    - src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx
    - src/components/header/NotificationDropdown.tsx
    - src/layout/AppHeader.tsx
decisions:
  - "Notification bell + global search are self-contained client islands riding the shell QueryProvider — no AuthGate prop threading (layout does not re-render on sibling navigations; a prop-fed count would go stale)"
  - "banned/verified stay 'true'/'false' string enums in the URL layer; coerced to booleans inside the action after the permission gate"
  - "listCategories(opts?) paginates ONLY when page is present — bare calls (pickers, posts-page options) keep the full list (back-compat contract)"
  - "globalSearch author-scopes from the session while the posts LIST page intentionally does not — the safer direction, asymmetry documented in src/actions/search.ts"
metrics:
  duration: "~2 sessions (interrupted twice by host events; resumed in place)"
  completed: 2026-08-28
  tests: "676 baseline → 764 passing (88 new tests)"
  commits: 16
status: complete
---

# Quick Task 260827-se8: Dashboard Functional Gaps — Summary

Closed all six dashboard gaps: notifications had no backing data, header search/bell were demo markup, the storage form only rendered the active provider's section, and posts/users/categories/media lists had no search or pagination.

## What Was Built

### Task 1 — Notifications data layer (70a0c52 RED / c2b766b GREEN)
- `notifications` table (userId, type, payload jsonb, readAt, createdAt) + generated migration
- `src/lib/notifications.ts` — `notifyUsers` fan-out helper: single insert, empty-recipients no-op, awaited-swallow contract (insert failure logged, never fails the parent mutation)
- Three session-scoped actions: `countUnreadNotifications`, `listNotifications(page)`, `markNotificationsRead` — each `getSessionOrThrow()` FIRST; WHERE scoped to the session user only, no client ids accepted
- Newsletter subscribe now notifies admins (`new_subscriber` + subscriberEmail)

### Task 2 — List-filter infrastructure (d4e00e5 / 22793cb)
- `src/lib/list-filters.ts`: `firstValue` (flatten tampered string[]), `bounded` (trim+cap), `clampPage`, `DASHBOARD_PAGE_SIZE = 20` — extracted from the (site)/search parse idiom
- `ListFilterBar` client island: URL-writing only (never queries), 300ms-debounced text fields with Enter commit, instant-apply selects

### Task 3 — Storage form all-four-sections (9b5849c / 81511f4)
- All four provider sections (Local/R2/Cloudinary/S3) render unconditionally from saved values
- Active provider marked by a conditional border/ring + "Active" badge that MOVES with `watch("activeProvider")` — comparisons routed through an `isActiveProvider(p)` helper (zero literal `activeProvider === ` occurrences, grep-verified)

### Task 4 — Posts workstream (cf72e75 / 00b7e43)
- `postListSchema` (q/status/categoryId/author/page/pageSize 1-100); `listPosts`/`countPosts` share `buildPostListWhere`; author filter matches the JOINED user's name/email
- `returnForRevision` action: `assertOwnsPost` first, transition to draft, notify author minus actor (`post_returned`), single `revalidateTag("posts-list", "max")`
- Notify hooks: `submitForReview` → editors+admins minus actor (`post_submitted`); `publishPost` → author minus actor (`post_published`)
- `PostRowActions` gains a Return button (admin/editor, pending_review only) with its own optimistic mutation
- Posts page rewritten URL-driven: status/category selects + q + author field, pagination preserving filters

### Task 5 — Users list (6368ee5 / 2ba4099)
- `userListSchema` (q/role/banned/verified as string enums, page/pageSize); `listUsers(opts?)` + `countUsers` share `buildUserListWhere` (banned/verified coerced to booleans after the gate); `requireCan` stays the literal first statement
- Users page URL-driven; UsersTable keeps its optimistic mutations (rows as props)

### Task 6 — Categories list (806a2a8 / 2b15e56)
- `categoryListSchema` — `page` OPTIONAL: its absence signals "no pagination", so bare `listCategories()` callers (CategoryPicker, posts-page options) keep the full list unchanged
- q → or(ilike name, ilike slug); `countCategories` mirrors the WHERE; categories page q-only filter + pagination

### Task 7 — Media list (4ce95a8 / 4134d88)
- `mediaListSchema` reshaped to the uniform contract (q/kind/page/pageSize; raw limit/offset dropped; exact mimeType kept); `kind` → `like(mimeType, 'kind/%')` prefix; `countMedia` added
- Media page q + Kind select + pagination; MediaGrid/MediaPicker refresh calls adapted to `{pageSize: 100}`

### Task 8 — Header functionalization (3e06cf1 / c4def3c)
- `globalSearch`: session FIRST; <2 chars short-circuits without DB; posts leg role-scoped from the session (author = own only; editor/admin see drafts); users leg admin-only (user-table select structurally unreachable otherwise — proven by test); taxonomy legs exclude soft-deleted; all legs limit 5; users projection id/name/email only
- `GlobalSearch` island: verbatim TailAdmin input, ⌘K focus effect moved in, 300ms debounce, keyed queries (stale responses discarded), grouped dropdown with verified click-throughs (post edit, users?q=email, categories?q=name, /dashboard/tags)
- `NotificationDropdown` full rewrite: live unread badge (hidden at 0, 60s refetch + window focus), mark-read-on-open invalidating both keys, type→copy map with payload postTitle/subscriberEmail + relative time, postId rows link to the edit page, demo footer dropped
- AppHeader: inert form gone, user prop chain from 260827-869 untouched

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dashboard overview dead signature after T4 (posts)**
- Found during: Task 4 tsc gate
- Issue: overview called `listPosts({ limit: POSTS_READ_CAP })` — a field the new postListSchema removed; would have thrown INVALID_INPUT at runtime
- Fix: overview rewritten onto `countPosts({status})` tiles + a 5-row pending_review preview
- Files: src/app/(admin)/dashboard/page.tsx
- Commit: 00b7e43

**2. [Rule 1 - Bug] Dashboard overview dead signature after T7 (media)**
- Found during: Task 7
- Issue: overview's media tile read `listMedia({ limit: MEDIA_READ_CAP }).length` — limit field removed by the new schema (would have silently degraded to pageSize 20)
- Fix: swapped for the new `countMedia()` (a real count(*), better than the capped-read approximation)
- Files: src/app/(admin)/dashboard/page.tsx
- Commit: 4134d88

**3. [Rule 3 - Blocking] Three extra listMedia callers existed beyond the plan's assumption**
- Found during: Task 7
- Issue: plan stated "the only caller is the media page" — MediaGrid's refresh query and MediaPicker also called `listMedia({ limit: 100 })`
- Fix: both updated to `{ pageSize: 100 }` (max-cap single page, same data volume)
- Files: src/app/(admin)/dashboard/media/MediaGrid.tsx, src/components/dashboard/media/MediaPicker.tsx
- Commit: 4134d88

**4. [Discretion] ListFilterBar debounce extended to the secondary text field**
- The plan specified debounce for the primary q field; the author field on the posts page got the same 300ms treatment + Enter commit (consistency, one code path)
- Commit: 22793cb

### Test-harness corrections during GREEN (tests fixed, not implementation)

- taxonomy RED: an Edit anchor accidentally swallowed the D-23 describe opener — restored immediately (parse error, never committed broken)
- media GREEN: one old test still passed the removed `{limit, offset}` shape — updated to `{page, pageSize}` (the plan's "tests updated accordingly")
- search GREEN: the users-leg MUST_NOT_BE_REACHED proof initially used a throwing terminal, which fired on the categories leg (legitimately runs for non-admins) — replaced with a routing-based proof (user table never appears in from() calls + users group empty while other legs pass rows through)

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm test` (full suite) | 69 files, 764/764 passed (baseline 676 → +88) |
| `pnpm exec tsc --noEmit` | 8 errors — the pre-existing TailAdmin scaffold baseline (identical before/after; logged in deferred-items.md) |
| `rm -rf .next && pnpm build` | Compiled successfully; full route manifest generated; all dashboard routes present |
| `instant = false` grep ×4 pages | posts/users/categories/media each exactly 1 |
| `activeProvider === ` grep | 0 occurrences in StorageSettingsForm |
| `GlobalSearch` in AppHeader | present (import + mount) |
| `countUnreadNotifications` in NotificationDropdown | present |

## Known Stubs

None. Every surface wired in this task reads live data.

## Commits (16, in order)

| Hash | Task | Message |
|------|------|---------|
| 70a0c52 | T1 | test(260827-se8): notifications data layer RED |
| c2b766b | T1 | feat(260827-se8): notifications data layer GREEN |
| d4e00e5 | T2 | test(260827-se8): list filters + filter bar RED |
| 22793cb | T2 | feat(260827-se8): list-filter helpers + ListFilterBar GREEN |
| 9b5849c | T3 | test(260827-se8): storage form all sections RED |
| 81511f4 | T3 | feat(260827-se8): storage form all-four-sections GREEN |
| cf72e75 | T4 | test(260827-se8): posts list + return-for-revision RED |
| 00b7e43 | T4 | feat(260827-se8): posts list mechanics + return-for-revision GREEN |
| 6368ee5 | T5 | test(260827-se8): users list filters RED |
| 2ba4099 | T5 | feat(260827-se8): users list mechanics GREEN |
| 806a2a8 | T6 | test(260827-se8): categories list filters RED |
| 2b15e56 | T6 | feat(260827-se8): categories list mechanics GREEN |
| 4ce95a8 | T7 | test(260827-se8): media list filters RED |
| 4134d88 | T7 | feat(260827-se8): media list mechanics GREEN |
| 3e06cf1 | T8 | test(260827-se8): globalSearch RED |
| c4def3c | T8 | feat(260827-se8): functional header search + notification bell GREEN |

Branch: `worktree-agent-a1976c4eb428ea826` (base `9b3446f`).

## Self-Check: PASSED

- All 16 commit hashes verified present on `worktree-agent-a1976c4eb428ea826` via `git log 9b3446f..HEAD` (70a0c52 → c4def3c, complete RED/GREEN pairs for T1–T8, no gaps).
- All key created files verified on disk (notifications lib/actions/tests, list-filters, ListFilterBar, search action/tests, GlobalSearch, this SUMMARY, deferred-items).
- Working tree clean except these two intentionally uncommitted docs artifacts (orchestrator owns the docs commit; copy out of the worktree before cleanup).

