// src/lib/backup/destinations/google-drive.ts
// [CITED: 08-CONTEXT.md D-02 (Google Drive via OAuth user-consent flow), D-03 (encrypted creds)]
// [CITED: 08-RESEARCH.md Pattern 3 (lines 282-325) — buildConsentUrl/exchangeCode/uploadToDrive]
// [CITED: 08-RESEARCH.md Pitfall 4 — access_type:"offline" + prompt:"consent" REQUIRED for refresh_token]
// [CITED: 08-RESEARCH.md Anti-Pattern — do NOT hand-roll token refresh; googleapis auto-refreshes]
// [CITED: 08-PATTERNS.md row destinations/google-drive.ts — NO in-repo analog → RESEARCH Pattern 3]
// [CITED: 08-03-PLAN.md Task 1 <behavior> + <acceptance_criteria>]
//
// THE GOOGLE DRIVE BACKUP DESTINATION + OAuth user-consent helpers (D-02). Google Drive is the
// only backup destination that authenticates via an OAuth USER-CONSENT flow (NOT a service
// account): the admin clicks "Connect Drive" → Google consent → the callback Route Handler
// (08-03 Task 2) exchanges the code, encrypts the refresh_token, and stores it under
// backup.gdrive_creds. Subsequent Drive calls below reuse that refresh_token; the googleapis
// client AUTO-REFRESHES the short-lived access_token (do NOT hand-roll refresh — RESEARCH
// Anti-Pattern). revokeDriveToken() is exported so the 08-04 disconnectGoogleDrive() action can
// invalidate the refresh_token at Google's revocation endpoint (the revocation half of D-02).
//
// SCOPE: drive.file — least privilege (app-created files ONLY, never the user's whole Drive).
// This is the T-08-03c mitigation; the scope-gate test asserts the over-privileged "drive"
// scope is absent.
//
// Cred shape (backup.gdrive_creds, encrypted via lib/crypto, written by the 08-03 callback):
//   { refreshToken: string }
//
// Server-only — NO "use client" directive. Kept bundle-excluded unless Drive is enabled via the
// 08-01 lazy non-literal-dynamic-import registry (getEnabledDestinations).
import { google } from "googleapis";
import { Readable } from "node:stream";
import { readSetting, BACKUP_GDRIVE_CREDS_KEY } from "../config";
import { decrypt } from "@/lib/crypto";
import { log } from "@/lib/log";
import type { BackupDestination } from "../types";

/**
 * The least-privilege Drive scope (T-08-03c). `drive.file` grants access ONLY to files this app
 * created — never the user's entire Drive. The over-privileged `https://www.googleapis.com/auth/drive`
 * scope is deliberately NOT requested (scope-gate test enforces this structurally).
 */
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** The decrypted shape stored (encrypted) under settings key backup.gdrive_creds. */
interface GdriveBackupCreds {
  refreshToken: string;
}

/**
 * Build the OAuth2 client from the operator-provided Google Cloud OAuth client env vars. Same
 * three values (client id/secret/redirect) are used for consent-URL generation, code exchange,
 * token revocation, AND the authed Drive client — Google binds them to the OAuth client. The env
 * vars are runtime-injected (user_setup: Google Cloud Console → Credentials). Lazy read (call
 * time) so test stubs + runtime reloads are picked up.
 */
function buildOAuth2(): InstanceType<typeof google.auth.OAuth2> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  // google.auth.OAuth2 tolerates undefineds at construction (it surfaces a clear error only when
  // a flow actually needs the missing value); keep construction unconditional so the test can
  // assert the call shape, and the real runtime surfaces Google's own missing-config error.
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * buildConsentUrl (D-02) — the URL the admin's browser is sent to when they click "Connect Drive".
 *
 * The FOUR consent params are non-negotiable (RESEARCH Pitfall 4):
 *   - access_type:"offline" — REQUIRED to receive a refresh_token at all.
 *   - prompt:"consent"      — REQUIRED on every re-auth so a fresh refresh_token is returned
 *                              (without it, only the FIRST-ever consent returns one; losing it
 *                              would permanently break Drive backups until the admin revokes +
 *                              re-consents). T-08-03d mitigation.
 *   - scope:[drive.file]    — least privilege (app-created files only). T-08-03c.
 *   - state                 — CSRF token; the 08-03 callback verifies it against the signed
 *                              httpOnly `gdrive_oauth_state` cookie before any token exchange.
 *
 * @param state The CSRF token (generated + cookie-bound by the 08-04 getGoogleConsentUrl action).
 */
export function buildConsentUrl(state: string): string {
  const oauth2 = buildOAuth2();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [DRIVE_FILE_SCOPE],
    state,
  });
}

/**
 * exchangeCode (D-02) — exchange the authorization code for tokens. Called by the 08-03 OAuth
 * callback Route Handler after the CSRF state check passes. Because buildConsentUrl always sends
 * access_type:"offline" + prompt:"consent", `tokens.refresh_token` is present; the caller encrypts
 * + stores it (lib/crypto → backup.gdrive_creds).
 *
 * @param code The `code` query param from Google's redirect.
 * @returns The tokens object ({ refresh_token, access_token, expiry_date, ... }). The callback
 *          reads `.refresh_token!`.
 */
export async function exchangeCode(code: string): Promise<{
  refresh_token?: string | null;
  access_token?: string | null;
  expiry_date?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
}> {
  const oauth2 = buildOAuth2();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

/**
 * revokeDriveToken (D-02 revocation half) — invalidate a refresh_token at Google's token-revocation
 * endpoint. Consumed by the 08-04 disconnectGoogleDrive() Server Action so disconnecting Drive
 * both revokes the token at Google AND deletes the local backup.gdrive_creds row.
 *
 * BEST-EFFORT (try/catch): a token Google already revoked/expired returns an `invalid_grant` error
 * from the revocation endpoint — that must NOT throw to the caller, because the local cleanup
 * (deleting the settings row) should still proceed. Refresh handling is automatic via the
 * googleapis client; this function is only the explicit revocation.
 *
 * @param refreshToken The decrypted refresh_token from backup.gdrive_creds.
 */
export async function revokeDriveToken(refreshToken: string): Promise<void> {
  const oauth2 = buildOAuth2();
  try {
    await oauth2.revokeToken(refreshToken);
  } catch (e) {
    // Best-effort: an already-revoked or expired token is the desired end-state — log + swallow.
    log.error("gdrive token revoke failed (best-effort)", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Load + decrypt the Google Drive credentials from settings. Returns null when no creds row is
 * stored yet (admin has not connected Drive via the OAuth flow) so testConnection can degrade to
 * a "not connected" result instead of throwing.
 */
async function loadCreds(): Promise<GdriveBackupCreds | null> {
  const blob = await readSetting(BACKUP_GDRIVE_CREDS_KEY);
  if (!blob) return null;
  try {
    return JSON.parse(decrypt(blob)) as GdriveBackupCreds;
  } catch (e) {
    log.error("backup-gdrive-creds decrypt failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * Build an authenticated Drive client from the stored refresh_token. The googleapis client
 * AUTO-REFRESHES the short-lived access_token using the refresh_token (RESEARCH Anti-Pattern —
 * do NOT hand-roll a POST to oauth2.googleapis.com/token). Throws when unconfigured so a data-path
 * call (upload/list/download/delete) surfaces the misconfiguration loudly.
 */
async function requireDrive(): Promise<ReturnType<typeof google.drive>> {
  const creds = await loadCreds();
  if (!creds || !creds.refreshToken) {
    throw new Error("Google Drive backup destination not connected (backup.gdrive_creds missing)");
  }
  const oauth2 = buildOAuth2();
  oauth2.setCredentials({ refresh_token: creds.refreshToken });
  return google.drive({ version: "v3", auth: oauth2 });
}

/**
 * Escape a value for embedding inside a Drive API `q` query string. Drive q uses single quotes for
 * string literals and backslash-escapes quotes/backslashes within them. Used by list/download/delete
 * so a key containing an apostrophe cannot break out of the q literal (defense-in-depth — backup
 * keys follow the anydiscussion-YYYYMMDD-HHmm.sqlc convention and never contain quotes).
 */
function escapeQ(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Resolve the Drive fileId for a given file name (key). Drive addresses files by fileId, not name,
 * so download/delete list first to translate the backup key → fileId. Returns null when not found
 * (delete treats this as an idempotent no-op).
 */
async function resolveFileId(drive: ReturnType<typeof google.drive>, key: string): Promise<string | null> {
  const res = await drive.files.list({
    q: `name = '${escapeQ(key)}'`,
    fields: "files(id,name)",
    pageSize: 1,
  });
  const file = res.data.files?.[0];
  return file?.id ?? null;
}

/**
 * The Google Drive backup destination (D-02, D-03). Stores dump/media buffers as Drive files named
 * by the backup key; lists/downloads/deletes them by translating the key → fileId.
 */
export const gdriveBackupDestination: BackupDestination = {
  name: "gdrive",

  async upload(buffer, key, mimeType) {
    const drive = await requireDrive();
    await drive.files.create({
      requestBody: { name: key },
      media: {
        mimeType: mimeType ?? "application/octet-stream",
        body: Readable.from(buffer),
      },
    });
    return { key, sizeBytes: buffer.length };
  },

  async list(prefix) {
    const drive = await requireDrive();
    // Scope by name-contains to avoid returning the user's entire Drive. When a prefix is supplied
    // use it; otherwise default to the backup-key convention so retention/restore see only backups.
    const q = `name contains '${escapeQ(prefix ?? "anydiscussion-")}'`;
    const res = await drive.files.list({ q, fields: "files(name)" });
    const names = (res.data.files ?? [])
      .map((f) => f.name)
      .filter((n): n is string => typeof n === "string");
    return names;
  },

  async download(key) {
    const drive = await requireDrive();
    const fileId = await resolveFileId(drive, key);
    if (!fileId) {
      throw new Error(`Google Drive backup not found: ${key}`);
    }
    const res = await drive.files.get({ fileId, alt: "media" });
    // googleapis returns the media as a Buffer when alt:media is set for binary content.
    const data = res.data as Buffer | ArrayBuffer | Uint8Array;
    return Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
  },

  async delete(key) {
    const drive = await requireDrive();
    const fileId = await resolveFileId(drive, key);
    if (!fileId) return; // idempotent — a missing key is a no-op (BackupDestination contract).
    await drive.files.delete({ fileId }).catch(() => {
      // Swallow — delete is idempotent; a concurrent deletion must not throw to retention cleanup.
    });
  },

  async testConnection() {
    // Never throws — returns {ok, error?} so the dashboard surfaces inline feedback (mirrors the
    // R2 destination + testStorageConnection shapes).
    try {
      const creds = await loadCreds();
      if (!creds || !creds.refreshToken) {
        return { ok: false, error: "Google Drive not connected" };
      }
      const oauth2 = buildOAuth2();
      oauth2.setCredentials({ refresh_token: creds.refreshToken });
      const drive = google.drive({ version: "v3", auth: oauth2 });
      await drive.files.list({ pageSize: 1 });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
