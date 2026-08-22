# Deferred Items — quick task 260823-4yc

Out-of-scope discoveries logged during execution (not fixed, per scope boundary):

- **Pre-existing `tsc --noEmit` errors in untouched files** (found 2026-08-22):
  `src/actions/__tests__/storage-settings.test.ts` (TS18048 possibly-undefined ×4),
  `src/components/auth/ResetPasswordForm.tsx`, `SignInForm.tsx`, `SignUpForm.tsx`
  (TS2322 className on IntrinsicAttributes — likely a shared input-component prop
  typing drift), `src/components/form/date-picker.tsx`, `src/layout/AppSidebar.tsx`
  (same TS2322 pattern). These predate this task; `next build`'s TypeScript pass
  (the project's actual gate) is green. Worth a dedicated typing cleanup task.

- **PPR streamed redirect/404 status codes**: `/page/1`, `/page/0` (and the
  mirrored `/blog/page/1`) respond 200 at the HTTP layer with a streamed
  `NEXT_REDIRECT;replace;/;307` instruction; `/page/99` streams the 404 UI the
  same way. Identical to the existing `/blog/page/[pageNumber]` posture shipped
  in Phase 6 — noting in case an SEO pass later wants real 301/404 statuses for
  crawlers without JS.
