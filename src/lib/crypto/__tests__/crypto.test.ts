// src/lib/crypto/__tests__/crypto.test.ts
// [CITED: 04-05-PLAN.md Task 1 <behavior> + <acceptance_criteria>]
// [CITED: 04-RESEARCH.md "Pattern 2" lines 354-391 — AES-256-GCM canonical pattern]
// [CITED: 04-VALIDATION.md Wave 0 row "crypto.test.ts"]
//
// Wave-0 crypto tests proving D-25 (encrypted credential storage):
//   - Round-trip: decrypt(encrypt(plaintext)) === plaintext for plain strings + JSON blobs.
//   - Tamper detection: flipping one byte of the authTag → decrypt throws (AES-256-GCM
//     integrity — the auth tag is the cryptographic checksum).
//   - redactCredentials zeroes secret fields (regex /secret|key|token|password|api[-_]?key/i,
//     case-insensitive) and preserves non-secret fields.
//   - Missing SETTINGS_ENCRYPTION_KEY → encrypt/decrypt throw the clear "missing" error
//     AT CALL TIME (NOT module load — the local provider must keep working without the
//     key configured).
//
// Vitest environment = Node (default — vitest.config.ts sets environment: "node").
// No jsdom pragma needed — crypto is server-only and Node's `node:crypto` is available
// in the default test environment.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const TEST_KEY = Buffer.from(
  // 32 bytes of 0x01 — a deterministic, valid-length AES-256 key. NEVER used in prod.
  "0101010101010101010101010101010101010101010101010101010101010101",
  "hex",
).toString("base64");

describe("D-25 lib/crypto — AES-256-GCM round-trip + tamper detection", () => {
  beforeEach(() => {
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", TEST_KEY);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("decrypt(encrypt(plaintext)) === plaintext (round-trip)", async () => {
    const { encrypt, decrypt } = await import("../index");
    const cases = [
      "hello world",
      "",
      '{"cloud_name":"demo","api_key":"12345","api_secret":"shh"}',
      // Bangla UTF-8 — prove the cipher handles multi-byte (CLAUDE.md Bangla content support).
      "বাংলা ক্রেডেনশিয়াল",
      "x".repeat(10_000), // larger plaintext
    ];
    for (const pt of cases) {
      const envelope = encrypt(pt);
      expect(typeof envelope).toBe("string");
      // Envelope shape: <ivB64>:<authTagB64>:<ciphertextB64> (exactly 3 colon-separated parts).
      const parts = envelope.split(":");
      expect(parts).toHaveLength(3);
      expect(decrypt(envelope)).toBe(pt);
    }
  });

  it("each encrypt() call produces a fresh IV (different envelopes for same plaintext)", async () => {
    const { encrypt } = await import("../index");
    const a = encrypt("same-secret");
    const b = encrypt("same-secret");
    expect(a).not.toBe(b); // fresh 96-bit IV per call (CRITICAL for GCM)
  });

  it("decrypt throws on tampered authTag (AES-256-GCM integrity)", async () => {
    const { encrypt, decrypt } = await import("../index");
    const envelope = encrypt("sensitive");
    const [ivB64, authTagB64, ciphertextB64] = envelope.split(":");
    // Flip one byte of the authTag → final() must throw on integrity check.
    const tamperedTag = Buffer.from(authTagB64, "base64");
    tamperedTag[0] ^= 0xff;
    const tampered = [ivB64, tamperedTag.toString("base64"), ciphertextB64].join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("decrypt throws on tampered ciphertext (integrity across the body)", async () => {
    const { encrypt, decrypt } = await import("../index");
    const envelope = encrypt("sensitive");
    const [ivB64, authTagB64, ciphertextB64] = envelope.split(":");
    const tamperedText = Buffer.from(ciphertextB64, "base64");
    tamperedText[0] ^= 0xff;
    const tampered = [ivB64, authTagB64, tamperedText.toString("base64")].join(":");
    expect(() => decrypt(tampered)).toThrow();
  });
});

describe("D-25 lib/crypto — redactCredentials zeroes secret fields only", () => {
  beforeEach(() => {
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", TEST_KEY);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("zeroes secretAccessKey but preserves accessKeyId + bucket (R2 shape)", async () => {
    const { redactCredentials } = await import("../index");
    const redacted = redactCredentials({
      endpoint: "https://r2.example.com",
      region: "auto",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "top-secret-value",
      bucket: "media",
      forcePathStyle: true,
    });
    expect(redacted.accessKeyId).toBe("AKIAEXAMPLE");
    expect(redacted.secretAccessKey).toBe("");
    expect(redacted.bucket).toBe("media");
    expect(redacted.endpoint).toBe("https://r2.example.com");
  });

  it("zeroes cloudinary api_key + api_secret but preserves cloud_name (Cloudinary shape)", async () => {
    // Per Plan 04-05 Task 1 <behavior> variants list, api_key IS redacted (the plan
    // explicitly lists "api_key" among the variants to test for redaction). This is
    // stricter than Cloudinary's own convention (api_key is technically the public
    // half), but the safer default for a 2-5 person team — re-entering both api_key
    // + api_secret on edit is a small UX cost for a stronger D-25 boundary.
    const { redactCredentials } = await import("../index");
    const redacted = redactCredentials({
      cloud_name: "my-cloud",
      api_key: "12345",
      api_secret: "shh",
    });
    expect(redacted.cloud_name).toBe("my-cloud");
    expect(redacted.api_key).toBe("");
    expect(redacted.api_secret).toBe("");
  });

  it("zeroes fields matching /api[-_]?key/i (apiKey, api_key, api-key)", async () => {
    const { redactCredentials } = await import("../index");
    const redacted = redactCredentials({
      apiKey: "v1",
      api_key: "v2",
      "api-key": "v3",
      token: "t",
      password: "p",
      secret: "s",
    } as Record<string, unknown>);
    expect(redacted.apiKey).toBe("");
    expect(redacted.api_key).toBe("");
    expect(redacted["api-key"]).toBe("");
    expect(redacted.token).toBe("");
    expect(redacted.password).toBe("");
    expect(redacted.secret).toBe("");
  });

  it("preserves unrelated string fields (cdnBaseUrl, region)", async () => {
    const { redactCredentials } = await import("../index");
    const redacted = redactCredentials({
      cdnBaseUrl: "https://cdn.example.com",
      region: "us-east-1",
      apiKey: "x",
    });
    expect(redacted.cdnBaseUrl).toBe("https://cdn.example.com");
    expect(redacted.region).toBe("us-east-1");
  });
});

describe("D-25 lib/crypto — graceful failure on missing/invalid key", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("encrypt throws a clear 'SETTINGS_ENCRYPTION_KEY missing' error when env is empty", async () => {
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "");
    vi.resetModules();
    const { encrypt } = await import("../index");
    expect(() => encrypt("x")).toThrow(/SETTINGS_ENCRYPTION_KEY/i);
  });

  it("decrypt throws a clear 'SETTINGS_ENCRYPTION_KEY missing' error when env is empty", async () => {
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "");
    vi.resetModules();
    const { decrypt } = await import("../index");
    expect(() => decrypt("a:b:c")).toThrow(/SETTINGS_ENCRYPTION_KEY/i);
  });

  it("encrypt throws when key is not 32 bytes (invalid length)", async () => {
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", Buffer.from("too-short").toString("base64"));
    vi.resetModules();
    const { encrypt } = await import("../index");
    expect(() => encrypt("x")).toThrow(/SETTINGS_ENCRYPTION_KEY/i);
  });

  it("module loads cleanly when env is missing (lazy key read — local provider keeps working)", async () => {
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "");
    vi.resetModules();
    // dynamic import must NOT throw — the failure is deferred to call time.
    await expect(import("../index")).resolves.toBeDefined();
  });
});
