# Pitfalls Research

**Domain:** Self-hosted Next.js 16 blog CMS — Better Auth RBAC, Drizzle/Postgres, Tiptap editor, Cloudflare R2, Coolify/VPS
**Researched:** 2026-07-01
**Confidence:** MEDIUM overall (HIGH for the well-established Next.js ISR and Drizzle migration mechanics; MEDIUM for Better Auth RBAC specifics and Tiptap XSS internals — verify exact API names against current docs in the implementing phase; the **failure modes** themselves are HIGH-confidence, since they are documented behaviors of this exact stack)

> Note on sourcing: the project research seam routed docs questions to Context7, but the Context7 MCP server was unavailable in this environment, and the web-search backend was rate-limited (quota reset 2026-07-12). Two of three primary searches (Next.js 16 ISR, Better Auth RBAC) returned substantive, technically-accurate content; the rest is consolidated from established, version-stable knowledge of these exact libraries. Before the implementing phase, re-verify exact function/option names (`getSessionCookie`, `auth.api.userHasPermission`, `cacheLife`/`cacheTag`, `dynamicParams`, sharp loader config) against current docs — the **pitfalls** hold regardless of minor API drift.

---

## Critical Pitfalls

### Pitfall 1: Missing server-side auth on a mutating Server Action (SECURITY — highest severity)

**What goes wrong:**
A Server Action that mutates data (create/update/delete/publish post, change a role, edit settings, upload media) trusts the caller because the dashboard UI only *shows* that action to authorized users. An attacker — or any signed-in `author` — calls the action directly (devtools network tab, a hand-crafted `fetch` to the action ID, or a tampered form) and performs an operation they should not be allowed to do: publishing their own draft, editing another author's post, changing their own role to `admin`, injecting custom code into settings, deleting media.

**Why it happens:**
- The developer treats "the button isn't rendered" as a permission boundary. It is not — UI hiding is a UX concern, never a security control.
- The middleware route-gate on `(admin)` only checks that *some* session exists; it does not (and on the edge, *cannot*) verify the role or resource ownership. Developers confuse "middleware let them in" with "they're authorized for this action."
- A `useActionData`/TanStack Query flow feels "server-side" because it hits the server, so it feels safe — but the action body itself has no `getSession` + permission check at the top.

**How to avoid:**
- **Hard rule, enforced in code review and a lint check:** every `use server` function whose name starts with a mutation verb (`create`, `update`, `delete`, `publish`, `submit`, `set`, `upload`) MUST begin with:
  1. `const session = await auth.api.getSession({ headers: await headers() })` — reject if null (401-equivalent: throw `redirect` to signin or return an error result).
  2. A role/permission check appropriate to the action (`session.user.role`, or `auth.api.userHasPermission(...)`).
  3. A **resource-ownership** check where the role allows partial access — e.g. for `author`, verify `post.author_id === session.user.id` *after* fetching the post, before mutating. (An `author` editing "a post" is allowed; editing *your* post is allowed, *someone else's* is not. The check must be on the fetched row, not on a client-supplied `authorId`.)
- Do the check in the **Server Action**, not just middleware. Middleware is a coarse route gate; the action is the real boundary.
- Write a tiny shared helper (`lib/permissions/requireRole(role)`, `requireOwnPost(postId, session)`) so the check is one line and can't be "forgotten" inline.
- Add a CI grep test: every file in `actions/` must reference `getSession` or `requireRole`/`requirePermission`. This catches new actions added in a hurry.

**Warning signs:**
- Any `actions/*.ts` function that does not import from `lib/auth` or call `getSession`.
- A mutation that accepts a `userId`/`authorId`/`postId` from the client and trusts it without re-verifying ownership server-side.
- "It works when I click the button" used as the test — that only exercises the happy UI path, not the direct-invocation path.
- Middleware matcher covers `(admin)` but no action does its own role check.

**Phase to address:** **Auth + RBAC phase** (establish the `requireRole`/`requireOwnPost` helpers and the "every mutation starts with a check" convention) — and reinforced in every subsequent phase that adds a new action (content engine, settings, media, users).

---

### Pitfall 2: Unsanitized custom-code / raw-HTML injection stored and rendered (SECURITY — highest severity)

**What goes wrong:**
The settings table has fields for header/footer custom code, analytics snippets, or embeds. An `admin` (or, if Pitfall 1 also fails, anyone) pastes a `<script>` that runs on every public page — session hijacking, cookie exfiltration, crypto-miner injection, SEO spam links, or a defacement. Because it's stored in `settings` and rendered into the public layout, it executes for **every reader on every page**. Even with role-gating done right, a compromised or malicious admin account turns this into a site-wide XSS.

A second variant: the Tiptap post body or an embed field is rendered with `dangerouslySetInnerHTML` from stored HTML without sanitization, allowing per-post XSS.

**Why it happens:**
- The field is *intended* to allow `<script>` (that's the point of "custom code injection"), so developers don't sanitize it — but they fail to constrain *who* can write it and *what* runs.
- Sanitization is done at store-time only (or render-time only), not both. If only store-time, a later schema/format change or a DB restore can re-introduce unsanitized content. If only render-time, a bug in the render path (a new component, a cached HTML snippet) exposes it.
- `isomorphic-dompurify` is configured with a permissive default that still allows event handlers (`onerror`, `onload`) on tags people think are "safe" (`<img onerror=...>`).
- Tiptap HTML stored via `getHTML()` and later rendered raw outside the editor loses ProseMirror's schema-based filtering.

**How to avoid:**
- **Two-layer sanitization, both mandatory:** sanitize raw-HTML/JS fields on the way *in* (Server Action, before `INSERT`/`UPDATE`) AND on the way *out* (before render). Store-time defends the database; render-time defends against DB drift, restores, and code changes.
- For "custom code injection" specifically: use DOMPurify with an **explicit, allowlist-based config** — never the default for fields that accept `<script>`. Decide deliberately whether `<script>` is allowed at all; if analytics snippets are the use case, consider a structured "analytics ID" field instead of freeform code.
- **Role-gate custom-code fields separately.** Not every `admin` action should touch custom code; in v1 scope this is explicitly fast-follow/deferred — do **not** ship a freeform code-injection field in v1 at all. Defer it (per PROJECT.md Out of Scope) until you've designed the sanitization + audit-log story.
- For Tiptap bodies: prefer storing **ProseMirror JSON** (`getJSON()`) over HTML. JSON can only represent nodes/marks your schema defines; it structurally rejects unknown tags. When rendering, either rehydrate through Tiptap (schema-constrained) or sanitize the generated HTML with DOMPurify before `dangerouslySetInnerHTML`.
- Sanitize **pasted** content too — wire `editor.props.handlePaste` through DOMPurify so clipboard HTML is cleaned before parsing.
- Write a render-time test: insert `<img src=x onerror=alert(1)>` into every HTML-emitting field and assert the rendered output has no `onerror`.

**Warning signs:**
- A settings/embed field rendered with `dangerouslySetInnerHTML` and no DOMPurify call on the same code path.
- Sanitization only in the Server Action, with the render path assuming "it's already clean."
- DOMPurify used with no config object (defaults can be too permissive for `<img>`/`<svg>` event handlers).
- Tiptap content stored as raw HTML and rendered outside the editor.
- A custom-code-injection field shipped in v1 without an explicit security review.

**Phase to address:** **SEO/settings phase** for sanitization primitives (DOMPurify helper, sanitization unit tests) and **every phase that renders stored HTML** (content engine for post bodies; public frontend for layout/settings injection). Custom-code injection itself is **out of scope for v1** — do not build it until the sanitization story is proven.

---

### Pitfall 3: `revalidatePath`/`revalidateTag` not actually revalidating (stale content on publish)

**What goes wrong:**
An editor publishes a post (or updates one), but the public site keeps serving the old version — sometimes for minutes, sometimes indefinitely. Readers see stale content; SEO crawlers index the old version. The bug is intermittent and "fixes itself" on the next hard refresh, making it hard to reproduce.

**Why it happens (the documented Next.js 16 failure modes):**
- `revalidatePath`/`revalidateTag` are **no-ops outside a Server Action or Route Handler**. Calling them during a Server Component render silently does nothing — no error, no revalidation.
- **Path format is exact and picky.** `revalidatePath('/blog/[slug]')` does nothing; you must pass a concrete path (`/blog/hello-world`). Trailing slashes, `basePath`, and locale prefixes must match what's actually in the router. With `basePath`, the path passed must **not** include the basePath.
- **`revalidateTag` only affects `fetch` calls that set `next: { tags: [...] }`.** Tag revalidation with no tagged fetch is a silent no-op.
- **`dynamicParams = false`** on a route locks it to `generateStaticParams` output; on-demand revalidation and ISR for not-yet-generated params can fail. New published posts may 404 instead of appearing.
- **CDN/browser cache lies on top.** Even after Next revalidates, the browser's cached RSC payload and an upstream CDN (Cloudflare in front of Coolify) can serve stale HTML. Client-side `<Link>` navigation uses cached RSC payloads, so navigating from another page shows old data even after a hard refresh of the URL works.
- **Next.js 15+ changed fetch caching.** By default `fetch` is **not** cached unless you opt in. Mixing the old `next.revalidate` with the newer `cacheLife`/`cacheTag` APIs on the same resource produces confusing, conflicting behavior.
- **`output: 'export'` disables ISR entirely** — a leftover from scaffolding will silently break all of this.

**How to avoid:**
- Put `revalidatePath`/`revalidateTag` calls in the **Server Action that performs the publish/update** — never in a render path. After a successful DB write, call `revalidatePath('/blog')`, `revalidatePath(\`/blog/${slug}\`)`, `revalidatePath('/')`, and `revalidateTag('posts')`.
- **Tag your fetches** (`next: { tags: ['posts', \`post:${slug}\`] }`) so `revalidateTag` is meaningful, and prefer tags over long path lists where possible.
- Use **concrete paths derived from the row** (`/blog/${post.slug}`), never template strings with `[slug]`.
- On dynamic routes, set `dynamicParams = true` (the default) and provide `generateStaticParams` for the common cases so new posts appear without a full rebuild. Verify `export const dynamic` is not accidentally set to `force-static` on publish-affected routes.
- Call `router.refresh()` from the dashboard after a successful mutation so the editor sees the update without a hard refresh.
- **Test the publish → public-visible flow end to end** as an explicit acceptance check, not a side-effect of testing CRUD.
- Do not mix `next.revalidate` and `cacheLife`/`cacheTag` on the same resource — pick the new caching model and use it consistently.

**Warning signs:**
- "I published but the homepage still shows the old list" until a hard refresh or container restart.
- `revalidatePath` called inside a Server Component body or a `generateMetadata` function.
- Path arguments containing `[slug]` or other dynamic segment brackets.
- A route with `dynamicParams = false` that's expected to gain new entries over time.
- Cloudflare or browser cache headers (`Cache-Control: max-age=…`) fighting Next's revalidation.

**Phase to address:** **Content engine phase** (wire revalidation into publish/update Server Actions) and verified in the **Public frontend phase** (ISR/PPR first) + **Performance/deploy phase** (test the publish→visible loop on the real Coolify/Cloudflare stack, since self-hosted multi-instance caching changes the story — see Pitfall 6).

---

### Pitfall 4: Better Auth RBAC — relying on middleware role checks that can't actually run

**What goes wrong:**
The developer puts `if (session.user.role !== 'admin') redirect(...)` in `middleware.ts` to gate `(admin)`, and assumes the role check is enforced. But Next.js middleware runs on the **edge runtime**, which cannot run Better Auth's full session verification (it needs the DB / verified JWT). So either (a) the check is downgraded to "does a session cookie exist?", which lets any *valid session* through regardless of role, or (b) the middleware tries to call `auth.api.getSession` and throws/fails open. Combined with Pitfall 1 (no action-level check), an `author` session reaches admin-only actions.

**Why it happens:**
- Better Auth's session validation is a server/Node concern; the edge can't do it. The documented pattern is `getSessionCookie(request)` in middleware — and the docs explicitly warn that **cookie existence ≠ a valid session and ≠ a role**.
- Developers read "RBAC plugin" and assume role checks are cheap and edge-safe. They aren't, by design.
- The `admin` plugin and the `access` (fine-grained permissions) plugin are separate; people wire `admin()` and assume they have `userHasPermission`, which actually needs `access()`.

**How to avoid:**
- **Middleware = coarse gate only.** Use `getSessionCookie(request)` to bounce requests with *no* session cookie to `/signin`. That's its entire job. Do not attempt role logic there.
- **Server Components / Route Handlers / Server Actions = the real authorization layer.** There, call `auth.api.getSession({ headers: await headers() })` (this validates the session for real) and then check `session.user.role` or `auth.api.userHasPermission(...)`.
- If you need fine-grained permissions (not just the three roles), add the **`access` plugin** alongside `admin` — `userHasPermission` lives there.
- Make the role field part of the session/user object that Better Auth exposes after `getSession` (extend the user table with `role` per CLAUDE.md schema) so you don't need a second DB hit on every action.
- Keep a single `requireRole`/`requirePermission` helper (see Pitfall 1) so the "real check" location is unambiguous.

**Warning signs:**
- `auth.api.getSession` (the full server call) appearing in `middleware.ts`.
- Middleware branching on `session.user.role` — it can't reliably know the role there.
- A route that's "protected" only by middleware, with no Server Component/Action check.
- Confusion between the `admin` and `access` plugins ("why is `userHasPermission` undefined?").

**Phase to address:** **Auth + RBAC phase.** Get the middleware-does-only-cookie-check vs. action-does-real-check split right on day one; it's hard to retrofit.

---

### Pitfall 5: Drizzle migration drift from hand-editing generated SQL or editing snapshots

**What goes wrong:**
The schema and the database diverge. Future `drizzle-kit generate` calls produce no-op migrations (or worse, try to re-create/drop things that already changed), `drizzle-kit push` and `migrate` disagree, and a fresh clone + migrate does not reproduce the production DB. In the worst case a migration silently drops a column or fails mid-deploy.

**Why it happens:**
- A developer hand-edits a generated `.sql` file (to rename a column instead of drop+add, or to add an index) without understanding that the **snapshot** in `meta/*.snapshot` is what `generate` diffs against next. The SQL and the snapshot now disagree.
- Someone edits a snapshot or `meta/_journal.json` directly (e.g. to "remove" a bad migration), breaking the chain.
- Two branches each run `generate`, producing two migrations from the same parent snapshot with the same hash prefix — on merge, the journal has conflicting entries.
- Using `drizzle-kit push` (schema → DB directly) in one environment and `migrate` (via SQL files) in another, so the "source of truth" is ambiguous.

**How to avoid:**
- **Never hand-write SQL migrations, never edit snapshots/journal by hand** (matches the PROJECT.md constraint). Generate with `drizzle-kit generate` after every schema change.
- If you must customize a generated migration (e.g. to make a column rename non-destructive), do it by editing the **generated `.sql`** *before* running it, and make a matching note — but understand the snapshot now reflects the *original* generated intent, so verify the next `generate` produces an empty diff. The safer pattern: model the rename in schema (e.g. Drizzle's rename support) so generation handles it.
- **Commit `meta/_journal.json`, all `meta/*.snapshot`, and every `.sql` migration.** They are the migration history.
- Run `pnpm drizzle-kit generate` **immediately** after editing `db/schema.ts`, and commit the generated migration in the same PR as the schema change — never let schema edits and migrations drift across PRs.
- **One workflow only:** pick `migrate` (SQL files, applied via `drizzle-kit migrate` or the migrator at deploy) as the canonical path. Use `push` only for local dev scratch. Don't mix them for the same DB.
- Resolve migration-sequence conflicts on branch merge by re-generating from the merged schema (delete the conflicting migration, re-run `generate` against the merged snapshot).
- Verify with a clean-room test: spin up an empty Postgres, run all migrations in order, assert the schema matches `drizzle-kit generate`'s current diff (should be empty).

**Warning signs:**
- `drizzle-kit generate` produces a migration that "shouldn't" exist (DB and schema already match).
- A generated migration tries to re-add a column that already exists, or drop one that's gone.
- `meta/` files edited outside of `drizzle-kit generate`.
- Two PRs each touching `db/schema.ts` and `db/migrations/` with overlapping snapshot parents.
- Using `push` in staging and `migrate` in prod.

**Phase to address:** **Foundation phase** (establish the generate-then-commit-in-same-PR workflow and the clean-room migration test before any feature tables exist).

---

### Pitfall 6: Self-hosted ISR cache is per-instance (multi-instance revalidation breaks)

**What goes wrong:**
On a single `next start` instance, `revalidatePath` works. When the VPS/Coolify setup scales to two+ instances (or restarts one of several), revalidation only clears **that instance's** in-memory cache. Other instances keep serving stale pages. Symptom: "publish worked, but only half my readers see the new post."

**Why it happens:**
- Next.js's ISR/Data Cache lives in-process by default on self-hosted Node. Unlike Vercel, there's no shared cache layer.
- Coolify can run multiple replicas; a load balancer distributes requests. Revalidation hits one replica.
- This is invisible at MVP scale (one instance) and bites exactly when traffic grows — which is this project's stated trajectory ("growing traffic, tens of thousands/month").

**How to avoid:**
- Recognize this **before** scaling past one replica. At MVP (single instance) it's a non-issue; document it as a known scaling cliff.
- When moving to >1 instance, adopt a **shared cache**: Next.js 15+ supports a custom cache handler (`cacheHandler` in `next.config`) — back it with Redis (Valkey/Upstash-self-hosted) so all instances share one cache and one revalidation.
- Alternative: a revalidation webhook broadcast to all replicas. More moving parts; prefer the shared cache handler.
- Pin to a single replica until the shared-cache handler is in place, and treat the second replica as a deliberate scaling milestone with its own testing.

**Warning signs:**
- Adding a second Coolify replica coincides with "intermittent stale content" reports.
- Revalidation works on direct instance-A requests but not via the LB.
- Memory usage scales linearly with replicas (each holds a full cache).

**Phase to address:** **Performance/deploy phase** for awareness + documentation; the **first scaling milestone after v1** for the shared-cache-handler implementation. Out of scope for v1 (single instance), but the deploy phase must document it so it isn't discovered late.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing Tiptap content as raw HTML instead of ProseMirror JSON | One less serialization step; "it just works" with `dangerouslySetInnerHTML` | Loses schema-based XSS protection; makes sanitization mandatory and brittle; harder to migrate editor schema later | Never for this project — store JSON, render via schema or sanitized HTML |
| Skipping the resource-ownership check for `author` role | Faster CRUD scaffolding | Privilege escalation between authors; cross-author edits/deletes | Never |
| Using `drizzle-kit push` against staging/prod DB | No migration files to manage | No auditable history; schema and DB drift; unreproducible prod state | Local dev scratch DB only |
| Putting `revalidatePath` in a Server Component "to be safe" | Feels like it revalidates on render | Silent no-op; stale content bug that's hard to trace | Never — only in Server Actions/Route Handlers |
| Freeform "custom code injection" settings field in v1 | Marketing/analytics flexibility without code | Site-wide XSS vector if Pitfall 2 prevention slips | Out of scope for v1 per PROJECT.md — defer |
| Single shared Zod schema imported into both client and server without a boundary | Less code | Client bundle accidentally imports server-only deps; or schemas drift when someone copies instead of imports | Acceptable *if* the schema file is dependency-free and imported from a shared path — but verify the import graph |
| Middleware doing role checks (because "it's earlier") | One place to think about | Edge can't run the check; fails open or throws | Never — middleware = cookie-existence gate only |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Better Auth + Next.js middleware** | Calling `auth.api.getSession` in middleware (edge-incompatible) | Use `getSessionCookie(request)` in middleware for cookie-existence only; do full session + role checks in Server Components/Actions |
| **Better Auth `admin` vs `access` plugin** | Assuming `admin()` gives `userHasPermission` | `userHasPermission` comes from the `access` plugin; add it if you need fine-grained permissions beyond the 3 roles |
| **Drizzle + Postgres on Coolify** | Migrations not run on deploy; relying on `push` | Run `drizzle-kit migrate` (or the embedded migrator) as a deploy step; treat migration files as the source of truth |
| **Tiptap + Server rendering** | Rendering stored HTML via `dangerouslySetInnerHTML` raw | Store JSON; render through Tiptap (schema-constrained) or sanitize generated HTML with DOMPurify first |
| **R2 + `next/image`** | Pointing the loader at R2 directly and resizing per-request | Use a CDN domain (cdn.anydiscussion.com) in front of R2; resize at upload time with sharp, serve optimized originals; let `next/image` + the CDN cache |
| **Cloudflare in front of Coolify** | CDN cache headers fighting Next.js ISR revalidation | Align `Cache-Control`/`s-maxage` with your revalidate strategy; purge CDN on publish where needed; don't let CDN serve stale post pages |
| **Coolify env vars + Next.js** | Setting secrets only at runtime, not build | Add the same env vars to **build and runtime** in Coolify; remember Next.js inlines many at build time |
| **isomorphic-dompurify on server** | Calling DOMPurify built for the browser directly in a Server Component | Use `isomorphic-dompurify` (jsdom-backed) for server-side sanitization; plain `dompurify` needs a DOM |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Resizing images with sharp on every request | High CPU on the Next.js container on every cache miss; slow TTFB | Resize at **upload time** (sharp), store optimized variants in R2, serve via CDN; let `next/image` only transform when truly needed | A handful of posts/day is fine; breaks at traffic spikes or large media libraries |
| Serving unoptimized originals from R2 | Large payloads, slow LCP, mobile data burn | Always go through `next/image` with a CDN-backed loader; never raw `<img>` to R2 keys | Immediately on any image-heavy post |
| R2 Class A operation blowups (writes/lists) | Surprise bill from `PUT`/`LIST` storms ($4.50/M) | Avoid per-request writes; batch media writes; don't `LIST` the bucket from the app (track keys in the `media` table) | High only at very high write volume; the free tier (1M Class A/mo) covers MVP easily |
| R2 Class B reads scaling with un-cached traffic | Rising costs proportional to popularity ($0.36/M) | Aggressive CDN caching of media; long `s-maxage` for images | Tens of thousands of monthly readers — exactly this project's trajectory; watch the metric |
| Per-instance ISR cache at >1 replica | Stale content on some instances after publish | Shared cache handler (Redis) before scaling past one replica (see Pitfall 6) | Second Coolify replica |
| Dashboard bundle pulling heavy editor/charts into initial load | Slow dashboard TTI; large JS | Lazy-load Tiptap, charts, dnd-kit via `next/dynamic`; keep dashboard initial route lean | Grows with feature count; matters for editor UX |

> **R2 egress specifically is FREE** (zero data-transfer-out fees — R2's headline benefit vs. AWS S3). Storage ≈ $0.015/GB/mo, Class A (writes/lists) $4.50/M, Class B (reads) $0.36/M, with free tiers (1M Class A, 10M Class B/mo). For this project, egress is not the cost risk — **operation counts** (especially un-cached reads at scale) and **Next.js server CPU from sharp** are the real exposures.

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| No server-side check on a mutating Server Action (Pitfall 1) | **Critical:** privilege escalation, unauthorized publish/edit/delete, role self-elevation | Every mutation starts with `getSession` + role + ownership check; CI grep test on `actions/` |
| Custom-code/raw-HTML field stored and rendered unsanitized (Pitfall 2) | **Critical:** site-wide XSS via settings, per-post XSS via bodies/embeds | Sanitize at store AND render (DOMPurify, explicit allowlist); defer freeform code injection past v1; prefer Tiptap JSON storage |
| Trusting `getSessionCookie` in middleware as a role check (Pitfall 4) | High: any signed-in user reaches admin actions | Middleware = cookie existence only; real role check in Server Component/Action |
| Accepting client-supplied `authorId`/`userId` without ownership re-check | High: IDOR — edit/delete any post by ID | Fetch the row, verify `post.author_id === session.user.id` server-side |
| Raw `<img>` tags for content images | Medium: bypasses `next/image` optimization, enables some tracking/SSRF-via-src patterns | `next/image` only — enforced in CLAUDE.md; lint rule against `<img>` |
| No rate limiting on auth endpoints (signin, signup, password reset) | High: credential stuffing, brute force, account takeover | Add rate limiting (self-hosted, e.g. Redis-backed) on auth routes before going live |
| Secrets only in runtime env, not build env (Coolify) | Medium: build-time-inlined secrets missing → broken auth/DB at runtime | Set secrets in both build and runtime env in Coolify |
| DOMPurify default config for `<img>`/`<svg>` | Medium: `onerror`/`onload` event-handler XSS on "safe" tags | Explicit allowlist config; test with `<img src=x onerror=...>` payloads |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Editor publishes but public site shows stale post | Editors lose trust in the CMS; readers see wrong content | Wire revalidation into publish action; test publish→visible loop; `router.refresh()` in dashboard |
| Author submits for review but gets no feedback | Authors don't know if it worked; duplicate submissions | Explicit status transitions with toast/confirmation; status visible in posts list |
| Dashboard initial load pulls in Tiptap + charts + dnd-kit | Slow admin UX, especially on slow connections | Lazy-load heavy components; keep overview route lean |
| Meta description rejected for "being too long" when it's Bangla | Editors can't write valid Bangla SEO; Latin char-count limits misfire | Validate by byte count / reasonable length, not Latin character count; don't hardcode Latin limits |
| New published post 404s because `dynamicParams=false` | Post is "published" but unreachable | `dynamicParams=true` + `generateStaticParams` for common cases; test new-post route after publish |
| Bangla content renders with wrong/broken font | Readers see boxes or ugly fallbacks | UTF-8 + explicit Bangla webfont with `font-display: swap`; test with real Bangla content early |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces:

- [ ] **RBAC:** "Roles work" — but no Server Action has a real `getSession`+role check (only middleware). Verify: grep `actions/` for `getSession`/`requireRole`; every mutation matches.
- [ ] **RBAC:** "Authors can only edit their own posts" — but the action trusts a client `authorId`. Verify: action fetches the row and compares `post.author_id === session.user.id`.
- [ ] **ISR:** "Publishing revalidates" — but `revalidatePath` is in a render path or uses `[slug]`. Verify: concrete path derived from row, called inside the publish Server Action; test publish→public-visible.
- [ ] **Sanitization:** "Custom code field is saved" — but rendered raw. Verify: DOMPurify runs on the render path; payload test (`<img onerror>`) is stripped.
- [ ] **Tiptap:** "Body renders" — but via `dangerouslySetInnerHTML` on stored HTML. Verify: stored as JSON, or HTML sanitized at render.
- [ ] **Migrations:** "Schema applied" — but a hand-edit left the snapshot out of sync. Verify: clean-room empty-DB migrate reproduces schema; `drizzle-kit generate` diff is empty.
- [ ] **Auth:** "Sign-in works" — but no rate limit on the endpoint. Verify: scripted brute-force attempt is throttled.
- [ ] **Media:** "Uploads work" — but originals served directly, resized per request. Verify: optimized variants in R2, served via CDN through `next/image`.
- [ ] **Deploy:** "App runs on Coolify" — but DB backups aren't scheduled. Verify: Backups tab has an enabled, frequency-set, S3-targeted backup.
- [ ] **SEO:** "Sitemap exists" — but doesn't include new posts until a rebuild. Verify: publish a post, hit `/sitemap.xml`, see it listed without a redeploy.
- [ ] **Multi-instance:** "App scales" — but revalidation only hits one replica. Verify: with 2 replicas, publish is visible on both (or document single-replica constraint).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Missing server-side auth on actions (Pitfall 1) | LOW–MEDIUM | Add `requireRole`/`requireOwnPost` helpers; prepend to every mutation; add CI grep test. Audit recent action additions for prior abuse via logs. |
| Stored unsanitized custom code (Pitfall 2) | MEDIUM | Run a one-time DOMPurify pass over all stored HTML/JS fields; add render-time sanitization; audit access logs for the injection window; rotate sessions/cookies if a malicious payload ran. |
| Stale content from broken revalidation (Pitfall 3) | LOW | Move calls into the publish Server Action; switch to concrete paths + tagged fetches; trigger a full `revalidatePath('/')` + CDN purge once to clear the backlog. |
| Drizzle snapshot drift (Pitfall 5) | MEDIUM–HIGH | Recreate a clean snapshot from current schema: backup DB, align `meta/` with reality (regenerate from a known-good state), run clean-room migrate test. Avoid editing snapshots blindly. |
| Per-instance cache at scale (Pitfall 6) | MEDIUM | Introduce shared cache handler (Redis); redeploy all replicas; verify cross-instance revalidation. |
| Hand-edited migration already applied to prod | HIGH | Write a **forward** migration to correct it (never edit history); document; add clean-room test to prevent recurrence. |
| R2 cost surprise | LOW | Enable Cloudflare billing alerts; move to upload-time sharp resize; add CDN caching; track Class A/B operation metrics. |

## Pitfall-to-Phase Mapping

Aligned to the v1 MVP slice in PROJECT.md: **Foundation → Auth + RBAC → Content engine → SEO → Public frontend → Dashboard chrome → Performance & deploy.**

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Missing server-side auth on mutations (P1) | Auth + RBAC (helpers + convention) | CI grep: every `actions/*.ts` mutation calls `getSession`/`requireRole`; manual direct-invocation test as non-author |
| Unsanitized custom-code/HTML (P2) | Content engine (Tiptap JSON, DOMPurify helper) + Public frontend (render sanitization) | Payload test (`<img onerror>`, `<script>`) stripped at render; custom-code injection NOT shipped in v1 |
| `revalidatePath`/`revalidateTag` no-op (P3) | Content engine (wire into publish) + verify Public frontend + Performance/deploy | Publish a post → it appears on home + post URL without hard refresh or redeploy |
| Better Auth middleware-vs-action split (P4) | Auth + RBAC | Middleware only calls `getSessionCookie`; a signed-in non-admin hitting an admin action is rejected by the *action*, not just middleware |
| Drizzle migration drift (P5) | Foundation (workflow + clean-room test) | Empty Postgres + all migrations == schema; `drizzle-kit generate` diff empty |
| Per-instance ISR cache (P6) | Performance/deploy (document); post-v1 scaling milestone (shared cache handler) | Documented as known cliff; with 2 replicas, publish visible on both (or single-replica constraint stated) |
| Rate limiting on auth endpoints | Performance/deploy | Scripted brute force on `/signin` is throttled (429/lockout) |
| R2 cost/CPU (sharp per-request, un-cached reads) | Content engine (upload-time resize) + Performance/deploy (CDN cache, billing alerts) | No per-request sharp; Class B reads roughly flat vs traffic due to CDN cache |
| Zod client/server schema drift | Content engine / Dashboard chrome (shared schema path) | One schema file imported both sides; bundle analysis shows no server-only deps leaking client-side; no duplicated copies |
| Coolify build-vs-runtime env secrets | Performance/deploy | Changing a secret and redeploying does not break auth/DB; secrets set in both build and runtime |

## Sources

- **Next.js 16 ISR / `revalidatePath` / `revalidateTag` / PPR** — consolidated from the WebSearch result (Next.js 16 ISR pitfalls breakdown, 2026) covering: no-op outside Server Action/Route Handler, exact-path requirement, `dynamicParams` interaction, tagged-fetch requirement, browser/CDN/RSC-payload caching, `output: 'export'` disabling ISR, self-hosted per-instance cache, `cacheLife`/`cacheTag` vs `next.revalidate`. **Confidence: HIGH for the failure modes** (these are documented, version-stable Next.js App Router behaviors). Verify exact `cacheLife`/`cacheTag` API names against current Next.js 16 docs in the implementing phase.
- **Better Auth `admin`/`access` plugins + middleware pattern** — consolidated from the WebSearch result (Better Auth RBAC, 2026): `getSessionCookie` (cookie existence) in middleware vs `auth.api.getSession` + `auth.api.userHasPermission` in Server Components/Actions; `admin()` vs `access()` plugin split. **Confidence: MEDIUM** — pattern is correct and stable; re-verify exact method names and the `access` plugin's current API against Better Auth docs.
- **Drizzle `drizzle-kit generate` / migrations / snapshots / journal** — consolidated from WebSearch (Drizzle migrations, 2026): generated SQL + `meta/_journal.json` + `meta/*.snapshot`; drift from hand-editing SQL/snapshots/journal; `push` vs `migrate`. **Confidence: HIGH** for mechanics (these are stable Drizzle concepts); verify current `drizzle-kit` version's rename-handling and any new migration-format changes.
- **Tiptap / ProseMirror JSON vs HTML + XSS** — consolidated from WebSearch (Tiptap XSS, 2026): prefer `getJSON()` storage, schema-constrained rendering, DOMPurify for non-Tiptap render and pasted content, custom-extension/NodeView risks. **Confidence: MEDIUM** — approach is correct; verify the exact Tiptap v2/v3 API (`getJSON`, `setContent`, `handlePaste`) and whether the installed major version changed any defaults.
- **Cloudflare R2 pricing / sharp / `next/image`** — consolidated from WebSearch (R2 cost + Next.js, 2026): free egress, storage $0.015/GB/mo, Class A $4.50/M, Class B $0.36/M, free tiers, upload-time resize + CDN caching. **Confidence: MEDIUM** for exact numbers (verify current pricing on Cloudflare's pricing page before locking cost assumptions); **HIGH** for the structural claim that egress is free and the cost risks are operation counts + sharp CPU.
- **isomorphic-dompurify on the server** — established usage (jsdom-backed DOMPurify for Node/server components); plain `dompurify` requires a DOM. **Confidence: MEDIUM** — verify current package name/API in the implementing phase.
- **Coolify + Next.js self-hosting** — WebSearch (Coolify gotchas, 2026): build vs runtime env vars, standalone output, persistent storage volumes, Nixpacks vs Dockerfile, DB backups. **Confidence: MEDIUM** — verify against current Coolify docs (UI and feature set evolve).
- **Context7 MCP server** — was routed by the research-plan seam for all library-docs questions but was **unavailable in this environment**; the above was sourced via WebSearch + established knowledge instead. Re-running with Context7 available would strengthen the MEDIUM-confidence items.

---
*Pitfalls research for: self-hosted Next.js 16 blog CMS (Better Auth RBAC, Drizzle/Postgres, Tiptap, R2, Coolify)*
*Researched: 2026-07-01*
