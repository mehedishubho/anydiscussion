---
created: 2026-07-04T22:50:11Z
title: Wire media-library picker UI into post editor + feature image field
area: dashboard
resolves_phase: 4
files:
  - src/components/editor/toolbar/Toolbar.tsx (replace promptImage URL-prompt with library picker — DASH-03)
  - src/app/(admin)/posts/PostForm.tsx (feature-image field: URL input → picker modal)
  - src/app/(admin)/media/ (media library browser page — consumes listMedia/uploadMedia from Phase 3)
source: Phase 3 UAT (03-UAT.md test 3)
---

## Problem

Phase 3 built the **backend** media upload pipeline — `actions/media.ts` (`uploadMedia`,
`listMedia`, `deleteMedia`), the `lib/storage/` provider abstraction (local + R2), and the
`/api/media/[...path]` serve route — but intentionally shipped **URL-only image input**
in the editor UI for v1. This is per `03-CONTEXT.md D-10` ("feature image library OR
external" — Phase 3 chose external-URL for v1) and is documented in the code:

- `Toolbar.tsx:12-14` — *"The image button triggers an external-URL prompt for v1
  (media-library UI is [Phase 4])"*
- `Toolbar.tsx:134` — button title: *"Image (external URL — Phase 4 DASH-03 wires the
  library picker)"*
- `PostForm.tsx:127-132` — feature-image field is a plain text input ("Feature image URL")

During Phase 3 UAT (test 3), the founder reported: *"currently no option to upload the
feature image, just url box"*. The upload pipeline works (server-mediated, permission-
checked, 03-03 tests pass) — the gap is the **frontend picker UI** that lets a writer
browse/upload images from inside the post form and editor.

## Decision

Phase 4 DASH-03 ships the media-library picker UI. Specifically:

1. **Media library browser page** at `(admin)/media/` (or `(admin)/dashboard/media/` per
   the `/dashboard/*` restructure todo) — a grid/list of uploaded media with upload,
   alt-text editing, copy-URL, and delete. Consumes the Phase 3 `listMedia`/`uploadMedia`/
   `deleteMedia` actions.
2. **Picker modal** (reusable) that the post form and editor invoke:
   - Feature-image field (`PostForm.tsx`): replace the URL text input with a
     "Select image" button → opens picker modal → selecting an image populates
     `featureImage` (still a URL string at the data layer).
   - Editor image button (`Toolbar.tsx` `promptImage`): replace `window.prompt` with the
     picker modal → selecting inserts an image node with the chosen CDN URL.
3. Keep the "external URL" path as a fallback option inside the picker (paste-any-URL),
   since D-10 explicitly allows external images.

## Why Phase 4, not a Phase 3 gap

Phase 3 owns the upload/storage pipeline (delivered, tested). The picker UI is dashboard
chrome — squarely Phase 4's "TailAdmin wired to real data (... media ...)" scope
(DASH-03). Phase 3 is correct as-built (URL input per D-10's external-option).
