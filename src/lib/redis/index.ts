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
    lazyConnect: false,
  },
);

export const redisClient = globalThis.__redisClient;
