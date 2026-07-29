# ADR 0001: Single-Instance ISR Scaling Cliff

## Status

Accepted (v1). Revisit BEFORE adding a second Coolify replica.

## Context

This blog CMS serves its public routes (`(site)`) as ISR/PPR pages. The
performance model in `CLAUDE.md` and `.planning/PROJECT.md` is non-negotiable:
public pages are statically generated or ISR by default, `revalidatePath` and
`revalidateTag` flush stale entries on publish, and there is no client-side data
fetching for server-renderable content. `next.config.ts` enables
`cacheComponents: true` (PPR) and `output: "standalone"`.

Next.js ISR relies on an **in-memory cache** that lives inside the running Node
process. On a single Coolify instance this works correctly:

1. A page is prerendered (at build time when `pnpm build` runs under
   `cacheComponents`, or on the first request after a revalidation).
   - Build-time prerender is enabled by the build-time `DATABASE_URL` ARG in the
     `Dockerfile` builder stage (Plan 07-04, base `fc3286d`). `pnpm build` reads
     Postgres to populate the ISR cache for DB-dependent pages (homepage,
     `/blog`, `/_not-found`, `/contact`, `/terms`, `/privacy`). This ARG is a
     build-stage-only secret (D-21 adjustment) -- it is NOT copied into the
     runner image; the runtime gets `DATABASE_URL` from Coolify env at
     `docker run`.
2. When an editor publishes/updates a post, the mutating Server Action calls
   `revalidatePath` / `revalidateTag` (2-arg `"max"` form, Next.js 16). That
   call flushes the in-memory cache entry for the affected paths/tags
   (`/blog/{slug}`, `/`, `/blog`, category/tag archives, `/sitemap.xml`,
   `/rss.xml`, plus the `cacheTag`-wired routes from Phase 3/5/6).
3. The next request regenerates the page from Postgres and repopulates the
   cache. The publish -> visible latency is sub-30s on a single Coolify instance
   plus Cloudflare CDN (verified end-to-end by `scripts/test-publish-visible.mjs`,
   Plan 07-03).

The cacheTag-wired public routes (post pages, sitemap, RSS, taxonomy archives)
and the publish -> visible loop (Plan 07-03) are the user-visible surface that
depends on this cache staying coherent.

**The scaling cliff:** when a SECOND Coolify replica is added (for horizontal
scaling or zero-downtime deploys), each replica runs its OWN Node process with
its OWN in-memory cache. A publish that hits replica A flushes A's cache, but
replica B continues serving the stale page from ITS cache until either B's own
TTL expires or a revalidation request happens to land on B. Readers behind the
load balancer can be routed to the stale replica and see outdated content for
minutes. This is the "ISR scaling cliff" -- it is a correctness problem (stale
content), not just a performance one.

## Decision

For v1, run a **single Coolify instance** (D-32 -- no staging, single-environment
production deploy via `git push main`). This sidesteps the cliff entirely: there
is only one in-memory cache, so `revalidatePath` / `revalidateTag` always
flushes the one cache readers actually hit.

Trade-off accepted: a single-instance outage takes the site down. This is
acceptable for a small team (2-5 people) per D-32. Coolify's restart policy
(`unless-stopped`) recovers automatically from container crashes, and deploys
use Coolify's default strategy (a brief rollout that momentarily interrupts
service -- acceptable for a blog, not a real-time system).

## Consequences

**Positive**

- ISR works correctly out of the box with zero additional infrastructure.
- No shared-cache service to operate, monitor, or debug.
- publish -> visible latency is deterministic and sub-30s on the single instance.

**Negative**

- No horizontal scaling in v1. A traffic spike that exceeds one replica's
  capacity cannot be absorbed by adding replicas without first solving the
  shared-cache problem below.
- A deploy briefly takes the site down (Coolify default deploy strategy). This
  is the cost of the no-staging, single-environment model (D-32).

**v2 path (before adding a second Coolify replica)**

Before scaling horizontally, implement a shared Redis-backed `cacheHandler`
exposing the Next.js interface: `get`, `set`, `revalidateTag`,
`resetRequestCache`. NOTE: the stable config key is `cacheHandler` (singular,
stable since Next.js 14.1; image-cache support added in Next.js 16.2.0). Do NOT
use the deprecated `incrementalCacheHandlerPath` name -- it was renamed in
Next.js 14.1 and is no longer the documented key.

With a shared `cacheHandler`, all replicas read/write the same Redis-backed
cache, so a `revalidateTag` call from any replica flushes the entry every
replica sees. This closes the stale-cache cliff and makes publish -> visible
coherent across N replicas.

The connection primitive already exists: `src/lib/redis/index.ts` (Plan 07-02)
is the ioredis singleton (`redisClient`) that backs the auth rate-limit
counters. A v2 `cacheHandler` would reuse that singleton as its Redis client --
no new connection plumbing, just a new consumer of the existing client.

This is tracked as v2 requirement **SCALE-01** in `.planning/ROADMAP.md`.

## References

- Next.js `cacheHandler` interface documentation (singular form; stable since
  Next.js 14.1; image-cache support added Next.js 16.2.0).
- `.planning/ROADMAP.md` v2 -- SCALE-01 (multi-replica ISR scaling).
- Plan 07-02 -- `src/lib/redis/index.ts` ioredis singleton (the `cacheHandler`
  connection primitive).
- Plan 07-03 -- publish -> visible loop (`scripts/test-publish-visible.mjs`)
  that a shared `cacheHandler` would coordinate across replicas.
- Plan 07-04 -- multi-stage `Dockerfile` with the build-time `DATABASE_URL` ARG
  (base `fc3286d`) that enables ISR prerender at build.
- `.planning/phases/07-performance-deploy/07-CONTEXT.md` D-28 / D-29 / D-30
  (ISR scaling documentation decisions) and D-32 (single production environment).
