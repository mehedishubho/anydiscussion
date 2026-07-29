// src/actions/backup-settings.ts
// [CITED: 08-CONTEXT.md D-01 (multi-select), D-03 (encrypted creds + redact-on-read), D-05 (Restore gate), D-09 (defaults)]
// [CITED: 08-RESEARCH.md Pattern 6 (settings key scheme) + Pitfall 7 (never pre-fill secrets)]
// [CITED: 08-PATTERNS.md row backup-settings.ts — mirror src/actions/storage-settings.ts security ordering]
// [CITED: src/actions/storage-settings.ts:110-186 — requireRole FIRST → parse → encrypt → upsert → redact-on-read]
// [CITED: src/lib/permissions/index.ts L40-47 — requireRole('admin') signature (throws FORBIDDEN)]
// [CITED: src/lib/backup/config.ts — readBackupConfig/readSetting/upsertSetting + BACKUP_*_KEY constants]
// [CITED: src/lib/backup/destinations/google-drive.ts — buildConsentUrl(state) + revokeDriveToken(refreshToken) (08-03)]
// [CITED: src/lib/backup/job.ts — runBackupJob (called by triggerBackupNow)]
// [CITED: src/lib/backup/restore.ts — restoreKey/restoreLatest (called by restoreBackup)]
// [CITED: src/lib/backup/registry.ts — getEnabledDestinations (used by listBackups + testBackupConnection)]
//
// Backup Settings Server Actions (BACKUP-05, D-01, D-03, D-05). EIGHT actions, ALL admin-gated via
// requireRole('admin') FIRST (Pitfall #1 — UI hiding via the sidebar is supplementary only; every
// action re-checks the admin role server-side before any parse/encrypt/DB/cookie call). Proven
// structurally by the MUST_NOT_BE_REACHED test pattern for all 8 actions.
//
//   saveBackupSettings(input)     — admin → parse → upsert backup.config → if r2 secret, encrypt + upsert backup.r2_creds
//   getBackupSettings()           — admin → readBackupConfig + read r2/gdrive blobs → decrypt → redactCredentials → return
//   testBackupConnection(dest)    — admin → resolve dest via getEnabledDestinations → dest.testConnection() → {ok,error?} (never throws)
//   triggerBackupNow()            — admin → runBackupJob() try/catch → {ok,error?}
//   restoreBackup(key?)           — admin → restoreKey(key) / restoreLatest() → {ok,error?} (UI confirmation gate is enforced BEFORE this; D-05)
//   listBackups()                 — admin → getEnabledDestinations → dest.list() each → merge + sort newest-first → {backups:[{destination,key}]} (never throws)
//   getGoogleConsentUrl()         — admin → random CSRF state → signed httpOnly gdrive_oauth_state cookie → return buildConsentUrl(state) (T-08-04d)
//   disconnectGoogleDrive()       — admin → decrypt backup.gdrive_creds → revokeDriveToken (best-effort) BEFORE deleteSetting → {ok:true} (T-08-04e)
//
// Security ordering (Pitfall #1 — non-negotiable): every action calls requireRole('admin') as its
// FIRST line, before any parse/encrypt/DB/cookie operation.
//
// Server-only — top directive mandatory for Server Actions.
"use server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { requireRole } from "@/lib/permissions";
import { encrypt, decrypt, redactCredentials } from "@/lib/crypto";
import { log } from "@/lib/log";
import {
  readBackupConfig,
  readSetting,
  upsertSetting,
  deleteSetting,
  BACKUP_CONFIG_KEY,
  BACKUP_R2_CREDS_KEY,
  BACKUP_GDRIVE_CREDS_KEY,
} from "@/lib/backup/config";
import { getEnabledDestinations } from "@/lib/backup/registry";
import { buildConsentUrl, revokeDriveToken } from "@/lib/backup/destinations/google-drive";
import { runBackupJob } from "@/lib/backup/job";
import { restoreKey, restoreLatest } from "@/lib/backup/restore";
import { backupSettingsSchema, hasSecrets, type BackupSettingsInput } from "./backup-settings-schema";

/** The CSRF cookie name (consumed + cleared by the 08-03 OAuth callback Route Handler). */
const GDRIVE_OAUTH_STATE_COOKIE = "gdrive_oauth_state";
/** Short TTL (seconds) for the one-shot CSRF state cookie. */
const GDRIVE_OAUTH_STATE_MAX_AGE = 600;

/**
 * saveBackupSettings (D-01, D-03, BACKUP-05) — admin-only. Validates input, persists the config
 * JSON to backup.config, and (only when the r2 creds carry a non-empty secret) encrypts + persists
 * the r2 blob to backup.r2_creds. Per Pitfall 7, an empty secretAccessKey means "no change" — the
 * prior encrypted blob is preserved untouched.
 *
 * @throws Error("FORBIDDEN") when the caller is not admin (requireRole FIRST).
 */
export async function saveBackupSettings(
  input: BackupSettingsInput | unknown,
): Promise<{ ok: true }> {
  // 1. Admin re-check FIRST (BACKUP-05 — explicit admin, before any parse/encrypt/DB).
  await requireRole("admin");

  // 2. Validate via the shared Zod schema (Pitfall #1 — never trust the client shape).
  const data = backupSettingsSchema.parse(input);

  // 3. Persist the config blob (destinations multi-select + schedule + retention + drill + email).
  await upsertSetting(
    BACKUP_CONFIG_KEY,
    JSON.stringify({
      enabled: true,
      destinations: data.destinations,
      scheduleCron: data.scheduleCron,
      retentionDays: data.retentionDays,
      drillEnabled: data.drillEnabled,
      drillCron: data.drillCron,
      alertEmail: data.alertEmail,
    }),
  );

  // 4. r2 creds: encrypt + persist ONLY when the secret is non-empty (Pitfall 7 — empty = no change).
  if (hasSecrets(data.r2)) {
    const blob = encrypt(JSON.stringify(data.r2));
    await upsertSetting(BACKUP_R2_CREDS_KEY, blob);
  }

  log.info("backup settings saved", { destinations: data.destinations });
  return { ok: true };
}

/**
 * getBackupSettings (D-03, Pitfall 7) — admin-only. Reads backup.config (D-09 defaults applied via
 * readBackupConfig) + the r2/gdrive blobs, decrypts the non-empty ones, and runs redactCredentials
 * so secret fields come back EMPTY (never pre-filled in the form — Pitfall 7). gdrive is surfaced
 * as a `gdriveConnected` boolean (the form shows Connect/Disconnect — never the token itself).
 *
 * @throws Error("FORBIDDEN") when the caller is not admin.
 */
export async function getBackupSettings(): Promise<{
  destinations: { local: boolean; r2: boolean; gdrive: boolean };
  scheduleCron: string;
  retentionDays: number;
  drillEnabled: boolean;
  drillCron: string;
  alertEmail: string;
  r2?: Record<string, unknown>;
  gdriveConnected: boolean;
}> {
  await requireRole("admin");

  const cfg = await readBackupConfig();

  // r2 blob: decrypt + redact-on-read (secretAccessKey → ""). An empty blob means unconfigured.
  const r2Blob = await readSetting(BACKUP_R2_CREDS_KEY);
  // gdrive blob: presence indicates the admin completed OAuth. The token is never sent to the client.
  const gdriveBlob = await readSetting(BACKUP_GDRIVE_CREDS_KEY);

  return {
    destinations: cfg.destinations,
    scheduleCron: cfg.scheduleCron,
    retentionDays: cfg.retentionDays,
    drillEnabled: cfg.drillEnabled,
    drillCron: cfg.drillCron,
    alertEmail: cfg.alertEmail,
    ...(r2Blob
      ? { r2: redactCredentials(JSON.parse(decrypt(r2Blob))) }
      : {}),
    gdriveConnected: Boolean(gdriveBlob),
  };
}

/**
 * testBackupConnection (D-24 analog) — admin-only. Resolves the destination via the lazy registry
 * and delegates to its testConnection() probe. Returns { ok, error? } — never throws (the dashboard
 * surfaces inline ok/error feedback). gdrive/r2 probes use their stored creds; local probes the
 * backup root.
 *
 * @throws Error("FORBIDDEN") when the caller is not admin.
 */
export async function testBackupConnection(
  destination: string,
  _creds?: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole("admin");

  try {
    const dests = await getEnabledDestinations();
    const dest = dests.find((d) => d.name === destination);
    if (!dest) {
      return { ok: false, error: `Destination not enabled: ${destination}` };
    }
    return await dest.testConnection();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * triggerBackupNow (D-04) — admin-only. Runs the backup job immediately (dump → upload to every
 * enabled destination → retention). runBackupJob itself never throws (it records ok:false on
 * failure); the outer try/catch is belt-and-suspenders so the dashboard always gets a result.
 *
 * @throws Error("FORBIDDEN") when the caller is not admin.
 */
export async function triggerBackupNow(): Promise<{ ok: boolean; error?: string }> {
  await requireRole("admin");

  try {
    const result = await runBackupJob();
    if (!result.ok) {
      return { ok: false, error: "Backup job failed — see server logs (backup.last_run)" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * restoreBackup (D-05) — admin-only. Calls restoreKey(key) when a key is supplied, else
 * restoreLatest(). NOTE: the destructive-overwrite confirmation gate (type-the-DB-name) is enforced
 * in the UI form BEFORE this action is invoked; this action still re-checks admin server-side.
 * restoreKey/restoreLatest are primitives that restore unconditionally by design (D-05).
 *
 * @throws Error("FORBIDDEN") when the caller is not admin.
 */
export async function restoreBackup(
  key?: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole("admin");

  try {
    if (key) {
      await restoreKey(key);
    } else {
      await restoreLatest();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * listBackups (D-05) — admin-only. Iterates every enabled destination, calls dest.list(), merges all
 * returned keys into one list sorted newest-first by the YYYYMMDD-HHmm timestamp embedded in the key
 * (lexical === chronological), and returns {backups:[{destination,key}]}. Per-destination try/catch
 * means a failing destination contributes nothing and never breaks the call. Backs the Restore UI.
 *
 * @throws Error("FORBIDDEN") when the caller is not admin.
 */
export async function listBackups(): Promise<{
  backups: { destination: string; key: string }[];
}> {
  await requireRole("admin");

  const dests = await getEnabledDestinations();
  const merged: { destination: string; key: string }[] = [];
  for (const dest of dests) {
    try {
      const keys = await dest.list();
      for (const key of keys) {
        merged.push({ destination: dest.name, key });
      }
    } catch (e) {
      // Never throws — a failing destination is logged + contributes nothing (default-safe).
      log.error("listBackups: destination list failed", {
        dest: dest.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  // Sort newest-first: the YYYYMMDD-HHmm prefix makes lexical-descending === chronological-descending.
  merged.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
  return { backups: merged };
}

/**
 * getGoogleConsentUrl (D-02, T-08-04d) — admin-only. Generates an unguessable CSRF state token,
 * binds it to the admin's browser via a short-TTL httpOnly sameSite:lax cookie, and returns the
 * Google consent URL (buildConsentUrl). The 08-03 /api/auth/google/callback Route Handler reads
 * the cookie and rejects (400) on a state mismatch before any token exchange.
 *
 * CSRF defense: the state is crypto.randomBytes(16) (32 hex chars — unguessable), httpOnly (JS
 * cannot read it), sameSite:lax (top-level OAuth redirect carries it), and short-TTL (maxAge 600s).
 * The 08-03 callback compares the cookie value to the ?state query param directly, so the cookie
 * value MUST equal the state passed to buildConsentUrl.
 *
 * @throws Error("FORBIDDEN") when the caller is not admin.
 */
export async function getGoogleConsentUrl(): Promise<string> {
  await requireRole("admin");

  const state = crypto.randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set(GDRIVE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: GDRIVE_OAUTH_STATE_MAX_AGE,
    path: "/",
  });
  return buildConsentUrl(state);
}

/**
 * disconnectGoogleDrive (D-02 revocation half, T-08-04e) — admin-only. Reads + decrypts the stored
 * gdrive refresh_token, revokes it at Google's revocation endpoint (revokeDriveToken, best-effort —
 * an already-revoked/expired token MUST NOT abort local cleanup), and THEN deletes the
 * backup.gdrive_creds settings row. The revoke-before-delete ordering is critical: deleting first
 * would leave a valid token at Google indefinitely.
 *
 * @throws Error("FORBIDDEN") when the caller is not admin.
 */
export async function disconnectGoogleDrive(): Promise<{ ok: true }> {
  await requireRole("admin");

  const blob = await readSetting(BACKUP_GDRIVE_CREDS_KEY);
  if (blob) {
    let refreshToken = "";
    try {
      const creds = JSON.parse(decrypt(blob)) as { refreshToken?: string };
      refreshToken = creds.refreshToken ?? "";
    } catch (e) {
      // A corrupt blob should not block cleanup — log + proceed to delete the unusable row.
      log.error("disconnectGoogleDrive: decrypt failed (clearing row anyway)", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    if (refreshToken) {
      // BEST-EFFORT: revokeDriveToken's own try/catch already swallows already-revoked tokens, but
      // wrap it here too so a rejecting mock/runtime never aborts the local row deletion (T-08-04e).
      try {
        await revokeDriveToken(refreshToken);
      } catch (e) {
        log.error("disconnectGoogleDrive: revokeDriveToken rejected (best-effort)", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    await deleteSetting(BACKUP_GDRIVE_CREDS_KEY);
  }

  return { ok: true };
}
