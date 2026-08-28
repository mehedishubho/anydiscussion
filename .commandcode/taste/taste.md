# Taste

- Prefers defense-in-depth auth with DB-validated sessions over optimistic cookie checks — proxy for UX redirects only, (admin) layout as authoritative `getSession()` gate, and `requireCan`/`requireRole`/`getSessionOrThrow` as the first line in every protected server action/mutation; stale-cookie `getSessionCookie() → /dashboard` bounces should be removed in favor of page-level DB gates wrapped in Suspense. Confidence: 0.85
- Expects systematic auth coverage audits that map all routes, verify proxy vs layout vs action-level guards and RBAC (admin/editor/author), distinguish intentionally public handlers (contact/newsletter with honeypot + rate limiting, media streaming, rss/sitemap) from gaps, then patch and validate with `pnpm build` and middleware tests. Confidence: 0.82
