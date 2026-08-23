# RESEARCH — Quick Task 260824-3l2: Functional frontend newsletter with dashboard configuration

**Researched:** 2026-08-24
**Domain:** Public subscribe form (Server Action + Postgres) · settings key-value config · cached-footer client island · admin list/CSV surface
**Confidence:** HIGH (every pattern verified in-codebase except two explicitly flagged MEDIUM items)

## User Constraints (from CONTEXT.md — locked, not re-opened)

D-01 single opt-in, `status='active'` on subscribe, idempotent re-subscribe, unsubscribed flips back to active · D-02 settings keys `newsletter.enabled/.heading/.description/.success_message` on the existing pattern, footer cache refreshed via `seo-settings` tag, column removed entirely when disabled · D-03 admin-gated subscriber page: list (email/status/subscribed-at, paginated) + delete + CSV export · D-04 unique token column now, NO public unsubscribe route in this task · D-05 honeypot + per-IP rate limit (reuse existing pattern where possible) · D-06 Server Action `src/actions/newsletter.ts` as only mutation path; footer column becomes a small client component with `useActionState` inside the cached footer.

Stack locks honored: Next.js 16 (`^16.1.6` installed), Drizzle `^0.45.2` pinned (never 1.x), Zod 4, pnpm only, Better Auth RBAC, no new packages, no paid APIs.

---

## Priority 1 — Settings key-value pattern

### What was found

| File | Finding |
|---|---|
| `src/lib/seo/settings.ts` L40-48, L60-83 | `readSetting(key)` helper (select where key, null when absent/empty) + `getSeoSettings()` = `'use cache'` + `cacheTag("seo-settings")` with **fallback defaults when rows are absent** (L74-80: `siteTitle ?? "Any Discussion"` etc.) — the defaults-without-seed pattern D-02 needs |
| `src/lib/queries/social-links.ts` L49-69 | `readSocialLinks()` — `'use cache'` + `cacheTag("seo-settings")`, parallel per-key reads via `Promise.all`, returns `null` per absent key. Tagged cache because it has TWO consumers (footer + header) |
| `src/actions/settings.ts` L68-79 | `upsertSetting(key, value)` — **private** (NOT exported) update-then-insert-with-`onConflictDoNothing` helper; comment says it "mirrors the storage-settings.ts helper verbatim" — i.e. the established convention is a private duplicate per action file |
| `src/actions/settings.ts` L100-131 | `saveSeoSettings` — the write-action template: `requireRole("admin")` FIRST → Zod parse → `Promise.all` upserts → `revalidateTag("seo-settings", "max")` (2-arg form mandatory) + `revalidatePath("/", "layout")` + concrete path revalidations |
| `src/actions/seo-settings-schema.ts` | Pure-schema sibling module — a `"use server"` file can ONLY export async functions, so Zod schemas/types live in `*-schema.ts` siblings (same split as `contact.ts`/`contact-schema.ts`, `storage-settings*`) |
| `src/app/(admin)/dashboard/settings/seo/page.tsx` | Settings page shell: Server Component, try/catch around the cached read, passes `initial` into the client form |
| `src/app/(admin)/dashboard/settings/seo/SeoSettingsForm.tsx` | Client form: RHF + `zodResolver` + TanStack `useMutation` (NOT optimistic — D-27 server-confirm), INPUT_CLASS/LABEL_CLASS constants local to the form |

### Pattern to follow

- **Read side:** new `readNewsletterSettings()` server function returning `{ enabled, heading, description, successMessage }` with defaults applied (`enabled ?? true`, `heading ?? "Newsletter"`, `description ?? "Subscribe for the latest posts…"`, `successMessage ?? "Thanks for subscribing!"`). Two consumers exist (footer + dashboard settings page), so mirror `readSocialLinks`'s shape — its own `'use cache'` + `cacheTag("seo-settings")` (NOT required for correctness — the footer's own boundary already carries the tag — but it is the established multi-consumer shape and keeps the settings page read cheap). Either variant works; see Pitfalls.
- **Write side:** `saveNewsletterSettings` in `src/actions/newsletter.ts` copying `saveSeoSettings` line-for-line: `requireRole("admin")` FIRST → parse via `newsletter-schema.ts` → private `upsertSetting` duplicate → `revalidateTag("seo-settings", "max")` + `revalidatePath("/", "layout")`. The sitemap/robots/rss path revalidations from `saveSeoSettings` are NOT needed (no SEO route reads newsletter keys) — keep only the tag + layout revalidate.
- **Dashboard UI:** `src/app/(admin)/dashboard/settings/newsletter/page.tsx` + `NewsletterSettingsForm.tsx` mirroring the seo folder 1:1 (page reads defaults-applied snapshot; form has a checkbox/switch for `enabled` + three text inputs). Zod: `enabled: z.boolean()`, texts `z.string().max(...)` with sensible caps (e.g. heading 100, description 500, success_message 200).
- Store booleans as `"true"`/`"false"` strings (settings.value is `text` — D-02 specifies exactly this).

### Pitfalls / Anti-patterns

- **Never export `upsertSetting` from a `"use server"` file.** Every export of a `"use server"` module is a publicly invocable endpoint — a generic `upsertSetting(key, value)` would let any unauthenticated caller write arbitrary settings keys. Duplicate it privately (established convention).
- `revalidateTag` single-arg form is deprecated in Next 16.2.x — always `revalidateTag("seo-settings", "max")`.
- Do not read newsletter settings in `(admin)` from the footer's module or vice versa across route groups via component imports — settings readers live in `src/lib/queries/` (shared, like `social-links.ts`), forms stay inside their route folder.
- `getSetting` in `src/actions/settings.ts` IS exported (it's a server action) — do not use it inside the footer's cache boundary for 4 parallel reads; a `Promise.all` read like `readSocialLinks` avoids 4 sequential server-action round-trips.

## Priority 2 — Footer cache boundary + client island composition

### What was found

- `src/components/site/SiteFooter.tsx` L50-52: component-level `'use cache'` with `cacheTag("seo-settings")` + `cacheTag("posts-list")` — settings + category reads happen INSIDE the boundary; the comment (L44-49) documents that only tags on the footer's OWN boundary re-render it. Newsletter column today: L191-214, inert `<input>` + `type="button"`, no form.
- `src/components/site/SiteHeader.tsx` L29, L55, L202: renders `<ThemeToggle />` (client island) — but SiteHeader itself is NOT a cache boundary (its data functions are). Same for `src/app/(site)/blog/[slug]/page.tsx` (client islands ReadProgress/ShareButtons/Toc render in an uncached page body around cached data functions) and `contact/page.tsx` L110 (ContactForm client, page body uncached).
- `src/components/auth/SignUpForm.tsx` L52-55: the codebase's `useActionState` precedent — `React.useActionState<State, FormData>(setupAction, { status: "idle" })`, `pending` flag, `<form action={formAction}>`.
- **No component-level `'use cache'` function in this codebase renders a client child yet** — this task is the first. Verified against official docs instead (see below).
- [CITED: nextjs.org/docs/app/api-reference/directives/use-cache, docs v16.3.2, updated 2026-08-20] — "Return values: Same as arguments, plus JSX elements" (cached components may return trees containing client components); "You can pass Server Actions through cached components to Client Components without invoking them inside the cacheable function" (documented `CachedForm` example); arguments must be serializable (strings are fine); uncached helper queries called inside a cached function run at cache-fill and their results are stored in the cached output; `headers()`/`cookies()` are forbidden inside `'use cache'` but fine in Server Actions; self-hosted in-memory cache persists across requests (single VPS instance).
- [CITED: nextjs.org/docs/app/getting-started/caching] — runtime-API reads must sit outside cached scopes (Suspense holes); cached output serializes into the RSC payload (client references included).

### Pattern to follow

- `src/components/site/NewsletterForm.tsx` — `"use client"`, sibling of `ThemeToggle.tsx`. Directly imports `subscribeNewsletter` from `src/actions/newsletter.ts` (client components importing `"use server"` modules is the standard Server Action path — **no function prop ever crosses the cache boundary**). Receives only serializable string props from the footer: `heading`, `description`, `successMessage`.
- Server action gets the `useActionState` signature directly: `subscribeNewsletter(prev: SubscribeState, formData: FormData): Promise<SubscribeState>` with `SubscribeState = { status: "idle" } | { status: "success" } | { status: "error"; message: string }` — then in the island: `const [state, formAction, pending] = useActionState(subscribeNewsletter, { status: "idle" })` and `<form action={formAction}>`. Avoids SignUpForm's local wrapper (that wrapper only exists because `createFirstAdmin` has a plain object signature).
- In `SiteFooter.tsx`: `newsletter.enabled === false` → render nothing for the 4th column (grid degrades to 3 columns on lg automatically since the column simply isn't emitted — grid-cols-4 with 3 children leaves a gap at lg; acceptable per D-02 "no column at all", but see Pitfalls). Pass the three texts + successMessage as props.
- Footer styling for the island: keep the current footer's always-dark palette (white/10 borders, gray-400 text, brand-500 button) — copy classes inline like ContactForm does; do NOT import dashboard form classes.

### Pitfalls / Anti-patterns

- **Do not pass `state`-holding closures or action props INTO `SiteFooter` from `(site)/layout.tsx`** — the footer takes no props today; keep it that way (arguments to cached components become cache keys and must be serializable).
- **Success/error display after action returns**: the island renders `successMessage` (from settings, passed as prop) when `state.status === "success"` — do not have the action return the configured message text (keeps the action payload constant and the text cache-controlled).
- The action must NOT have `'use cache'` — [CITED: 06-RESEARCH Pitfall 7, enforced in `contact.ts` header] a cached Server Action silently no-ops after the first submission. Mutations are never cached.
- `crypto.randomUUID()` for the token is generated inside the Server Action (request time) — the random-value prerender constraint only applies inside `'use cache'`/prerender scopes, so this is safe; never generate the token in the footer component.
- Optional grid nicety: when the newsletter column is absent, `lg:grid-cols-4` leaves 3 columns in a 4-track grid. Switching to `lg:grid-cols-4` only when enabled (or always emitting 4-track with the categories column spanning) is a styling choice for the plan — D-02 requires only that the column disappears.

## Priority 3 — Drizzle schema + migration pattern

### What was found

- `src/db/schema.ts` L119-126 (`categories`) is the style reference: `serial` PK, `text` fields, `varchar(255)` `.unique()`, `timestamp("created_at").defaultNow().notNull()`. Enums exist: `postStatusEnum`/`pageStatusEnum` (L50-55) via `pgEnum`. `posts.previewToken` L83: `varchar(255).unique()` nullable crypto.randomUUID token — the D-04 token precedent. `settings` table L184-188: `key varchar(255)` PK, `value text`, `updatedAt`.
- Soft-delete (D-08) applies to CONTENT tables; join/utility tables hard-delete (schema header comment L13-14). `updatedAt` with `.$onUpdate(() => new Date())` precedent: `redirects` L199-202, `session`.
- `drizzle.config.ts` (repo root): schema `./src/db/schema.ts`, out `./src/db/migrations`, dialect postgresql, forward-only (no down migrations).
- `package.json` scripts: `db:generate` = `drizzle-kit generate`; migrations `0000..0005` exist in `src/db/migrations` + `meta/_journal.json`; `test:migrations` = `node scripts/test-migrations.mjs`.
- `src/lib/db/index.ts`: `import { db, schema } from "@/lib/db"` is the universal access shape.
- Email case: `user.email` is plain `text` `.unique()` (L214) — Postgres unique is case-sensitive; Better Auth itself normalizes emails to lowercase. No `citext` anywhere in the codebase (no extension dependency).

### Pattern to follow

Add to `src/db/schema.ts`:

```ts
// subscribers (newsletter — D-01 single opt-in, D-04 token-ready, hard-delete utility table)
export const subscriberStatusEnum = pgEnum("subscriber_status", [
  "active",
  "unsubscribed",
]);
export const subscribers = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(), // lowercase-normalized before insert
  status: subscriberStatusEnum("status").default("active").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(), // crypto.randomUUID() at insert (D-04)
  createdAt: timestamp("created_at").defaultNow().notNull(),   // "subscribed at" in the dashboard
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(), // re-subscribe flips status (D-01)
});
```

Then `pnpm db:generate` (generates `0006_*.sql` + journal entry — never hand-write SQL), apply via the project's usual migrate path, and run `pnpm test:migrations`.

- **D-01 upsert** — single statement, no read-check-write race:
  `db.insert(schema.subscribers).values({ email, token: crypto.randomUUID() }).onConflictDoUpdate({ target: schema.subscribers.email, set: { status: "active" } })` — first subscribe inserts active; existing active = idempotent no-op success; previously unsubscribed flips back to active. All three D-01 branches covered.
- **Email normalization in Zod, not citext**: `z.string().trim().toLowerCase().email(...).max(255)` in `newsletter-schema.ts` — matches Better Auth behavior, avoids a DB extension.
- **IP capture: store NOTHING.** The contact action persists no request data (D-08/no-DB-ethos, `contact.ts` header); `session.ipAddress` is the only IP storage in the codebase and it exists for security auditing. D-05's rate limit keys on IP transiently in Redis. No `ip` column — no PII retention question. [VERIFIED: codebase — no other precedent stores request IPs]

### Pitfalls / Anti-patterns

- **Enum vs text for status**: use `pgEnum` (matches `postStatusEnum` precedent). A bare text column + check would be a new pattern in this codebase.
- **Hard delete, not soft**: a `deletedAt` on subscribers would break D-01 — a soft-deleted email's unique row would be resurrected by `onConflictDoUpdate` with stale token/createdAt semantics. Delete means delete; "unsubscribed" is the soft state via the status enum.
- **Token not null**: unlike `previewToken` (nullable, generated later), generate at insert — the unsubscribe route (future) needs it present for every row.
- Do NOT add an `updatedAt` set inside the conflict `set:` clause AND rely on `$onUpdate` — with `onConflictDoUpdate`, Drizzle's `$onUpdate` does not fire for the conflict path in all versions; set `updatedAt: new Date()` explicitly in the `set:` clause (cheap, unambiguous).
- Never `drizzle-kit push` for this change — generate a migration file (project convention; `test:migrations` replays files).

## Priority 4 — Server Action + permission-check + rate-limit pattern

### What was found

- `src/actions/contact.ts` — **the exact public-unauthenticated-action template**: Zod parse first → honeypot silent-success (`return { ok: true }` without insert — L65-67) → per-IP rate limit from `x-forwarded-for` first value, `"unknown"` fallback (L75-81) → work. NO `requireCan` (public by design), NO `'use cache'` (Pitfall 7).
- `src/actions/contact-schema.ts` — honeypot field name `"website"` (bots auto-fill "website"/"url" most reliably — documented D-07 discretion), optional in schema so real users pass; also re-exports `zodResolver` for the single-import-surface pattern.
- `src/lib/permissions/index.ts` L40-47 — `requireRole("admin")`: admin always passes, others exact-match; throws `Error("FORBIDDEN")`. Import path `@/lib/permissions`.
- `src/lib/rate-limit/index.ts` + `upstash-ioredis-adapter.ts` L98-104 — Redis-backed `@upstash/ratelimit` (`Ratelimit.slidingWindow(5, "1 h")`, `prefix: "ratelimit:contact"`) over the shared ioredis singleton via a structural adapter. **D-05's "reuse where possible" = instantiate a second `Ratelimit`** with `prefix: "ratelimit:newsletter"` in the same adapter file; D-05's in-memory fallback is NOT needed — the Redis infra already exists and survives redeploys (the in-memory version was deliberately removed in 07-02).
- `src/lib/redis/index.ts` — singleton, `REDIS_URL ?? redis://localhost:6379` (docker-compose dev service), fail-closed after 3 retries (an outage blocks subscribe — same accepted trade-off as contact).
- `src/actions/__tests__/seo-settings.test.ts` — the MUST_NOT_BE_REACHED test pattern (vi.hoisted mocks for `@/lib/permissions`, `@/lib/db`, `next/cache`; non-admin assertion that db write is never reached; asserts `revalidateTag` 2-arg call).
- Actions return typed results / throw sentinel errors (`Error("RATE_LIMITED")`, `Error("FORBIDDEN")`) — clients map sentinels to friendly copy (ContactForm L98-101).

### Pattern to follow

`src/actions/newsletter.ts` (`"use server"`) + `src/actions/newsletter-schema.ts` (pure schema):

- `subscribeNewsletter(prev, formData)` — parse `formData` (email + honeypot `website`) through the shared schema; honeypot non-empty → return `{ status: "success" }` WITHOUT inserting; rate-limit via new `newsletterLimiter.limit(ip)` → throw `Error("RATE_LIMITED")` when exceeded; upsert (Priority 3); return `{ status: "success" }`. Duplicate-email paths return success (D-01: never an error).
- `saveNewsletterSettings(input)` — Priority 1 template.
- `listSubscribers(page)` / `deleteSubscriber(id)` / `countSubscribers()` — `requireRole("admin")` FIRST in each (D-03: admin role only — note `requireCan({newsletter: [...]})` would require adding an AC statement; `requireRole("admin")` is the precise, precedent-backed gate for an admin-only surface, mirroring `saveSeoSettings`).
- Rate limiter: add `newsletterLimiter` export beside `contactFormLimiter` (`slidingWindow(5, "1 h")` — same policy; tune if desired) and re-export from `src/lib/rate-limit/index.ts`.
- Tests: `src/actions/__tests__/newsletter.test.ts` mirroring `seo-settings.test.ts` (admin-gate MUST_NOT_BE_REACHED for save/delete; revalidation assertions; honeypot no-insert; upsert conflict behavior mocked).

### Pitfalls / Anti-patterns

- **Permission check ordering is non-negotiable**: `requireRole("admin")` is the FIRST line, before Zod parse and any DB write (CLAUDE.md + proven by MUST_NOT_BE_REACHED tests).
- Honeypot returns SUCCESS, not error (bots that see errors retry with mutated payloads — documented in `contact.ts` L62-64).
- IP extraction: `x-forwarded-for` first value, `"unknown"` fallback — Coolify's proxy sets the header (contact precedent). Do not invent a second extraction style.
- Sentinel errors only — the island maps `RATE_LIMITED` to a friendly line; all other errors generic.
- The schema module must not import anything client-only; keep the `zodResolver` re-export convention only if the dashboard form actually uses RHF (the newsletter settings form does; the public island does not — it's FormData-based `useActionState`).

## Priority 5 — Dashboard table page + CSV export

### What was found

- `src/app/(admin)/dashboard/categories/page.tsx` — list-page shell: Server Component, try/catch action read, `PageBreadcrumb`, `loadError` banner, rows into client table. Sibling `CategoriesTable.tsx` — client component with SSR-hydrated `useQuery` (`initialData`), `useMutation` optimistic delete (`onMutate` cache filter → `onError` rollback → `onSettled` invalidate), **`window.confirm` for delete confirmation** (L198-204), TailAdmin `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableCell` from `@/components/ui/table`, empty-state dashed box.
- Pagination precedents: `src/lib/queries/users.ts` L47-72 — `PAGE_SIZE` const + `offset = (max(1,page)-1)*SIZE` + `.orderBy(desc(...)).offset().limit()`; `src/actions/media.ts` L123-139 — `{ limit, offset }` opts parsed inside the action. **No dashboard page currently paginates via searchParams** — the subscriber page would be the first; public `Pagination` component (`src/components/site/Pagination.tsx`, server Link-based) is the visual analog.
- CSV/download precedent: **none in the codebase** (Phase 8 backups push to destinations; no HTTP download surface exists). Route Handler precedent: `src/app/api/media/[...path]/route.ts` — `export async function GET(request, { params }: { params: Promise<...> })`, Next 16 async params, returns `Response` with headers (Content-Type etc.). D-03 explicitly allows "admin-gated route or action".
- `middleware.ts` (repo root!) — matcher `/dashboard/:path*` + auth pages; cookie-existence UX gate only, NOT authoritative. Note: the auth gate file is `middleware.ts`, NOT `proxy.ts` — a documented deviation (L11-18: proxy.ts never registers in middleware-manifest.json under 16.2.9 + Turbopack). New dashboard routes are auto-covered by the matcher; the real gate is `requireRole` inside actions/handlers.
- Sidebar registration: `src/layout/AppSidebar.tsx` L62-88 — `navItems` array; `requiredRole: "admin"` per item (Users) and per subItem (Settings → Storage/Backup). Note: the SEO settings page is currently NOT linked in the sidebar (existing gap — don't repeat it for the new pages).

### Pattern to follow

- **Page**: `src/app/(admin)/dashboard/subscribers/page.tsx` — server component; read `searchParams` (Next 16: `{ searchParams }: { searchParams: Promise<{ page?: string }> }`, await it); `listSubscribers(page)` + count → rows + pageCount into a client `SubscribersTable` (categories-page shell + Table components + `window.confirm` delete + optimistic mutation pattern verbatim). Prev/next Links with `?page=N` (server pagination — simplest for a hygiene surface; no precedent conflict since no dashboard page paginates yet).
- **Delete**: `deleteSubscriber(id)` action, `requireRole("admin")` first, hard delete, no revalidation needed (dashboard-only read; TanStack invalidation refreshes the table — no public cached surface reads subscribers).
- **CSV export — Route Handler**: `src/app/(admin)/dashboard/subscribers/export/route.ts`, `GET` handler: `try { await requireRole("admin") } catch { return new Response("Forbidden", { status: 403 }) }` (the handler must return a status, not propagate a thrown `Error`); query all rows ordered by `createdAt desc`; build CSV (RFC 4180: quote every field, double internal quotes, CRLF rows); respond with `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="subscribers-<YYYY-MM-DD>.csv"`, `Cache-Control: no-store`. Trigger from a plain `<a href="/dashboard/subscribers/export">` Export button (native download — zero client JS). Handler is dynamic (reads headers via requireRole) so cacheComponents prerendering is not a concern; `middleware.ts` matcher already covers the path for UX.

### Pitfalls / Anti-patterns

- **CSV escaping**: emails can legally contain quotes/commas — wrap every field in `"` and double internal `"`; join with `,\r\n`. Prefix the body with the UTF-8 BOM (code point U+FEFF; in JS source, write the escape sequence backslash-u-F-E-F-F inside the string) so Excel opens Bangla/UTF-8 correctly. Escape nothing by hand-rolling string concat without the quote-wrap — that's the classic broken-CSV bug.
- **CSV formula injection** [ASSUMED, standard hardening]: a cell starting with `=`, `+`, `-`, `@` (or tab) can execute as a formula when opened in Excel/Sheets. Mitigation: prefix such cells with `'` (or a space). Emails starting with those chars are rare but possible; cheap to guard.
- **Route Handler vs Server Action for download**: an action returning a Blob requires client-side `URL.createObjectURL` plumbing and ships the payload through the RSC channel; a Route Handler is a direct browser download, cacheable by nothing, simplest auth story. Choose the handler (D-03 permits either).
- Do not skip the in-handler `requireRole` because middleware matched — middleware is UX-only (forged cookies pass).
- Timestamps in CSV: emit ISO-8601 (`toISOString()`) — unambiguous, sorts lexicographically; don't pre-format per-locale.
- Dashboard table pagination via searchParams means the page is dynamic (searchParams read) — that's correct for an auth-gated dashboard; do not add `'use cache'` anywhere in `(admin)` for this.

## Priority 6 — Web verification: client island + Server Action inside `'use cache'` (Next 16)

### What was found

[VERIFIED against official Next.js docs — `use cache` API reference, docs v16.3.2, lastUpdated 2026-08-20 (installed next is `^16.1.6`, same Cache Components model)]

1. **Client components inside cached components: supported.** Serialization section: return values = "Same as arguments, plus JSX elements"; cached output is an RSC payload in which client components serialize as client references. The docs' own `CachedForm` example renders `<form action={action}>` from inside `'use cache'`.
2. **Server Actions through cached components: explicitly supported** — "You can pass Server Actions through cached components to Client Components without invoking them inside the cacheable function" (pass-through rule: don't introspect/call them inside the cached body). Our design is simpler still: the island **imports** the action from the `"use server"` module directly, so no function value crosses the boundary at all — only string props flow footer → island, which are trivially serializable.
3. **`headers()` inside `'use cache'` is forbidden** (`next-request-in-use-cache` error) — the subscribe action reads `x-forwarded-for` in the Server Action, never in the footer. Consistent with `contact.ts`.
4. **Uncached reads inside a cached scope run at cache-fill time** and are captured into the cached output (docs `getOrderTotals` example) — reading newsletter settings inside the footer's boundary (or via a nested cached reader) is correct either way; revalidation via the footer's own `seo-settings` tag refreshes it.
5. `useActionState` precedent in-codebase: `SignUpForm.tsx` L52 — pattern works under this Next version (progressive enhancement via `<form action={formAction}>`; non-JS submission still executes the action server-side; D-06 accepts degraded visuals without JS).

Confidence: HIGH — official current docs + codebase precedent for every piece (client islands in the site route group, cached footer, useActionState, FormData actions).

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Rate limiting | Per-IP Map/counter | Second `Ratelimit` instance on the existing ioredis adapter | In-memory was deliberately removed (redeploy reset); Redis limiter already proven, prefix isolates keys |
| Email validation + normalization | Regex/trim logic | Zod schema (`.trim().toLowerCase().email()`) | Shared client/server contract; matches `contact-schema.ts` |
| Upsert semantics | select → branch → insert/update | `insert(...).onConflictDoUpdate({ target: email })` | Race-free D-01 in one statement; `onConflictDoNothing` precedent exists in `upsertSetting` |
| CSV serialization | String concatenation | Quote-wrap + double-quotes helper (~6 lines) + BOM | RFC 4180 edge cases (commas/quotes/CRLF in emails); no CSV lib warranted for 3 columns |
| Delete confirmation UI | Custom modal plumbing | `window.confirm` (CategoriesTable precedent) + optimistic mutation rollback | Established dashboard pattern |
| Table UI | New table markup | `@/components/ui/table` primitives | TailAdmin kit consistency |

**No new packages are required** — everything rides installed deps (next, drizzle-orm 0.45.x, zod 4, react-hook-form/@hookform/resolvers for the settings form, @tanstack/react-query, @upstash/ratelimit, ioredis). Package Legitimacy Audit: N/A (zero installs).

## Recommended file map

**New**

| File | Purpose |
|---|---|
| `src/db/migrations/0006_*.sql` (+ meta journal) | Generated by `pnpm db:generate` — subscribers table + subscriber_status enum (never hand-written) |
| `src/actions/newsletter.ts` | `"use server"`: `subscribeNewsletter` (useActionState-signature, honeypot + rate-limit + upsert), `saveNewsletterSettings`, `listSubscribers`, `countSubscribers`, `deleteSubscriber`; private `upsertSetting` duplicate |
| `src/actions/newsletter-schema.ts` | Pure Zod: subscribe schema (email normalized + `website` honeypot), newsletter-settings schema, `SubscribeState` type |
| `src/lib/queries/newsletter-settings.ts` | `readNewsletterSettings()` — defaults-applied snapshot read (social-links.ts shape) for footer + settings page |
| `src/components/site/NewsletterForm.tsx` | `"use client"` island — `useActionState` + `<form action={formAction}>`, honeypot field (off-screen pattern), pending/success/error states, footer-dark styling |
| `src/app/(admin)/dashboard/settings/newsletter/page.tsx` | Admin settings page shell (seo/page.tsx analog) |
| `src/app/(admin)/dashboard/settings/newsletter/NewsletterSettingsForm.tsx` | Client form — enable toggle + heading/description/success texts (RHF + zodResolver + useMutation, SeoSettingsForm analog) |
| `src/app/(admin)/dashboard/subscribers/page.tsx` | Admin list page — searchParams pagination, rows into table |
| `src/app/(admin)/dashboard/subscribers/SubscribersTable.tsx` | Client table — email/status/created, window.confirm delete (optimistic), Export link |
| `src/app/(admin)/dashboard/subscribers/export/route.ts` | GET CSV Route Handler — requireRole('admin') → 403, RFC 4180 + BOM, Content-Disposition |
| `src/actions/__tests__/newsletter.test.ts` | MUST_NOT_BE_REACHED admin gates, honeypot no-insert, revalidation calls |

**Modified**

| File | Change |
|---|---|
| `src/db/schema.ts` | `subscriberStatusEnum` + `subscribers` table |
| `src/components/site/SiteFooter.tsx` | Read newsletter settings inside cache boundary; render `<NewsletterForm …/>` or nothing (D-02) |
| `src/lib/rate-limit/upstash-ioredis-adapter.ts` | Add `newsletterLimiter` (prefix `ratelimit:newsletter`) |
| `src/lib/rate-limit/index.ts` | Re-export `newsletterLimiter` |
| `src/layout/AppSidebar.tsx` | Top-level "Subscribers" (admin-only) + Settings → "Newsletter" subItem |

## Confidence

| Area | Level | Basis |
|---|---|---|
| Settings read/write + revalidation | HIGH | Exact analogs read line-by-line (`saveSeoSettings`, `readSocialLinks`, `getSeoSettings`) |
| Schema + migration | HIGH | Style reference + enum/unique/`$onUpdate` precedents all in `schema.ts`; `db:generate` script verified |
| Client island inside cached footer | HIGH for validity (official docs explicitly support it); MEDIUM for "first of its kind in this codebase" — recommend the executor verify the footer still prerenders in `pnpm build` after wiring | Docs verified; no in-repo component-level cache renders a client child today |
| Rate limiting reuse | HIGH | Adapter + second-instance path verified (`contactFormLimiter`) |
| Subscriber page + delete | HIGH | CategoriesTable/page copied pattern |
| CSV export Route Handler | MEDIUM | No download precedent in codebase; Route Handler + auth pattern verified individually, the combination is new |
| CSV formula-injection guard | LOW [ASSUMED] | Standard hardening knowledge, not verified against a project doc — planner may treat as optional polish |
| `revalidatePath` set for save action | HIGH for tag+layout (mirrors `saveSeoSettings` core); the omission of sitemap/robots/rss revalidations is a reasoned delta (no SEO route reads newsletter keys) | — |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | CSV formula-injection prefix guard is desirable hardening | Priority 5 pitfalls | Minimal — cosmetic either way |
| A2 | `slidingWindow(5, "1 h")` is an acceptable newsletter policy (mirrors contact) | Priority 4 | Policy choice; trivially tunable |
| A3 | Store no IP for subscribers (privacy; matches contact's no-storage ethos) | Priority 3 | If analytics later want sources, needs a new column — out of scope now |
| A4 | 3-of-4 grid tracks acceptable when newsletter disabled (no grid-class switching) | Priority 2 | Cosmetic layout only; D-02 requires column absence, not grid restyle |

All other claims verified in-codebase or cited from official Next.js 16 docs.

## Sources

- Codebase files cited inline (all read this session; line references given per section).
- [CITED: nextjs.org/docs/app/api-reference/directives/use-cache] — serialization/pass-through/Server-Action-through-cached-component rules (docs v16.3.2, updated 2026-08-20).
- [CITED: nextjs.org/docs/app/getting-started/caching] — cacheComponents model, runtime APIs outside cached scopes, self-hosted in-memory persistence.
- WebSearch results cross-checked against the two official doc pages above before use.

**Research date:** 2026-08-24 · **Valid until:** ~2026-09-21 (stable codebase patterns; Next docs stable)
