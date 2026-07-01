// src/lib/db/index.ts
// [VERIFIED: drizzle-orm/node-postgres + pg driver API — RESEARCH.md Pattern 2 lines 381-393]
// The single Drizzle ORM client singleton. All DB access in the app flows through
// this entry point (T-01-05 mitigation: Drizzle parameterizes every query).
//
// Server-only — NO "use client" directive. Reads DATABASE_URL from env (never
// hardcoded — ASVS V8). Real secrets live in gitignored .env.local; staging/prod
// via Coolify injection.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export { schema };
