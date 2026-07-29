# Any Discussion

A custom-built, self-hosted blog CMS for **anydiscussion.com** -- not WordPress.
One Next.js 16 app serves both a public-facing blog (extremely fast: ISR/PPR,
minimal client JS) and an auth-gated, role-based admin dashboard (more
JS-heavy, not optimizing for public Core Web Vitals), backed by one PostgreSQL
database. English UI with Bangla content allowed (UTF-8, not a translated UI).

Editors and authors publish well-optimized blog posts and readers consume them
at maximum speed -- the public blog is fast and SEO-sound, and the dashboard
lets a small team manage the full content lifecycle (draft -> review -> publish)
without touching code.

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Server Components, Server Actions, Turbopack) |
| Language | TypeScript (strict) |
| Database | PostgreSQL (self-hosted via Coolify) |
| ORM | Drizzle ORM + drizzle-kit |
| Auth | Better Auth + admin/RBAC plugin |
| Editor | Tiptap v3 (ProseMirror) |
| Forms | React Hook Form + Zod v4 (schemas shared client + server) |
| Client data | TanStack Query (dashboard only) |
| Media | Cloudflare R2 (S3-compatible) + sharp + next/image custom loader |
| Cache | Redis 7.x (self-hosted, rate-limit counters) |
| Analytics | Umami (self-hosted, separate subdomain) |
| Deployment | Coolify on a VPS (git-push deploys, managed SSL) |

Package manager is **pnpm only** -- never npm or yarn.

## Local Development

```bash
pnpm install
pnpm setup   # configures env, DB connection, runs migrations
pnpm dev     # starts the Next.js dev server (Turbopack)
```

A local Postgres is required (the `docker-compose.yml` dev service exposes it on
port 5435). See `.env.example` for the full environment variable list.

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Start the Next.js dev server |
| `pnpm build` | Production build (standalone output) |
| `pnpm start` | Start the production server |
| `pnpm lint` | ESLint (includes the `(site)`/`(admin)` no-restricted-imports gate) |
| `pnpm db:generate` | Generate a Drizzle migration from schema changes |
| `pnpm test` | Run the Vitest unit suite |
| `pnpm test:migrations` | Clean-room migration test |
| `pnpm test:auth-gate` | Verify the auth/RBAC route gate |
| `pnpm test:auth-ratelimit` | Verify the auth rate-limit enforcement (429 at threshold) |
| `pnpm test:publish-visible` | End-to-end publish -> visible revalidation test |
| `pnpm check-bundle` | Gzipped bundle-size budget gate |
| `pnpm lighthouse` | Run Lighthouse CI against the configured URLs (`lighthouserc.json`) |
| `pnpm setup` | First-time project setup |
| `pnpm verify` | Run the local verification script |

## Performance

The public site targets a Lighthouse 90+ performance score and Google "Good"
Core Web Vitals thresholds (LCP <= 2.5s, INP <= 200ms, CLS <= 0.1). The
thresholds and audited URLs are configured in
[`lighthouserc.json`](./lighthouserc.json) (PERF-01).

Run the audit from a dev machine against the production URL:

```bash
pnpm lighthouse
```

Note: the audit uses `interaction-to-next-paint` (INP), NOT the retired
`max-potential-fid` (FID) metric. INP replaced FID in March 2024.

## Deployment

Deploys are git-push to `main` -> Coolify builds the multi-stage `Dockerfile`
and serves production with managed SSL. There is no staging environment (D-32).
See [`docs/operations/coolify-deploy.md`](./docs/operations/coolify-deploy.md)
for the full runbook.

## ISR Scaling

The public site is ISR/PPR-first and runs on a **single Coolify instance**.
This works because the Next.js in-memory cache lives in one Node process, so
`revalidatePath` / `revalidateTag` always flushes the one cache readers hit.

Before adding a SECOND Coolify replica, a shared Redis-backed `cacheHandler`
must be implemented -- otherwise each replica serves from its own stale cache
(the "ISR scaling cliff"). See
[`docs/adr/0001-isr-single-instance-scaling.md`](./docs/adr/0001-isr-single-instance-scaling.md)
for the full analysis and the v2 path.

## Project Planning

Roadmap, requirements, and per-phase planning artifacts live under
[`.planning/`](./.planning/). See
[`.planning/ROADMAP.md`](./.planning/ROADMAP.md) for the milestone breakdown.
