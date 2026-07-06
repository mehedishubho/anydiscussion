# Phase 5: SEO Basics - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-06
**Phase:** 5-SEO Basics
**Areas discussed:** P5/P6 boundary, OG image strategy, JSON-LD breadth, RSS feed shape, Post-editor SEO panel, SEO-settings page, Redirects proxy check, Sitemap coverage

**Notable pattern:** the founder delegated **every** gray area to Claude's discretion ("You decide" ×5, then "Lock all 3 as recommended" for the final batch). The options below are the alternatives Claude presented at each decision point; the resolution column records the locked default. The founder chose to explore 4 additional areas mid-discussion (post-editor SEO panel, settings/seo page, redirects check, sitemap coverage) after the initial 4.

---

## P5 / P6 boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Layer only (rec) | Phase 5 ships the SEO engine (`lib/seo/*` + `sitemap.ts`/`robots.ts`/`rss.xml` + metadata on existing `(site)` home & preview + dashboard validation); Phase 6 consumes it. No `[slug]` pull-forward unless verifier demands it. | ✓ (Claude-locked after "You decide") |
| Pull post route forward | Also build a minimal read-only `/[slug]` post page to prove generateMetadata + JSON-LD end-to-end this phase. | |
| You decide | Delegate the boundary to researcher/planner. | founder's literal pick → Claude locked the recommendation |

**User's choice:** "You decide" → Claude locked **Layer only** (D-01) with a documented fallback (pull a thin `/[slug]` forward only if the verifier demands a live post URL).

---

## OG image strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Static chain only (rec) | `og_image` → feature image → site default. Zero render complexity. | ✓ (Claude-locked) |
| Static + dynamic OG | Also a `/api/og/[slug]` Route Handler via `satori` + `@resvg/resvg-js`. Branded cards, real complexity + a perf consideration. | (fast-follow) |
| You decide | Delegate. | founder's literal pick |

**User's choice:** "You decide" → Claude locked **Static chain only** for v1 (D-09); dynamic OG is a documented fast-follow, added only if it clears the perf bar.

---

## JSON-LD breadth

| Option | Description | Selected |
|--------|-------------|----------|
| BlogPosting only | Literal SEO-03 minimum. | |
| BlogPosting + site-wide (rec) | + `WebSite`/`SearchAction` + `Organization`. Cheap once the builder exists. | ✓ (Claude-locked) |
| Full set now | + `BreadcrumbList` + `Person` (some need Phase 6 routes). | |
| You decide | Delegate. | founder's literal pick |

**User's choice:** "You decide" → Claude locked **BlogPosting + site-wide** (D-03); BreadcrumbList + Person ride to Phase 6.

---

## RSS feed shape

| Option | Description | Selected |
|--------|-------------|----------|
| Excerpt, posts only (rec at question time) | `/rss.xml`, excerpt body, posts only. Drives clicks. | |
| Full-text, posts only | Full sanitized HTML body. Maximizes readership/reach. | ✓ (Claude-locked — switched recommendation post-delegation) |
| Dual path + alias | `/rss.xml` + `/feed.xml`. Maximal compatibility. | |
| You decide | Delegate. | founder's literal pick |

**User's choice:** "You decide" → Claude locked **Full-text, posts only, `/rss.xml`** (D-07). *Note:* Claude's question-time recommendation was excerpt-only, but post-delegation it revisited the call against PROJECT.md's "readers consume content at maximum speed" core value and switched to full-text (the modern-blog default, à la Substack) as more aligned with a content-blog's growth posture.

---

## Post-editor SEO panel (additional area — elected by founder)

| Option | Description | Selected |
|--------|-------------|----------|
| Panel + auto-derive (rec) | SEO panel in the post editor; auto-derive title/desc/OG with manual override; wires `post_seo` writes. | ✓ (Claude-locked) |
| Fields only, no derive | Manual-only fields. More author friction. | |
| You decide | Delegate. | founder's literal pick |

**User's choice:** "You decide" → Claude locked **Panel + auto-derive** (D-08). *Discovery:* scouting confirmed the Phase 3 post editor does NOT write `post_seo` today (only `pages` does) — so this is required gap-closure work, not optional polish.

---

## SEO-settings dashboard page (additional area)

| Option | Description | Selected |
|--------|-------------|----------|
| Ship `settings/seo` page + seed keys (rec) | Admin-only page editing site defaults; consistent with Phase 4 `settings/storage`. | ✓ (locked in batch) |
| Defer page, seed-only | Seed keys, edit via DB. Leaner but bad non-dev-founder UX. | |
| Adjust other | — | |

**User's choice:** "Lock all 3 as recommended" → Claude locked **Ship `settings/seo` page + seed keys** (D-11).

---

## Redirects proxy check (additional area)

| Option | Description | Selected |
|--------|-------------|----------|
| Wire the empty-table check now (rec) | CLAUDE.md mandate; empty in v1, ready for SETT-03. Mechanism TBD (edge runtime caveat). | ✓ (locked in batch) |
| Defer until SETT-03 (v2) | Leave proxy.ts cookie-only this phase. | |
| Adjust other | — | |

**User's choice:** "Lock all 3 as recommended" → Claude locked **Wire the check now** (D-12). *Caveat flagged for researcher/planner:* Phase 2's `proxy.ts` is edge-runtime + cookie-only — a Drizzle/`pg` lookup likely can't run there; pick `runtime:'nodejs'` on the proxy vs a `not-found.tsx` server-component.

---

## Sitemap coverage (additional area)

| Option | Description | Selected |
|--------|-------------|----------|
| Posts + pages now, single sitemap (rec) | Extensible for Phase 6 archives; priority/changefreq defaults per type. | ✓ (locked in batch) |
| (no real alternative presented — discretion items) | sitemap-index, archive entries deferred to Phase 6/v2. | |

**User's choice:** "Lock all 3 as recommended" → Claude locked **Single sitemap, posts + pages now** (D-05); category/tag/author entries added in Phase 6; sitemap-index is a v2 scale concern.

---

## Claude's Discretion

Every area was delegated. The locked defaults (D-01..D-13 in CONTEXT.md) ARE Claude's recommendations. Explicitly-open mechanics left to the researcher/planner:
- metadataBase/canonical env var name + `(site)/layout.tsx` vs root placement
- sitemap priority/changefreq values + RSS latest-N count + `/feed.xml` alias
- Bangla meta thresholds + `Intl.Segmenter` vs byte-count
- Redirects-check mechanism (edge nodejs-flag vs `not-found.tsx`)
- Whether dynamic OG is added this phase or confirmed as fast-follow
- Exact `settings` key names + SEO panel component shape
- Whether to pull a minimal `/[slug]` forward if the verifier demands a live post URL

## Deferred Ideas

- Dynamic branded OG image generation → fast-follow / Phase 7+
- `BreadcrumbList` + `Person` author JSON-LD → Phase 6 (with archive/author routes)
- Category/tag/author archive entries in sitemap → Phase 6
- Sitemap-index (multi-sitemap) → v2 scale concern
- `/feed.xml` alias → builder-discretion / fast-follow
- Redirects manager UI → v2 (SETT-03)
- Analytics script injection → Phase 6 (ANAL-01/02)
- Production revalidation audit + CWV/bundle-budget pass → Phase 7 (PERF-01/02/03)

---

*Phase: 5-SEO Basics*
*Discussion log: 2026-07-06*
