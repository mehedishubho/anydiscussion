---
phase: 07-performance-deploy
reviewed: 2026-08-26T17:43:49Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - docs/adr/0001-isr-single-instance-scaling.md
  - docs/operations/coolify-deploy.md
  - docs/operations/dns-email-deliverability.md
  - docs/operations/umami-deploy.md
  - scripts/check-bundle-size.mjs
  - scripts/test-auth-ratelimit.mjs
  - scripts/test-publish-visible.mjs
  - src/actions/__tests__/newsletter.test.ts
  - src/actions/__tests__/pages.test.ts
  - src/actions/__tests__/taxonomy.test.ts
  - src/actions/__tests__/users.test.ts
  - src/actions/categories.ts
  - src/actions/contact.ts
  - src/actions/newsletter.ts
  - src/actions/pages-schema.ts
  - src/actions/pages.ts
  - src/actions/tags.ts
  - src/actions/users.ts
  - src/lib/__tests__/post-render.test.ts
  - src/lib/auth/index.ts
  - src/lib/post-render.ts
  - src/lib/rate-limit/__tests__/client-ip.test.ts
  - src/lib/rate-limit/__tests__/rate-limit.test.ts
  - src/lib/rate-limit/index.ts
  - src/lib/rate-limit/upstash-ioredis-adapter.ts
  - src/lib/redis/index.ts
findings:
  critical: 2
  warning: 7
  info: 5
  total: 14
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-08-26T17:43:49Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Full-phase adversarial review of the Phase 7 (Performance & Deploy) surface,
including the Plan 07-06 additions (trusted-proxy XFF keying, fail-closed Redis
degradation, ephemeral-cache test surface, partial-update schema, harness
reliability fixes). Every library-behavior claim was cross-checked against the
installed packages (`better-auth@1.6.23`, `@upstash/ratelimit@2.0.8`,
`next@16.2.9` dist, `resend` dist) and against the Dockerfile, package.json,
schemas, and client components the reviewed files depend on.

What holds up well: the permission-check-first convention is genuinely enforced
across all mutating actions (proven by MUST_NOT_BE_REACHED tests, not just
asserted); `subscribeNewsletter` is the correct public-action resilience shape
(returned states, last-hop XFF via the one shared helper, fail-closed limiter
catch); the rate-limit adapter's variadic translation and the WR-02/WR-03 test
rewrites are faithful to the installed library; the post-render NULL-body guard
and its test are sound; the ADR's `cacheHandler` naming claim is correct.

The two critical findings are both deploy-time contract breaks: (1) the
production runbook's runtime env table omits `TRUSTED_PROXY_CIDR` entirely, so
a by-the-runbook deploy reintroduces the exact single-global-bucket auth lockout
that Plan 07-06 was written to fix; (2) the `RATE_LIMITED`-via-thrown-error
contract in `contact.ts` (and the friendly guard messages in `users.ts`) cannot
reach the client in production builds — React's flight serializer strips error
messages in production (verified in the installed dist), so `ContactForm`'s
message mapping is dead code in prod and rate-limited users are told "Something
went wrong. Please try again."

## Structural Findings (fallow)

No structural findings block was provided for this pass (no JSON payload in the
invocation). All findings below are narrative findings from direct code review.

## Critical Issues

### CR-01: Production runbook omits TRUSTED_PROXY_CIDR — a by-the-runbook deploy reintroduces the global auth rate-limit bucket (trivial unauthenticated sign-in lockout)

**File:** `docs/operations/coolify-deploy.md:179-208` (section 5 runtime env table); cross-ref `src/lib/auth/index.ts:163-175`
**Issue:** Plan 07-06 made `advanced.ipAddress.trustedProxies` env-driven
(`TRUSTED_PROXY_CIDR`) precisely because, per the code's own verified comment
(`src/lib/auth/index.ts:143-157`), with `trustedProxies` empty and
`ipAddressHeaders` set, Better Auth 1.6.23's `getIPFromHeader` returns **null**
for ANY multi-value `X-Forwarded-For`. Behind an appending proxy (the Coolify
Caddy/Traefik default — the runbook itself describes the proxy terminating TLS
in front of the app) **every** production request carries a multi-value XFF, so
all auth traffic collapses into one `NO_TRUSTED_IP_KEY` bucket limited to
**3 requests / 15 minutes across all users**. Any unauthenticated attacker can
spend 3 requests and lock out sign-in, password reset, and email verification
for the entire site for 15 minutes at a time — the exact T-07-06-01 threat the
plan says was mitigated.

The mitigation only activates if the operator sets `TRUSTED_PROXY_CIDR` in the
production runtime environment. The variable IS documented in `.env.example`
(local dev, empty default) and referenced in the harness's manual-run notes —
but the runbook's runtime environment variable table (section 5), which is the
operator's checklist for what Coolify must have set before first deploy, does
not contain it. Grep confirms zero occurrences of `TRUSTED_PROXY_CIDR` anywhere
under `docs/`. An operator following the runbook verbatim ships the vulnerable
configuration, and the code's fail-closed framing ("over-limiting, never
spoofable") does not help here — this is an availability attack surface on the
auth endpoints, not a spoofing one.

**Fix:** Add the variable to the section 5 runtime table with generation/shape
guidance, and add a verification step:

```markdown
| `TRUSTED_PROXY_CIDR` | The Coolify proxy's internal-network CIDR (e.g. the
  docker-network range like `172.16.0.0/12`); comma-separate multiple ranges |
  REQUIRED for production behind the appending proxy. Unset ⇒ every request
  resolves to a null client IP ⇒ ALL auth traffic shares one 3/15-min bucket
  (trivial unauthenticated lockout). Mis-set (over-broad CIDR matching every
  hop) ⇒ same shared bucket. Verify after deploy via the through-the-proxy
  curl check in scripts/test-auth-ratelimit.mjs SKIP instructions
  ("Human Verification Required" item 4). |
```

Also mention it in the Troubleshooting entry for "Auth fails closed" — today
that entry only says "Redis is unreachable", which will mislead an operator
debugging the shared-bucket lockout.

### CR-02: Thrown-error-message contracts (RATE_LIMITED, friendly guard messages) never reach the client in production — React flight redaction makes the mapping dead code

**File:** `src/actions/contact.ts:94-100` (primary); `src/actions/users.ts:429-467, 478-488` (same mechanism); cross-ref `src/components/site/ContactForm.tsx:92-103`
**Issue:** `submitContact` signals rate-limiting and Redis-outage by
`throw new Error("RATE_LIMITED")`, and its docblock (contact.ts:48-53) states
"The client form maps this to a friendly 'Too many messages — please try again
later' message". `ContactForm.tsx:98-101` implements that mapping:
`err instanceof Error && err.message === "RATE_LIMITED" ? "Too many messages…" : "Something went wrong…"`.
`deleteUser` in users.ts relies on the same mechanism for its five
deliberately-readable guard messages ("You cannot delete your own account.",
"Cannot delete the last remaining admin…", etc.).

Verified against the installed runtime: in production builds, React's flight
server serializes a rejected Server Action promise as an error chunk carrying
**only a digest** (`node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.production.js:1925-1927`
— `emitErrorChunk(request, id, digest)` stringifies `{ digest }` only; no
message/name/stack), and the client reconstructs the error with the generic
message "An error occurred in the Server Components render. The specific
message is omitted in production builds…" (react-server-dom-webpack-client
production bundles, line ~1800). `err.message` on the client is therefore never
`"RATE_LIMITED"` in production — the mapping is dead code, rate-limited and
Redis-outage users see "Something went wrong. **Please try again.**" (which
actively invites hammering the limiter), and every `deleteUser` guard failure
surfaces as a generic error in the dashboard. The contract appears to work in
dev (dev flight builds forward `message`), so local testing cannot catch it.

Note the irony: the phase invariant "never leak internal errors to public
forms" is accidentally satisfied by the redaction, but the defined
`RATE_LIMITED` public contract — the part tests pin — does not function
end-to-end in production. `subscribeNewsletter` is the correct shape
(useActionState + returned error states) and is unaffected.

**Fix:** Return error states instead of throwing, mirroring
`subscribeNewsletter`:

```ts
// contact.ts — change the public contract from thrown to returned state
export async function submitContact(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: "RATE_LIMITED" | "INVALID_INPUT" }> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };
  // ...
  try {
    ({ success } = await contactFormLimiter.limit(ip));
  } catch {
    return { ok: false, error: "RATE_LIMITED" }; // Redis outage — fail closed
  }
  if (!success) return { ok: false, error: "RATE_LIMITED" };
  // ...
}
// ContactForm.tsx — switch on the returned state (never err.message)
```

For `users.ts`, either return `{ error: string }` states from `deleteUser` /
`updateUser` / `createUser` call sites, or attach a stable `digest` to the
thrown errors and have the dashboard switch on `err.digest` — but do not keep
branching on `err.message`.

## Warnings

### WR-01: Redis error listener is a no-op in production — outages are invisible, and the runbook's V5 diagnostic can never fire

**File:** `src/lib/redis/index.ts:47-54`; cross-ref `docs/operations/coolify-deploy.md:289-294` (V5)
**Issue:** The singleton's only `error` listener logs via `console.warn` guarded
by `if (process.env.NODE_ENV !== "production")`. In production (which is the
only place the Redis outage path matters — fail-closed sign-in blocking), the
listener swallows the error with **zero output**. The listener still prevents
the process crash (its real job), but coolify-deploy.md V5 instructs: "Check
the Next.js container logs for the ioredis connection succeeding (no repeated
`[redis] connection error` warnings)" — those warnings are structurally
impossible to observe in production, so V5 vacuously passes during a full
Redis outage and the operator's only symptom is unexplained fail-closed auth.
**Fix:** Log unconditionally (rate-limited if desired) via the structured
`log.error` used elsewhere, e.g. `log.error("redis connection error", { message: err?.message })`, and align V5's wording with what production actually emits.

### WR-02: DNS/deliverability runbook points operators at a nonexistent page — `/forget-password` (actual route is `/forgot-password`)

**File:** `docs/operations/dns-email-deliverability.md:119` (step 6.1) and `:245-247` (troubleshooting); cross-ref `src/app/(full-width-pages)/(auth)/forgot-password/` and `src/proxy.ts:94-97`
**Issue:** Step 6 of the runbook instructs: "Visit
`https://anydiscussion.com/forget-password`" to trigger the password-reset
email. The app's page route is `/forgot-password` (confirmed in the route
tree; `src/proxy.ts` matcher uses `/forgot-password`). `/forget-password` is
only the Better Auth **API endpoint** name (`/api/auth/forget-password`, as
keyed in `rateLimit.customRules`) — the runbook conflates the API endpoint
with the user-facing page. The URL as written 404s, so verification step 6 and
V3 cannot be executed as written (and the "Rate limit blocks the test"
troubleshooting entry repeats the wrong path). **Fix:** Replace both
occurrences with `/forgot-password` and optionally note that the underlying
rate-limited endpoint is `/api/auth/forget-password`.

### WR-03: Coolify runbook's two "OPEN DECISIONS" are stale against the repo, and the V1 dry-run command omits the build-time env its own decision A mandates

**File:** `docs/operations/coolify-deploy.md:77-121` (Decision A), `:123-177` (Decision B), `:242-251` (V1); cross-ref `Dockerfile:16` vs `Dockerfile:95`, `package.json:18`
**Issue:** (a) Decision B is presented as unresolved ("GATE 2 currently FAILS
on a clean production build", "resolve before first deploy"), but the repo has
already applied the recommended path: `Dockerfile:95` runs
`--max-gz-kb=1000` and `package.json`'s `check-bundle` script matches — while
`Dockerfile:16` (header comment) still says `--max-gz-kb=100`. The runbook
also still claims the gate runs `--max-gz-kb=100`. An operator reconciling the
runbook against the repo gets three mutually inconsistent statements, and
might "re-raise" an already-raised threshold. (b) The V1 local dry-run command
passes only the two `NEXT_PUBLIC_*` build args and no build-time
`DATABASE_URL`/`REDIS_URL`, so the dry-run as written fails with the very
`ECONNREFUSED` its own Decision A section and Troubleshooting entry describe.
**Fix:** Update Decision B to record "resolved — 1000 KB applied in Dockerfile
RUN + package.json (fix the stale Dockerfile:16 header comment)"; extend the
V1 command with the Decision-A build-time env (`--build-arg`/env for
`DATABASE_URL` and `REDIS_URL`), or explicitly mark the command as requiring
them.

### WR-04: test-auth-ratelimit.mjs reports PASS (exit 0) when its HTTP assertions actually fail — false green for real limiter regressions

**File:** `scripts/test-auth-ratelimit.mjs:316-323, 328`
**Issue:** In `main()`, an HTTP result of `"failed"` sets `process.exitCode = 1`
only when the structural check ALSO failed; if structural passed, the script
prints "FAIL:HTTP CHECK FAILED" and then exits 0, and the summary line prints
`Result: PASS (exit 0)` — directly contradicting the FAIL line above it. The
failure modes that reach `"failed"` are genuine regressions, not environment
noise: "expected 4th attempt to return 429, got 200 — rate limiter is not
enforced (Redis customStorage miswired?)" and "429 but no X-Retry-After
header". Only the `"skipped"` result (server unavailable) deserves exit 0.
Any automation (or the Docker gates, if this script is ever wired in) consuming
the exit code will certify a broken limiter. **Fix:** In the `"failed"`
branch, set `process.exitCode = 1` unconditionally; keep exit 0 only for
`"passed"` and `"skipped"`. (Also note: `httpCheck`'s Windows cleanup calls
`taskkill /pid ${server.pid}` — if the spawn itself failed, `pid` is
`undefined`; the cleanup-error log covers it, but a `server.pid` guard would
silence a predictable noise line.)

### WR-05: No server-side input validation on taxonomy name/description and updateUser profile fields — violates the project's own Zod-reuse convention

**File:** `src/actions/categories.ts:23-27, 29-43, 74-100`; `src/actions/tags.ts:23-26, 28-38, 78-102`; `src/actions/users.ts:294-334`
**Issue:** CLAUDE.md's code conventions require Zod schemas "reused for both
form validation and Server Action input parsing". `pages`, `posts`,
`newsletter`, and `contact` all follow it; these three actions do not:
- `createCategory`/`createTag` accept `name: string` with no length cap and no
  min — an empty-string name is inserted verbatim; `description` likewise
  unbounded. Only the slug is validated (`validateSlug`).
- `updateCategory`/`updateTag` use truthiness (`...(input.name ? { name: ... } : {})`)
  for `name` but `!== undefined` for `description` — an update of
  `{ name: "" }` silently no-ops instead of being rejected, an inconsistency
  that will cost someone an debugging hour.
- `updateUser` accepts `name`/`bio`/`avatar` with no validation at all — any
  authenticated user (self-edit path) can persist arbitrarily large strings, or
  an `avatar` value that is not a URL/CDN key, which the public author page
  then consumes.
These are permission-gated surfaces, so severity is capped at Warning, but a
10 MB `name`/`bio` payload is a trivial DB-bloat DoS by any authenticated
author, and the project convention is explicit.
**Fix:** Add `categorySchema`/`tagSchema` (`name: z.string().min(1).max(120)`,
`description: z.string().max(1000).optional()`) parsed first in each action,
and a `userUpdateSchema` for `updateUser` (`name` max 255, `bio` max ~2000,
`avatar` as URL-or-empty). Use `!== undefined` consistently for partial
semantics and let Zod reject empty names instead of silently skipping.

### WR-06: Last-hop XFF keying assumes exactly ONE appending proxy — the documented Cloudflare + Coolify topology collapses all visitors into shared 5/hour form buckets

**File:** `src/lib/rate-limit/index.ts:48-53` (docblock) and `:61-64`; cross-ref `docs/adr/0001-isr-single-instance-scaling.md:34-36`
**Issue:** `getClientIpFromXff` returns the last comma-separated entry. Under
the project's documented production topology — ADR 0001 describes the publish
loop running "on a single Coolify instance **plus Cloudflare CDN**" — the chain
seen by the app is `client-spoofed…, realClientIP (appended by Cloudflare),
cfEdgeIP (appended by the Coolify proxy)`. The last hop is then a **Cloudflare
edge IP shared by every visitor**, so `contactFormLimiter` and
`newsletterLimiter` key on it: the whole site shares a handful of 5-per-hour
buckets. The helper's own docblock acknowledges the multi-proxy mode
("adjacent callers then share one bucket… over-limits, never under-limits"),
but the failure direction being "safe" does not make it acceptable — it means
both public forms are effectively disabled site-wide (every 6th submission
within an hour, globally, returns RATE_LIMITED). This must be resolved before
or at deploy: either confirm the apex is DNS-only (grey cloud) so the Coolify
proxy is the sole appending hop, or extend the helper to strip a configured
number of trusted hops / prefer `CF-Connecting-IP` when present and trusted.
**Fix (minimal):** make the trusted-hop count configurable, mirroring the
auth limiter's approach:

```ts
// strip N rightmost hops that our own proxy chain appended (env: TRUSTED_XFF_HOP_COUNT, default 1)
export function getClientIpFromXff(forwardedFor: string | null): string {
  const hops = (forwardedFor ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  const n = Number(process.env.TRUSTED_XFF_HOP_COUNT ?? "1");
  const ip = hops.length > n ? hops[hops.length - 1 - n] : hops[hops.length - 1];
  return ip || "unknown";
}
```

…and document the env var in the deploy runbook alongside
`TRUSTED_PROXY_CIDR` (CR-01), with a post-deploy verification that two
different clients get different buckets.

### WR-07: Deploy runbook's core premise (git push main = automatic production deploy) contradicts the recorded owner decision that production deploys are manual and Docker is local-dev only

**File:** `docs/operations/coolify-deploy.md:13-18` (header), `:271-279` (V3); cross-ref plan 07-04 close-out (commit `462e4e1`, 2026-07-29: "Tasks 2-3 deferred per owner manual-deploy decision") and the recorded deploy-approach decision (Dockerfile + docker-compose are LOCAL-DEV only; prod deploy is manual)
**Issue:** The runbook opens with "There is NO staging environment and NO CI
layer… A push to `main` builds and deploys directly to production at
https://anydiscussion.com" and V3 instructs "Push to main: `git push origin
main`" as the production deploy step. Per the owner's later recorded decision,
the Docker pipeline is local-dev only and production deployment is manual.
An operator following this runbook would wire up (and trigger) an
auto-deploy-to-production path the owner explicitly deferred — the exact class
of silent-divergence-between-docs-and-reality this runbook exists to prevent.
**Fix:** Add a prominent status note at the top of the runbook: "SUPERSEDED
(owner decision 2026-07-29): production deploys are MANUAL; the Docker/Coolify
pipeline described here is local-dev dry-run material. Retain sections 5-6
(runtime env, Redis service) as the production env-var reference." At minimum,
reconcile the header and V3 with the recorded decision.

## Info

### IN-01: check-bundle-size.mjs scans only the top level of chunks/ — currently correct, fragile to build-shape changes

**File:** `scripts/check-bundle-size.mjs:84`
**Issue:** `readdirSync(STATIC_DIR).filter((f) => f.endsWith(".js"))` is
non-recursive. Verified against the current `.next/static/chunks` (Turbopack
output): flat, no subdirectories — so today's totals are correct. But Webpack
builds (an allowed opt-out per project context) and some Next versions emit
nested chunk dirs (`chunks/app/`, `chunks/ssr/`), which would be silently
skipped and under-count the gate's own metric.
**Fix:** `readdirSync(STATIC_DIR, { recursive: true })` (Node ≥20.1) and keep
the `.js` filter; totals stay identical on the current flat layout.

### IN-02: Blank contact subject ships as "Contact: " — the `?? data.name` fallback is dead for real form payloads

**File:** `src/actions/contact.ts:119`; cross-ref `src/actions/contact-schema.ts:45`
**Issue:** `subject: \`${data.subject ?? data.name}\`` uses nullish
coalescing, but the schema (`z.string().max(255).optional()`) permits empty
string, and the client form always sends the field (default `""`). A user who
leaves subject blank produces the email subject `Contact: ` — the intended
name fallback never fires because `""` is not nullish.
**Fix:** `\`Contact: ${data.subject?.trim() || data.name}\`` (or add
`.min(1)` + `.transform` to the schema to normalize blank to undefined).

### IN-03: createFirstAdmin has a count-then-create TOCTOU window

**File:** `src/actions/users.ts:69-91`
**Issue:** Two concurrent bootstrap requests can both observe `count(admins)===0`
and both create an admin. There is no unique constraint that backstops the
check. The window is the first-run setup moment only, and the codebase's
threat model treats post-bootstrap calls as blocked, so this is low
likelihood — but it is the one gap in an otherwise structurally-proven gate.
**Fix:** Wrap in a transaction with `SELECT … FOR UPDATE` on the count (or a
settings-row "bootstrap-closed" flag inserted with `onConflictDoNothing` and
checked via insert-result), or accept and document the window.

### IN-04: Ungated "use server" read exports are publicly invocable endpoints

**File:** `src/actions/tags.ts:70-76` (`getPostTagIds`), `:56-63` (`listTags`); `src/actions/categories.ts:62-72` (`listCategories`)
**Issue:** Per the codebase's own stated threat model ("every export of a
'use server' module is a publicly invocable endpoint" — newsletter.ts:15-17),
these three reads are callable by any unauthenticated party. The data is
public-site data (tag/category names, post↔tag id associations), so
sensitivity is low, and the CLAUDE.md convention mandates checks on mutating
actions. Flagging so the exposure is a documented decision rather than an
accident. **Fix (optional):** add a lightweight `requireCan`/session gate or a
comment pinning the "public data, deliberately ungated" rationale on each.

### IN-05: test-auth-ratelimit.mjs has no port preflight — a stale listener on 3940 is polled and results are misattributed

**File:** `scripts/test-auth-ratelimit.mjs:126-146` (waitForServer), `:173-186` (httpCheck)
**Issue:** If any process (including an orphan from a pre-WR-06 run, or a dev
server on the same port) already listens on 3940, `waitForServer` succeeds
against it immediately, the four sign-in POSTs hit the foreign process, and
the script's own spawned `next start` fails with EADDRINUSE visible only in
captured stderr. Verdicts are then attributed to the wrong server. The WR-06
cleanup work made orphans unlikely, but a preflight would make misattribution
impossible.
**Fix:** Before spawning, probe the port (e.g. a raw `net.connect` check) and
fail fast with "port 3940 already in use — kill the stale listener" if
occupied.

---

_Reviewed: 2026-08-26T17:43:49Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
