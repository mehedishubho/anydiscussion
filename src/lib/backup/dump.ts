// src/lib/backup/dump.ts
// [CITED: 08-CONTEXT.md D-04 (in-app pg_dump), D-05 (manual restore via pg_restore)]
// [CITED: 08-RESEARCH.md Pattern 2 (lines 249-279) + Anti-Pattern + Pitfall 7 — execFile, NOT exec]
// [CITED: 08-PATTERNS.md row dump.ts — NO in-repo analog; follow RESEARCH Pattern 2 verbatim]
// [CITED: T-08-01 — Information Disclosure: execFile argv array so the connection-string
//  password is never shell-interpolated or exposed in a process-list shell string]
// [CITED: 08-01-PLAN.md Task 1 <behavior> + <acceptance_criteria>]
//
// pg_dump / pg_restore wrappers. The DB password lives inside DATABASE_URL, so we use
// `child_process.execFile` (which takes an argv ARRAY and never spawns a shell) — NEVER
// `exec` (which would interpolate the connection string into a shell command and expose
// the password to the process list + shell history). Verified by dump.test.ts asserting
// the call argv is an Array.
//
// Custom format (`-Fc`) is used for dumps: compression + selective restore (`-t`/`--use-list`)
// + parallel restore (`-j N`). Restore uses `pg_restore -j 2 -d <target>`.
//
// TEMP FILES: dumps can be large, so pg_dump writes to a temp file in os.tmpdir() (not
// captured into Node memory via stdout) and the buffer is read back; both helpers unlink
// the temp in a finally/catch so nothing leaks. maxBuffer is set to 1 GiB defensively.
//
// DEFERRED (08-VALIDATION.md): live verification of a real pg_dump -Fc against the managed
// Postgres waits for Phase 7 deploy. The unit tests mock execFile and assert argv SHAPE only.
//
// Server-only — NO "use client" directive.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { readFile, unlink, writeFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

/** Large maxBuffer so a big dump's stdout/stderr never truncates the spawn. */
const MAX_BUFFER = 1024 * 1024 * 1024; // 1 GiB

/**
 * Format a UTC timestamp as YYYYMMDD-HHmm (the backup-key convention from CONTEXT D-discretion).
 * Exported so job.ts generates the same key shape and retention can parse it back out.
 */
export function formatBackupTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`
  );
}

/**
 * pgDump (D-04) — dump the DATABASE_URL database to a custom-format (.sqlc) Buffer.
 *
 * Runs `pg_dump -Fc -d <DATABASE_URL> -f <tmp>` via execFile (no shell). `env: { ...process.env }`
 * is passed so PGPASSWORD / connection env inherit without landing in a shell history. The
 * dump is written to a temp file (not stdout) to avoid holding the whole dump in spawn
 * output memory; the file is then read into a Buffer and unlinked.
 *
 * @returns The pg_dump custom-format bytes.
 * @throws Error when DATABASE_URL is unset, or pg_dump exits non-zero / is not installed.
 */
export async function pgDump(): Promise<Buffer> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set — cannot run pg_dump");
  }
  const tmp = path.join(os.tmpdir(), `anydiscussion-${formatBackupTimestamp()}.sqlc`);
  try {
    await execFileAsync("pg_dump", ["-Fc", "-d", dbUrl, "-f", tmp], {
      env: { ...process.env },
      maxBuffer: MAX_BUFFER,
    });
    return await readFile(tmp);
  } finally {
    await unlink(tmp).catch(() => {
      /* temp cleanup is best-effort — never mask the real error */
    });
  }
}

/**
 * pgRestore (D-05) — restore a custom-format dump buffer into a target database URL.
 *
 * Writes the dump to a temp file, then runs `pg_restore -j 2 -d <targetDbUrl> <tmp>` via
 * execFile (no shell). `-j 2` enables 2 parallel restore jobs (custom format only). The
 * temp is unlinked in a finally block.
 *
 * The caller chooses the target (the MAIN db for manual restore, the `backup_verify`
 * scratch db for the restore-drill) — this function is the primitive.
 *
 * @param dump        The pg_dump custom-format bytes (from pgDump or dest.download).
 * @param targetDbUrl The destination connection string.
 */
export async function pgRestore(
  dump: Buffer,
  targetDbUrl: string,
): Promise<void> {
  const tmp = path.join(
    os.tmpdir(),
    `anydiscussion-restore-${formatBackupTimestamp()}.sqlc`,
  );
  try {
    await writeFile(tmp, dump);
    await execFileAsync("pg_restore", ["-j", "2", "-d", targetDbUrl, tmp], {
      env: { ...process.env },
      maxBuffer: MAX_BUFFER,
    });
  } finally {
    await unlink(tmp).catch(() => {
      /* best-effort temp cleanup */
    });
  }
}
