// src/lib/backup/__tests__/config.test.ts
// [CITED: 08-01-PLAN.md Task 1 <behavior> + <acceptance_criteria> — backup.config Zod parse + D-09 defaults]
// [CITED: 08-VALIDATION.md Wave 0 row "config.test.ts"]
// [CITED: 08-RESEARCH.md Pattern 6 (lines 414-422) — settings key scheme]
// [CITED: D-03, D-09 — backup.config plaintext JSON; daily / 30d retention / weekly drill defaults]
//
// Wave-0 config tests proving D-03/D-09 (settings-driven config I/O):
//   - readBackupConfig returns D-09 defaults when settings row "backup.config" is absent.
//   - readBackupConfig parses a populated row through the Zod schema without throwing.
//   - readBackupConfig merges D-09 defaults for a PARTIAL stored config.
//   - writeBackupConfig JSON-stringifies + upserts the settings key "backup.config".
//
// Mock strategy: @/lib/db is mocked (mirrors storage __tests__/registry.test.ts) so the
// settings read/upsert never hits a real DB. drizzle-orm's eq is mocked so the
// where-condition captures the settings key; the update().set() chain captures the
// persisted JSON value. We control the settingsRow mock to feed absent / full / partial.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { settingsRow, setArgMock, whereArgMock } = vi.hoisted(() => ({
  settingsRow: vi.fn(),
  setArgMock: vi.fn(), // captures the { value, updatedAt } written via update().set()
  whereArgMock: vi.fn(), // captures the eq(column, key) condition
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => {
    whereArgMock({ column: col, value: val });
    return { column: col, value: val };
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => settingsRow() }),
        limit: () => settingsRow(),
      }),
    }),
    update: () => ({
      // update().set({value,updatedAt}).where(eq(...)) → set captures arg; where resolves rowcount.
      set: (s: unknown) => {
        setArgMock(s);
        return { where: () => Promise.resolve(1) };
      },
    }),
    insert: () => ({
      values: () => ({ onConflictDoNothing: () => Promise.resolve(undefined) }),
    }),
  },
  schema: { settings: { key: "key", value: "value" } },
}));

describe("D-09: readBackupConfig returns sensible defaults when settings row is absent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EMAIL_FROM", "ops@example.com");
    settingsRow.mockResolvedValue([]); // no row → defaults
  });

  it("returns D-09 defaults (enabled, local-on, daily 03:00, 30d retention, weekly drill)", async () => {
    const { readBackupConfig } = await import("../config");
    const cfg = await readBackupConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.destinations).toEqual({ local: true, r2: false, gdrive: false });
    expect(cfg.scheduleCron).toBe("0 3 * * *"); // daily at 03:00 UTC
    expect(cfg.retentionDays).toBe(30);
    expect(cfg.drillEnabled).toBe(true);
    expect(cfg.drillCron).toBe("0 4 * * 0"); // weekly, Sunday 04:00
    expect(cfg.alertEmail).toBe("ops@example.com"); // derived from EMAIL_FROM
  });

  it("reads the settings row under key 'backup.config'", async () => {
    const { readBackupConfig, BACKUP_CONFIG_KEY } = await import("../config");
    await readBackupConfig();
    expect(whereArgMock).toHaveBeenCalledWith(
      expect.objectContaining({ value: BACKUP_CONFIG_KEY }),
    );
  });

  it("defaults alertEmail to '' when EMAIL_FROM is unset", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    vi.resetModules();
    const { readBackupConfig } = await import("../config");
    const cfg = await readBackupConfig();
    expect(cfg.alertEmail).toBe("");
  });
});

describe("D-03: readBackupConfig parses a populated backup.config row through Zod", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EMAIL_FROM", "ops@example.com");
  });

  it("parses a full stored config verbatim", async () => {
    settingsRow.mockResolvedValue([
      {
        value: JSON.stringify({
          enabled: true,
          destinations: { local: true, r2: true, gdrive: false },
          scheduleCron: "0 5 * * *",
          retentionDays: 14,
          drillEnabled: false,
          drillCron: "0 6 * * 0",
          alertEmail: "alert@example.com",
        }),
      },
    ]);
    const { readBackupConfig } = await import("../config");
    const cfg = await readBackupConfig();
    expect(cfg.destinations).toEqual({ local: true, r2: true, gdrive: false });
    expect(cfg.scheduleCron).toBe("0 5 * * *");
    expect(cfg.retentionDays).toBe(14);
    expect(cfg.drillEnabled).toBe(false);
    expect(cfg.drillCron).toBe("0 6 * * 0");
    expect(cfg.alertEmail).toBe("alert@example.com");
  });

  it("merges D-09 defaults for a partial stored config (missing fields filled)", async () => {
    settingsRow.mockResolvedValue([{ value: JSON.stringify({ retentionDays: 7 }) }]);
    const { readBackupConfig } = await import("../config");
    const cfg = await readBackupConfig();
    expect(cfg.retentionDays).toBe(7); // stored value honored
    expect(cfg.enabled).toBe(true); // default filled
    expect(cfg.destinations.local).toBe(true); // default filled
    expect(cfg.scheduleCron).toBe("0 3 * * *"); // default filled
    expect(cfg.drillCron).toBe("0 4 * * 0"); // default filled
  });

  it("does not throw on an empty-string stored value (treats as defaults)", async () => {
    settingsRow.mockResolvedValue([{ value: "" }]);
    const { readBackupConfig } = await import("../config");
    await expect(readBackupConfig()).resolves.toBeDefined();
  });
});

describe("D-03: writeBackupConfig JSON-stringifies + upserts the backup.config key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EMAIL_FROM", "ops@example.com");
  });

  it("upserts a JSON blob under settings key 'backup.config'", async () => {
    const { writeBackupConfig, BACKUP_CONFIG_KEY } = await import("../config");
    await writeBackupConfig({
      enabled: true,
      destinations: { local: true, r2: false, gdrive: false },
      scheduleCron: "0 3 * * *",
      retentionDays: 30,
      drillEnabled: true,
      drillCron: "0 4 * * 0",
      alertEmail: "ops@example.com",
    });
    // The write went through the update().set().where() path (not insert fallback).
    expect(whereArgMock).toHaveBeenCalledWith(
      expect.objectContaining({ value: BACKUP_CONFIG_KEY }),
    );
    expect(setArgMock).toHaveBeenCalledTimes(1);
    const persisted = setArgMock.mock.calls[0][0] as { value: string; updatedAt: Date };
    expect(persisted.updatedAt instanceof Date).toBe(true);
    const parsed = JSON.parse(persisted.value);
    expect(parsed.destinations).toEqual({ local: true, r2: false, gdrive: false });
    expect(parsed.retentionDays).toBe(30);
    expect(parsed.scheduleCron).toBe("0 3 * * *");
  });
});
