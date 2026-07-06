---
status: testing
phase: 05-seo-basics
source: [05-VERIFICATION.md]
started: 2026-07-07T04:30:00Z
updated: 2026-07-07T04:30:00Z
---

## Current Test

number: 1
name: Live HTML — home page `<title>` + two JSON-LD script tags
expected: |
  `pnpm dev`, open http://localhost:3000/, view page source.
  `<title>Any Discussion</title>` (or seeded site.title) is present, AND two
  `<script type="application/ld+json">` tags appear in the body — one WebSite
  (with potentialAction SearchAction), one Organization. Confirms SC-1 at the
  runtime-HTML level.
awaiting: user response

## Tests

### 1. Live HTML — home page `<title>` + two JSON-LD script tags
expected: With `pnpm dev` running, `http://localhost:3000/` page source contains `<title>Any Discussion</title>` (or seeded site.title) and two `<script type="application/ld+json">` tags (WebSite + Organization). Proves SC-1 at runtime (build + unit tests cannot observe streamed HTML).
result: [pending]

### 2. Populated-DB sitemap / RSS / robots content
expected: With ≥1 published post + page seeded, `curl http://localhost:3000/sitemap.xml` lists home (1.0/daily) + post (/blog/{slug}, 0.8/weekly) + page (/{slug}, 0.5/monthly), no drafts/soft-deleted; `curl /rss.xml` returns `application/rss+xml` with one `<item>` per published post (full-text body in CDATA); `curl /robots.txt` shows allow "/" + disallow ["/preview/","/dashboard/","/signin","/signup","/forgot-password"] + sitemap pointer.
result: [pending]

### 3. Editor flow — SEO panel saves post_seo
expected: As an editor, create a post filling the 4 SEO panel fields (meta title, meta description, canonical URL, OG image), save, then inspect the `post_seo` row in the DB. Row exists with the 4 fields populated; grapheme-invalid inputs are logged + skipped without failing the save (defensive safeParse).
result: [pending]

### 4. Admin flow — settings/seo cache invalidation end-to-end (covers behavior_unverified[0])
expected: As admin, open `/dashboard/settings/seo`, edit the 5 fields, save, then reload `/` in a browser. The home page `<title>` + JSON-LD update on the NEXT request (no container restart) — proves `revalidateTag("seo-settings","max")` actually invalidates the `getSeoSettings` `'use cache'` snapshot at runtime.
result: [pending]

### 5. Redirects runtime — 404 fallback + populated-row redirect (covers behavior_unverified[1])
expected: On a running dev server, visit an unmatched path (e.g. `/nonexistent`) → the 404 UI renders WITHOUT crashing (empty redirects table → try/catch swallows → null → 404). Then manually insert a `redirects` row (old_path `/old`, new_path `/new`, status_code 301) and visit `/old` → `permanentRedirect`/`redirect` fires to `/new`.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
