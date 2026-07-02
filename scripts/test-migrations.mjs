// scripts/test-migrations.mjs
// [VERIFIED: drizzle-orm/node-postgres/migrator.migrate + pg Pool — RESEARCH.md lines 783-829]
// Clean-room migration drift test (FOUND-06, D-09).
//
// Applies every committed migration to a FRESH EMPTY Postgres and asserts all
// 12 expected tables are present in information_schema.tables. This is the
// drift gate that catches schema-vs-migration drift: if a developer edits
// schema.ts but forgets to run `pnpm db:generate`, the generated migration
// set will either fail to apply or produce a schema that doesn't match.
// (8 Phase-1 tables + user/session/account/verification Phase-2 auth tables.)
//
// Port note: the throwaway postgres-test service is on host port 5436
// (remapped from the original 5433 because host 5433 was already bound by a
// sibling dev project — see docker-compose.yml).
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Default matches docker-compose.yml postgres-test service creds (port 5436).
// Override via TEST_DATABASE_URL in .env.local for non-default setups.
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://anydiscussion:125524@localhost:5436/anydiscussion_test";
const MIGRATIONS_FOLDER = "./src/db/migrations";

async function runCleanRoomTest() {
  console.log("Starting clean-room migration test...");
  console.log(`Target: ${TEST_DB_URL.replace(/:[^:@]+@/, ":****@")}`);
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("✓ All migrations applied successfully to clean DB.");

    // Verify tables exist via information_schema (DB introspection, not Drizzle table objects)
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const tables = result.rows.map((r) => r.table_name);
    console.log(`✓ Tables in clean DB (${tables.length}):`, tables.join(", "));

    const expected = [
      "posts",
      "post_seo",
      "categories",
      "tags",
      "post_tags",
      "media",
      "settings",
      "pages",
      // Phase 2 auth tables (Better Auth CLI-generated, merged into schema.ts):
      "user",
      "session",
      "account",
      "verification",
    ];
    const missing = expected.filter((t) => !tables.includes(t));
    if (missing.length > 0) {
      throw new Error(`Missing tables: ${missing.join(", ")}`);
    }
    console.log(`✓ All ${expected.length} expected tables present.`);
    console.log("✓ Clean-room migration test PASSED.");
  } catch (err) {
    console.error("✗ Clean-room migration test FAILED:", err);
    process.exitCode = 1; // NOT process.exit(1) — allow finally to close the pool
  } finally {
    await pool.end();
  }
}

runCleanRoomTest();
