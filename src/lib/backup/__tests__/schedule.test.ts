// src/lib/backup/__tests__/schedule.test.ts
// [CITED: 08-05-PLAN.md Task 2 <behavior> + <acceptance_criteria>]
// [CITED: 08-VALIDATION.md Wave 0 row "schedule.test.ts" — covers BACKUP-03/04 + T-08-SC]
// [CITED: 08-RESEARCH.md Pattern 5 (lines 376-407) — hourly-poll + isDue shape; Pitfall 3 (multi-instance cliff)]
// [CITED: D-04 (node-cron in startScheduler), D-07 (drill-failure email), D-09 (defaults), T-08-05]
//
// Wave-0 schedule tests proving BACKUP-03/04 + D-04/D-07/D-09:
//   - startScheduler registers THREE cron.schedule entries (publish + backup + drill).
//   - Backup tick calls runBackupJob only when readBackupConfig().enabled + isDue(scheduleCron);
//     early-returns when disabled.
//   - Drill tick: on runRestoreDrill resolve → upserts settings key "backup.last_drill" {ok:true};
//     on rejection → logs + upserts {ok:false,error} (FIRST in catch) + fires sendEmail exactly
//     once with subject "Backup restore-drill FAILED" (fire-and-forget).
//   - Each new tick wraps its body in try/catch so a transient error never throws to the scheduler.
//
// Mock strategy: node-cron is mocked so cron.schedule records (expr, cb) pairs; the drill/backup
// internals (runBackupJob, runRestoreDrill, readBackupConfig, upsertSetting, sendEmail) are mocked
// so no real DB / email / fs runs. The REAL isDue stays in @/lib/schedule (tested via "*" cron
// exprs that always match). No real scheduler fires.
import { describe, it, expect, beforeEach, vi } from "vitest";

// --- Hoisted mock state (vi.hoisted so the factories can reference these before module eval) ---
const cronState = vi.hoisted(() => ({
  // Every cron.schedule(expr, cb) call, in registration order.
  scheduled: [] as Array<{
    expr: string;
    cb: (...args: unknown[]) => Promise<unknown>;
  }>,
}));

const { runBackupJobMock } = vi.hoisted(() => ({ runBackupJobMock: vi.fn() }));
const { runRestoreDrillMock } = vi.hoisted(() => ({ runRestoreDrillMock: vi.fn() }));
const { readBackupConfigMock } = vi.hoisted(() => ({
  readBackupConfigMock: vi.fn(),
}));
const { upsertSettingMock } = vi.hoisted(() => ({ upsertSettingMock: vi.fn() }));
const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));
const { publishDueMock } = vi.hoisted(() => ({ publishDueMock: vi.fn() }));

// node-cron: record schedule registrations. The returned task exposes stop() for a future
// graceful-shutdown hook (mirrors the real return shape).
vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn((expr: string, cb: (...a: unknown[]) => unknown) => {
      cronState.scheduled.push({ expr, cb: cb as (...a: unknown[]) => Promise<unknown> });
      return { stop: vi.fn() };
    }),
    validate: vi.fn(() => true),
  },
}));

// Internals mocked — the schedule layer is what's under test, not the backup/drill engines
// (those have their own Wave-0 files: job.test.ts, drill.test.ts).
vi.mock("@/lib/backup/job", () => ({
  runBackupJob: (...a: unknown[]) => runBackupJobMock(...a),
}));
vi.mock("@/lib/backup/drill", () => ({
  runRestoreDrill: (...a: unknown[]) => runRestoreDrillMock(...a),
}));
vi.mock("@/lib/backup/config", () => ({
  readBackupConfig: (...a: unknown[]) => readBackupConfigMock(...a),
  upsertSetting: (...a: unknown[]) => upsertSettingMock(...a),
  BACKUP_LAST_DRILL_KEY: "backup.last_drill",
}));
vi.mock("@/lib/email", () => ({
  sendEmail: (...a: unknown[]) => sendEmailMock(...a),
}));
vi.mock("@/lib/log", () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));
// schedule/index.ts imports publishDueScheduledPosts from "./system-publish" (sibling). From this
// test file that absolute path is src/lib/schedule/system-publish → "../../schedule/system-publish".
vi.mock("../../schedule/system-publish", () => ({
  publishDueScheduledPosts: (...a: unknown[]) => publishDueMock(...a),
}));

/** A complete D-09-shaped config used as the readBackupConfig mock default. */
function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    destinations: { local: true, r2: false, gdrive: false },
    // "* * * * *" matches every minute so the REAL isDue returns true without time-fakery.
    scheduleCron: "* * * * *",
    retentionDays: 30,
    drillEnabled: true,
    drillCron: "* * * * *",
    alertEmail: "ops@example.com",
    ...overrides,
  };
}

// Imported once at module load (after the vi.mock hoist). startScheduler is idempotent for
// registration — each test resets cronState + re-calls it so exactly 3 entries are present.
import { startScheduler } from "@/lib/schedule";

describe("D-04: startScheduler registers publish + backup + drill cron entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cronState.scheduled.length = 0;
    readBackupConfigMock.mockResolvedValue(makeConfig());
    runBackupJobMock.mockResolvedValue({ ok: true, destinations: [] });
    runRestoreDrillMock.mockResolvedValue(undefined);
    upsertSettingMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue(undefined);
    publishDueMock.mockResolvedValue(0);
    startScheduler();
  });

  it("registers exactly THREE cron.schedule entries", () => {
    expect(cronState.scheduled).toHaveLength(3);
  });

  it("backup + drill ticks poll hourly (expr '0 * * * *'), publish stays every minute", () => {
    expect(cronState.scheduled).toHaveLength(3);
    // Order is fixed by startScheduler: publish, backup, drill.
    const [publish, backup, drill] = cronState.scheduled;
    expect(publish.expr).toBe("* * * * *");
    expect(backup.expr).toBe("0 * * * *");
    expect(drill.expr).toBe("0 * * * *");
  });
});

describe("BACKUP-03: backup tick calls runBackupJob only when enabled + isDue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cronState.scheduled.length = 0;
    readBackupConfigMock.mockResolvedValue(makeConfig());
    runBackupJobMock.mockResolvedValue({ ok: true, destinations: [] });
    runRestoreDrillMock.mockResolvedValue(undefined);
    upsertSettingMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue(undefined);
    publishDueMock.mockResolvedValue(0);
    startScheduler();
  });

  it("calls runBackupJob when cfg.enabled + isDue(scheduleCron)", async () => {
    const backupTick = cronState.scheduled[1].cb;
    await backupTick();
    expect(runBackupJobMock).toHaveBeenCalledTimes(1);
  });

  it("early-returns (no runBackupJob) when cfg.enabled is false", async () => {
    readBackupConfigMock.mockResolvedValueOnce(makeConfig({ enabled: false }));
    const backupTick = cronState.scheduled[1].cb;
    await backupTick();
    expect(runBackupJobMock).not.toHaveBeenCalled();
  });
});

describe("D-07: drill failure path fires email + writes backup.last_drill {ok:false}", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cronState.scheduled.length = 0;
    readBackupConfigMock.mockResolvedValue(makeConfig());
    runBackupJobMock.mockResolvedValue({ ok: true, destinations: [] });
    runRestoreDrillMock.mockResolvedValue(undefined);
    upsertSettingMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue(undefined);
    publishDueMock.mockResolvedValue(0);
    startScheduler();
  });

  it("on runRestoreDrill rejection: sendEmail called ONCE with subject 'Backup restore-drill FAILED'", async () => {
    runRestoreDrillMock.mockRejectedValueOnce(new Error("drill integrity failed"));
    const drillTick = cronState.scheduled[2].cb;
    await drillTick();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const payload = sendEmailMock.mock.calls[0][0] as {
      to: string;
      subject: string;
      text: string;
    };
    expect(payload.subject).toBe("Backup restore-drill FAILED");
    expect(payload.to).toBe("ops@example.com");
    expect(payload.text).toContain("drill integrity failed");
  });

  it("on rejection: upserts backup.last_drill with {ok:false} (FIRST in catch, before email)", async () => {
    runRestoreDrillMock.mockRejectedValueOnce(new Error("drill integrity failed"));
    const drillTick = cronState.scheduled[2].cb;
    await drillTick();

    const lastDrillCalls = upsertSettingMock.mock.calls.filter(
      (c) => c[0] === "backup.last_drill",
    );
    expect(lastDrillCalls).toHaveLength(1);
    const value = JSON.parse(lastDrillCalls[0][1] as string);
    expect(value.ok).toBe(false);
    expect(value.error).toContain("drill integrity failed");
    expect(typeof value.at).toBe("string");
  });

  it("drill tick does NOT throw to the scheduler on rejection (try/catch swallows)", async () => {
    runRestoreDrillMock.mockRejectedValueOnce(new Error("boom"));
    const drillTick = cronState.scheduled[2].cb;
    // Resolves cleanly — the catch block contains the failure.
    await expect(drillTick()).resolves.toBeUndefined();
  });
});

describe("D-07: drill success path writes backup.last_drill {ok:true} + no email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cronState.scheduled.length = 0;
    readBackupConfigMock.mockResolvedValue(makeConfig());
    runBackupJobMock.mockResolvedValue({ ok: true, destinations: [] });
    runRestoreDrillMock.mockResolvedValue(undefined);
    upsertSettingMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue(undefined);
    publishDueMock.mockResolvedValue(0);
    startScheduler();
  });

  it("on runRestoreDrill resolve: upserts backup.last_drill {ok:true}", async () => {
    const drillTick = cronState.scheduled[2].cb;
    await drillTick();

    const lastDrillCalls = upsertSettingMock.mock.calls.filter(
      (c) => c[0] === "backup.last_drill",
    );
    expect(lastDrillCalls).toHaveLength(1);
    const value = JSON.parse(lastDrillCalls[0][1] as string);
    expect(value.ok).toBe(true);
    expect(typeof value.at).toBe("string");
  });

  it("on resolve: does NOT send an alert email", async () => {
    const drillTick = cronState.scheduled[2].cb;
    await drillTick();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("early-returns (no drill, no last_drill write) when cfg.drillEnabled is false", async () => {
    readBackupConfigMock.mockResolvedValueOnce(makeConfig({ drillEnabled: false }));
    const drillTick = cronState.scheduled[2].cb;
    await drillTick();
    expect(runRestoreDrillMock).not.toHaveBeenCalled();
    expect(upsertSettingMock).not.toHaveBeenCalled();
  });
});
