---
phase: 05-seo-basics
plan: 05
subsystem: editor
tags: [editor, tiptap, uat-gap-closure, wordpress-classic, toolbar]
requires: []
provides:
  - "WordPress-classic editor surface (Visual/Text tabs, ordered toolbar, min-height area, live word-count footer) rendered by EVERY EditorProvider consumer (PostForm + PageForm) with zero API changes"
  - "TextAlign (heading+paragraph) + CharacterCount in the shared editorExtensions array — alignment survives generateHTML AND sanitizeBeforeRender (test-proven)"
affects:
  - "src/app/(admin)/dashboard/posts/PostForm.tsx (inherits new surface, no source change)"
  - "src/app/(admin)/dashboard/pages/PageForm.tsx (inherits new surface, no source change)"
  - "src/lib/post-render.ts output (may now emit text-align inline styles — sanitize-preserve verified)"
tech-stack:
  added:
    - "@tiptap/extension-text-align@3.27.1 (exact pin, planner-audited official tiptap monorepo release — T-05-SC)"
    - "@tiptap/extension-character-count@3.27.1 (exact pin, same release train; registry description mislabels it 'font family' — known tiptap metadata copy-paste bug)"
  patterns:
    - "useEditorState single-selector reactive derivation (Tiptap v3 recommended pattern) for toolbar active states and footer counts"
    - "Tiptap v3 setContent(content, { emitUpdate: true }) options-object API (positional boolean signature removed in v3)"
key-files:
  created:
    - src/components/editor/__tests__/tiptap-editor-surface.test.tsx
    - .planning/phases/05-seo-basics/deferred-items.md
  modified:
    - package.json
    - pnpm-lock.yaml
    - src/components/editor/extensions.ts
    - src/components/editor/TiptapEditor.tsx
    - src/components/editor/toolbar/Toolbar.tsx
    - src/components/editor/__tests__/round-trip.test.ts
decisions:
  - "DOMPurify default allowlist already retains the style attribute — the sanitize-preserve test PASSED without adding 'style' to ADD_ATTR (plan said let the test decide; it decided no change)"
  - "Toolbar shows only in Visual mode — its commands chain().focus() and would steal caret from the Text-tab textarea"
  - "Text tab keeps RHF live via setContent(html, {emitUpdate:true}) on every keystroke — no switch-back needed"
  - "MediaPicker mocked to a no-op stub in the jsdom smoke test — its import chain pulls the server-action/db (drizzle/pg) graph"
metrics:
  duration: 14min
  completed: 2026-08-25
status: complete
---

# Phase 5 Plan 05: WordPress-Classic Editor Surface (UAT Gap 1) Summary

**One-liner:** Rebuilt the body editor to the WordPress-classic spec — Visual/Text tabs, spec-ordered toolbar with TextAlign + More(...) overflow, min-height writing area, live word-count footer — delivered to both post and page forms through EditorProvider with zero API changes.

## What Was Built

### Task 1 — Text-align + character-count extensions with round-trip and sanitize tests (TDD)

- **RED (83cd72f):** extended `round-trip.test.ts` with 3 alignment cases — center-aligned paragraph serializes `text-align: center`; the aligned HTML RETAINS the style through `sanitizeBeforeRender`; right-aligned heading serializes the same way. All 3 failed for the right reason (TextAlign absent → attrs dropped by generateHTML), 7 pre-existing cases stayed green.
- **GREEN (85b40cb):** installed `@tiptap/extension-text-align@3.27.1` + `@tiptap/extension-character-count@3.27.1` (exact pins, planner-audited against registry.npmjs.org per T-05-SC). Added both to the shared `editorExtensions` array — TextAlign configured `types: ["heading", "paragraph"]` (body-level blocks only, matching the toolbar surface), CharacterCount default config (storage-only, no schema output → server `generateHTML` unaffected). Updated the file's config-notes header with the two UAT-gap-1 entries. `lib/sanitize/index.ts` needed NO change — DOMPurify's default attribute allowlist retains `style` (ADD_ATTR extends, never replaces, defaults).
- Full suite after: 576/576 green (sanitize anti-drift tests included).

### Task 2 — Toolbar rebuilt in WordPress-classic order (fc17e16)

`Toolbar.tsx` now renders exactly: (1) block-type native select — Paragraph/Heading 1/2/3 via `setParagraph()`/`toggleHeading({level})`; (2) Bold; (3) Italic; (4) Bulleted list; (5) Numbered list; (6) Blockquote; (7) Align left/center/right — `setTextAlign(dir)` with toggle semantics (`unsetTextAlign()` when the clicked direction is already active); (8) Insert link (D-05 prompt flow unchanged); (9) Insert table (`insertTable({rows:3, cols:3, withHeaderRow:true})` unchanged); (10) More("...") overflow dropdown — Strike, Code, Code block, Image (existing MediaPicker wiring intact), Undo/Redo with `can()`-gated disabled states, outside-click backdrop close. All active states derive from ONE `useEditorState` selector (Tiptap v3 pattern) instead of scattered `editor.isActive()` reads; deep-equal gating means the toolbar re-renders only when a selected value changes. `ToolbarProps` contract unchanged (`editor: Editor | null`).

### Task 3 — Editor shell: Visual/Text tabs, min-height area, word-count footer (a65ec00)

`TiptapEditor.tsx` rebuilt around the untouched `useEditor`/`EditorContent` core:
- **Tab header** (WordPress-classic top placement): Visual | Text, driven by a `mode` state.
- **Visual surface:** toolbar + `min-h-[350px]` white writing area (dark-mode surface treatment preserved), prose typography kept.
- **Text surface:** controlled monospace textarea initialized from `editor.getHTML()` on Visual→Text switch; every keystroke calls `editor.commands.setContent(html, { emitUpdate: true })` — ProseMirror parses against the schema (unknown tags dropped; T-05-11 layers unchanged) and `emitUpdate` fires `onUpdate` → `onChange(editor.getJSON())` → RHF body field stays live even if the user never switches back.
- **Footer:** live `Words: N` + `N characters` from CharacterCount storage via one `useEditorState` selector — the pipe canary for the "body box not working" UAT symptom.
- `TiptapEditorProps` and `EditorProvider` untouched — grep-verified both `PostForm.tsx` (L163) and `PageForm.tsx` (L182) render `<EditorProvider name="body" control={control} />` unchanged and inherit the entire surface.
- **New jsdom smoke test** (`tiptap-editor-surface.test.tsx`, `// @vitest-environment jsdom` pragma, MediaPicker stubbed): 4/4 green — tab labels render; clicking Text swaps `.tiptap.ProseMirror` for a TEXTAREA (and back); typing fires `onChange` with `{type: "doc"}`; footer count updates 0 → "Words: 4" on typing. Tiptap-in-jsdom initialization was NOT flaky — full test set ran, no reduction needed.

## Verification

- `pnpm test --run`: **580/580 green** (57 files — including extended round-trip, sanitize, new surface smoke test, posts suites).
- `rm -rf .next && pnpm build`: **exits 0**, compiled successfully (stale `'use cache'` guard per project memory — extensions.ts feeds the cached renderPostBody path).
- PostForm + PageForm: zero source changes (git diff since base touches only editor files, package.json, pnpm-lock.yaml).
- TDD gate sequence: `test(05-05)` commit (83cd72f) precedes `feat(05-05)` commits (85b40cb, fc17e16, a65ec00).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fresh worktree lacked .env.local — build-time prerender failed**
- **Found during:** Task 3 verify (`pnpm build`)
- **Issue:** `/(admin)/(ui-elements)/modals` prerender queried the DB with no credentials (`SASL: client password must be a string`) and Better Auth errored on the missing secret. `.env.local` is gitignored so the freshly created worktree never received it; the build cannot pass without it.
- **Fix:** copied `D:/Devsroom-Work/anydiscussion/.env.local` into the worktree. Verified gitignored (`.gitignore:30: .env*.local`) — untracked, never committed.
- **Files modified:** none in git (untracked local file only)
- **Commit:** n/a (no repo change)

**2. [Scope boundary — logged, not fixed] 12 pre-existing `tsc --noEmit` errors in unrelated files**
- **Found during:** Task 2 verify (`pnpm exec tsc --noEmit`)
- **Issue:** 4× TS18048 in `storage-settings.test.ts`, 8× TS2322 `className`/IntrinsicAttributes in TailAdmin-era auth forms / date-picker / AppSidebar. None of the files are touched by this plan (verified `git diff base --stat`) and none import editor code; `pnpm build` exits 0 with them present.
- **Action:** logged to `.planning/phases/05-seo-basics/deferred-items.md` per the scope boundary; NOT fixed.
- **Commit:** fc17e16 (the deferred-items.md file)

### Plan-anticipated branch NOT taken (informational)

- The plan's Task 1 contingency ("If Test 2 fails because DOMPurify strips the style attribute: add 'style' to ADD_ATTR") was not needed — the sanitize-preserve test passed against the unmodified config. No speculative change made, per the plan's own instruction.

## Auth Gates

None.

## Issues

None open. The UAT "body box not working" symptom has a working pipe at the unit level (typing moves the footer count and fires `onChange` with a doc JSON — proven by the smoke test); live-dashboard confirmation lands with 05-06 (publish flow) and the phase UAT.

## Known Stubs

None — all surfaces are wired to live editor state; the only mock is a test-file stub of MediaPicker (test double, not a product stub).

## Self-Check: PASSED

All 10 created/modified files verified present on disk; all 5 commits verified in git log (83cd72f, 85b40cb, fc17e16, a65ec00, 9e5b8b9). Working tree clean (only untracked gitignored .env.local remains, by design).
