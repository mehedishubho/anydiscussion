# Phase 4: Dashboard Chrome - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-05
**Phase:** 4-Dashboard Chrome
**Areas discussed:** Folded todos, Nav & demo cleanup, Users & roles UX, Media library & picker, Storage Settings + providers, Pages management, Form & mutation pattern

---

## Folded Todos (cross_reference_todos)

| Todo | Disposition |
|------|-------------|
| Move admin routes under `/dashboard/*` (`2026-07-04-dashboard-route-prefix-restructure.md`, score 0.9, `resolves_phase: 4`) | ✓ Folded → D-01 |
| Media-library picker UI (`2026-07-04-media-library-picker-ui.md`, score 0.9, `resolves_phase: 4`) | ✓ Folded → D-12/D-13 |
| Configurable multi-destination backup system (`2026-06-30-…md`, score 0.6, area: database) | Reviewed, NOT folded — false-positive keyword overlap; already mutated into Phase 8 (BACKUP-01..05). Reviewed-not-folded in Phases 1/2/3/4. |

---

## Nav & demo cleanup (DASH-07, DASH-08 + route-restructure scope)

| Question | Choice | Alternatives considered |
|----------|--------|-------------------------|
| Sidebar nav shape | **CMS + collapsed Components** (focused CMS nav + retained `(ui-elements)` reference group) | Focused CMS nav (cut all demos); You decide |
| Demo page disposition | **Delete `(others-pages)` chart/form/table + unused component files; keep Calendar + Profile; keep `(ui-elements)`** | Unlist from sidebar only; You decide |
| Overview `/dashboard` content | **Lean real stats** (posts-by-status, pending-review list, media count, New post CTA; server-rendered) | Minimal welcome + quick actions; keep TailAdmin overview demo; You decide |
| Role-based sidebar | **Filter nav by role** (UX layer; server gates authoritative) | Show full nav to everyone; You decide |

**Notes:** A tension between "keep collapsed Components" (preserve `(ui-elements)`) and "delete demos" (which named ui-elements) was reconciled live: delete chart/form/table demos + their component files, keep the `(ui-elements)` showcase as the "Components" reference group. The founder confirmed this reading was not contradicted.

---

## Users & roles UX (DASH-04)

| Question | Choice | Alternatives considered |
|----------|--------|-------------------------|
| Create/edit interaction | **Table + side drawer/modal** | Dedicated create/edit pages; You decide |
| Disable vs delete | **Disable (ban) only** (no destructive delete) | Soft-delete option too; You decide |
| Profile editing | **Self-service** (any role edits own; admins edit anyone) | Admin-only editing; You decide |
| Session management UI | **Revoke sessions only** (no per-device list) | Full session list; You decide |

---

## Media library & picker (DASH-03 + picker todo)

| Question | Choice | Alternatives considered |
|----------|--------|-------------------------|
| Library view | **Grid + list toggle** (click → details drawer) | List-first; You decide |
| Picker pattern | **One reusable `<MediaPicker>` modal** (browse + upload-in-place + select; "paste external URL" tab) | Per-location pickers; You decide |
| Upload UX | **Drag-drop + multi-file + progress + alt prompt** | Single-file, alt after; You decide |
| Delete safety | **Soft-delete + warn if referenced, don't block** | Block if referenced; You decide |

---

## Storage Settings + providers (DASH-09)

| Question | Choice | Alternatives considered |
|----------|--------|-------------------------|
| "push-CDN" definition | **Generic S3-compatible / origin-pull CDN provider** (no vendor lock-in) | Bunny CDN (named vendor); Defer push-CDN to v2; You decide |
| Cloudinary integration depth | **Full provider** (upload via API + on-the-fly transforms) | Delivery-only (fetch from origin); You decide |
| Credential validation | **"Test connection" before save** | Lazy validate on first upload; You decide |
| Credential storage | **Encrypted at rest** (app-level encryption, env key) | Plain `settings` values; You decide |

---

## Pages management (DASH-05)

| Question | Choice | Alternatives considered |
|----------|--------|-------------------------|
| Pages at launch | **Seed T&C + Privacy + Contact** (draft rows at migration) | Empty — admin creates each; You decide |
| Page editor chrome | **Trimmed post editor** (drop category/tags/excerpt/feature-image/schedule/preview) | Full post-editor parity; You decide |
| Contact page handling | **Content-only here; form is Phase 6** | Inline form-builder now; You decide |
| Page status workflow | **Simple draft/published** (no review) | Same review workflow as posts; You decide |

---

## Form & mutation pattern (DASH-06)

| Question | Choice | Alternatives considered |
|----------|--------|-------------------------|
| Pattern application scope | **All pages + retrofit posts editor** | New pages only (leave Phase 3 posts untouched); You decide |
| Optimistic UI scope | **Selective** (media delete, taxonomy CRUD, user ban/role-change, page save; NOT publish/upload) | Optimistic everywhere; You decide |
| QueryClient placement | **`(admin)`-scoped provider** (devtools dev-only) | App-wide root provider; You decide |

---

## Claude's Discretion

- Dark mode coverage (D-06) — verify only; `ThemeContext` exists.
- Drawer/modal component choice, `<MediaPicker>` internal layout, per-provider "Test connection" probe shape.
- Encryption approach (Node `crypto` vs library) and exact `settings` key names for credential blobs.
- Generic push-CDN provider's exact credential fields + whether purge-on-upload is wired.
- Cloudinary SDK choice + transform params.
- Media "used-by" scan: reference-count vs simple substring.
- Internal structure of the Storage Settings form and users drawer.

## Deferred Ideas

- Contact form behavior (SMTP/honeypot/rate-limit) → Phase 6 (SITE-10).
- Per-device session list / IP / last-active → v2.
- Named-vendor push-CDN (Bunny specifically) → v2 fast-follow.
- Full media reference-count tracking → v2.
- Dashboard analytics/charts on overview → Phase 7.
- Revision history / stricter editorial control → v2 (CONTv2-01).
- Analytics script injection → Phase 6 (ANAL-01/02).
- Bundle-budget enforcement + production revalidation audit → Phase 7 (PERF-02/03).

---

*Phase: 4-Dashboard Chrome*
*Discussion logged: 2026-07-05*
