# Coolify Production Deploy Runbook

Production deployment of the Any Discussion blog on Coolify. This runbook covers
the git-push deploy model, runtime secret injection, the Redis managed service,
and the two build-time decisions the operator MUST resolve before the first
successful production build (build-needs-DB and the bundle-size gate threshold).

> References: D-20 (multi-stage Dockerfile), D-21 (build-time vs runtime secrets),
> D-23 (Coolify managed SSL), D-31 (no CI; Coolify is the pipeline), D-32 (no
> staging; push to main = production), D-13/D-14 (bundle-size gate). The Dockerfile
> at the repo root is the build pipeline Coolify invokes (authored in Plan 07-01).
>
> There is NO staging environment and NO CI layer (D-31/D-32). A push to `main`
> builds and deploys directly to production at https://anydiscussion.com. The
> Docker build-step gates (GATE 1 lint + GATE 2 bundle-size) are therefore the
> ONLY automated pre-production safety net -- they must pass inside the builder
> stage before the runtime image is copied.

## Prerequisites

- A Coolify v4.x instance running on the production VPS.
- SSH access to the VPS (for local Docker dry-run + log inspection).
- The managed Postgres service created in Coolify (PostgreSQL 16 or 17), with a
  database for the blog (e.g. `anydiscussion`) and the migrations applied
  (`pnpm db:generate` artifacts via `drizzle-kit`; see Phase 1 migration flow).
- All runtime secrets on hand (see the env var table in Steps section 5).
- The production domain `anydiscussion.com` DNS pointing at the Coolify VPS
  (A/AAAA records for the apex and `www`).
- Docker installed locally for the pre-push build dry-run (recommended).

## Steps

### 1. Create the Coolify project (git-push trigger)

1. In the Coolify dashboard: **Projects -> New Project**. Name it (e.g.
   `anydiscussion`).
2. Add a server (the production VPS) if not already added.
3. Create a new resource of type **Application**, connected to the git repository
   (the `anydiscussion` repo). Set the production branch to `main`.
4. Coolify builds via the repo-root `Dockerfile` (Plan 07-01, multi-stage:
   `deps` -> `builder` -> `runner`). Confirm the **Build Pack** is `Dockerfile`
   and the **Port** exposed is `3000` (the `runner` stage sets `EXPOSE 3000` and
   `CMD ["node","server.js"]`).
5. Under **Domains**, set:
   - `https://anydiscussion.com`
   - `https://www.anydiscussion.com`
   Coolify's proxy (Caddy/Traefik) terminates TLS via Let's Encrypt on both
   (D-23). No manual certificate management is needed.
6. Set the **Restart Policy** to `unless-stopped` so the container self-recovers
   from crashes (D-32 single-instance trade-off; multi-replica is a documented
   v2 path, see the ISR scaling ADR).

### 2. Configure build args (bake-time NEXT_PUBLIC_* only)

Per D-21, ONLY `NEXT_PUBLIC_*` variables are baked into the client bundle at
build time. These are SAFE to expose in the client. In Coolify, configure them as
**Build Args** (NOT runtime environment variables), because they must be present
when `next build` runs inside the builder stage.

The Dockerfile declares exactly two build args (Plan 07-01):

| Build Arg | Value (production) | Why bake-time |
|-----------|--------------------|---------------|
| `NEXT_PUBLIC_SITE_URL` | `https://anydiscussion.com` | Public base URL; baked into client code / metadata |
| `NEXT_PUBLIC_CDN_URL` | `https://cdn.anydiscussion.com` | Public CDN origin; baked into the next/image loader |

In Coolify: **Application -> Environment Variables -> Build Arguments** (or the
"Dockerfile Arguments" / build-time vars section depending on Coolify version).
Enter both as build args.

> SECURITY (D-21): Runtime secrets (DATABASE_URL, BETTER_AUTH_SECRET,
> RESEND_API_KEY, S3 credentials, SETTINGS_ENCRYPTION_KEY, REDIS_URL) MUST NOT be
> Dockerfile ARGs and MUST NOT be build args. They are injected at container
> start as runtime environment variables (section 5 below). The Dockerfile has
> zero ARG/ENV lines for runtime secrets by design.

### 3. OPEN DECISION A -- Build needs a database (resolve before first deploy)

**Problem.** The Dockerfile builder stage runs `pnpm build`, which executes
`next build`. Several routes are statically prerendered at build time and query
Postgres during prerender -- e.g. the homepage's featured posts and the
`/_not-found` page's suggested posts. With no `DATABASE_URL` reachable from the
builder stage, `next build` fails with `ECONNREFUSED` (Postgres not found).

This is the same class of problem the Redis `lazyConnect` fix solved for Redis
(commit `7999254`, "fix(07-02): defer redis connect (lazyConnect)"): the auth /
rate-limit module graph is imported during `pnpm build`, so the ioredis client
was trying to open a TCP connection to Redis at build time and crashing the build
worker. That fix sets `lazyConnect: true` in `src/lib/redis/index.ts` so the
connection is deferred to the first command (request time). The database has no
equivalent "lazy connect" -- the Drizzle pool connects when a prerender queries
it -- so the build genuinely needs a reachable Postgres.

**Resolution paths (the operator chooses one):**

**(a) RECOMMENDED for v1 -- Provide DATABASE_URL (and REDIS_URL) as Coolify
build-time env vars.** In Coolify, set `DATABASE_URL` and `REDIS_URL` as
build-time environment variables (alongside the NEXT_PUBLIC_* build args) so the
builder stage can reach the managed Postgres service during `next build`. This
preserves ISR/static prerendering (the performance bar in CLAUDE.md) and requires
no code changes. Redis still needs to be reachable because the auth module graph
imports the ioredis singleton -- thanks to `lazyConnect` the build won't crash if
Redis is briefly unreachable, but providing `REDIS_URL` at build time removes the
warning entirely.
   - **Trade-off:** build-time env vars are present in the builder layer only;
     they do NOT end up in the final `runner` image (the runtime stage is a fresh
     `node:20-alpine` copy of standalone output -- see Dockerfile Stage 3). They
     are also NOT `NEXT_PUBLIC_*`, so they are never baked into client bundles.
     Confirm with the secret non-leakage check in the Verification section.

**(b) Make DB-dependent prerender pages dynamic.** Mark the homepage and
`/_not-found` (and any other route that queries the DB at prerender) as dynamic
so `next build` skips the DB query. This removes the build-time DB requirement
but sacrifices ISR for those routes -- they become render-on-request. This
contradicts the CLAUDE.md performance requirement (public pages should be
static/ISR by default), so it is the fallback, not the default.

> Decision for v1: use path (a). Provide `DATABASE_URL` and `REDIS_URL` as
> Coolify build-time environment variables so the production build can
> prerender ISR pages. Record this in the operator notes. Path (b) remains
> available if build-time DB access ever becomes impractical.

### 4. OPEN DECISION B -- Bundle-size gate threshold (resolve before first deploy)

**Problem.** GATE 2 of the Dockerfile builder stage runs:

```
node scripts/check-bundle-size.mjs --max-gz-kb=100
```

`scripts/check-bundle-size.mjs` sums the GZIPPED size of EVERY `.js` file under
`.next/static/chunks/` (the full production output Next.js emits) and fails the
build when the total exceeds the threshold. Next.js does not route-group-separate
the chunks directory: a single production build emits roughly 48 chunks totalling
roughly 749 KB gzipped, which includes the `(admin)` dashboard, the Tiptap
editor, and the public `(site)` chunks together. Against the 100 KB threshold,
GATE 2 currently FAILS on a clean production build -- it is not measuring a
leak, it is measuring the combined admin + editor + site output.

What GATE 2 is designed to catch (and does catch) is a CATASTROPHIC leak: e.g.
Tiptap or TailAdmin accidentally imported into a `(site)` entry, inflating the
total far beyond baseline. GATE 1 (below) is the precise leak detector.

**Note on GATE 1 (the real cross-group leak guard):** The first build gate runs
`pnpm lint --max-warnings 0`. The existing ESLint `no-restricted-imports` rule
in `eslint.config.mjs` already fails on ANY `(site)` -> `(admin)` import. This is
the precise cross-group leak detector -- it catches even a single small leaked
import. GATE 2 is the coarse size backstop.

**Resolution paths (the operator chooses one before the first deploy):**

**(a) RECOMMENDED for v1 -- Raise the threshold to a realistic total budget.**
Set GATE 2's threshold to a budget that admits the legitimate combined output
while still catching a catastrophic regression. A budget in the range of
**1000 KB gzipped** (1 MB) is realistic for a combined admin/editor/site Next.js
build. Two ways to apply it:

   - Edit the `RUN` line in the Dockerfile builder stage to pass the budget:
     `RUN node scripts/check-bundle-size.mjs --max-gz-kb=1000`
   - OR edit the `check-bundle` script in `package.json` (currently
     `--max-gz-kb=100`) to match, and have the Dockerfile call `pnpm check-bundle`
     (or keep the explicit `--max-gz-kb` flag in the Dockerfile).

   Record the chosen budget and the baseline gzipped total (the script prints it)
   so a future regression that pushes the total materially above baseline still
   trips the gate.

**(b) Rescope the gate to public chunks only.** Restrict
`check-bundle-size.mjs` to chunks that are actually loaded by `(site)` routes
(e.g. by name pattern or by reading the `(site)` route group's client manifest).
This is more work and more fragile (chunk names are hashed), and GATE 1 already
precisely guards cross-group leaks, so it is not recommended for v1.

> Decision for v1: use path (a). Raise the GATE 2 threshold to a realistic total
> budget (suggested 1000 KB gzipped) and record the baseline. GATE 1 remains the
> precise `(site)` -> `(admin)` leak guard. Do NOT lower the threshold back to
> 100 KB without first rescoping the script, or every production build will fail.

### 5. Inject runtime environment variables

In Coolify: **Application -> Environment Variables** (RUNTIME variables, not
build args). Enter every runtime secret below. These are injected at container
start (`docker run`) and never baked into the image (D-21). Generate secrets
with the commands noted.

| Variable | Value / how to generate | Notes |
|----------|-------------------------|-------|
| `DATABASE_URL` | `postgresql://<user>:<pw>@<postgres-host>:5432/<db>` | Managed Postgres internal hostname (Coolify network). |
| `REDIS_URL` | `redis://<redis-internal-host>:6379` | Coolify Redis managed service (section 6). Internal only. |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` (>=32 chars) | High-entropy session secret. Never reuse across envs. |
| `BETTER_AUTH_URL` | `https://anydiscussion.com` | Production base URL, no trailing slash. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | `https://anydiscussion.com,https://www.anydiscussion.com` | Comma-separated CSRF/origin allowlist (D-21). |
| `RESEND_API_KEY` | From https://resend.com/api-keys | Resend SMTP key (AUTH-06/07). See dns-email-deliverability.md. |
| `EMAIL_FROM` | `no-reply@mail.anydiscussion.com` | Must be a Resend-verified from-domain. |
| `S3_ENDPOINT` | R2 S3 endpoint (`https://<accountid>.r2.cloudflarestorage.com`) | R2 in prod (MinIO in dev). |
| `S3_REGION` | `auto` (R2) | R2 uses `auto`. |
| `S3_ACCESS_KEY_ID` | R2 access key id | R2 token credentials. |
| `S3_SECRET_ACCESS_KEY` | R2 secret access key | R2 token credentials. |
| `S3_BUCKET` | `anydiscussion-media` (your R2 bucket) | Media bucket. |
| `S3_FORCE_PATH_STYLE` | `false` | R2 uses virtual-hosted style (MinIO dev uses `true`). |
| `SETTINGS_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` | 32-byte base64; encrypts storage-provider credentials (Phase 4 D-25). Runtime only -- NOT NEXT_PUBLIC. |

> SECURITY (D-21): Runtime secrets MUST NOT be Dockerfile ARGs. They MUST NOT
> appear as build args. They are runtime only. The Verification section below
> proves non-leakage with a negative grep against the built image.

After entering all variables, redeploy (or restart the service) so the container
picks up the new environment.

### 6. Add the Redis managed service (rate limiting, PERF-04)

Redis backs the auth rate limiter (Better Auth `customStorage`, 3 requests / 15
min on sign-in, password-reset, email-verification -- see `src/lib/auth/index.ts`
`rateLimit` block). It MUST be reachable from the Next.js runtime.

1. In Coolify: **Services -> Add Service -> Redis**.
2. Use the official image `redis:7-alpine` (Redis Inc. official -- verify the
   image source; T-07-04-SC mitigation).
3. Configure the Redis command to mirror the dev `docker-compose.yml` definition
   (Plan 07-02):
   - `--maxmemory 256mb`
   - `--maxmemory-policy allkeys-lru` (D-04 -- NOT `noeviction`)
   - `--save ""` (disable RDB persistence -- rate-limit data is ephemeral, D-04)
   - `--appendonly no` (disable AOF persistence)
4. **Bind Redis to the Coolify internal network ONLY.** Do NOT publish the Redis
   port to the public internet (T-07-04-04 / T-07-02-04). The dev
   `docker-compose.yml` maps `6379:6379` for local parity; production must NOT
   expose the port.
5. Set `REDIS_URL` (section 5) to the internal Redis hostname/port so the Next.js
   container can reach it.

### 7. Health check and restart policy

- **Health check:** Coolify's default health check probes the application port
  (3000) at `/`. A successful deploy returns HTTP 200 on the homepage. Confirm
  the probe is enabled; if it fails the deploy is marked unhealthy.
- **Restart policy:** `unless-stopped` (set in step 1). The container restarts
  on crash but stays down if you explicitly stop it.

## Verification

### V1. Local Docker build dry-run (before pushing to Coolify)

From the repo root, with the two open decisions resolved (DATABASE_URL/REDIS_URL
reachable at build time, GATE 2 threshold raised):

```
docker build -t anydiscussion-test \
  --build-arg NEXT_PUBLIC_SITE_URL=https://anydiscussion.com \
  --build-arg NEXT_PUBLIC_CDN_URL=https://cdn.anydiscussion.com .
```

Confirm:
- GATE 1 (`pnpm lint --max-warnings 0`) passes -- no cross-group import warnings.
- GATE 2 (`node scripts/check-bundle-size.mjs --max-gz-kb=<budget>`) passes and
  prints the baseline gzipped total.
- The build completes and produces `.next/standalone`.

### V2. Secret non-leakage (D-21) -- MANDATORY

Against the locally built image, confirm runtime secrets are NOT baked in:

```
docker run --rm anydiscussion-test env | grep -E "(DATABASE_URL|RESEND_API_KEY|BETTER_AUTH_SECRET|SETTINGS_ENCRYPTION_KEY|REDIS_URL|S3_SECRET)"
```

Expected: EMPTY output (no matches). Only `NEXT_PUBLIC_*` variables (and standard
Node/container env) should appear. If ANY runtime secret appears, the Dockerfile
is wrong -- abort and revisit Plan 07-01 before pushing.

### V3. Production build + SSL provisioning

1. Push to main: `git push origin main`.
2. Watch the Coolify build log. Confirm both GATE 1 and GATE 2 run inside the
   builder stage and pass (a gate fail aborts the deploy with a clear log line).
3. Confirm the runner stage starts and the Coolify proxy provisions the Let's
   Encrypt certificate for `https://anydiscussion.com` and
   `https://www.anydiscussion.com`.

### V4. Smoke test the production URL

Visit `https://anydiscussion.com` and confirm:
- Homepage loads.
- A single blog post loads.
- Dark mode toggles.
- A content image renders via `next/image` (served from
  `https://cdn.anydiscussion.com`).

### V5. Redis reachable from the runtime

Check the Next.js container logs for the ioredis connection succeeding (no
repeated `[redis] connection error` warnings). If Redis is unreachable, auth
fails closed (sign-in blocked) per T-07-02-06 -- safer for brute-force, but the
rate limiter is effectively down until Redis is reachable.

### V6. Rate-limit enforcement

Attempt 4 invalid sign-ins at `/signin` within 15 minutes. The 4th attempt must
trigger the rate-limit response (HTTP 429 with `X-Retry-After`, surfaced by
Better Auth's `toNextJsHandler`). This proves the Redis-backed `customStorage`
(`src/lib/auth/index.ts`) is wired end-to-end.

### V7. Publish-visible latency (Pitfall #3 closure)

With the production URL live, from a dev machine run:

```
PROD_URL=https://anydiscussion.com pnpm test:publish-visible
```

Expected: PASS, with the public URL reflecting the published/updated content
within 30 seconds. A FAIL means the revalidation fixes from Plan 07-03 need
debugging -- the Plan 07-03 audit deliverable is the diagnostic reference.

## Rollback

### Rollback (a bad deploy went live)

Because push-to-main is production (D-32), a rollback is a `git revert` + push,
which Coolify rebuilds and redeploys:

1. `git revert <bad-commit> && git push origin main` -- Coolify rebuilds the
   previous-good state.
2. If the build itself is broken and cannot rebuild, mark the service as
   stopped in Coolify and restore the previous image tag from the Coolify
   deployment history (Coolify retains prior successful deployments; pick the
   last known-good and redeploy it).
3. If Postgres data was mutated by the bad deploy, restore from the most recent
   backup (Phase 8 backup scope).

### Troubleshooting

- **Build fails with `ECONNREFUSED` to Postgres:** open decision A was not
  resolved -- provide `DATABASE_URL` as a Coolify build-time env var (section 3,
  path a). The redis `lazyConnect` fix (commit `7999254`) is the precedent for
  this build-time-connection class of problem.
- **GATE 2 fails with `total gzipped JS ~749 KB exceeds 100 KB threshold`:** open
  decision B was not resolved -- raise the threshold to a realistic budget
  (section 4, path a; e.g. `--max-gz-kb=1000`). Do NOT treat this as a leak; GATE
  1 is the real leak guard.
- **GATE 2 fails after a real regression:** if the total jumps well above the
  recorded baseline (e.g. baseline 750 KB, now 1.4 MB), a genuine leak or bloat
  occurred. Inspect the script's top-10 largest-chunks output and look for
  `editor`/`tiptap`/`admin`-named chunks loading on a `(site)` route.
- **Secret non-leakage check (V2) shows a runtime secret:** the Dockerfile or a
  Coolify build arg leaked a secret into a layer. Remove the offending ARG/ENV,
  rebuild, and re-verify before pushing. Rotate the leaked secret.
- **SSL does not provision:** confirm DNS for `anydiscussion.com` and
  `www.anydiscussion.com` resolves to the Coolify VPS and that ports 80/443 are
  reachable (Let's Encrypt HTTP-01 challenge). Re-trigger certificate
  provisioning from the Coolify service settings.
- **Auth fails closed (no sign-in possible):** Redis is unreachable from the
  runtime. Confirm the Redis managed service is running and `REDIS_URL` points at
  the internal hostname. Rate limiting intentionally fails closed when Redis is
  down (T-07-02-06).
- **Homepage is blank / 500 after deploy:** the build may have prerendered
  against a DB that had no data, or `DATABASE_URL` at runtime differs from the
  build-time value. Confirm the runtime `DATABASE_URL` points at the production
  Postgres with the migrated schema.
