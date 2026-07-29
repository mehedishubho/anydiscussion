// scripts/check-backup-secrets.mjs
// [CITED: 08-05-PLAN.md Task 2 <action> + <acceptance_criteria> — D-21 negative-grep extension]
// [CITED: 08-RESEARCH.md Pitfall 6 (backup secrets leak into standalone build layers) + T-08-SC]
// [CITED: scripts/check-bundle-size.mjs — header/exit convention (process.exitCode, not throw-exit)]
// [VERIFIED: node:fs built-ins only — no external deps]
//
// Backup-secret Dockerfile leak gate (D-21 boundary / T-08-SC). Reads the Dockerfile and FAILS
// (exit 1) if any backup/runtime-secret env var NAME appears in an ARG or ENV directive.
//
// All backup credentials are RUNTIME secrets injected by Coolify at `docker run` — NEVER baked
// into build layers via ARG/ENV. DATABASE_URL is the one documented build-time exception (the
// builder-stage ARG used for ISR prerender, NOT copied into the runner image) and is intentionally
// NOT in the watch list. This gate extends the Phase 7 D-21 negative-grep to cover the new
// backup vars (Google OAuth, BACKUP_LOCAL_ROOT) plus the reused secrets that protect backup
// credentials (SETTINGS_ENCRYPTION_KEY) and send the drill-failure alert (RESEND_API_KEY/EMAIL_FROM).
//
// Run inside the Dockerfile builder stage (after the Dockerfile is present) or locally:
//   node scripts/check-backup-secrets.mjs
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const DOCKERFILE = join(REPO_ROOT, "Dockerfile");

/**
 * Backup / runtime-secret env var names that MUST stay runtime-only (D-21 boundary).
 * None of these may appear in any Dockerfile ARG or ENV directive.
 *
 * - Google OAuth (D-02): GOOGLE_CLIENT_SECRET is the true secret; GOOGLE_CLIENT_ID /
 *   GOOGLE_REDIRECT_URI are grouped because they are runtime-only config, not build-time.
 * - BACKUP_LOCAL_ROOT: the local-destination root (path, not secret, but runtime-configured).
 * - SETTINGS_ENCRYPTION_KEY (Phase 4): encrypts the backup.r2_creds / backup.gdrive_creds blobs.
 * - RESEND_API_KEY / EMAIL_FROM (Phase 2): the drill-failure alert sender + default recipient.
 */
const BACKUP_SECRET_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "BACKUP_LOCAL_ROOT",
  "SETTINGS_ENCRYPTION_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
];

function main() {
  console.log("=== Any Discussion — backup-secret Dockerfile leak gate (D-21 / T-08-SC) ===");
  console.log(`Dockerfile: ${DOCKERFILE}`);
  console.log(`Watching ${BACKUP_SECRET_VARS.length} backup/runtime-secret var names.`);

  if (!existsSync(DOCKERFILE)) {
    console.error(`FAIL: Dockerfile not found at ${DOCKERFILE}`);
    process.exitCode = 1;
    return;
  }

  const contents = readFileSync(DOCKERFILE, "utf8");
  const lines = contents.split(/\r?\n/);

  /** @type {{ line: number; var: string; text: string }[]} */
  const leaks = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    // ARG and ENV are the only Dockerfile directives that define env vars in the image.
    // (Match the directive keyword at line start; ENV's alternate `ENV key value` form is covered
    //  too because we test the var name with a word boundary anywhere in the directive line.)
    if (!/^(ARG|ENV)\b/.test(trimmed)) return;
    for (const v of BACKUP_SECRET_VARS) {
      const re = new RegExp(`\\b${v}\\b`);
      if (re.test(trimmed)) {
        leaks.push({ line: idx + 1, var: v, text: trimmed });
      }
    }
  });

  if (leaks.length > 0) {
    console.error(
      `\nFAIL: ${leaks.length} backup secret var(s) found in ARG/ENV directives:`,
    );
    for (const l of leaks) {
      console.error(`  line ${l.line}: ${l.var} — ${l.text}`);
    }
    console.error(
      "\nAll backup credentials MUST be runtime-injected by Coolify (D-21 / T-08-SC),",
    );
    console.error("NEVER baked into build layers via ARG/ENV (RESEARCH Pitfall 6).");
    process.exitCode = 1;
    return;
  }

  console.log(
    "PASS: no backup secret var name appears in any Dockerfile ARG/ENV directive.",
  );
}

main();
