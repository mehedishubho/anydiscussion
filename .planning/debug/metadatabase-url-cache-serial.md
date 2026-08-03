---
status: resolved
trigger: "Next.js error (dev log, repeated): [ Cache ] Only plain objects can be passed to Client Components from Server Components. URL objects are not supported. {metadataBase: URL, title: ..., description: ..., openGraph: ..., twitter: ...}"
created: 2026-08-03T12:00:00.000Z
updated: 2026-08-03T18:07:00Z
goal: find_and_fix
resolved_by: "gsd-debug session 2026-08-03 (root-caused + fixed in-session)"
---

## Current Focus

hypothesis: CONFIRMED — `buildSiteMetadata` (src/lib/seo/metadata.ts:181) returns
  `metadataBase: new URL(s.canonicalBaseUrl)`. The `generateMetadata` in
  `(site)/layout.tsx` and `(site)/page.tsx` is annotated `"use cache"` (REQUIRED under
  cacheComponents:true). Next.js serializes a `'use cache'` return value through the RSC
  flight serializer; a `URL` instance is not serializable there → the `[ Cache ]` error.
  The page still renders (HTTP 200) but the cache write fails and the error spams every
  render. The error object's shape (metadataBase + title + description + openGraph +
  twitter) uniquely matches `buildSiteMetadata` — the other builders omit metadataBase/twitter.
test: Reproduced against the live dev server (PID 25524, port 3000). The dev log
  (.next/dev/logs/next-development.log) shows the exact error prefixed `[ Cache ]`.
expecting: After changing `metadataBase` from `new URL(...)` to the plain string
  `s.canonicalBaseUrl` (Next.js types: `metadataBase?: string | URL`), the `[ Cache ]`
  error stops and canonical/OG URL resolution is unchanged (Next.js coerces the string
  internally).
next_action: Apply one-line fix in metadata.ts + update the URL-instance assertion in
  metadata.test.ts, then re-curl the dev server + run the unit test.

## Symptoms

expected: `generateMetadata` returning site-wide metadata caches cleanly under
  cacheComponents:true with no server errors.
actual: Every render of a (site) route logs `[ Cache ] Only plain objects can be passed
  to Client Components from Server Components. URL objects are not supported.` pointing at
  `metadataBase`. The HTML still returns 200.
errors: `[ Cache ] Only plain objects can be passed to Client Components from Server
  Components. URL objects are not supported. {metadataBase: URL, ...}`
reproduction: `pnpm dev`, GET http://localhost:3000/ (any (site) route triggers the layout
  generateMetadata). Confirmed in .next/dev/logs/next-development.log.
started: Noticed 2026-08-03 (surfaces on any prerender of a (site) route under cacheComponents).

## Evidence

- timestamp: 2026-08-03T12:00Z
  checked: Only source of `metadataBase:` in the repo — ripgrep across src
  found: Single occurrence: `src/lib/seo/metadata.ts:181` inside `buildSiteMetadata`.
    All other builders (buildPostMetadata/buildPageMetadata/buildArchiveMetadata) omit
    metadataBase entirely — so the error shape uniquely identifies buildSiteMetadata.
  implication: The leaked object is the `buildSiteMetadata` return value.

- timestamp: 2026-08-03T12:00Z
  checked: Every caller of buildSiteMetadata (ripgrep)
  found: Only two production call sites: `(site)/layout.tsx:50` and `(site)/page.tsx:52`,
    BOTH inside `generateMetadata` annotated `"use cache"`. The result is RETURNED from
    generateMetadata (framework-consumed), never passed as a prop to a client component.
  implication: This is NOT a server→client prop leak. It is the `'use cache'` directive
    serializing the return value (cached results are stored/serialized through the RSC
    flight format), where `URL` is non-serializable.

- timestamp: 2026-08-03T12:00Z
  checked: Live repro — `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`
    then read .next/dev/logs/next-development.log
  found: HTTP 200 (page renders), but the log contains repeated:
    `{"source":"Server","level":"ERROR","message":"[ Cache ] Only plain objects can be
    passed to Client Components from Server Components. URL objects are not supported.\n
    {metadataBase: URL, title: ..., description: ..., openGraph: ..., twitter: ...}\n ^^^"}`
  implication: The `[ Cache ]` prefix is decisive — the failure originates in the
    `'use cache'` serialization path, not in prop passing or in normal Metadata API
    handling (Next.js docs do show `metadataBase: new URL(...)` as valid for NON-cached
    metadata; the friction is specifically `'use cache'` + URL instance).

- timestamp: 2026-08-03T12:00Z
  checked: Next.js Metadata type for metadataBase
  found: `metadataBase?: string | URL` — a plain string is a fully supported alternative.
  implication: Passing the string is functionally identical (Next.js coerces it to a URL
    for canonical/OG resolution) AND cache-serializable. No behavioral/SEO regression.

- timestamp: 2026-08-03T12:00Z
  checked: `pnpm build` (production)
  found: Build is CURRENTLY BLOCKED by an UNRELATED Phase-08 error:
    `./src/app/api/auth/google/callback/route.ts:26 — Route segment config "runtime" is
    not compatible with nextConfig.cacheComponents. Please remove it.` (`export const
    runtime = "nodejs"`). This is a separate bug (flagged to user); the metadata fix is
    independent and verifiable via the dev server.
  implication: The metadata error is dev-runtime; the route runtime export is a
    production-build blocker. Both need fixing for a green build but they are independent.

## Eliminated

- hypothesis: A Server Component passes the metadata object as a prop to a Client Component.
  evidence: ripgrep for `metadata={` / `meta={` / `seo={` / `Metadata`-typed props found
    ZERO matches. buildSiteMetadata is only ever returned from generateMetadata. ELIMINATED.
  timestamp: 2026-08-03T12:00Z

- hypothesis: Remove `'use cache'` from generateMetadata to fix serialization.
  evidence: The layout comment + 05-RESEARCH Pitfall 1 document that `'use cache'` is
    REQUIRED under cacheComponents:true for a generateMetadata reading external data;
    removing it raises "metadata accesses uncached data but page is otherwise fully
    prerenderable." ELIMINATED (would trade one error for another).
  timestamp: 2026-08-03T12:00Z

## Resolution

root_cause: `buildSiteMetadata` returns `metadataBase: new URL(s.canonicalBaseUrl)`.
  Under `cacheComponents:true`, the `generateMetadata` in `(site)/layout.tsx` and
  `(site)/page.tsx` carries `"use cache"`, so Next.js serializes the return value through
  the RSC flight serializer. A `URL` instance is not serializable there, producing the
  repeated `[ Cache ] Only plain objects can be passed... URL objects are not supported`
  error. Pages still render (HTTP 200) but metadata never caches.

fix: In `src/lib/seo/metadata.ts`, change `metadataBase: new URL(s.canonicalBaseUrl)` →
  `metadataBase: s.canonicalBaseUrl` (plain string; `metadataBase?: string | URL`).
  Update the buildSiteMetadata JSDoc (no longer "a URL"; cite the cache-serialization
  reason). Update the unit test `metadata.test.ts` that asserts `toBeInstanceOf(URL)` to
  assert the string form instead. Canonical/OG resolution unchanged (Next.js coerces the
  string internally).

verification: DONE (2026-08-03). `pnpm build` → BUILD_EXIT=0; grep counts: route-segment
  errors 0, "URL objects are not supported" 0, no type-check/compile/prerender errors. The
  (site) routes prerendered as ◐ Partial Prerender — i.e. the `'use cache'` generateMetadata
  ran during prerender with the string metadataBase and emitted NO `[ Cache ]` error. Unit
  tests: 506/506 pass (`pnpm test`), including the rewritten metadata + google-callback suites.
  NOTE: the long-running dev server (PID 25524) was serving stale `'use cache'` data and will
  keep logging the old error until restarted — a restart clears it (code is verified correct).

related_findings (fixed in same session, uncovered while verifying):
  1. src/app/api/auth/google/callback/route.ts — `export const runtime = "nodejs"` is
     incompatible with cacheComponents (blocked ALL production builds). Removed; Node.js is
     the default Route Handler runtime so googleapis stays server-side.
  2. Same route — GET read `state`/`code` from a non-existent `{ searchParams }` context
     property (Route Handlers only receive dynamic-segment `params`; query params come from
     `request.url`). As written it ALWAYS returned 400 → the entire Phase 08-03 Drive OAuth
     flow was broken; its test passed only because it faked the same wrong shape. Fixed to
     read `new URL(request.url).searchParams`; test updated (callGet via URL query string,
     `runtime` assertion replaced with an absence guard).
files_changed:
  - src/lib/seo/metadata.ts (metadataBase: new URL(...) → string)
  - src/lib/seo/__tests__/metadata.test.ts (assert string, not URL instance)
  - src/app/api/auth/google/callback/route.ts (remove runtime export; fix GET signature)
  - src/lib/backup/__tests__/google-callback.test.ts (callGet via URL; runtime guard)
