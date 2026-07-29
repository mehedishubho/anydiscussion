// src/lib/backup/__tests__/crypto-roundtrip.test.ts
// [CITED: 08-01-PLAN.md Task 1 <behavior> + <acceptance_criteria> — crypto round-trip for backup creds]
// [CITED: 08-VALIDATION.md Wave 0 row "crypto-roundtrip.test.ts"]
// [CITED: D-03 — credentials encrypted at rest via lib/crypto AES-256-GCM]
// [CITED: 08-RESEARCH.md Pattern 6 — backup.r2_creds + backup.gdrive_creds encrypted blobs]
//
// Wave-0 characterization test proving D-03 (the existing lib/crypto envelope fits the
// backup-credential blobs that 08-02/08-03/08-04 will store): encrypt a JSON-stringified
// creds blob → decrypt → deep-equal the original. This is NOT a new crypto implementation
// — lib/crypto is proven (Phase 4 D-25). This test proves the backup-creds SHAPE survives
// the encrypt/decrypt round-trip (so future plans can persist + read them confidently).
//
// Vitest environment = Node (default). SETTINGS_ENCRYPTION_KEY stubbed to a 32-byte key.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const TEST_KEY = Buffer.from(
  // 32 bytes of 0x07 — deterministic, valid-length AES-256 key. NEVER used in prod.
  "0707070707070707070707070707070707070707070707070707070707070707",
  "hex",
).toString("base64");

describe("D-03: lib/crypto round-trips backup-credential blobs", () => {
  beforeEach(() => {
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", TEST_KEY);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("R2 backup creds blob: encrypt → decrypt → deep-equal original", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const creds = {
      endpoint: "https://<account>.r2.cloudflarestorage.com",
      region: "auto",
      accessKeyId: "AKIA-BACKUP-KEY",
      secretAccessKey: "super-secret-r2-key",
      bucket: "anydiscussion-backups",
      forcePathStyle: true,
    };
    const envelope = encrypt(JSON.stringify(creds));
    const parts = envelope.split(":");
    expect(parts).toHaveLength(3); // <iv>:<authTag>:<ciphertext>
    const roundTripped = JSON.parse(decrypt(envelope));
    expect(roundTripped).toEqual(creds);
  });

  it("Google Drive refresh-token creds blob: encrypt → decrypt → deep-equal original", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const creds = {
      refreshToken: "1//0gXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      clientId: "google-client-id.apps.googleusercontent.com",
    };
    const envelope = encrypt(JSON.stringify(creds));
    const roundTripped = JSON.parse(decrypt(envelope));
    expect(roundTripped).toEqual(creds);
    // The refresh token survives intact — critical: a corrupted token breaks Drive auth.
    expect(roundTripped.refreshToken).toBe(creds.refreshToken);
  });

  it("two encrypt() calls produce different envelopes (fresh IV per call — GCM safety)", async () => {
    const { encrypt } = await import("@/lib/crypto");
    const blob = JSON.stringify({ refreshToken: "same-token" });
    expect(encrypt(blob)).not.toBe(encrypt(blob));
  });

  it("Bangla UTF-8 in a creds value survives the round-trip (CLAUDE.md content support)", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const creds = { note: "ব্যাকআপ ক্রেডেনশিয়াল", bucket: "backups" };
    const roundTripped = JSON.parse(decrypt(encrypt(JSON.stringify(creds))));
    expect(roundTripped).toEqual(creds);
  });
});
