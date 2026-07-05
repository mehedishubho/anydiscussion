---
status: complete
phase: 03-content-engine
source: [03-VERIFICATION.md]
started: 2026-07-04T21:47:11Z
updated: 2026-07-04T23:12:07Z
---

## Current Test

[testing complete]

## Tests

### 1. Clean-Room Migration Drift Test (Docker)

**Test:** Run `pnpm test:migrations` in a Docker-equipped environment (the BLOCKING schema gate per 03-01-PLAN acceptance criteria).
expected: All 4 migrations apply cleanly to an empty Postgres; the 12-table schema matches `src/db/schema.ts` exactly.
result: pass
note: Initial run failed with ECONNREFUSED on :5436 (postgres-test container was stopped). Started the container (`docker compose up -d postgres-test`), re-ran, and it passed — all 4 migrations applied, all 12 expected tables present.

### 2. Visual UAT on the Post Editor

**Test:** Visit `/posts/new` and `/posts/<id>/edit` in a running `pnpm dev` environment. Confirm: dashboard chrome renders, Tiptap editor lazy-loads (no SSR errors), RHF+Zod error states display inline, CategoryPicker populates from `listCategories`, TagPicker populates from `listTags`, SchedulePicker timezone label reads from `getSetting("site.timezone")`, PreviewLink Generate/Regenerate/Revoke works.
expected: A working editor experience — author can type, format, save draft, submit for review; editor can publish; preview link opens in incognito.
result: pass
note: Required starting the main postgres container (`docker compose up -d postgres minio`) — it was stopped (ECONNREFUSED on :5435). After that, editor exercised and confirmed working. Sidebar link to /posts deferred to Phase 4 (see todos/pending/2026-07-04-dashboard-route-prefix-restructure.md).

### 3. Body Image Rendering Strategy (MEDIA-03 strict reading)

**Test:** Open a post with body images on the public render path (when Phase 6 ships) OR on `/preview/[token]` now. Inspect the rendered HTML — are body images raw `<img>` tags or `<Image>` components?
expected: Confirm whether raw `<img>` (current Tiptap output via generateHTML → sanitize → dangerouslySetInnerHTML) is acceptable for v1 OR document the Phase 6 post-process step that converts body `<img>` to `<Image>` components (the standard Tiptap+Next pattern). NOTE: genuine gap vs success-criterion #4's literal "never a raw `<img>`" — the storage/upload pipeline is correct, but in-body images bypass `cdnImageLoader`. Largely a Phase 6 concern.
result: skipped
reason: Accepted as a documented Phase 6 fast-follow. Body images render as raw <img> via generateHTML → dangerouslySetInnerHTML (confirmed in code: post-render.ts does no <img>→<Image> transform; cdnImageLoader only applies to <Image> components). The public render path where body content renders to readers ships in Phase 6; the standard fix is an HTML post-process step in post-render.ts there.

### 4. SchedulePicker UI Save Flow

**Test:** On `/posts/<id>/edit`, pick a datetime in the SchedulePicker, then trigger save (button or blur). Verify `setSchedule` is invoked and `posts.publishedAt` updates in the DB.
expected: The picked datetime persists to `posts.publishedAt`; the scheduler worker then flips the post to `published` at the due time. NOTE: real implementation gap — `setSchedule` is fully implemented + unit-tested but the edit page passes a no-op onChange closure (`src/app/(admin)/posts/[id]/edit/page.tsx` L84-88), so the UI does NOT invoke it. Acknowledged as Phase 4 DASH-01 fast-follow. The schedule CAN be set via direct Server Action call — only the UI save flow is missing.
result: skipped
reason: Accepted as a documented Phase 4 DASH-01 fast-follow. Confirmed in code: SchedulePicker.tsx fires onChange correctly, but [id]/edit/page.tsx:84-89 passes a no-op closure and a misleading comment ("called from the client component on blur or a save button" — no such handler exists; grep shows setSchedule is invoked from zero places in src/app/). The action itself is tested (D-15). The fix is a client-side save/blur handler calling setSchedule + correcting the comment.

### 5. Scheduled-Publishing Worker End-to-End

**Test:** Seed a post with `status='draft'` AND `publishedAt=<1 minute in the past>`, run `pnpm build && pnpm start`, wait 60+ seconds, then verify the post status is now `published` AND `/blog/<slug>` renders the post AND the homepage `/` reflects the new post.
expected: The cron tick (every minute) flips the post; the 6 concrete paths + 4 2-arg tags revalidate; `log.info("system-publish", {postId})` audit entry appears in the server log.
result: skipped
reason: Deferred — founder will verify later when running the production stack. Requires pnpm build && pnpm start (node-cron registers via instrumentation.ts only under the NEXT_RUNTIME production gate) + a seeded due post. The call-site logic is unit-tested (Wave-0: worker queries status='draft' AND publishedAt<=now() and emits 6 concrete revalidatePath + 4 two-arg revalidateTag). Re-run when the scheduler UI save flow lands (Phase 4 DASH-01) and a production build is available.

### 6. /preview/[token] PPR Behavior (Post-Merge Build Fix Verification)

**Test:** Build the app, visit `/preview/<valid-token>` AND `/preview/unknown-uuid` in a browser. Confirm: (a) valid token renders the draft body via `renderPostBody` (generateHTML → sanitizeBeforeRender), (b) unknown token returns 404 via `notFound()`, (c) the static shell serves immediately while the dynamic post content streams inside `<Suspense>` (cacheComponents PPR pattern).
expected: Token-gate works; renderPostBody output is sanitized (no `<script>`/`onerror`); PPR split works under cacheComponents (no `export const dynamic` segment config — disallowed). This is the load-bearing post-merge build fix.
result: skipped
reason: Deferred to the production-build run alongside test 5. Requires pnpm build && pnpm start + a post with a valid previewToken. The token-gate (db.select where previewToken=token → notFound()), the sanitize-before-render pipeline, and the Suspense/PPR restructure (the post-merge build fix) are all verified in code and compile in `next build` (the route shows ◐ Partial Prerender). Live PPR streaming to be confirmed when the founder runs the production stack.

### 7. Pitfall #3 Revalidation Audit on Real Stack

**Test:** On a real Coolify+Turbopack deployment, publish a post from the dashboard, then verify the homepage + `/blog` + `/category/<slug>` + `/blog/<slug>` reflect the new post within the SWR window without a manual rebuild.
expected: All listed pages reflect the newly-published post. No stale listing.
result: skipped
reason: Deferred to Phase 7 PERF-03 (deployment audit). Cannot run locally — requires a real Coolify+Turbopack stack. The call-site wiring (6 concrete revalidatePath literals + 4 two-arg revalidateTag(tag,"max") calls) is verified in code and unit-tested (posts.test.ts iterates revalidateTag.mock.calls asserting every call length===2 and arg[1]==="max"). Runtime cache invalidation to be audited end-to-end on the deployed stack in Phase 7.

## Summary

total: 7
passed: 2
issues: 0
pending: 0
skipped: 5
blocked: 0

## Gaps

(none — no issues reported. 5 skipped items are documented future-phase / runtime deferrals:
 - test 3 → Phase 6 render-path body-image <img>→<Image> post-process
 - test 4 → Phase 4 DASH-01 SchedulePicker save-flow wiring (todos/pending/2026-07-04-* for related dashboard restructure + media picker)
 - tests 5 & 6 → runtime checks deferred to the production-build run
 - test 7 → Phase 7 PERF-03 Coolify deployment audit)
