---
status: testing
phase: 03-content-engine
source: [03-VERIFICATION.md]
started: 2026-07-04T21:47:11Z
updated: 2026-07-04T21:47:11Z
---

## Current Test

number: 1
name: Clean-Room Migration Drift Test (Docker)
expected: |
  Run `pnpm test:migrations` in a Docker-equipped environment. All 4 migrations
  (0000 + 0001 + 0002 + 0003) apply cleanly to an empty Postgres; the resulting
  12-table schema matches `src/db/schema.ts` exactly. Confirms `media.uploaded_by`
  is `text` FK on `user.id`, `media.provider_key` NOT NULL + `media.provider` exist,
  and `posts.preview_token` varchar(255) UNIQUE exists.
awaiting: user response

## Tests

### 1. Clean-Room Migration Drift Test (Docker)

**Test:** Run `pnpm test:migrations` in a Docker-equipped environment (the BLOCKING schema gate per 03-01-PLAN acceptance criteria).
expected: All 4 migrations apply cleanly to an empty Postgres; the 12-table schema matches `src/db/schema.ts` exactly.
result: [pending]

### 2. Visual UAT on the Post Editor

**Test:** Visit `/posts/new` and `/posts/<id>/edit` in a running `pnpm dev` environment. Confirm: dashboard chrome renders, Tiptap editor lazy-loads (no SSR errors), RHF+Zod error states display inline, CategoryPicker populates from `listCategories`, TagPicker populates from `listTags`, SchedulePicker timezone label reads from `getSetting("site.timezone")`, PreviewLink Generate/Regenerate/Revoke works.
expected: A working editor experience — author can type, format, save draft, submit for review; editor can publish; preview link opens in incognito.
result: [pending]

### 3. Body Image Rendering Strategy (MEDIA-03 strict reading)

**Test:** Open a post with body images on the public render path (when Phase 6 ships) OR on `/preview/[token]` now. Inspect the rendered HTML — are body images raw `<img>` tags or `<Image>` components?
expected: Confirm whether raw `<img>` (current Tiptap output via generateHTML → sanitize → dangerouslySetInnerHTML) is acceptable for v1 OR document the Phase 6 post-process step that converts body `<img>` to `<Image>` components (the standard Tiptap+Next pattern). NOTE: genuine gap vs success-criterion #4's literal "never a raw `<img>`" — the storage/upload pipeline is correct, but in-body images bypass `cdnImageLoader`. Largely a Phase 6 concern.
result: [pending]

### 4. SchedulePicker UI Save Flow

**Test:** On `/posts/<id>/edit`, pick a datetime in the SchedulePicker, then trigger save (button or blur). Verify `setSchedule` is invoked and `posts.publishedAt` updates in the DB.
expected: The picked datetime persists to `posts.publishedAt`; the scheduler worker then flips the post to `published` at the due time. NOTE: real implementation gap — `setSchedule` is fully implemented + unit-tested but the edit page passes a no-op onChange closure (`src/app/(admin)/posts/[id]/edit/page.tsx` L84-88), so the UI does NOT invoke it. Acknowledged as Phase 4 DASH-01 fast-follow. The schedule CAN be set via direct Server Action call — only the UI save flow is missing.
result: [pending]

### 5. Scheduled-Publishing Worker End-to-End

**Test:** Seed a post with `status='draft'` AND `publishedAt=<1 minute in the past>`, run `pnpm build && pnpm start`, wait 60+ seconds, then verify the post status is now `published` AND `/blog/<slug>` renders the post AND the homepage `/` reflects the new post.
expected: The cron tick (every minute) flips the post; the 6 concrete paths + 4 2-arg tags revalidate; `log.info("system-publish", {postId})` audit entry appears in the server log.
result: [pending]

### 6. /preview/[token] PPR Behavior (Post-Merge Build Fix Verification)

**Test:** Build the app, visit `/preview/<valid-token>` AND `/preview/unknown-uuid` in a browser. Confirm: (a) valid token renders the draft body via `renderPostBody` (generateHTML → sanitizeBeforeRender), (b) unknown token returns 404 via `notFound()`, (c) the static shell serves immediately while the dynamic post content streams inside `<Suspense>` (cacheComponents PPR pattern).
expected: Token-gate works; renderPostBody output is sanitized (no `<script>`/`onerror`); PPR split works under cacheComponents (no `export const dynamic` segment config — disallowed). This is the load-bearing post-merge build fix.
result: [pending]

### 7. Pitfall #3 Revalidation Audit on Real Stack

**Test:** On a real Coolify+Turbopack deployment, publish a post from the dashboard, then verify the homepage + `/blog` + `/category/<slug>` + `/blog/<slug>` reflect the new post within the SWR window without a manual rebuild.
expected: All listed pages reflect the newly-published post. No stale listing.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
