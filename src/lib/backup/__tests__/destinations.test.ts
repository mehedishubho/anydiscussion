// src/lib/backup/__tests__/destinations.test.ts
// [CITED: 08-01-PLAN.md Task 2 <behavior> + <acceptance_criteria> — local fs round-trip]
// [CITED: 08-VALIDATION.md Wave 0 row "destinations.test.ts"]
// [CITED: 08-RESEARCH.md Pattern 1 + 08-PATTERNS.md row local.ts — mirror non-image raw-buffer branch]
// [CITED: T-08-01b — path-traversal defense (assertSafeKey rejects '..' / absolute keys)]
//
// Wave-0 local destination tests proving D-01 (local default-on, real fs round-trip):
//   - upload writes the raw buffer as-is (no sharp variants) to BACKUP_LOCAL_ROOT.
//   - list/download/delete round-trip a real buffer through the filesystem.
//   - list(prefix) filters by prefix.
//   - delete is idempotent (missing key does not throw).
//   - assertSafeKey rejects '..' / absolute keys (T-08-01b path-traversal mitigation).
//   - testConnection probes fs.access(BACKUP_LOCAL_ROOT).
//
// NO external service: a REAL fs round-trip against os.tmpdir(). The module reads
// BACKUP_LOCAL_ROOT at load time, so each test stubs the env + vi.resetModules() before
// dynamic-importing the destination fresh.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("D-01: local backup destination — real fs round-trip", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "backup-local-"));
    vi.stubEnv("BACKUP_LOCAL_ROOT", root);
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  });

  it("readonly name === 'local'", async () => {
    const { localBackupDestination } = await import("../destinations/local");
    expect(localBackupDestination.name).toBe("local");
  });

  it("upload → list → download → deep-equal → delete → list empty", async () => {
    const { localBackupDestination } = await import("../destinations/local");
    const buf = Buffer.from("PGDUMP-CUSTOM-FORMAT-BYTES-12345");
    const key = "anydiscussion-20260729-0300.sqlc";

    const result = await localBackupDestination.upload(buf, key);
    // upload returns {key, sizeBytes} with NO variants field (narrower than StorageProvider).
    expect(result).toEqual({ key, sizeBytes: buf.length });
    expect(result).not.toHaveProperty("variants");

    const listed = await localBackupDestination.list();
    expect(listed).toContain(key);

    const downloaded = await localBackupDestination.download(key);
    expect(Buffer.isBuffer(downloaded)).toBe(true);
    expect(downloaded.equals(buf)).toBe(true);

    await localBackupDestination.delete(key);
    const listedAfter = await localBackupDestination.list();
    expect(listedAfter).not.toContain(key);
  });

  it("upload writes the raw buffer as-is (no sharp processing)", async () => {
    const { localBackupDestination } = await import("../destinations/local");
    const buf = Buffer.from("raw-bytes-no-sharp");
    const key = "raw-test.sqlc";
    await localBackupDestination.upload(buf, key);
    // Read the file directly from disk to prove it's byte-identical (no transformation).
    const onDisk = await fs.readFile(path.join(root, key));
    expect(onDisk.equals(buf)).toBe(true);
  });

  it("list(prefix) filters by prefix", async () => {
    const { localBackupDestination } = await import("../destinations/local");
    await localBackupDestination.upload(Buffer.from("a"), "anydiscussion-20260101-0000.sqlc");
    await localBackupDestination.upload(Buffer.from("b"), "other-20260101-0000.sqlc");

    const all = await localBackupDestination.list();
    expect(all).toHaveLength(2);

    const filtered = await localBackupDestination.list("anydiscussion-");
    expect(filtered).toContain("anydiscussion-20260101-0000.sqlc");
    expect(filtered).not.toContain("other-20260101-0000.sqlc");
  });

  it("delete is idempotent (missing key does not throw)", async () => {
    const { localBackupDestination } = await import("../destinations/local");
    await expect(
      localBackupDestination.delete("never-uploaded.sqlc"),
    ).resolves.toBeUndefined();
  });

  it("rejects keys containing '..' (T-08-01b path-traversal guard)", async () => {
    const { localBackupDestination } = await import("../destinations/local");
    await expect(
      localBackupDestination.upload(Buffer.from("x"), "../escape.sqlc"),
    ).rejects.toThrow();
    await expect(localBackupDestination.download("../escape.sqlc")).rejects.toThrow();
    await expect(localBackupDestination.delete("../escape.sqlc")).rejects.toThrow();
  });

  it("rejects absolute keys (T-08-01b path-traversal guard)", async () => {
    const { localBackupDestination } = await import("../destinations/local");
    const abs = path.isAbsolute("/etc/passwd") ? "/etc/passwd" : "C:/x.sqlc";
    await expect(
      localBackupDestination.upload(Buffer.from("x"), abs),
    ).rejects.toThrow();
  });

  it("testConnection returns ok:true when BACKUP_LOCAL_ROOT exists", async () => {
    const { localBackupDestination } = await import("../destinations/local");
    const result = await localBackupDestination.testConnection();
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("testConnection returns ok:false (never throws) when root is missing", async () => {
    const missing = path.join(os.tmpdir(), `no-such-backup-root-${Date.now()}`);
    vi.stubEnv("BACKUP_LOCAL_ROOT", missing);
    vi.resetModules();
    const { localBackupDestination } = await import("../destinations/local");
    const result = await localBackupDestination.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
