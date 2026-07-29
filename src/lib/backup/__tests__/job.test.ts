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

const { pgDumpMock, pgRestoreMock, getEnabledMock, readConfigMock, upsertSettingMock } = vi.hoisted(
  () => ({
    pgDumpMock: vi.fn(),
    pgRestoreMock: vi.fn(),
    getEnabledMock: vi.fn(),
    readConfigMock: vi.fn(),
    upsertSettingMock: vi.fn(),
  }),
);

vi.mock("../dump", () => ({
  pgDump: (...a: unknown[]) => pgDumpMock(...a),
  pgRestore: (...a: unknown[]) => pgRestoreMock(...a),
}));
vi.mock("../registry", () => ({
  getEnabledDestinations: (...a: unknown[]) => getEnabledMock(...a),
}));
vi.mock("../config", () => ({
  readBackupConfig: (...a: unknown[]) => readConfigMock(...a),
  upsertSetting: (...a: unknown[]) => upsertSettingMock(...a),
  BACKUP_LAST_RUN_KEY: "backup.last_run",
  BACKUP_CONFIG_KEY: "backup.config",
  BACKUP_LOCAL_PATH_KEY: "backup.local_path",
  BACKUP_R2_CREDS_KEY: "backup.r2_creds",
  BACKUP_GDRIVE_CREDS_KEY: "backup.gdrive_creds",
}));

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
