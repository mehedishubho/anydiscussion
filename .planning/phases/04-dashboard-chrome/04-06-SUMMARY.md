---
phase: 04-dashboard-chrome
plan: 06
subsystem: dashboard-chrome
type: execute (gap-closure)
tags: [avatar, mediapicker, react-hook-form, next/image, dash-04]
requires:
  - "04-02 MediaPicker component (src/components/dashboard/media/MediaPicker.tsx) — merged"
  - "04-03 UserDrawer + ProfileForm with text-input avatar field"
provides:
  - "UserDrawer.tsx + ProfileForm.tsx avatar fields wired to <MediaPicker> (Plan 04-02 modal)"
  - "Plan 04-03 must_have truth row 20 satisfied — full plan-fidelity for DASH-04"
affects:
  - "src/app/(admin)/dashboard/users/UserDrawer.tsx"
  - "src/app/(admin)/dashboard/profile/ProfileForm.tsx"
tech-stack:
  added: []
  patterns:
    - "RHF setValue('avatar', url) driven by MediaPicker onSelect — mirrors PostForm feature-image wiring"
    - "Hidden registered input + watch() preview + Replace/Remove + Select-image button — the established picker-consumer shape"
key-files:
  modified:
    - src/app/(admin)/dashboard/users/UserDrawer.tsx
    - src/app/(admin)/dashboard/profile/ProfileForm.tsx
decisions:
  - "Mirror PostForm's feature-image wiring verbatim (inlined, not extracted) — DRY-across-3-consumers does not justify a new module for a 4-line state block"
  - "Reuse MediaPicker.tsx unchanged (default export, accept='image' default) — the picker is the sole avatar entry path; the text-input fallback is removed, not supplemented"
metrics:
  duration: "~4m"
  tasks_completed: 1
  files_modified: 2
  completed: 2026-07-06T15:22:06Z
status: complete
---

# Phase 4 Plan 06: Avatar MediaPicker Gap-Closure Summary

Swapped the Rule-3 text-input avatar fallback in UserDrawer.tsx and ProfileForm.tsx for the reusable `<MediaPicker>` modal from Plan 04-02, mirroring PostForm's feature-image field (useState open-state, watch() preview, setValue('avatar', url) on select, Replace/Remove + Select-image buttons, next/image thumbnail) — closing the only 04-VERIFICATION.md gap (31/32 → 32/32) and bringing DASH-04 to full plan-fidelity.

## What Was Built

A single gap-closure edit applied identically to two avatar consumers:

**Both files** (`UserDrawer.tsx`, `ProfileForm.tsx`):
- Imports: added `useState` from react, `Image` from `next/image`, default import of `MediaPicker` from `@/components/dashboard/media/MediaPicker`.
- `useForm` destructure extended with `setValue` and `watch` (added alongside the existing `register`/`handleSubmit`/`formState`).
- Component body: added `const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);` and `const avatarValue = watch("avatar");` directly after the `useForm` declaration (same placement as PostForm's `mediaPickerOpen`/`featureImageValue`).
- Avatar field block replaced: the standalone `<input {...register("avatar")}>` text input (with its "Avatar URL" label, CDN-URL placeholder, and "Paste a CDN URL" helper) is removed. In its place: a hidden registered `<input type="hidden" {...register("avatar")} aria-hidden />` to keep RHF/Zod validation on the field, then a conditional — when `avatarValue` is truthy, a preview row (next/image `Image` with `src`/`fill`/`sizes`/`object-cover`, the URL text, a `Replace` button → `setAvatarPickerOpen(true)`, and a `Remove image` button → `setValue("avatar", "", { shouldValidate: true })`); otherwise a `Select image` button → `setAvatarPickerOpen(true)`. After the conditional, the trailing `<MediaPicker isOpen={avatarPickerOpen} onClose={...} onSelect={(url) => { setValue("avatar", url, { shouldValidate: true }); setAvatarPickerOpen(false); }} />` element.
- Label renamed "Avatar URL" → "Avatar" (the field is no longer a URL paste box).
- Header comment block updated: the "MediaPicker integration target / Rule 3 auto-fix / parallel wave" note replaced with a one-line note that the avatar field reuses the Plan-04-02 picker via `setValue('avatar', url)`, mirroring PostForm's feature-image field.

The wiring is identical across both consumers and identical to PostForm's feature-image field — only the field name (`avatar` vs `featureImage`) and state-var name (`avatarPickerOpen`/`avatarValue` vs `mediaPickerOpen`/`featureImageValue`) differ. The `MediaPicker.tsx` component is reused unchanged (default export, `accept="image"` default omitted).

## Files Modified

| File | Change |
| ---- | ------ |
| `src/app/(admin)/dashboard/users/UserDrawer.tsx` | Avatar text input → `<MediaPicker>` + hidden register + preview/Select-image conditional. Added `useState`, `next/image`, `MediaPicker` imports; `setValue`/`watch` to useForm destructure. |
| `src/app/(admin)/dashboard/profile/ProfileForm.tsx` | Identical swap. Added `useState` from react (file had no react import), `next/image`, `MediaPicker` imports; `setValue`/`watch` to useForm destructure. |

## Verification

| Check | Command | Result |
| ----- | ------- | ------ |
| Production build | `pnpm build` | exit 0 — all `/dashboard/*` routes registered with PPR markers; both edited files compile; next/image + MediaPicker imports resolve |
| Full test suite | `pnpm test` | 243/243 pass (24 test files) — no regression to users.test.ts, auth-gate, profile, or any suite |
| MediaPicker present (UserDrawer) | `grep -c 'MediaPicker'` | 4 (import + JSX + comment refs) — ≥1 ✓ |
| MediaPicker present (ProfileForm) | `grep -c 'MediaPicker'` | 4 — ≥1 ✓ |
| Select image button (UserDrawer) | `grep -c 'Select image'` | 1 — ≥1 ✓ |
| Select image button (ProfileForm) | `grep -c 'Select image'` | 1 — ≥1 ✓ |
| avatarPickerOpen (UserDrawer) | `grep -c 'avatarPickerOpen'` | 2 — ≥2 ✓ |
| avatarPickerOpen (ProfileForm) | `grep -c 'avatarPickerOpen'` | 2 — ≥2 ✓ |
| setValue (UserDrawer) | `grep -c 'setValue'` | 5 — ≥1 ✓ |
| setValue (ProfileForm) | `grep -c 'setValue'` | 5 — ≥1 ✓ |
| Text-input fallback removed | `grep -c 'Avatar URL'` / `'Paste a CDN URL'` | 0 / 0 in both files — removed, not supplemented ✓ |
| No raw `<img>` | `grep -c '<img'` | 0 in both — thumbnail uses next/image ✓ |
| MediaPicker.tsx untouched | mtime check | unchanged — reused, not modified ✓ |

## Decisions Made

1. **Mirror PostForm verbatim, inline (no extraction).** The plan explicitly forbade extracting a shared hook: DRY-across-3-consumers does not justify a new module for a 4-line state block, and inlining keeps all three consumers (PostForm feature-image, UserDrawer avatar, ProfileForm avatar) structurally identical. The state-var names follow the PostForm convention (`<field>PickerOpen` / `<field>Value`).
2. **Reuse MediaPicker.tsx unchanged.** The component's default `accept="image"` is correct for an avatar (the prop was reserved for exactly this consumer). No new props or filters needed.
3. **The text-input fallback is removed, not supplemented.** The plan's must_have required the picker to be the sole avatar entry path; keeping the text input alongside would have failed the "removed, not supplemented" truth.
4. **No schema changes.** `avatar` stays `z.string().optional().or(z.literal(""))` in both consumers — the picker writes a URL string or empty via `setValue`, identical to the prior text-input writes. The hidden registered input keeps Zod validation on the field.
5. **next/image for the thumbnail.** Project hard rule (CLAUDE.md): content-image previews go through `next/image`, never raw `<img>`. The avatar URL (library `/api/media/<key>`, upload `media.publicUrl`, or external URL) follows the same remotePatterns situation as PostForm's featureImage — no new next.config surface introduced.

## Deviations from Plan

None — plan executed exactly as written. The single task was applied identically to both files as specified, mirroring the PostForm feature-image wiring without scope creep. No other field, file, or component was touched.

## Known Stubs

None. The avatar field is fully wired to the reusable `<MediaPicker>` in both consumers — no hardcoded empty values, placeholder data, or unwired props remain. The picker writes a real URL via `setValue('avatar', url)` and the preview reads `watch('avatar')`, so the data path is live end-to-end.

## Self-Check: PASSED

- `src/app/(admin)/dashboard/users/UserDrawer.tsx` — FOUND (modified)
- `src/app/(admin)/dashboard/profile/ProfileForm.tsx` — FOUND (modified)
- Commit `d4d19a6` — FOUND in `git log`
- Build exit 0 — confirmed
- 243/243 tests pass — confirmed
