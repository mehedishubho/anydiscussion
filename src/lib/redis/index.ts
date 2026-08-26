// src/lib/redis/index.ts
// [VERIFIED: ioredis 5.11.1 API + Next.js standalone singleton pattern —
//  RESEARCH.md Example 4 lines 676-720; Pitfall 1 lines 500-505]
// The single ioredis client singleton. All Redis access in the app (rate-limit
// counters for both Better Auth customStorage and the @upstash/ratelimit Contact
// adapter) flows through this entry point.
//
// DIVERGENCE from src/lib/db/index.ts (intentional): the DB singleton uses a
// plain `const pool = new Pool()`. Redis uses the globalThis hot-reload-safe
// variant — the standard Next.js dev-mode idiom (prevents connection spam
// across HMR). The DB singleton's plain-const form is a known minor debt; the
// Redis singleton does NOT repeat it (RESEARCH.md Example 4, PATTERNS.md note).
//
// Server-only — NO "use client" directive. Reads REDIS_URL from env (never
// hardcoded — ASVS V8). Real secrets live in gitignored .env.local; staging/prod
// via Coolify injection. Dev default points at the docker-compose Redis service
// (redis:7-alpine on localhost:6379).
//
// Threat model (T-07-02-06): on Redis connection failure, ioredis throws after
// `maxRetriesPerRequest: 3` retries. Better Auth's customStorage defaults to
// fail-closed (sign-in blocked) — safer for brute-force protection. Documented
// in scripts/test-auth-ratelimit.mjs.
import Redis from "ioredis";
import { log } from "@/lib/log";

// Next.js dev-mode HMR hot-reload-safe singleton. Without globalThis, every HMR
// cycle would spawn a new Redis connection and leak sockets.
declare global {
  var __redisClient: Redis | undefined;
}

globalThis.__redisClient ??= new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  {
    maxRetriesPerRequest: 3, // fail-closed after 3 retries (T-07-02-06)
    enableReadyCheck: true,
    // lazyConnect: do NOT open the TCP connection at module load. The auth/rate-limit
    // module graph is imported during `pnpm build`; with lazyConnect:false ioredis
    // tried to reach Redis at build time and emitted unhandled error events that
    // crashed the build worker. The first command (first rate-limit check, at request
    // time) opens the connection — fail-closed still holds via maxRetriesPerRequest.
    lazyConnect: true,
  },
);
// Attach an error listener so a Redis outage is LOGGED instead of surfacing as
// an unhandled "error" event (which crashes the Node process). Rate-limiting
// still fails closed on the command path; this listener's crash-prevention job
// is unchanged — only the logging changed (Plan 07-07 / WR-01).
globalThis.__redisClient.on("error", (err) => {
  // UNCONDITIONAL structured logging: a production Redis outage must be visible
  // in the container logs. The previous dev-only console warning (gated on the
  // environment mode) was a no-op in production — the only environment where
  // the outage path matters (fail-closed sign-in blocking) — making the deploy
  // runbook's V5 diagnostic structurally impossible to observe (07-REVIEW
  // WR-01).
  log.error("redis connection error", {
    message: err?.message ?? String(err),
  });
});

export const redisClient = globalThis.__redisClient;
