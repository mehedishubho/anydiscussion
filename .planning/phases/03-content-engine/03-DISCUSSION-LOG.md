# Phase 3: Content Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 3-Content Engine
**Areas discussed:** Editor capabilities, Media upload flow, Scheduled publishing, Editing safety net, Bangla slug strategy, Excerpt behavior, Taxonomy boundary + rules, Feature image source, Editor UI polish boundary, Revalidation breadth

---

## Editor capabilities

### Q1 — Editor capability tier

| Option | Description | Selected |
|--------|-------------|----------|
| Lean (starter-kit) | Headings, bold/italic, lists, links, blockquote, inline code, horizontal rule. Leanest sanitize; no body images. | |
| Standard (+ media + code blocks) | Lean + media-library images in body + code blocks. Typical blog sweet spot. | |
| Rich (+ tables + embeds) | Standard + tables, pull-quotes/callouts, oEmbed embeds. Richest; most research risk. | ✓ |

**User's choice:** Rich (+ tables + embeds)
**Notes:** Concentrates research risk on the embed extension + SSR round-trip (matches roadmap MEDIUM flag). The permissive stance recurs across all editor answers.

### Q2 — Embed handling

| Option | Description | Selected |
|--------|-------------|----------|
| URL node → server-rendered | Author pastes URL only; server resolves embed iframe at render. Smallest XSS surface. | |
| Raw HTML paste → sanitize | Author pastes provider embed HTML; DOMPurify sanitizes (iframe allowlist per provider) before storage AND render. | ✓ |
| Defer embeds | Drop embeds from v1 rich set; ship tables + media + code now. | |

**User's choice:** Raw HTML paste → sanitize
**Notes:** Most flexible, largest sanitize surface. Researcher must nail the per-provider iframe/domain allowlist; raises priority of the MEDIUM research flag.

### Q3 — Body image sourcing

| Option | Description | Selected |
|--------|-------------|----------|
| Media library only (by reference) | Every body image references a media record; orphan-file hygiene. | |
| Inline upload OR library | Inline upload (creates a media record) or pick existing. | |
| Allow external URLs | Hot-linking OK; cdnImageLoader passes absolute URLs through. SSRF mitigation needed. | ✓ |

**User's choice:** Allow external URLs
**Notes:** Flagged SSRF implication — arbitrary external URLs through next/image's optimizer are an SSRF vector; researcher picks mitigation (remotePatterns allowlist or unoptimized passthrough).

### Q4 — Code block highlighting

| Option | Description | Selected |
|--------|-------------|----------|
| Plain (no highlighting) | `<pre><code>`, no tokenization. Zero extra JS, trivial sanitize. | ✓ |
| Server-side (Shiki) | Server render, no client JS, build CPU cost. | |
| Client-side (lowlight) | Tiptap CodeBlockLowlight; risks leaking to public chunk (PERF-02). | |

**User's choice:** Plain (no highlighting)

### Q5 — Link behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Auto external + nofollow | Forced target=_blank + rel=noopener noreferrer nofollow. | |
| Auto-linkify URLs too | Above + Linkify extension auto-links pasted URLs. | |
| Manual (author decides) | No forced attrs; author sets target/rel. DOMPurify allows these. | ✓ |

**User's choice:** Manual (author decides)
**Notes:** Keeps DOMPurify's default noopener-on-target=_blank safety; sanitizer must allow target/rel attrs.

### Continue check

**User's choice:** More editor questions (led to Q4 + Q5 above), then Next area.

---

## Media upload flow

### Q1 — Upload path (Phase-1 D-14 deferred decision lands here)

| Option | Description | Selected |
|--------|-------------|----------|
| Server-mediated (sharp at upload) | Client → Server Action → sharp variants → storage. Keeps Phase-1 pipeline + Pitfall #7. Raise body limit. | ✓ |
| Presigned + post-upload sharp | Client direct-uploads original; post-upload trigger runs sharp. Best for large files; async step + CORS. | |
| Presigned + client-side resize | Client resizes in-browser, uploads direct. Loses sharp quality. | |

**User's choice:** Server-mediated (sharp at upload)

### Q2 — Accepted file types

| Option | Description | Selected |
|--------|-------------|----------|
| Images only | sharp variants + next/image. Simplest single pipeline. | |
| Images + documents (PDF) | Images via sharp; PDFs stored as-is. | |
| Images + docs + video/audio | Full media library; non-image types skip sharp, stored as-is. | ✓ |

**User's choice:** Images + docs + video/audio
**Notes:** Data model accepts any mime; video/audio can't use next/image (need <video>/<audio>); sanitize must allow those elements.

### Q3 — Max upload size

| Option | Description | Selected |
|--------|-------------|----------|
| 10MB (de-facto images+docs) | Effectively excludes video. No special body-limit config beyond raised default. | ✓ |
| 100MB (incl. short video) | Allows short 720p video. Needs large body limit + longer timeout. | |
| 500MB+ (full video) | Full video hosting. Heavy; tension with server-mediated choice. | |

**User's choice:** 10MB (de-facto images+docs)
**Notes:** De-facto scopes v1 to images + small docs; video deferred-by-cap. Dissolves the server-mediated body-limit tension.

### Continue check

**User's choice:** Next area

---

## Scheduled publishing

### Q1 — Scheduler mechanism (CONT-09 adds worker/cron dependency)

| Option | Description | Selected |
|--------|-------------|----------|
| Cron → protected route | Coolify/host cron hits a secret route every few min. Reliable, decoupled from traffic. | |
| Lazy / on-request (no cron) | On-request query flips due posts. Zero infra; latency depends on traffic. | |
| In-process / worker | node-cron in the Next process (or worker container). Self-contained. | ✓ |

**User's choice:** In-process / worker
**Notes:** v1 single-instance OK; scheduler has no session → can't use transitionPost (needs system-publish path, R7 exception).

### Q2 — Scheduling scope

| Option | Description | Selected |
|--------|-------------|----------|
| Primitive + editor UI | Full feature: worker + publishedAt + datetime-picker in editor. | ✓ |
| Primitive only (UI in Phase 4) | Engine only; polished datetime-picker in Phase 4. | |

**User's choice:** Primitive + editor UI

### Q3 — Timezone

| Option | Description | Selected |
|--------|-------------|----------|
| UTC store + Dhaka display | UTC in DB; picker shows Asia/Dhaka from settings. Minute-resolution. | ✓ |
| UTC everywhere | Store + display UTC. Simplest; awkward for Dhaka team. | |
| Per-editor browser tz | Author's OS timezone. Ambiguous across editors. | |

**User's choice:** UTC store + Dhaka display

---

## Editing safety net

### Q1 — Autosave trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Debounced (on change) | ~3s after last keystroke; Saving/Saved indicator; TanStack mutation. | ✓ |
| Interval (every 30s) | Timer-based; more idle writes. | |
| On blur | Field-blur triggered; fewest writes; least live feel. | |

**User's choice:** Debounced (on change)

### Q2 — Autosave scope (given D-13 live edits)

| Option | Description | Selected |
|--------|-------------|----------|
| Drafts only (safe) | Autosave drafts/pending only; published needs explicit Save. | ✓ |
| All statuses (incl. live) | Autosave published too → changes go live within debounce. Risky (no revisions). | |

**User's choice:** Drafts only (safe)

### Q3 — Preview generation permission

| Option | Description | Selected |
|--------|-------------|----------|
| Author (own) + editor/admin | Author generates for own draft; editor/admin any. Matches Phase-2 trusting posture. | ✓ |
| Editor/admin only | Authors must submit first. Tighter control. | |
| Admin only | Most restrictive; overkill. | |

**User's choice:** Author (own) + editor/admin

### Q4 — Preview link life

| Option | Description | Selected |
|--------|-------------|----------|
| No expiry (rotate/revoke) | Long-lived until publish (rotates then) or explicit rotate/revoke. | ✓ |
| Time-boxed (7 days) | Auto-expire after 7 days. Safer default; slow reviewer gets expired surprise. | |
| Single-use | Per-session/short-lived. Defeats share-with-reviewer use case. | |

**User's choice:** No expiry (rotate/revoke)

---

## Bangla slug strategy

### Q1 — Slug generation (CONT-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-transliterate + override | Bangla→Latin via lib; manual override. Clean URLs; transliteration research risk. | |
| Bangla Unicode slug | Keep Bangla (URL-encoded on wire, decoded in address bar). Less portable. | |
| Manual entry only | Author always types slug (Latin). URL-safe validator. Zero transliteration risk. | ✓ |

**User's choice:** Manual entry only

---

## Excerpt behavior

### Q1 — Excerpt production

| Option | Description | Selected |
|--------|-------------|----------|
| Manual (auto fallback) | Hand-written field; auto-trim fallback if blank. | |
| Always auto-derived | First ~160 chars body plain-text. No author field. | |
| Both (author picks) | Manual field + auto-derive utility; author chooses per post. | ✓ |

**User's choice:** Both (author picks)

---

## Taxonomy boundary + rules

### Q1 — Taxonomy UI boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Actions + editor pickers (mgmt UI in P4) | Phase 3: actions + pickers; standalone mgmt pages Phase 4 (DASH-02). | ✓ |
| Full taxonomy UI now | Phase 3 ships standalone Categories/Tags pages too. Overlaps Phase 4. | |

**User's choice:** Actions + editor pickers (mgmt UI in P4)

### Q2 — Taxonomy constraints

| Option | Description | Selected |
|--------|-------------|----------|
| Required category, tags capped (~8) | One category required; tags up to ~8. Forces structure; caps tag spam. | ✓ |
| Optional category, tags capped | Flexible; some posts uncategorized (worse for SEO/archive). | |
| Required category, tags uncapped | Max freedom; tag sprawl/dupes risk. | |

**User's choice:** Required category, tags capped (~8)

---

## Feature image source

### Q1 — Feature image source

| Option | Description | Selected |
|--------|-------------|----------|
| Media library only | Tracked, optimized, reliable. Asymmetric to body images. | |
| Media library OR external URL | Consistent with body-image decision. Risk of broken card/OG if external dies. | ✓ |
| Optional (either source) | Not required to publish; fallback to site default. | |

**User's choice:** Media library OR external URL
**Notes:** Combined with the "optional to publish" framing — feature image is optional; source rule (library OR external) applies when set; fallback to site default in settings when absent.

---

## Editor UI polish boundary

### Q1 — Phase-3 editor page polish

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal functional now | Throwaway functional editor; Phase 4 polishes into TailAdmin. | |
| TailAdmin-quality now | Editor built into (admin) shell to near-final. Partially consumes Phase 4 DASH-01. | ✓ |

**User's choice:** TailAdmin-quality now
**Notes:** Cross-phase effect recorded — Phase 4's DASH-01 narrows to the OTHER dashboard pages (users, media browser, pages, settings); posts new/edit largely done in Phase 3.

---

## Revalidation breadth

### Q1 — Publish/update invalidation scope (CONT-08, Pitfall #3)

| Option | Description | Selected |
|--------|-------------|----------|
| Targeted (paths + tags) | revalidatePath concrete paths + revalidateTag by post/category/tag/author (2-arg). | ✓ |
| Broad (whole site) | revalidatePath('/', 'layout'). Simplest; discards entire ISR cache. | |
| Minimal (post page only) | Invalidate only the post page. Under-invalidation; stale listings. | |

**User's choice:** Targeted (paths + tags)

---

## Claude's Discretion

Areas delegated to researcher/planner (founder-level decisions exhausted):
- DOMPurify config + iframe/domain allowlist contents; SSRF mitigation choice for external images; DOMPurify target/rel behavior.
- node-cron lifecycle wiring in Next 16; exact system-publish SQL shape; minute interval.
- Local storage provider serve model (public/ vs route); exact settings keys; per-provider credential storage for v1.
- Tiptap v3 extension package list + exact extensions array for generateHTML (round-trip parity = MEDIUM research flag).
- StorageProvider interface method shapes; previewToken generation scheme; autosave debounce implementation; schema migration deltas.
- "Scheduled" status representation (new enum value vs publishedAt+draft signal).

## Deferred Ideas

- Video hosting (raise cap + presigned/streaming path) — fast-follow.
- Cloudinary + push-CDN storage providers — Phase 4 (DASH-09).
- Storage Settings admin page — Phase 4 (DASH-09).
- Categories/Tags standalone management UI — Phase 4 (DASH-02).
- Revision history / draft versions — v2 (CONTv2-01).
- Stricter editorial control (publish → pending_review on edit) — v2.
- Auto-transliteration / Bangla-Unicode slugs — rejected for v1 (D-20 manual); transliteration possible fast-follow if manual proves painful.
- Bundle-budget enforcement + production revalidation audit — Phase 7 (PERF-02, PERF-03).
