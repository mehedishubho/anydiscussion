// src/lib/backup/drill.ts
// [CITED: 08-CONTEXT.md D-07 (automated drill + email alert), D-08 (scratch DB on existing Postgres)]
// [CITED: 08-RESEARCH.md Pattern 4 (lines 336-368) — withMaintenanceClient + CREATE/restore/verify/DROP]
// [CITED: 08-RESEARCH.md Pitfall 2 (CREATE DATABASE cannot run in a transaction — SQLSTATE 25001)]
// [CITED: 08-RESEARCH.md Pitfall 5 (terminate-before-DROP — active connections block DROP)]
// [CITED: 08-PATTERNS.md row drill.ts — NO direct in-repo analog; codebase uses Drizzle exclusively]
// [CITED: 08-05-PLAN.md Task 1 <behavior> + <acceptance_criteria> + threat_model T-08-05]
//
// The automated restore-drill (BACKUP-04). Closes the "backup-never-restored" gamble by proving
// the latest dump actually restores: CREATE a scratch DB `backup_verify` on the EXISTING Postgres
// → pg_restore the latest dump into it → smoke-query row counts on the key tables → ALWAYS tear
// it down (pg_terminate_backend + DROP DATABASE) in a `finally` so backup_verify NEVER lingers.
//
// WHY A RAW pg.Client, NOT Drizzle: CREATE DATABASE / DROP DATABASE cannot run inside a
// transaction block (SQLSTATE 25001 — RESEARCH Pitfall 2). Drizzle's `db.transaction()` would
// wrap the call in BEGIN/COMMIT and trigger that error. node-postgres `Client` is AUTOCOMMIT BY
// DEFAULT — it never emits BEGIN unless you explicitly ask it to. So the maintenance connection
// (CREATE/DROP) uses `new Client({ connectionString: maintUrl })` directly. The `pg` package is
// already installed (it's Drizzle's driver — src/lib/db/index.ts:10 imports `Pool` from "pg").
//
// WHY CONNECT TO THE `postgres` MAINTENANCE DB: you cannot CREATE/DROP a database while
// connected TO it — Postgres requires the connection target a different DB. The standard
// maintenance DB is `postgres`, so we swap the dbname in DATABASE_URL to `postgres` for the
// CREATE/DROP client, then swap it to `backup_verify` for the restore + integrity check.
//
// The caller (the cron tick in 08-05 Task 2) wraps runRestoreDrill in try/catch and fires
// sendEmail on failure — the drill itself THROWS on integrity failure so the caller alerts.
//
// DEFERRED (08-VALIDATION.md): live verification against managed Postgres waits for Phase 7
// deploy + the CREATEDB grant (user_setup). The unit tests mock pg.Client + pgRestore + the
// registry and assert the SEQUENCE + autocommit invariant + no-linger contract — no real DB.
//
// Server-only — NO "use client" directive.
import { Client } from "pg";
import { pgRestore } from "./dump";
import { getEnabledDestinations } from "./registry";
import { log } from "@/lib/log";

/** The scratch database name (D-08). Created + always dropped per drill — never lingers. */
const SCRATCH_DB = "backup_verify";

/**
 * Backup key pattern for selecting restorable dumps (matches job.ts/restore.ts BACKUP_KEY_RE).
 * Replicated per-module so drill.ts stays decoupled from restore.ts (which restores to the LIVE
 * db — wrong target for a drill).
 */
const BACKUP_KEY_RE = /^anydiscussion-\d{8}-\d{4}\.sqlc$/;

/** The key tables an integrity-check smoke query counts (a content + auth + config + media slice). */
const INTEGRITY_TABLES = ["posts", "users", "settings", "media"] as const;

/**
 * Swap the dbname in a postgres connection URL. Preserves userinfo, host, port, and any query
 * string (e.g. ?sslmode=require) byte-for-byte — only the dbname path segment is replaced.
 *
 * Used to derive (a) the `postgres` maintenance URL (for CREATE/DROP) and (b) the `backup_verify`
 * URL (for pg_restore + the integrity check) from the single configured DATABASE_URL.
 */
function swapDbName(dbUrl: string, newDbName: string): string {
  // Match: "/" + the dbname (chars that are not "/" or "?") + an optional "?query" through end.
  // Replacement keeps the leading slash, drops in the new dbname, re-appends the query string.
  return dbUrl.replace(/(\/)[^/?]*(\?.*)?$/, `$1${newDbName}$2`);
}

/**
 * withMaintenanceClient (D-08 + RESEARCH Pitfall 2) — open a raw autocommit pg.Client to the
 * `postgres` maintenance DB, run `fn(client)`, always `client.end()` in a finally.
 *
 * The Client is AUTOCOMMIT BY DEFAULT (node-postgres never emits BEGIN on its own) — this is
 * the SQLSTATE 25001 guard: CREATE/DROP DATABASE cannot run in a transaction block, so we
 * deliberately do NOT add BEGIN/COMMIT anywhere. The drill test asserts no BEGIN precedes CREATE.
 *
 * Exported so the drill test can assert the connect/end lifecycle + autocommit invariant.
 *
 * @param fn Receives the connected Client. Its return value is passed through.
 */
export async function withMaintenanceClient<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set — cannot open maintenance client");
  }
  const maintUrl = swapDbName(dbUrl, "postgres");
  const client = new Client({ connectionString: maintUrl }); // autocommit — NO BEGIN/COMMIT
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * verifyIntegrity (D-07) — smoke-query row counts on the key tables (posts/users/settings/media)
 * against the restored scratch DB. A successful restore yields a row per count; a partial or
 * broken restore yields no row, which we treat as a drill failure (THROWS).
 *
 * Connects to the `backup_verify` URL (NOT the maintenance DB — we need to query the restored
 * tables). The Client is closed in a finally so no connection to backup_verify lingers (which
 * would in turn block the DROP in the caller's finally — RESEARCH Pitfall 5).
 *
 * @param backupVerifyUrl The connection string with dbname `backup_verify`.
 * @throws Error when any SELECT count(*) returns no row (partial restore).
 */
export async function verifyIntegrity(backupVerifyUrl: string): Promise<void> {
  const client = new Client({ connectionString: backupVerifyUrl });
  await client.connect();
  try {
    for (const table of INTEGRITY_TABLES) {
      const res = await client.query(`SELECT count(*) AS c FROM ${table}`);
      const count = res.rows?.[0]?.c;
      if (count === undefined || count === null) {
        throw new Error(
          `integrity check failed: SELECT count(*) FROM ${table} returned no row (partial restore)`,
        );
      }
    }
  } finally {
    await client.end();
  }
}

/**
 * Download the newest backup dump across enabled destinations. Mirrors restore.ts restoreLatest's
 * newest-key selection but STOPS before pgRestore (the drill restores into backup_verify, not the
 * live DB). Returns the dump Buffer or throws when no destination has a backup.
 */
async function downloadLatestDump(): Promise<Buffer> {
  const dests = await getEnabledDestinations();
  let latest: string | null = null;
  for (const dest of dests) {
    const keys = await dest.list().catch(() => [] as string[]);
    const backupKeys = keys.filter((k) => BACKUP_KEY_RE.test(k));
    if (backupKeys.length > 0) {
      // Lexical max === newest (the YYYYMMDD-HHmm prefix sorts chronologically).
      const newest = backupKeys.sort()[backupKeys.length - 1];
      if (latest === null || newest > latest) latest = newest;
    }
  }
  if (latest === null) {
    throw new Error("No backup found to drill-restore");
  }
  for (const dest of dests) {
    try {
      return await dest.download(latest);
    } catch (e) {
      // This destination doesn't have the key — try the next one.
      log.error("drill: download failed, trying next destination", {
        dest: dest.name,
        key: latest,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  throw new Error(`Backup key not found in any enabled destination: ${latest}`);
}

/**
 * runRestoreDrill (D-07 + D-08, BACKUP-04) — prove the latest dump restores.
 *
 * Sequence:
 *   1. downloadLatestDump() — the newest dump across enabled destinations.
 *   2. withMaintenanceClient → CREATE DATABASE backup_verify (autocommit; no transaction).
 *   3. pgRestore(dump, <url with dbname backup_verify>) — restore into the scratch DB.
 *   4. verifyIntegrity(<backup_verify url>) — row counts on posts/users/settings/media.
 *   5. FINALLY (always, even on failure): withMaintenanceClient →
 *        pg_terminate_backend(pid) WHERE datname='backup_verify'  (RESEARCH Pitfall 5 —
 *        active connections block DROP, so terminate first)
 *        → DROP DATABASE IF EXISTS backup_verify.
 *
 * The finally guarantees `backup_verify` NEVER lingers — even when the restore or the integrity
 * check throws (T-08-05 no-linger mitigation). The drill itself THROWS on integrity failure so
 * the caller (the cron tick in 08-05 Task 2) can fire the email alert.
 *
 * @throws On any step failure (download, CREATE, pgRestore, integrity check). The finally
 *         always runs DROP before the error propagates.
 */
export async function runRestoreDrill(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set — cannot run restore-drill");
  }
  const dump = await downloadLatestDump();

  // Step 2: CREATE the scratch DB on the maintenance connection (autocommit — RESEARCH Pitfall 2).
  await withMaintenanceClient((c) => c.query(`CREATE DATABASE ${SCRATCH_DB}`));

  try {
    // Step 3 + 4: restore into backup_verify + integrity-check the restored tables.
    const backupVerifyUrl = swapDbName(dbUrl, SCRATCH_DB);
    await pgRestore(dump, backupVerifyUrl);
    await verifyIntegrity(backupVerifyUrl);
  } finally {
    // Step 5: ALWAYS tear down — terminate connections then DROP (RESEARCH Pitfall 5).
    // Runs on both success and failure paths so backup_verify never lingers.
    await withMaintenanceClient(async (c) => {
      await c.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
        [SCRATCH_DB],
      );
      await c.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB}`);
    });
  }
}
