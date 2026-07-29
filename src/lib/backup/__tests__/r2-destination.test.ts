// src/lib/backup/__tests__/r2-destination.test.ts
// [CITED: 08-02-PLAN.md Task 1 <behavior> + <acceptance_criteria> — dedicated backup-bucket S3Client]
// [CITED: 08-VALIDATION.md Wave 0 row "r2-destination.test.ts"]
// [CITED: 08-RESEARCH.md Anti-Patterns — backup R2 bucket/client MUST be distinct from media]
// [CITED: D-01 (R2 selectable), D-03 (encrypted creds), D-06 (full DR destination)]
//
// Wave-0 R2 destination tests. Asserts the destination:
//   - Builds a DEDICATED S3Client from decrypted backup.r2_creds (NOT the media client).
//   - upload/list/download/delete/testConnection round-trip against the BACKUP bucket.
//   - NEVER imports the media s3Client / getActiveProvider (static gate — grep on source).
//
// Mock strategy: @aws-sdk/client-s3 is mocked so S3Client construction + Command inputs are
// observable. ../config.readSetting returns an "encrypted" blob; @/lib/crypto.decrypt returns
// the JSON creds. No real network.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Backup creds — a DEDICATED backup bucket, distinct from the media bucket. */
const BACKUP_CREDS = {
  endpoint: "https://backup-account.r2.cloudflarestorage.com",
  region: "auto",
  accessKeyId: "BACKUP-KEY-ID",
  secretAccessKey: "BACKUP-SECRET",
  bucket: "anydiscussion-backups",
  forcePathStyle: false,
};

const { sendMock, ctorMock, readSettingMock, decryptMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  ctorMock: vi.fn(),
  readSettingMock: vi.fn(),
  decryptMock: vi.fn(),
}));

// Mock @aws-sdk/client-s3: S3Client records its construction config + exposes a shared send.
// Command classes are stubs that capture the input passed to their constructor so tests can
// assert Bucket/Key/Body/MaxKeys without depending on real SDK internals.
vi.mock("@aws-sdk/client-s3", () => {
  class Stub {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return {
    S3Client: vi.fn(function (this: { send: typeof sendMock; config: unknown }, config: unknown) {
      ctorMock(config);
      this.send = sendMock;
      this.config = config;
    }),
    PutObjectCommand: Stub,
    ListObjectsV2Command: Stub,
    GetObjectCommand: Stub,
    DeleteObjectCommand: Stub,
  };
});

vi.mock("../config", () => ({
  readSetting: (...a: unknown[]) => readSettingMock(...a),
  BACKUP_R2_CREDS_KEY: "backup.r2_creds",
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: (...a: unknown[]) => decryptMock(...a),
}));

describe("08-02 Task 1: R2 backup destination (dedicated backup bucket/client)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readSettingMock.mockResolvedValue("ENCRYPTED-BLOB");
    decryptMock.mockReturnValue(JSON.stringify(BACKUP_CREDS));
  });

  async function loadDest() {
    const mod = await import("../destinations/r2");
    return mod.r2BackupDestination;
  }

  it("exports a BackupDestination whose readonly name === 'r2'", async () => {
    const dest = await loadDest();
    expect(dest.name).toBe("r2");
  });

  it("upload builds a DEDICATED S3Client from backup creds (not media creds) + sends PutObjectCommand against the BACKUP bucket", async () => {
    const dest = await loadDest();
    sendMock.mockResolvedValue({});
    const buf = Buffer.from("DB-DUMP-BYTES");

    const res = await dest.upload(buf, "anydiscussion-20260729-0300.sqlc", "application/octet-stream");

    // The dedicated client was constructed exactly once with the BACKUP creds.
    expect(ctorMock).toHaveBeenCalledTimes(1);
    const cfg = ctorMock.mock.calls[0][0] as Record<string, unknown>;
    expect(cfg).toMatchObject({
      endpoint: BACKUP_CREDS.endpoint,
      region: BACKUP_CREDS.region,
      forcePathStyle: BACKUP_CREDS.forcePathStyle,
    });
    const credentials = cfg.credentials as Record<string, string>;
    expect(credentials.accessKeyId).toBe("BACKUP-KEY-ID");
    expect(credentials.secretAccessKey).toBe("BACKUP-SECRET");

    // PutObjectCommand targeted the BACKUP bucket (not the media bucket name).
    expect(sendMock).toHaveBeenCalledTimes(1);
    const cmd = sendMock.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input.Bucket).toBe("anydiscussion-backups");
    expect(cmd.input.Key).toBe("anydiscussion-20260729-0300.sqlc");
    expect(cmd.input.ContentType).toBe("application/octet-stream");
    expect((cmd.input.Body as Buffer).equals(buf)).toBe(true);

    expect(res).toEqual({ key: "anydiscussion-20260729-0300.sqlc", sizeBytes: buf.length });
  });

  it("list paginates ListObjectsV2Command via ContinuationToken across multiple pages", async () => {
    const dest = await loadDest();
    sendMock
      .mockResolvedValueOnce({
        Contents: [{ Key: "a.sqlc" }, { Key: "b.sqlc" }],
        IsTruncated: true,
        NextContinuationToken: "tok-1",
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: "c.sqlc" }],
        IsTruncated: false,
      });

    const keys = await dest.list();

    expect(keys).toEqual(["a.sqlc", "b.sqlc", "c.sqlc"]);
    expect(sendMock).toHaveBeenCalledTimes(2);
    // Second page carries the ContinuationToken from the first.
    const page2 = sendMock.mock.calls[1][0] as { input: Record<string, unknown> };
    expect(page2.input.ContinuationToken).toBe("tok-1");
    // Both pages list the BACKUP bucket.
    expect((sendMock.mock.calls[0][0] as { input: Record<string, unknown> }).input.Bucket).toBe(
      "anydiscussion-backups",
    );
  });

  it("download uses GetObjectCommand + transformToByteArray → Buffer", async () => {
    const dest = await loadDest();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    sendMock.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => bytes },
    });

    const out = await dest.download("anydiscussion-20260729-0300.sqlc");

    const cmd = sendMock.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input.Key).toBe("anydiscussion-20260729-0300.sqlc");
    expect(cmd.input.Bucket).toBe("anydiscussion-backups");
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.equals(Buffer.from(bytes))).toBe(true);
  });

  it("delete is idempotent — swallows a not-found rejection", async () => {
    const dest = await loadDest();
    sendMock.mockRejectedValueOnce(new Error("NoSuchKey"));

    // Must NOT throw despite the rejection.
    await expect(
      dest.delete("anydiscussion-20260729-0300.sqlc"),
    ).resolves.toBeUndefined();

    const cmd = sendMock.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input.Key).toBe("anydiscussion-20260729-0300.sqlc");
  });

  it("testConnection returns {ok:true} on a successful MaxKeys:1 list", async () => {
    const dest = await loadDest();
    sendMock.mockResolvedValueOnce({ Contents: [], IsTruncated: false });

    const res = await dest.testConnection();

    expect(res).toEqual({ ok: true });
    const cmd = sendMock.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input.MaxKeys).toBe(1);
    expect(cmd.input.Bucket).toBe("anydiscussion-backups");
  });

  it("testConnection returns {ok:false,error} on throw — never throws", async () => {
    const dest = await loadDest();
    sendMock.mockRejectedValueOnce(new Error("access denied"));

    const res = await dest.testConnection();

    expect(res.ok).toBe(false);
    expect(res.error).toContain("access denied");
  });

  it("testConnection returns {ok:false} 'not configured' without calling S3 when creds are absent", async () => {
    readSettingMock.mockResolvedValue(""); // no backup.r2_creds row
    const dest = await loadDest();

    const res = await dest.testConnection();

    expect(res).toEqual({ ok: false, error: expect.stringContaining("not configured") });
    expect(sendMock).not.toHaveBeenCalled();
    expect(ctorMock).not.toHaveBeenCalled();
  });
});

describe("08-02 Task 1 anti-pattern gate: dedicated-client separation", () => {
  it("r2.ts does NOT import the media s3Client / getActiveProvider / lib/r2 / storage registry", async () => {
    // Static source gate (T-08-02): the backup destination must build its OWN client from
    // backup creds — never reach for the media bucket's client/registry. Reading the source
    // from disk makes this a real structural assertion, not just a mock artifact.
    const src = await readFile(join(__dirname, "..", "destinations", "r2.ts"), "utf8");

    // Strip the license/header comments so a doc comment mentioning these symbols (e.g. an
    // anti-pattern explanation) does not false-positive. Only actual import statements count.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    expect(code).not.toMatch(/from\s+["']@\/lib\/r2["']/);
    expect(code).not.toMatch(/from\s+["']@\/lib\/storage\/registry["']/);
    expect(code).not.toMatch(/\bgetActiveProvider\b/);
    expect(code).not.toMatch(/\bs3Client\b/);
  });
});
