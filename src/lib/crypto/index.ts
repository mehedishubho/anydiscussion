// src/lib/crypto/index.ts
// [CITED: 04-CONTEXT.md D-25 — credentials encrypted at rest, never exposed to client]
// [CITED: 04-RESEARCH.md "Pattern 2" lines 352-391 — AES-256-GCM canonical Node crypto pattern]
// [CITED: 04-05-PLAN.md Task 1 — encrypt/decrypt/redactCredentials]
//
// D-25 credential encryption helper. AES-256-GCM provides confidentiality + integrity
// in a single operation — the auth tag makes any tamper of iv/ciphertext/authtag throw
// at decrypt.final() (proven by crypto.test.ts).
//
// Envelope format: "<ivB64>:<authTagB64>:<ciphertextB64>" — fits the settings.value text
// column with no schema change (settings.value is text).
//
// KEY HANDLING (Pitfall 0 from 04-RESEARCH Pitfall 2 + Plan 04-05 Task 1):
//   - The key is read lazily INSIDE encrypt/decrypt (NOT at module load). This is critical:
//     the local storage provider must keep working on a fresh install where
//     SETTINGS_ENCRYPTION_KEY is not yet set. The module MUST load cleanly without the
//     env var; the failure is deferred to the call site that actually needs crypto.
//   - Missing or invalid-length key → throw a clear "SETTINGS_ENCRYPTION_KEY missing
//     or invalid" Error at encrypt/decrypt call time. The error message includes the
//     generation command so the operator can recover immediately.
//
// Server-only — NO "use client" directive. Imported by Server Actions (storage-settings.ts)
// and instrumentation.ts boot (best-effort configure — wraps in try/catch).
//
// [CITED: Node.js docs — crypto.createCipheriv with 'aes-256-gcm']
import crypto from "node:crypto";

/**
 * Canonical secret-field matcher (D-25). Used by redactCredentials to zero secret
 * fields before they cross the client boundary. Case-insensitive on:
 *   - "secret"      → secretAccessKey, api_secret, client_secret
 *   - "api[-_]?key" → apiKey, api_key, api-key (the Cloudinary api_key IS the secret
 *                     half of the pair, so it is treated as secret)
 *   - "token"       → continuationToken, csrfToken
 *   - "password"    → password, newPassword
 *
 * NOT redacted (intentionally — the public identifier half of an AWS-style pair):
 *   - "accessKeyId" — R2/AWS public identifier. Per Plan 04-05 Task 1 <behavior> the
 *     example output preserves `accessKeyId: "AKIA..."`. The research-sourced regex
 *     in 04-RESEARCH.md Pattern 2 line 388 included a bare "key" alternative which
 *     incorrectly matched "accessKeyId"; this implementation drops that alternative
 *     so the plan's authoritative example holds. The secretAccessKey half still
 *     redacts (matches "secret"). Rule 1 deviation — documented in SUMMARY.
 *
 * NOTE: a hypothetical bare "key" field (rare) would NOT be redacted by this regex.
 * The storage providers in this codebase have no such field — all secret halves use
 * either "secret" (secretAccessKey, api_secret) or "api[-_]?key" (apiKey, api_key).
 */
const SECRET_FIELD_REGEX = /secret|api[-_]?key|token|password/i;

const KEY_ERROR_MESSAGE =
  'SETTINGS_ENCRYPTION_KEY missing or invalid — generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"';

/**
 * Lazily read + validate the master key. Reads process.env.SETTINGS_ENCRYPTION_KEY
 * each call (cheap) so test stubs and runtime env reloads are picked up. Returns
 * the 32-byte Buffer or throws a clear Error (caller-visible, NOT module-load-time).
 */
function getKey(): Buffer {
  const b64 = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(KEY_ERROR_MESSAGE);
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(KEY_ERROR_MESSAGE);
  }
  return key;
}

/**
 * Encrypt a UTF-8 plaintext string with AES-256-GCM. Produces a fresh 96-bit IV per
 * call (CRITICAL for GCM — IV reuse with the same key catastrophically breaks the
 * cipher's confidentiality + integrity guarantees).
 *
 * @param plaintext The UTF-8 string to encrypt (typically a JSON-stringified credential blob).
 * @returns Envelope "<ivB64>:<authTagB64>:<ciphertextB64>" (all base64).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV — fresh per call (GCM standard).
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 16 bytes — guarantees integrity.
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

/**
 * Decrypt an AES-256-GCM envelope produced by `encrypt`. Throws on any tamper
 * (authTag mismatch) — by design GCM never returns partial/garbage plaintext.
 *
 * @param envelope The "<ivB64>:<authTagB64>:<ciphertextB64>" string from `encrypt`.
 * @returns The original UTF-8 plaintext.
 */
export function decrypt(envelope: string): string {
  const key = getKey();
  const parts = envelope.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid envelope format — expected <iv>:<authTag>:<ciphertext>");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64")); // throws on tamper at final()
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Zero secret fields before they cross the client boundary (Pitfall 7 / D-25).
 *
 * Returns a shallow copy with each secret field's value replaced by the empty string.
 * Field names matching /secret|api[-_]?key|token|password/i (case-insensitive) are
 * treated as secret. Non-matching fields (e.g. accessKeyId, bucket, cloud_name) are
 * preserved verbatim. Used by `getStorageSettings` to enforce "decrypted server-side,
 * redacted on read for client" (Pitfall 7).
 *
 * @param creds The decrypted credential object (any shape).
 * @returns A copy with secret fields zeroed.
 */
export function redactCredentials<T extends Record<string, unknown>>(creds: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(creds)) {
    out[k] = SECRET_FIELD_REGEX.test(k) ? "" : v;
  }
  return out as T;
}
