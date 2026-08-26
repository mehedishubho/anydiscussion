---
phase: 07-performance-deploy
reviewed: 2026-08-26T14:19:48Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - docs/adr/0001-isr-single-instance-scaling.md
  - docs/operations/coolify-deploy.md
  - docs/operations/dns-email-deliverability.md
  - docs/operations/umami-deploy.md
  - scripts/check-bundle-size.mjs
  - scripts/test-auth-ratelimit.mjs
  - scripts/test-publish-visible.mjs
  - src/actions/__tests__/pages.test.ts
  - src/actions/__tests__/taxonomy.test.ts
  - src/actions/__tests__/users.test.ts
  - src/actions/categories.ts
  - src/actions/contact.ts
  - src/actions/pages.ts
  - src/actions/tags.ts
  - src/actions/users.ts
  - src/lib/auth/index.ts
  - src/lib/rate-limit/__tests__/rate-limit.test.ts
  - src/lib/rate-limit/index.ts
  - src/lib/rate-limit/upstash-ioredis-adapter.ts
  - src/lib/redis/index.ts
findings:
  critical: 1
  warning: 13
  info: 4
  total: 18
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-08-26T14:19:48Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

The Phase 07 surface was reviewed at standard depth with cross-referencing of
every library-behavior claim against the installed packages
(`better-auth@1.6.23`, `@upstash/ratelimit@2.0.8`) and against the Dockerfile,
package.json, schemas, and helpers the files depend on.

The revalidation additions to categories/tags/pages/users actions are
conventionally correct (permission-check-first, concrete literal paths, 2-arg
`revalidateTag(tag, "max")`) but have **zero assertion coverage** in the
updated test mocks. The Redis singleton, Better Auth `customStorage`, and the
ioredis adapter are solid individually. The dominant problems are: (1) an
unverified, internally inconsistent client-IP trust model that can either
collapse the entire auth rate limiter into one global bucket (verified against
better-auth 1.6.23 dist source) or leave the contact limiter keyed on an
attacker-controlled value; (2) a false "limiter never throws" contract that the
test file claims to prove but never exercises; and (3) three runbook/ADR
technical claims that contradict the actual Dockerfile and library behavior
(the manual-deploy revision recorded in 07-04-SUMMARY.md is not re-flagged
here).

## Critical Issues

### CR-01: Unverified, inconsistent client-IP trust model — Better Auth rate limiter collapses to a single shared bucket on multi-value XFF; contact limiter keys on attacker-controlled first hop

**File:** `src/lib/auth/index.ts:141-148`, `src/actions/contact.ts:75-78`, `scripts/test-auth-ratelimit.mjs:33-37`
**Issue:** The entire PERF-04 rate-limiting design rests on the claim (repeated
in `src/lib/auth/index.ts:142-143` and `scripts/test-auth-ratelimit.mjs:34-36`)
that "Coolify's Caddy/Traefik overwrites X-Forwarded-For; an attacker cannot set
this header from the client side." This claim is never verified anywhere in the
repo, and the two limiter paths implement *different, both-fragile* trust
models:

1. **Better Auth (verified against installed dist):** with only
   `advanced.ipAddress.ipAddressHeaders: ["x-forwarded-for"]` configured and
   `trustedProxies` NOT set,
   `@better-auth/core@1.6.23/dist/utils/ip.mjs` (`getIPFromHeader`, lines
   172-191) returns **null for any multi-value XFF header**
   (`if (forwardedIps.length !== 1) return null;`). The rate limiter then keys
   every such request into one shared bucket
   (`rate-limiter/index.mjs:287`: `createRateLimitKey(ip ?? NO_TRUSTED_IP_KEY, path)`).
   Proxies that *append* to XFF (Traefik's standard behavior) therefore make
   every production request multi-value → **all anonymous sign-in,
   password-reset, reset-consume, and email-verification traffic shares a
   single 3-requests-per-15-minutes bucket**. Three requests from anyone lock
   out auth for every user for 15 minutes — a trivial unauthenticated DoS of
   the auth service, and the exact opposite of the intended brute-force
   protection.
2. **Contact form:** `src/actions/contact.ts:77` takes
   `forwardedFor?.split(",")[0]?.trim()` — the **first** hop. Under an
   appending proxy the first hop is client-supplied, so a bot rotating fake
   `X-Forwarded-For` values gets a fresh 5/hour budget per fake IP
   (`newsletterLimiter` shares the same extraction pattern via its consumer).
   Under an overwriting proxy this is safe; under an appending proxy it is a
   full bypass. The integration test sends a single-value XFF directly to
   `next start`, so it validates neither production proxy behavior — it passes
   while the production trust assumption is untested.

**Fix:**
1. Configure `trustedProxies` so better-auth strips the chain from the right
   (verified supported at `ip.mjs:178-186`):

   ```ts
   advanced: {
     ipAddress: {
       ipAddressHeaders: ["x-forwarded-for"],
       // Coolify proxy network CIDR (the Caddy/Traefik container):
       trustedProxies: ["172.16.0.0/12"], // adjust to the actual Coolify network
     },
   },
   ```
2. In `contact.ts`, stop trusting the first hop — take the **last** entry
   (appended by our own proxy) or a proxy-set real-IP header:
   `const ip = forwardedFor?.split(",").pop()?.trim() || "unknown";`
3. Empirically verify the proxy behavior before shipping: through the deployed
   proxy, `curl -H "X-Forwarded-For: 1.2.3.4"` the app and log what it
   resolves. Add that check to `scripts/test-auth-ratelimit.mjs`'s manual-run
   instructions so the assumption is re-verified per environment.

## Warnings

### WR-01: `submitContact` crashes with an opaque error when Redis is down — the "limiter never throws" contract is false

**File:** `src/actions/contact.ts:78-81`
**Issue:** `await contactFormLimiter.limit(ip)` has no try/catch, and the
claim (in `src/lib/rate-limit/index.ts` header and
`src/lib/rate-limit/__tests__/rate-limit.test.ts:157-158`: "callers in
contact.ts rely on `success: false` rather than a try/catch") is false.
Verified against the installed `@upstash/ratelimit@2.0.8` dist:
`safeEval` rethrows non-NOSCRIPT errors (`dist/index.mjs:147-156`) and the
`slidingWindow` `limit()` implementation has **no catch** around it. When
Redis is unreachable, ioredis rejects after `maxRetriesPerRequest: 3`
(~seconds of retry backoff), `limit()` rejects, and `submitContact` throws a
raw error that is neither the documented `RATE_LIMITED` nor any graceful
message — the public contact form hard-fails during a Redis outage with no
defined user-facing behavior. The auth path's fail-closed behavior is a
documented decision (T-07-02-06); the contact path's is neither designed nor
documented.
**Fix:** Decide and encode the policy explicitly:

```ts
let limited: boolean;
try {
  ({ success: limited } = await contactFormLimiter.limit(ip));
} catch {
  // Redis down: fail CLOSED (consistent with the auth limiter, T-07-02-06)
  throw new Error("RATE_LIMITED");
}
if (!limited) throw new Error("RATE_LIMITED");
```

and correct the false never-throws comments in `rate-limit/index.ts` and the
test file.

### WR-02: `resetEphemeralCache()` in rate-limit.test.ts is a silent no-op — the cache lives at `ctx.cache` and is a `Cache` wrapper, not a `Map`

**File:** `src/lib/rate-limit/__tests__/rate-limit.test.ts:113-118`
**Issue:** The helper reads
`(contactFormLimiter as { cache?: Map }).cache`, but in
`@upstash/ratelimit@2.0.8` the ephemeral cache is assigned in the base
constructor as `this.ctx.cache = new Cache(new Map())` (dist `index.mjs:757-761`;
`new Ratelimit(...)` resolves to `RegionRatelimit extends Ratelimit`,
`index.mjs:1419-1438`). `limiter.cache` is `undefined`, so
`cache instanceof Map` is always false and the reset never runs. The file's
own header comment even cites `ctx.cache` — then reads `.cache`. The current
four tests pass only because their IPs were chosen to avoid cross-test
collisions (the block cached by test 2's IP `1.2.3.4` is never reused by
tests 3-4); any future test re-using a previously blocked identifier will
fail mysteriously.
**Fix:**

```ts
function resetEphemeralCache() {
  const ctxCache = (contactFormLimiter as unknown as { ctx?: { cache?: { empty?(): void } } }).ctx?.cache;
  ctxCache?.empty?.(); // Cache.empty() clears the underlying Map
}
```

(or expose `ephemeralCache: new Map()` in the limiter config and clear that
Map directly, which is the supported API.)

### WR-03: Test "does NOT throw on Redis call failure surface" never simulates a Redis failure — certifies a property that is false

**File:** `src/lib/rate-limit/__tests__/rate-limit.test.ts:156-164`
**Issue:** The test calls `contactFormLimiter.limit("203.0.113.42")` against
the happy-path mock and asserts the result has `success/limit/remaining/reset`
properties. It never makes the mocked `evalsha`/`eval` reject, so the
stated subject ("Redis call failure surface") is never exercised — and the
property it claims to prove is the exact one CR/WR-01 shows to be false (the
library propagates Redis errors). This test gives false assurance that
`contact.ts` needs no error handling.
**Fix:** Replace with a real failure simulation:

```ts
it("propagates Redis failures to the caller (documenting contact.ts's required catch)", async () => {
  mockEvalshaRejects(new Error("ECONNREFUSED")); // wire a mutable failure flag into the vi.mock
  await expect(contactFormLimiter.limit("203.0.113.42")).rejects.toThrow("ECONNREFUSED");
});
```

### WR-04: The Phase-07 revalidation additions have zero assertion coverage — all three action test files mock `revalidatePath`/`revalidateTag` but never assert a single call

**File:** `src/actions/__tests__/pages.test.ts:37-40`, `src/actions/__tests__/taxonomy.test.ts:36-39`, `src/actions/__tests__/users.test.ts:68-71`
**Issue:** The stated Phase-07 change to these files is the revalidation wiring
(concrete `revalidatePath("/category/${slug}")`, `revalidateTag("posts-list", "max")`,
`revalidateTag(\`category-${id}\`, "max")`, etc.). The updated mocks exist only
to prevent the actions from crashing outside Next's static-generation store —
no test asserts `revalidatePathMock`/`revalidateTagMock` was called, with
which paths/tags, or in the 2-arg `"max"` form. Regressions like dropping the
`"max"` argument, revalidating the wrong slug on rename, or omitting the
old-URL revalidation on soft-delete would all pass green. (taxonomy.test.ts
line 104 even says "assertions on call patterns where useful" — none follow.)
**Fix:** Add at least one assertion block per mutating action, e.g.:

```ts
it("softDeleteCategory revalidates the concrete old slug + tag axes", async () => {
  await softDeleteCategory(7);
  expect(revalidatePathMock).toHaveBeenCalledWith("/category/existing-slug");
  expect(revalidatePathMock).toHaveBeenCalledWith("/sitemap.xml");
  expect(revalidateTagMock).toHaveBeenCalledWith("posts-list", "max");
  expect(revalidateTagMock).toHaveBeenCalledWith("category-7", "max");
});
```

### WR-05: `updatePage`'s `Partial<PageInput>` contract is broken — `pageSchema` requires `title` and `slug`, so any true partial input throws

**File:** `src/actions/pages.ts:139-142`
**Issue:** `updatePage(id: number, input: Partial<PageInput>)` documents
"Only the supplied fields are written (Partial<PageInput> semantics)" and
`pageSchema.parse({ ...input, id })` — but `pageSchema`
(`src/actions/pages-schema.ts:26-43`) declares `title: z.string().min(1)` and
`slug: z.string().min(1)` as **required**. A partial call such as
`updatePage(id, { status: "published" })` (a status toggle) or
`{ metaTitle: "..." }` throws a ZodError before any write. The only current
caller (`PageForm.tsx:89`) happens to always send the full payload, so this is
latent — but the JSDoc/signature promise a behavior the implementation does
not have, and pages.test.ts:156 (`updatePage(1, { title: "T2" })`) only works
because the FORBIDDEN mock throws before the parse. The happy path of both
`createPage` and `updatePage` (including revalidation) is untested.
**Fix:** Parse partial updates with a partial schema, keeping the strict
fields when present:

```ts
const data = pageSchema.partial().extend({ id: z.number().int().positive() })
  .parse({ ...input, id }) as Partial<PageSchemaInput>;
```

### WR-06: test-auth-ratelimit.mjs never kills `next start` on Linux/macOS — process-group kill of a `detached: false` child throws ESRCH, leaving an orphan server that poisons subsequent runs

**File:** `scripts/test-auth-ratelimit.mjs:150-156, 211-221`
**Issue:** The server is spawned with `{ shell: true, detached: false }`, so
the child is *not* a process-group leader. The cleanup branch for non-Windows
calls `process.kill(-server.pid, "SIGTERM")` — a negative PID targets a
process group with pgid === child pid, which does not exist → ESRCH is thrown
synchronously → swallowed by the bare `catch {}` ("best-effort kill") → the
sh/next-start process survives the script. On POSIX, every run leaks a
server holding port 3940; the next run's `waitForServer()` then succeeds
immediately against the **stale** server (potentially an older build with
older rate-limit config), and the 4 sign-in POSTs are issued against it —
the test can pass or fail for reasons unrelated to the current code.
**Fix:** Either spawn detached and keep the group kill, or kill the direct
child and its children explicitly:

```js
const server = spawn(`npx next start -p ${PORT}`, { stdio: "pipe", shell: true, detached: true });
// finally:
process.kill(-server.pid, "SIGTERM"); // now valid: detached:true made it a group leader
```

### WR-07: `npx next start` in test-auth-ratelimit.mjs violates the pnpm-only project constraint and risks resolving a wrong binary

**File:** `scripts/test-auth-ratelimit.mjs:151`
**Issue:** CLAUDE.md: "pnpm only. Never use npm or yarn — not in commands,
scripts, READMEs, or CI config." The script spawns `npx next start`. Beyond
the convention violation, `npx` falls back to registry resolution if the
local bin is missing (e.g. pruned node_modules), silently testing a different
Next version than the app runs. All other scripts in the repo use pnpm.
**Fix:** `spawn(\`pnpm exec next start -p ${PORT}\`, { stdio: "pipe", shell: true, detached: true });`

### WR-08: check-bundle-size.mjs scans `.next/static/chunks` non-recursively — nested chunk directories (e.g. `chunks/app/**` emitted by webpack builds) are silently excluded from the total

**File:** `scripts/check-bundle-size.mjs:84`
**Issue:** `readdirSync(STATIC_DIR).filter((f) => f.endsWith(".js"))` reads
only the top level, while the header (lines 12-14) and the coolify runbook
both claim the script sums "EVERY `.js` file under `.next/static/chunks/`".
Webpack App-Router builds emit client component chunks under nested paths
(`_next/static/chunks/app/<route>-<hash>.js` is the standard webpack output
shape); if the build ever runs under webpack (or Turbopack emits nested
groups), those files are excluded from both the total and the top-10
diagnostics — the gate undercounts and a leak in nested chunks goes
undetected.
**Fix:** Walk recursively:

```js
import { readdirSync, statSync } from "node:fs";
function walkJsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walkJsFiles(p) : e.name.endsWith(".js") ? [p] : [];
  });
}
```

and verify the count against a fresh local `pnpm build` once (the runbook's
"~48 chunks / ~749 KB" baseline should be re-confirmed as the recursive
total).

### WR-09: coolify-deploy.md contradicts the actual Dockerfile on three points — stale "OPEN DECISION B", false "zero ARG/ENV" security claim, and a dry-run command missing the required build arg

**File:** `docs/operations/coolify-deploy.md:73-75, 125-129, 152-177, 246-251, 337-340`
**Issue:**
1. **Section 4 (OPEN DECISION B)** quotes the GATE 2 invocation as
   `--max-gz-kb=100`, says it "currently FAILS on a clean production build",
   and instructs the operator to edit the Dockerfile `RUN` line and/or
   `package.json` ("currently `--max-gz-kb=100`"). Both were already changed
   to `--max-gz-kb=1000` (Dockerfile:95, package.json:18, applied in fc3286d
   per 07-04-SUMMARY.md). The troubleshooting entry
   "**GATE 2 fails with `total gzipped JS ~749 KB exceeds 100 KB threshold`**"
   describes a failure that can no longer occur. An operator following this
   runbook would "fix" an already-fixed gate.
2. **Section 2's security note** states "The Dockerfile has zero ARG/ENV
   lines for runtime secrets by design" and "DATABASE_URL … MUST NOT be
   Dockerfile ARGs and MUST NOT be build args." The Dockerfile declares
   `ARG DATABASE_URL` (line 71) and `ENV DATABASE_URL=$DATABASE_URL`
   (line 74) — the documented D-21 build-time exception that ADR 0001
   (lines 22-27) and runbook Section 3(a) itself both describe. The absolute
   claim is false and contradicts the rest of the same document.
3. **V1 (local dry-run)** shows a `docker build` command passing only the two
   `NEXT_PUBLIC_*` args — but per the runbook's own Section 3 (and the
   Dockerfile), the builder-stage `pnpm build` fails with ECONNREFUSED
   without `--build-arg DATABASE_URL=…`. The verification command as written
   reproduces the failure the runbook warns about.
**Fix:** Update Section 4 to record the applied decision (threshold 1000 KB,
baseline ~749 KB) and drop the "resolve before first deploy" framing; correct
Section 2's note to "DATABASE_URL is the single sanctioned build-time ARG
exception (builder stage only, not in the runner image — see Section 3a)";
add `--build-arg DATABASE_URL=…` to the V1 command; rewrite the GATE 2
troubleshooting entry for the 1000 KB threshold.

### WR-10: umami-deploy.md instructs exposing Umami on internal port 3001 but never sets Umami's `PORT` env — following the runbook literally yields an unreachable service

**File:** `docs/operations/umami-deploy.md:53-56, 63-70`
**Issue:** Step 2 says "Port: expose Umami on `3001` internally. Coolify's
proxy routes `https://analytics.anydiscussion.com` to this port… (Umami
listens on 3000 by default; map/host as 3001 or whatever the Coolify service
expects…)". Step 3's environment table sets only `DATABASE_URL` and
`APP_SECRET`. Umami binds to `PORT` (default 3000) — if the proxy is pointed
at 3001 while the container still listens on 3000, the health check and the
subdomain 404/502, and step 4's "confirm the login screen" fails. The
parenthetical "or whatever the Coolify service expects" is self-contradictory
guidance for an operator without Umami internals knowledge.
**Fix:** Either keep the service on 3000 (Coolify maps domains to the
container port it is told to), or add to the step-3 table:
`PORT=3001` (and keep the proxy target 3001). State one canonical choice.

### WR-11: DNS runbook's DMARC `rua` on an external domain will never receive reports without the RFC-required authorization record — the documented rollback diagnostic silently has no data source

**File:** `docs/operations/dns-email-deliverability.md:88-95, 210-216`
**Issue:** The DMARC record publishes `rua=mailto:<operator-email>` where the
operator email is, per the prerequisites, a Gmail/Outlook primary inbox — a
different domain from the DMARC record's domain. Per RFC 7489 §7.1, a report
receiver on an external domain only accepts aggregate reports if the
receiving domain publishes
`<mail-sending-domain>._report._dmarc.<receiver-domain> TXT "v=DMARC1"` —
which a Gmail/Outlook user cannot publish. Without it, mailbox providers
simply do not send reports to that address. The rollback section nevertheless
instructs: "Inspect the `rua` aggregate reports (emailed to the `rua` address)
to find which sources are failing DKIM/SPF alignment" — a step that can never
produce data, so the p=quarantine tightening proceeds without the monitoring
loop the runbook is built around.
**Fix:** Either set `rua` to an address on the sending domain
(e.g. `dmarc-reports@anydiscussion.com`) and forward it, or add a step
documenting the external-rua authorization record requirement (and note that
consumer Gmail/Outlook cannot publish it, requiring a report-processing
address on the owned domain).

### WR-12: redis/index.ts swallows all connection errors in production while coolify-deploy.md V5 tells the operator to verify Redis health via those very warnings

**File:** `src/lib/redis/index.ts:47-54`, `docs/operations/coolify-deploy.md:289-294`
**Issue:** The `on("error")` handler only logs when
`NODE_ENV !== "production"`. In the production container
(`NODE_ENV=production`, Dockerfile:102), *every* Redis error — connection
refused, auth failure, DNS — is silently discarded. Runbook V5 ("Redis
reachable from the runtime") instructs: "Check the Next.js container logs for
the ioredis connection succeeding (no repeated `[redis] connection error`
warnings)." That check can never fire in production; an operator confirms
"no warnings" trivially whether Redis is healthy or completely down (the
first visible symptom would be fail-closed 429/500s on auth). The
verification step provides false assurance.
**Fix:** Log at a low rate in production too (the listener's purpose is
crash-prevention, not silence):

```ts
globalThis.__redisClient.on("error", (err) => {
  console.warn("[redis] connection error — rate-limiting will fail closed:", err?.message ?? err);
});
```

and/or correct V5 to a real probe (e.g. watch for the fail-closed 429 on a
test sign-in, or `docker exec … redis-cli ping`).

### WR-13: Mutating actions in categories.ts/tags.ts/users.ts skip server-side field validation mandated by the project's Zod-reuse convention

**File:** `src/actions/categories.ts:29-43`, `src/actions/tags.ts:28-38`, `src/actions/users.ts:294-334`
**Issue:** CLAUDE.md: "Zod schemas … reused for both form validation and
Server Action input parsing"; pages.ts implements this correctly
(`pageSchema.parse`). These files do not:
- `createCategory`/`createTag`/`updateCategory`/`updateTag` validate only the
  slug (`validateSlug`); `name` accepts the empty string (creates a taxonomy
  row with no name) and `description` (categories) is entirely unvalidated
  (any length/type shape passes the TS type at runtime).
- `updateUser` performs no runtime validation at all: `name`/`bio`/`avatar`
  have no length caps (bio is rendered on the public `/author/[username]`
  page), and `role` is a TS-only union — a crafted action invocation can
  write an arbitrary role string into the user table (admin-only path, but a
  garbage value breaks that user's `userHasPermission` resolution). TS types
  do not enforce anything at the Server Action boundary — the client can send
  any shape.
**Fix:** Add a small Zod schema per feature (mirroring pages-schema.ts) and
parse as the first step after the permission gate, e.g.
`userPatchSchema.parse(input)` with
`role: z.enum(["admin","editor","author"]).optional()` and
`bio: z.string().max(500).optional()`.

## Info

### IN-01: check-bundle-size.mjs header still narrates the obsolete 100 KB deploy-abort policy

**File:** `scripts/check-bundle-size.mjs:12-16`
**Issue:** The header says "Threshold: 100 KB gzipped total (D-14) … the
deploy MUST abort," while the deployed gates (Dockerfile:95, package.json:18)
run 1000 KB and the script default of 100 only applies to bare `node` invocation.
**Fix:** Update the header comment to describe the default-vs-gate split and
the 1000 KB total-budget decision (fc3286d).

### IN-02: sanitizeBodyHtml's `<`+`>` heuristic entity-escapes legitimate non-HTML text at storage time

**File:** `src/actions/pages.ts:60-67`
**Issue:** A plain-text node containing both `<` and `>` that is not HTML
(e.g. "if a < b and b > c") is routed through `sanitizeBeforeStore`
(DOMPurify), which HTML-escapes bare `<` on serialization — the stored text
can come back entity-escaped. Copied verbatim from posts.ts by design (drift
prevention), so fix both together or neither; document the accepted edge.
**Fix:** Guard with a stricter HTML-shape check (e.g. `/<[a-zA-Z][^>]*>/`) in
both posts.ts and pages.ts, and add a round-trip test for text-with-angle-brackets.

### IN-03: Runbook sets `S3_FORCE_PATH_STYLE=false` for R2, contradicting the verified stack guidance in CLAUDE.md

**File:** `docs/operations/coolify-deploy.md:200`
**Issue:** `.claude/CLAUDE.md`'s verified R2 config states
`forcePathStyle: true` for R2; the runbook's env table says R2 uses
virtual-hosted style (`false`). R2 accepts both today, but the project's two
authoritative documents disagree on production config.
**Fix:** Align on one value (verify against the live R2 endpoint behavior) and
make the runbook match the stack table.

### IN-04: Deploy prerequisites say migrations are applied via "`pnpm db:generate` artifacts" — generate does not apply, and no apply script exists

**File:** `docs/operations/coolify-deploy.md:23-25`, `package.json:10`
**Issue:** `db:generate` only generates migration files; package.json has no
`db:migrate` script, so the prerequisite's wording ("with the migrations
applied (`pnpm db:generate` artifacts …)") describes a command that does not
apply anything. An operator could believe the schema is live when it isn't.
**Fix:** Reword to the actual apply step (`pnpm exec drizzle-kit migrate`, or
add a `db:migrate` script and reference it).

---

_Reviewed: 2026-08-26T14:19:48Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
