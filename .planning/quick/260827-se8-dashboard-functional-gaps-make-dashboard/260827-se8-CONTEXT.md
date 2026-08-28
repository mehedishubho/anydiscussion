# Quick Task 260827-se8: Dashboard functional gaps (header search/notifications, list filter/search/pagination, storage multi-provider) - Context

**Gathered:** 2026-08-27
**Status:** Ready for planning

<domain>
## Task Boundary

Dashboard functional gaps: make dashboard header notification and search functional; add filter, search, and pagination to /dashboard/posts, /dashboard/categories, /dashboard/media, and /dashboard/users; /dashboard/settings/storage not showing multi provider settings.

</domain>

<decisions>
## Implementation Decisions

### Header search
- Global dropdown: grouped live results (Posts, Users, Categories, Tags) rendered as the admin types; clicking a result opens that entity's edit page. Works across all dashboard pages.

### Notifications
- Content events: author submits for review → notifies editors/admins; publish/return-for-revision → notifies the author; new subscriber → notifies admins. Requires a notifications DB table + bell UI with unread count in the dashboard header.

### List page mechanics
- Server-side URL-driven: filters/search/page number live in the URL (searchParams → Drizzle WHERE + count + limit/offset), deep-linkable, back-button correct. Client components only write the URL; the Server Component re-queries. Applies to posts, categories, media, and users list pages.

### Storage page
- All providers visible: show all four provider config sections (local / R2 / Cloudflare R2 / Push CDN, per src/lib/storage/) simultaneously, active provider highlighted — configure several without flipping the selector. (Backend already supports all 4; the form currently renders only the active section.)

### Claude's Discretion
- Page size for lists (suggest 20/page), debounce timing for the header-search dropdown, per-page filter fields (posts: status/category/author; users: role/ban/verified state; media: kind; categories: search only), pagination control styling (TailAdmin), and the notifications table shape/migration specifics — all following existing conventions (Drizzle generate, Zod, Server Actions, permission checks first).
- Whether categories/tags need pagination vs. simple search (row counts are typically small) — implement consistently anyway.

</decisions>

<specifics>
## Specific Ideas

- Header search dropdown: grouped sections, live results, click-through to edit pages (e.g. /dashboard/posts/[id]/edit, /dashboard/users, category edit).
- Notifications: unread badge count in the existing header (AppHeader/UserDropdown area); mark-as-read on open.
- Storage: keep the active-provider selector semantics (uploads route through the selected provider) but render every provider's credential section at once with the active one visually distinguished; keep secret-field redaction + re-enter-to-change behavior (D-25).
- List pages: reuse the existing page shells; keep `export const instant = false` conventions on any page that gains top-level awaits (260826-oif).

</specifics>

<canonical_refs>
## Canonical References

- 04-CONTEXT.md D-23/D-24/D-25 (Storage settings page, test connection, credential encryption)
- 08-CONTEXT.md (backup settings page as the second settings-page analog)
- 260826-oif quick task (instant-navigation opt-out convention for (admin) pages with top-level awaits)
- CLAUDE.md security conventions (requireCan/requireRole first in every mutating action; Zod shared client+server)

</canonical_refs>
