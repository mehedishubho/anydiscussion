// drizzle.config.ts (repo root)
// [VERIFIED: drizzle-kit 0.31.10 defineConfig API + CLI test]
// Schema source of truth: src/db/schema.ts. Migration output: src/db/migrations/.
// Forward-only (D-11) — no down/rollback migrations anywhere.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
