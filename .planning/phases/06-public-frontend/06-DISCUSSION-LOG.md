# Phase 6: Public Frontend - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `06-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 6-Public Frontend
**Areas discussed:** View-count path; Browse IA (home / /blog / archive); Single-post shape; Contact form delivery; Search UX; Header & footer + nav; Author page; Archive filters; Dark-mode toggle; Category/tag archives; Reading time + TOC; Empty/streaming states

---

## Area selection (gray-area menu)

| Round | Question | Selected |
|---|---|---|
| R1 | Which areas to discuss? | View-count path, Home / /blog / archive, Single-post shape, Contact form delivery (all 4) |
| R2 | Which additional areas? | Search UX, Header & footer + nav, Author page, Archive filters (all 4) |
| R3 | Which next-layer areas? | Dark-mode toggle, Category/tag archives, Reading time + TOC, Empty/streaming states (all 4) |

The user opted to "Explore more gray areas" twice before declaring readiness — every product-level gray area was resolved.

---

## View-count path (SITE-07 streaming hole + SITE-17)

### Storage / accuracy
| Option | Description | Selected |
|---|---|---|
| Simple counter column | `views` int column on `posts`, atomic +1, no de-dupe (accepts minor crawler/refresh inflation) | ✓ |
| De-dupe table | `post_views` table counting unique (post × IP/session × time-window); more accurate, more write rows | |
| From analytics (Umami API) | No first-party counter; display fetched from Umami — couples display to analytics uptime (instance deploys Phase 7) | |
| You decide | Lock the recommended | |

**User's choice:** Simple counter column.

### Write path (PPR-safe increment)
| Option | Description | Selected |
|---|---|---|
| Server-side in Suspense slot | The streaming view-count async component does the atomic +1 per real visit; static body stays cached under PPR; zero client JS | ✓ |
| Client beacon + Route Handler | Tiny client fetch to `/api/views/[slug]` does the +1; page fully static/ISR; adds client JS + endpoint | |
| You decide | Lock the recommended | |

**User's choice:** Server-side in Suspense slot.

---

## Browse IA (SITE-01/02/03)

### Route split
| Option | Description | Selected |
|---|---|---|
| Magazine + feed + list | Home = magazine (hero + grid + category teasers); /blog = paginated feed; archive = dense filterable list | ✓ |
| Home IS /blog + archive | Collapse home + /blog into one feed; archive separate | |
| Magazine home + /blog doubles as archive | Home = magazine; /blog is feed AND filterable archive | |

**User's choice:** Magazine + feed + list (three distinct routes).

### "Featured" definition
| Option | Description | Selected |
|---|---|---|
| Manual `featured` flag | Boolean on posts (default false); editor-curated; home hero ≠ /blog first item | ✓ |
| Latest N (no flag) | Featured = newest published; no schema change; home hero = /blog first item (overlap) | |
| Flag + manual order | `featured` + a sort/`featuredAt` field for hero rotation | |

**User's choice:** Manual `featured` flag. (Pagination = classic numbered, builder discretion.)

---

## Single-post page (SITE-07/13/14)

### Layout archetype
| Option | Description | Selected |
|---|---|---|
| Centered + sticky TOC sidebar | Centered prose; sticky TOC (H2/H3) on desktop / inline on mobile; meta-row share + reading time; read-progress bar; Suspense(view-count + related) at end | ✓ |
| Centered + inline top TOC (lightest) | Static TOC list above body; no sidebar/scroll-spy; least client JS | |
| Rich magazine + sticky share rail | Full-width hero + byline avatar + sticky share rail + sticky TOC + related grid (most client JS) | |

**User's choice:** Centered + sticky TOC sidebar.

### Related-posts algorithm
| Option | Description | Selected |
|---|---|---|
| Same category, fallback to tags | Same category (latest first); fill remaining with most-tag-overlap; exclude current; cap ~3–4 | ✓ |
| Shared tags only | Most tag-overlap; ignore category | |
| Combined score (category + tags) | Weighted same-category + shared-tag count; top-N; more query | |

**User's choice:** Same category, fallback to tags.

---

## Contact form (SITE-10)

### Delivery mechanism
| Option | Description | Selected |
|---|---|---|
| Reuse lib/email (Resend) | Existing Phase-2 wrapper; one email integration; deliverability managed; Phase-2 adoption is the "no paid API" precedent | ✓ |
| Raw SMTP via nodemailer | Self-hosted SMTP relay; literal "SMTP, no paid API"; deliverability burden (DKIM/SPF/DMARC) | |
| You decide | Lock reuse lib/email | |

**User's choice:** Reuse lib/email (Resend).

### Storage
| Option | Description | Selected |
|---|---|---|
| Email-only, no DB | Fire email, store nothing — matches PROJECT.md "no DB storage" | ✓ |
| Also log to a table | `contact_messages` dashboard inbox — resilience/archive; deviates from "no DB storage" | |

**User's choice:** Email-only, no DB. (Honeypot + in-memory rate-limit, builder discretion.)

---

## Search (SITE-08)

| Option | Description | Selected |
|---|---|---|
| Page-only | `/search` GET form + server-rendered PG-FTS ranked results; filters via URL params; header search icon | ✓ |
| Page + header autocomplete | Above + header typeahead (client component + API Route) | |

**User's choice:** Page-only.

---

## Header & footer + nav (cross-cutting)

| Option | Description | Selected |
|---|---|---|
| Standard with categories dropdown | Logo + nav (Home/Blog/Categories dropdown/About/Contact) + search icon + dark toggle; rich footer | ✓ |
| Minimal / flat nav | Logo + flat nav + dark toggle; search via footer link; footer = legal links only | |
| You decide | Lock the recommended | |

**User's choice:** Standard with categories dropdown.

---

## Author page (SITE-06)

| Option | Description | Selected |
|---|---|---|
| Full bio page + username slug | `/author/[username]` (bio + avatar + posts + Person JSON-LD + byline link); adds `username` column on `user` | ✓ |
| Full page, use UUID URL | Same page but `/author/[user.id]`; no schema change; ugly URLs | |
| Minimal header + username slug | Posts list + small header (name + avatar, no bio); adds username | |

**User's choice:** Full bio page + username slug.

---

## Archive filters (SITE-03)

| Option | Description | Selected |
|---|---|---|
| Top filter bar + pagination | Category/tag/author/date-range via URL params; numbered pagination | ✓ |
| Sidebar facets + pagination | Left-sidebar checkbox facets; richer UX, more layout | |
| You decide | Lock the recommended | |

**User's choice:** Top filter bar + numbered pagination.

---

## Dark-mode toggle (SITE-16)

| Option | Description | Selected |
|---|---|---|
| System + header toggle | OS preference default + small client toggle + no-flash `<head>` script | ✓ |
| System-only, no toggle | Media-query-driven class; zero client JS; no override | |
| Share dashboard setting | Cookie/shared pref couples (site) and (admin) | |

**User's choice:** System + header toggle.

---

## Category/tag archives (SITE-04/05)

| Option | Description | Selected |
|---|---|---|
| Reuse archive template | `/category/[slug]` + `/tag/[slug]` reuse ArchiveList pre-filtered; + BreadcrumbList JSON-LD | ✓ |
| Distinct simpler pages | Lighter taxon post list (no full filter bar); BreadcrumbList still | |

**User's choice:** Reuse archive template.

---

## Reading time + TOC (SITE-13)

| Option | Description | Selected |
|---|---|---|
| Bangla-aware + H2/H3 | `Intl.Segmenter` word count × tunable WPM (~200); TOC = H2 + H3 | ✓ |
| Simple words/min + H2 only | Naive whitespace word count (Latin assumption); TOC H2 only | |

**User's choice:** Bangla-aware + H2/H3.

---

## Empty / streaming states (cross-cutting)

| Option | Description | Selected |
|---|---|---|
| Skeletons + friendly empties | Skeleton placeholders in Suspense; meaningful empty/no-result copy; friendly 404 (suggested posts + search) | ✓ |
| Minimal | Spinners; plain "No results"; minimal 404 | |

**User's choice:** Skeletons + friendly empties.

---

## Claude's Discretion

The user did not delegate any area wholesale to "You decide" — every area received an explicit product choice. Claude's discretion applies only to the listed mechanics in `06-CONTEXT.md` (cacheLife/cacheTag profiling, query-module shape, share targets, username rules, honeypot/rate-limit specifics, settings key names, card ratios, copy).

## Deferred Ideas

- Dynamic branded OG image generation → Phase 7+ fast-follow.
- Umami analytics instance deploy + GA4/Plausible swap → Phase 7 (injection-only this phase).
- Persistent (Redis-backed) rate limiting + multi-instance view-count dedupe → v2 (SCALE-01).
- Production CWV/bundle-budget pass + publish→visible audit → Phase 7 (PERF-01/02/03).
- Menu builder + redirects manager UI → v2 (SETT-01/03).
- Comments / reader discussion → Out of Scope.

### Reviewed Todos (not folded)
- "Configurable multi-destination backup system" — false-positive match (score 0.6); already mutated into Phase 8 (BACKUP-01..05). Reviewed-and-not-folded in Phases 1–6.
