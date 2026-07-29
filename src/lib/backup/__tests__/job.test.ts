// src/lib/backup/__tests__/job.test.ts
// [CITED: 08-01-PLAN.md Task 2 <behavior> + <acceptance_criteria> — orchestrator + retention + restore]
// [CITED: 08-VALIDATION.md Wave 0 row "job.test.ts"]
// [CITED: 08-PATTERNS.md row job.ts — mirror src/lib/schedule/index.ts try/catch resilience]
// [CITED: D-04 (job), D-05 (restore), D-09 (retentionDays)]
//
// Wave-0 job tests proving D-04/D-05/D-09:
//   - runBackupJob: pgDump once → upload to EVERY enabled destination → write backup.last_run
//     → runRetentionCleanup; wrapped in try/catch + log.error (never throws to caller).
//   - runRetentionCleanup: deletes keys older than retentionDays, keeps newer.
//   - restoreKey: downloads from a destination + calls pgRestore with DATABASE_URL.
//   - restoreLatest: picks the newest key across destinations + restores it.
//
// Mock strategy: dump/registry/config are mocked so no real pg_dump / DB / fs runs. The
// fake destination records uploads/downloads/deletes so tests assert the orchestration shape.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { BackupDestination } from "../types";

const {
  pgDumpMock,
  pgRestoreMock,
  getEnabledMock,
  readConfigMock,
  upsertSettingMock,
  readSettingMock,
  syncMediaBucketMock,
} = vi.hoisted(() => ({
  pgDumpMock: vi.fn(),
  pgRestoreMock: vi.fn(),
  getEnabledMock: vi.fn(),
  readConfigMock: vi.fn(),
  upsertSettingMock: vi.fn(),
  readSettingMock: vi.fn(),
  syncMediaBucketMock: vi.fn(),
}));

vi.mock("../dump", async () => {
  // Spread the real module so formatBackupTimestamp (used by job.ts to build the backup
  // key) stays the genuine implementation — only pgDump/pgRestore are overridden.
  const actual = await vi.importActual<typeof import("../dump")>("../dump");
  return {
    ...actual,
    pgDump: (...a: unknown[]) => pgDumpMock(...a),
    pgRestore: (...a: unknown[]) => pgRestoreMock(...a),
  };
});
vi.mock("../registry", () => ({
  getEnabledDestinations: (...a: unknown[]) => getEnabledMock(...a),
}));
vi.mock("../config", () => ({
  readBackupConfig: (...a: unknown[]) => readConfigMock(...a),
  upsertSetting: (...a: unknown[]) => upsertSettingMock(...a),
  readSetting: (...a: unknown[]) => readSettingMock(...a),
  BACKUP_LAST_RUN_KEY: "backup.last_run",
  BACKUP_CONFIG_KEY: "backup.config",
  BACKUP_LOCAL_PATH_KEY: "backup.local_path",
  BACKUP_R2_CREDS_KEY: "backup.r2_creds",
  BACKUP_GDRIVE_CREDS_KEY: "backup.gdrive_creds",
}));

// 08-02 Task 2: media-sync is mocked so job-test observes the ORCHESTRATION (whether
// runBackupJob invokes syncMediaBucket with the right source/prefix/callback) without
// running the real pagination loop (that is unit-tested in media-sync.test.ts).
vi.mock("../media-sync", () => ({
  syncMediaBucket: (...a: unknown[]) => syncMediaBucketMock(...a),
}));

// The media R2 client is the SYNC SOURCE (read-only List/Get). Mocked to a bare object so
// importing job.ts never constructs a real S3Client against MinIO in tests. Separation
// invariant (T-08-02): this is the MEDIA client — distinct from the backup-bucket client
// built inside r2.ts from backup creds.
vi.mock("@/lib/r2", () => ({ s3Client: { send: vi.fn() } }));

const DUMP = Buffer.from("PGDUMP-CUSTOM-FORMAT");

/** Build a fake BackupDestination that records uploads/downloads/deletes in memory. */
function makeFakeDest(
  name: "local" | "r2" | "gdrive",
  opts: { keys?: string[]; store?: Map<string, Buffer> } = {},
): BackupDestination & {
  uploaded: string[];
  deleted: string[];
  store: Map<string, Buffer>;
} {
  const store = opts.store ?? new Map<string, Buffer>();
  for (const k of opts.keys ?? []) store.set(k, Buffer.from(`existing-${k}`));
  return {
    name,
    uploaded: [],
    deleted: [],
    store,
    async upload(buffer: Buffer, key: string) {
      this.uploaded.push(key);
      this.store.set(key, buffer);
      return { key, sizeBytes: buffer.length };
    },
    async list(prefix?: string) {
      const keys = [...this.store.keys()];
      return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
    },
    async download(key: string) {
      const b = this.store.get(key);
      if (!b) throw new Error(`not found: ${key}`);
      return b;
    },
    async delete(key: string) {
      this.deleted.push(key);
      this.store.delete(key);
    },
    async testConnection() {
      return { ok: true };
    },
  } as BackupDestination & {
    uploaded: string[];
    deleted: string[];
    store: Map<string, Buffer>;
  };
}

describe("D-04: runBackupJob dumps + uploads to every enabled destination + records last_run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://u:pw@localhost:5432/anydiscussion");
    pgDumpMock.mockResolvedValue(DUMP);
    readConfigMock.mockResolvedValue({
      enabled: true,
      destinations: { local: true, r2: false, gdrive: false },
      scheduleCron: "0 3 * * *",
      retentionDays: 30,
      drillEnabled: true,
      drillCron: "0 4 * * 0",
      alertEmail: "",
    });
    upsertSettingMock.mockResolvedValue(undefined);
    // 08-02 Task 2: media not on R2 here → runBackupJob skips media sync (DB-only). Keeps
    // the existing dump-upload assertions (one upload per dest) unaffected by the new path.
    readSettingMock.mockResolvedValue("local");
    syncMediaBucketMock.mockResolvedValue(0);
  });

  it("calls pgDump once + uploads the dump to EVERY enabled destination", async () => {
    const destA = makeFakeDest("local");
    const destB = makeFakeDest("r2");
    getEnabledMock.mockResolvedValue([destA, destB]);

    const { runBackupJob } = await import("../job");
    const result = await runBackupJob();

    expect(pgDumpMock).toHaveBeenCalledTimes(1);
    expect(getEnabledMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.destinations).toEqual(["local", "r2"]);
    // Each destination received exactly one upload of the dump, under a generated key.
    expect(destA.uploaded).toHaveLength(1);
    expect(destB.uploaded).toHaveLength(1);
    const keyPattern = /^anydiscussion-\d{8}-\d{4}\.sqlc$/;
    expect(destA.uploaded[0]).toMatch(keyPattern);
    expect(destA.uploaded[0]).toBe(destB.uploaded[0]); // same key across destinations
  });

  it("writes settings key 'backup.last_run' with a success status JSON", async () => {
    const dest = makeFakeDest("local");
    getEnabledMock.mockResolvedValue([dest]);

    const { runBackupJob } = await import("../job");
    await runBackupJob();

    expect(upsertSettingMock).toHaveBeenCalledWith(
      "backup.last_run",
      expect.any(String),
    );
    const status = JSON.parse(upsertSettingMock.mock.calls[0][1]);
    expect(status.ok).toBe(true);
    expect(status.bytes).toBe(DUMP.length);
    expect(status.destinations).toEqual(["local"]);
    expect(status.at).toBeDefined();
  });

  it("uploads the actual dump buffer (not a placeholder)", async () => {
    const dest = makeFakeDest("local");
    getEnabledMock.mockResolvedValue([dest]);
    const { runBackupJob } = await import("../job");
    await runBackupJob();
    const storedKey = dest.uploaded[0];
    expect(dest.store.get(storedKey)!.equals(DUMP)).toBe(true);
  });
});

describe("D-09: runRetentionCleanup deletes old keys, keeps newer ones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://u:pw@localhost:5432/anydiscussion");
  });

  it("deletes keys older than retentionDays and keeps newer", async () => {
    const old = "anydiscussion-20200101-0000.sqlc"; // ~years old
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const freshKey = `anydiscussion-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(
      now.getUTCDate(),
    )}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}.sqlc`;
    const dest = makeFakeDest("local", { keys: [old, freshKey] });

    const { runRetentionCleanup } = await import("../job");
    const deleted = await runRetentionCleanup(dest as BackupDestination, 30);

    expect(deleted).toBe(1);
    expect(dest.deleted).toContain(old);
    expect(dest.deleted).not.toContain(freshKey);
    expect(dest.store.has(freshKey)).toBe(true);
  });

  it("ignores keys that don't match the backup-key timestamp pattern", async () => {
    const dest = makeFakeDest("local", {
      keys: ["README.txt", "random-file.bin"],
    });
    const { runRetentionCleanup } = await import("../job");
    const deleted = await runRetentionCleanup(dest as BackupDestination, 30);
    expect(deleted).toBe(0); // non-backup files are never deleted by retention
  });
});

describe("D-04 resilience: runBackupJob never throws to the caller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://u:pw@localhost:5432/anydiscussion");
    readConfigMock.mockResolvedValue({
      enabled: true,
      destinations: { local: true, r2: false, gdrive: false },
      scheduleCron: "0 3 * * *",
      retentionDays: 30,
      drillEnabled: true,
      drillCron: "0 4 * * 0",
      alertEmail: "",
    });
    getEnabledMock.mockResolvedValue([makeFakeDest("local")]);
    upsertSettingMock.mockResolvedValue(undefined);
    // 08-02 Task 2: media not on R2 → skip media sync in these resilience tests.
    readSettingMock.mockResolvedValue("local");
    syncMediaBucketMock.mockResolvedValue(0);
  });

  it("returns ok:false (and records a failure status) when pgDump throws", async () => {
    pgDumpMock.mockRejectedValue(new Error("pg_dump not installed"));

    const { runBackupJob } = await import("../job");
    const result = await runBackupJob();

    expect(result.ok).toBe(false);
    // Failure status still written to backup.last_run.
    expect(upsertSettingMock).toHaveBeenCalledWith("backup.last_run", expect.any(String));
    const status = JSON.parse(upsertSettingMock.mock.calls[0][1]);
    expect(status.ok).toBe(false);
    expect(status.error).toContain("pg_dump not installed");
  });
});

describe("D-05: restoreKey / restoreLatest wrap pgRestore against DATABASE_URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://u:pw@localhost:5432/anydiscussion");
    pgRestoreMock.mockResolvedValue(undefined);
  });

  it("restoreKey downloads the dump from a destination + calls pgRestore with DATABASE_URL", async () => {
    const dumpForRestore = Buffer.from("RESTORE-ME");
    const dest = makeFakeDest("local", {
      store: new Map([["anydiscussion-20260729-0300.sqlc", dumpForRestore]]),
    });
    getEnabledMock.mockResolvedValue([dest]);

    const { restoreKey } = await import("../restore");
    await restoreKey("anydiscussion-20260729-0300.sqlc");

    expect(pgRestoreMock).toHaveBeenCalledTimes(1);
    const [passedDump, target] = pgRestoreMock.mock.calls[0];
    expect((passedDump as Buffer).equals(dumpForRestore)).toBe(true);
    expect(target).toBe("postgresql://u:pw@localhost:5432/anydiscussion");
  });

  it("restoreKey throws when no enabled destination has the key", async () => {
    const dest = makeFakeDest("local"); // empty store
    getEnabledMock.mockResolvedValue([dest]);
    const { restoreKey } = await import("../restore");
    await expect(restoreKey("missing.sqlc")).rejects.toThrow();
    expect(pgRestoreMock).not.toHaveBeenCalled();
  });

  it("restoreLatest picks the newest key across destinations + restores it", async () => {
    const newest = Buffer.from("NEWEST");
    const dest = makeFakeDest("local", {
      store: new Map([
        ["anydiscussion-20260101-0000.sqlc", Buffer.from("OLD")],
        ["anydiscussion-20260729-0300.sqlc", newest],
        ["anydiscussion-20260615-0300.sqlc", Buffer.from("MID")],
      ]),
    });
    getEnabledMock.mockResolvedValue([dest]);

    const { restoreLatest } = await import("../restore");
    await restoreLatest();

    expect(pgRestoreMock).toHaveBeenCalledTimes(1);
    const [passedDump] = pgRestoreMock.mock.calls[0];
    expect((passedDump as Buffer).equals(newest)).toBe(true);
  });

  it("restoreLatest throws when there are no backups", async () => {
    getEnabledMock.mockResolvedValue([makeFakeDest("local")]); // empty
    const { restoreLatest } = await import("../restore");
    await expect(restoreLatest()).rejects.toThrow();
  });
});

describe("D-06: runBackupJob syncs media R2 objects to every enabled destination (full DR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://u:pw@localhost:5432/anydiscussion");
    pgDumpMock.mockResolvedValue(DUMP);
    readConfigMock.mockResolvedValue({
      enabled: true,
      destinations: { local: true, r2: true, gdrive: false },
      scheduleCron: "0 3 * * *",
      retentionDays: 30,
      drillEnabled: true,
      drillCron: "0 4 * * 0",
      alertEmail: "",
    });
    upsertSettingMock.mockResolvedValue(undefined);
    syncMediaBucketMock.mockResolvedValue(7);
  });

  it("calls syncMediaBucket with the MEDIA R2 source + a dated prefix when active_provider is r2", async () => {
    readSettingMock.mockResolvedValue("r2"); // media lives on the R2 bucket
    const dest = makeFakeDest("r2");
    getEnabledMock.mockResolvedValue([dest]);

    const { runBackupJob } = await import("../job");
    await runBackupJob();

    expect(syncMediaBucketMock).toHaveBeenCalledTimes(1);
    const arg = syncMediaBucketMock.mock.calls[0][0] as {
      source: { client: unknown; bucket: string };
      destKeyPrefix: string;
      uploadObject: (key: string, buf: Buffer) => Promise<void>;
    };
    // The source is the MEDIA R2 client + the media bucket name (NOT the backup bucket).
    expect(arg.source.bucket).toBe(
      process.env.S3_BUCKET || "anydiscussion-media",
    );
    expect(arg.source.client).toBeDefined(); // the media s3Client from @/lib/r2
    // Dated prefix of the form media-YYYYMMDD/.
    expect(arg.destKeyPrefix).toMatch(/^media-\d{8}\/$/);
    // The dump upload happened before media sync (one upload so far).
    expect(dest.uploaded).toHaveLength(1);

    // The uploadObject callback fans out to EVERY enabled destination.
    const before = dest.uploaded.length;
    await arg.uploadObject("media-20260729/img/a.webp", Buffer.from([1, 2]));
    expect(dest.uploaded.length).toBe(before + 1);
    expect(dest.uploaded).toContain("media-20260729/img/a.webp");
    expect(dest.store.get("media-20260729/img/a.webp")!.equals(Buffer.from([1, 2]))).toBe(true);
  });

  it("skips media sync when active_provider is local (media NOT on R2) — degrades to DB-only", async () => {
    readSettingMock.mockResolvedValue("local");
    const dest = makeFakeDest("local");
    getEnabledMock.mockResolvedValue([dest]);

    const { runBackupJob } = await import("../job");
    const result = await runBackupJob();

    expect(syncMediaBucketMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    // Only the dump was uploaded — no media objects.
    expect(dest.uploaded).toHaveLength(1);
  });

  it("still completes the DB dump (ok:true) when media sync throws — degraded, not failed", async () => {
    readSettingMock.mockResolvedValue("r2");
    syncMediaBucketMock.mockRejectedValue(new Error("R2 list failed"));
    const dest = makeFakeDest("r2");
    getEnabledMock.mockResolvedValue([dest]);

    const { runBackupJob } = await import("../job");
    const result = await runBackupJob();

    // DB dump succeeded despite media-sync failure (D-06 degrades to DB-only on sync error).
    expect(result.ok).toBe(true);
    expect(result.destinations).toEqual(["r2"]);
    expect(dest.uploaded).toHaveLength(1); // the dump
    expect(syncMediaBucketMock).toHaveBeenCalled();
  });
});
