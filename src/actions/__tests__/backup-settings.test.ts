// src/actions/__tests__/backup-settings.test.ts
// @vitest-environment node
// [CITED: 08-04-PLAN.md Task 1 <behavior> + <acceptance_criteria>]
// [CITED: 08-VALIDATION.md Wave 0 row 08-04-1 — all 8 actions admin-gate FIRST + redact-on-read]
// [CITED: 08-CONTEXT.md D-01 (multi-select), D-03 (encrypted creds), D-05 (Restore), D-09 (defaults)]
// [CITED: src/actions/__tests__/storage-settings.test.ts — MUST_NOT_BE_REACHED mock scaffold shape]
// [CITED: T-08-04 (admin gate), T-08-04b (redact-on-read), T-08-04d (CSRF state cookie), T-08-04e (revoke-before-delete)]
//
// Wave-0 backup-settings tests proving all 8 admin-gated Server Actions + the OAuth/restore invariants:
//   - EVERY action calls requireRole('admin') FIRST — non-admin → FORBIDDEN before any
//     parse/encrypt/db/cookies (MUST_NOT_BE_REACHED for all 8).
//   - getBackupSettings applies redactCredentials (secretAccessKey === "" in output) — Pitfall 7.
//   - saveBackupSettings upserts backup.config + encrypts backup.r2_creds ONLY when creds have a secret.
//   - getGoogleConsentUrl sets a signed httpOnly 'gdrive_oauth_state' cookie (maxAge<=600) + returns
//     buildConsentUrl(state); the state passed to buildConsentUrl equals the cookie value.
//   - disconnectGoogleDrive calls revokeDriveToken BEFORE deleting backup.gdrive_creds, and does NOT
//     throw when revokeDriveToken rejects (best-effort).
//   - listBackups merges + sorts keys from enabled destinations newest-first; never throws when a
//     destination's list() rejects.
//   - testBackupConnection returns {ok,error?} and never throws.
//   - triggerBackupNow calls runBackupJob (try/catch); restoreBackup calls restoreKey/restoreLatest.
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Hoisted spies (mock factory needs them at hoist time) ───────────────────
const {
  requireRoleMock,
  encryptMock,
  decryptMock,
  redactCredentialsMock,
  readSettingMock,
  upsertSettingMock,
  deleteSettingMock,
  readBackupConfigMock,
  getEnabledDestinationsMock,
  buildConsentUrlMock,
  revokeDriveTokenMock,
  runBackupJobMock,
  restoreKeyMock,
  restoreLatestMock,
  cookiesMock,
  cookieSetMock,
  cookieGetMock,
  cookieDeleteMock,
} = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  encryptMock: vi.fn(),
  decryptMock: vi.fn(),
  redactCredentialsMock: vi.fn(),
  readSettingMock: vi.fn(),
  upsertSettingMock: vi.fn(),
  deleteSettingMock: vi.fn(),
  readBackupConfigMock: vi.fn(),
  getEnabledDestinationsMock: vi.fn(),
  buildConsentUrlMock: vi.fn(),
  revokeDriveTokenMock: vi.fn(),
  runBackupJobMock: vi.fn(),
  restoreKeyMock: vi.fn(),
  restoreLatestMock: vi.fn(),
  cookiesMock: vi.fn(),
  cookieSetMock: vi.fn(),
  cookieGetMock: vi.fn(),
  cookieDeleteMock: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  requireRole: (...a: unknown[]) => requireRoleMock(...a),
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: (...a: unknown[]) => encryptMock(...a),
  decrypt: (...a: unknown[]) => decryptMock(...a),
  redactCredentials: (...a: unknown[]) => redactCredentialsMock(...a),
}));

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

// Canonical settings I/O (08-01 config.ts) — mocked so assertions on read/upsert/delete are direct.
vi.mock("@/lib/backup/config", () => ({
  readSetting: (...a: unknown[]) => readSettingMock(...a),
  upsertSetting: (...a: unknown[]) => upsertSettingMock(...a),
  deleteSetting: (...a: unknown[]) => deleteSettingMock(...a),
  readBackupConfig: (...a: unknown[]) => readBackupConfigMock(...a),
  BACKUP_CONFIG_KEY: "backup.config",
  BACKUP_R2_CREDS_KEY: "backup.r2_creds",
  BACKUP_GDRIVE_CREDS_KEY: "backup.gdrive_creds",
}));

vi.mock("@/lib/backup/registry", () => ({
  getEnabledDestinations: (...a: unknown[]) => getEnabledDestinationsMock(...a),
}));

vi.mock("@/lib/backup/destinations/google-drive", () => ({
  buildConsentUrl: (...a: unknown[]) => buildConsentUrlMock(...a),
  revokeDriveToken: (...a: unknown[]) => revokeDriveTokenMock(...a),
}));

vi.mock("@/lib/backup/job", () => ({
  runBackupJob: (...a: unknown[]) => runBackupJobMock(...a),
}));

vi.mock("@/lib/backup/restore", () => ({
  restoreKey: (...a: unknown[]) => restoreKeyMock(...a),
  restoreLatest: (...a: unknown[]) => restoreLatestMock(...a),
}));

// next/headers cookies() — async in Next 16; resolves to a jar with set/get/delete.
vi.mock("next/headers", () => ({
  cookies: (...a: unknown[]) => cookiesMock(...a),
}));

import {
  saveBackupSettings,
  getBackupSettings,
  testBackupConnection,
  triggerBackupNow,
  restoreBackup,
  listBackups,
  getGoogleConsentUrl,
  disconnectGoogleDrive,
} from "../backup-settings";

const adminSession = () => ({
  user: { id: "u-admin", role: "admin" },
  session: { id: "s1" },
});

/** A complete, valid form-shaped input for saveBackupSettings (r2 has a secret). */
const validInputWithSecret = {
  destinations: { local: true, r2: true, gdrive: false },
  scheduleCron: "0 3 * * *",
  retentionDays: 30,
  drillEnabled: true,
  drillCron: "0 4 * * 0",
  alertEmail: "ops@example.com",
  r2: {
    endpoint: "https://r2.example.com",
    region: "auto",
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "shh-secret",
    bucket: "backups",
    forcePathStyle: true,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(adminSession());
  cookiesMock.mockResolvedValue({
    set: cookieSetMock,
    get: cookieGetMock,
    delete: cookieDeleteMock,
  });
});

// ─── Shared MUST_NOT_BE_REACHED helper ──────────────────────────────────────
/** When requireRole throws FORBIDDEN, the action must not reach any later side effect. */
function forbidAdmin() {
  requireRoleMock.mockImplementation(() => {
    throw new Error("FORBIDDEN");
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 1. saveBackupSettings
// ════════════════════════════════════════════════════════════════════════════
describe("T-08-04: saveBackupSettings — admin gate fires FIRST", () => {
  beforeEach(() => {
    encryptMock.mockImplementation((s: string) => `enc:${s}`);
    upsertSettingMock.mockResolvedValue(undefined);
  });

  it("non-admin → FORBIDDEN before parse/encrypt/upsert (MUST_NOT_BE_REACHED)", async () => {
    forbidAdmin();
    encryptMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    upsertSettingMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(saveBackupSettings(validInputWithSecret)).rejects.toThrow("FORBIDDEN");
    expect(requireRoleMock).toHaveBeenCalledWith("admin");
    expect(encryptMock).not.toHaveBeenCalled();
    expect(upsertSettingMock).not.toHaveBeenCalled();
  });

  it("admin → upserts backup.config (JSON) with the config fields", async () => {
    await saveBackupSettings(validInputWithSecret);

    const configCall = upsertSettingMock.mock.calls.find(
      (c: unknown[]) => c[0] === "backup.config",
    );
    expect(configCall).toBeTruthy();
    const stored = JSON.parse(configCall![1] as string);
    expect(stored.destinations).toEqual({ local: true, r2: true, gdrive: false });
    expect(stored.scheduleCron).toBe("0 3 * * *");
    expect(stored.retentionDays).toBe(30);
    expect(stored.alertEmail).toBe("ops@example.com");
  });

  it("admin → when r2 creds have a secret, encrypts + upserts backup.r2_creds", async () => {
    await saveBackupSettings(validInputWithSecret);

    expect(encryptMock).toHaveBeenCalledTimes(1);
    const encArg = encryptMock.mock.calls[0][0] as string;
    expect(encArg).toContain("shh-secret");
    const credsCall = upsertSettingMock.mock.calls.find(
      (c: unknown[]) => c[0] === "backup.r2_creds",
    );
    expect(credsCall).toBeTruthy();
    expect(credsCall![1]).toBe("enc:" + encArg);
  });

  it("admin → empty secretAccessKey means NO encrypt / NO backup.r2_creds write (Pitfall 7)", async () => {
    await saveBackupSettings({
      ...validInputWithSecret,
      r2: { ...validInputWithSecret.r2, secretAccessKey: "" },
    });

    expect(encryptMock).not.toHaveBeenCalled();
    const credsCall = upsertSettingMock.mock.calls.find(
      (c: unknown[]) => c[0] === "backup.r2_creds",
    );
    expect(credsCall).toBeUndefined();
    // backup.config is still written (the admin may toggle destinations without re-entering creds).
    expect(
      upsertSettingMock.mock.calls.some((c: unknown[]) => c[0] === "backup.config"),
    ).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. getBackupSettings — redact-on-read (Pitfall 7 / T-08-04b)
// ════════════════════════════════════════════════════════════════════════════
describe("T-08-04b / Pitfall 7: getBackupSettings — redacts secret fields on read", () => {
  beforeEach(() => {
    readBackupConfigMock.mockResolvedValue({
      enabled: true,
      destinations: { local: true, r2: true, gdrive: false },
      scheduleCron: "0 3 * * *",
      retentionDays: 30,
      drillEnabled: true,
      drillCron: "0 4 * * 0",
      alertEmail: "ops@example.com",
    });
    // redactCredentials real-ish behavior: zero fields matching the secret regex.
    redactCredentialsMock.mockImplementation(<T extends Record<string, unknown>>(creds: T): T => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(creds)) {
        out[k] = /secret|api[-_]?key|token|password/i.test(k) ? "" : v;
      }
      return out as T;
    });
  });

  it("non-admin → FORBIDDEN before any read (MUST_NOT_BE_REACHED)", async () => {
    forbidAdmin();
    readBackupConfigMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    readSettingMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(getBackupSettings()).rejects.toThrow("FORBIDDEN");
    expect(requireRoleMock).toHaveBeenCalledWith("admin");
    expect(readBackupConfigMock).not.toHaveBeenCalled();
    expect(readSettingMock).not.toHaveBeenCalled();
  });

  it("admin → returns config + redacted r2 creds (secretAccessKey empty) + gdriveConnected flag", async () => {
    decryptMock.mockImplementation((blob: string) => {
      if (blob === "enc-r2")
        return JSON.stringify({
          endpoint: "https://r2.example.com",
          region: "auto",
          accessKeyId: "AKIAEXAMPLE",
          secretAccessKey: "r2-secret",
          bucket: "backups",
          forcePathStyle: true,
        });
      return "{}";
    });
    // First readSetting call → r2 blob; second → gdrive blob (empty).
    readSettingMock.mockResolvedValueOnce("enc-r2").mockResolvedValueOnce("");

    const result = await getBackupSettings();

    expect(result.destinations).toEqual({ local: true, r2: true, gdrive: false });
    expect(result.scheduleCron).toBe("0 3 * * *");
    // Redacted: secretAccessKey empty (Pitfall 7); non-secret fields preserved.
    expect(result.r2.secretAccessKey).toBe("");
    expect(result.r2.bucket).toBe("backups");
    expect(result.r2.accessKeyId).toBe("AKIAEXAMPLE");
    // gdrive blob empty → not connected.
    expect(result.gdriveConnected).toBe(false);
  });

  it("admin → gdriveConnected is true when a gdrive creds blob exists", async () => {
    decryptMock.mockReturnValue("{}");
    readSettingMock.mockResolvedValueOnce("").mockResolvedValueOnce("enc-gdrive");

    const result = await getBackupSettings();
    expect(result.gdriveConnected).toBe(true);
    // r2 absent (empty blob) → no r2 section.
    expect(result.r2).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. testBackupConnection — never throws + admin gate
// ════════════════════════════════════════════════════════════════════════════
describe("T-08-04: testBackupConnection — admin gate + never throws", () => {
  it("non-admin → FORBIDDEN before any destination probe (MUST_NOT_BE_REACHED)", async () => {
    forbidAdmin();
    getEnabledDestinationsMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(testBackupConnection("r2", {} as never)).rejects.toThrow("FORBIDDEN");
    expect(requireRoleMock).toHaveBeenCalledWith("admin");
    expect(getEnabledDestinationsMock).not.toHaveBeenCalled();
  });

  it("admin → delegates to the destination's testConnection() → { ok: true }", async () => {
    const r2Dest = {
      name: "r2",
      testConnection: vi.fn().mockResolvedValue({ ok: true }),
    };
    getEnabledDestinationsMock.mockResolvedValue([r2Dest]);

    const result = await testBackupConnection("r2", {} as never);
    expect(r2Dest.testConnection).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });

  it("admin → returns { ok:false, error } when the destination's probe rejects (never throws)", async () => {
    const r2Dest = {
      name: "r2",
      testConnection: vi.fn().mockRejectedValue(new Error("invalid creds")),
    };
    getEnabledDestinationsMock.mockResolvedValue([r2Dest]);

    const result = await testBackupConnection("r2", {} as never);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("invalid creds");
  });

  it("admin → unknown/unenabled destination → { ok:false, error } (never throws)", async () => {
    getEnabledDestinationsMock.mockResolvedValue([]); // r2 not enabled
    const result = await testBackupConnection("r2", {} as never);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. triggerBackupNow — runBackupJob try/catch + admin gate
// ════════════════════════════════════════════════════════════════════════════
describe("T-08-04: triggerBackupNow — admin gate + runBackupJob", () => {
  it("non-admin → FORBIDDEN before runBackupJob (MUST_NOT_BE_REACHED)", async () => {
    forbidAdmin();
    runBackupJobMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(triggerBackupNow()).rejects.toThrow("FORBIDDEN");
    expect(runBackupJobMock).not.toHaveBeenCalled();
  });

  it("admin → calls runBackupJob and returns { ok:true } on success", async () => {
    runBackupJobMock.mockResolvedValue({ ok: true, bytes: 1234, destinations: ["local"] });
    const result = await triggerBackupNow();
    expect(runBackupJobMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });

  it("admin → runBackupJob rejection → { ok:false, error } (never throws)", async () => {
    runBackupJobMock.mockRejectedValue(new Error("pg_dump missing"));
    const result = await triggerBackupNow();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("pg_dump missing");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. restoreBackup — restoreKey/restoreLatest + admin gate (D-05)
// ════════════════════════════════════════════════════════════════════════════
describe("T-08-04 / D-05: restoreBackup — admin gate + restore primitive", () => {
  it("non-admin → FORBIDDEN before restoreKey/restoreLatest (MUST_NOT_BE_REACHED)", async () => {
    forbidAdmin();
    restoreKeyMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(restoreBackup("anydiscussion-20260729-0300.sqlc")).rejects.toThrow("FORBIDDEN");
    expect(restoreKeyMock).not.toHaveBeenCalled();
    expect(restoreLatestMock).not.toHaveBeenCalled();
  });

  it("admin → with a key → calls restoreKey(key) → { ok:true }", async () => {
    restoreKeyMock.mockResolvedValue(undefined);
    const result = await restoreBackup("anydiscussion-20260729-0300.sqlc");
    expect(restoreKeyMock).toHaveBeenCalledWith("anydiscussion-20260729-0300.sqlc");
    expect(restoreLatestMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("admin → without a key → calls restoreLatest() → { ok:true }", async () => {
    restoreLatestMock.mockResolvedValue(undefined);
    const result = await restoreBackup();
    expect(restoreLatestMock).toHaveBeenCalledTimes(1);
    expect(restoreKeyMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("admin → restore rejection → { ok:false, error } (never throws)", async () => {
    restoreKeyMock.mockRejectedValue(new Error("restore failed"));
    const result = await restoreBackup("k");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("restore failed");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. listBackups — merge + sort newest-first + never throws (D-05)
// ════════════════════════════════════════════════════════════════════════════
describe("T-08-04 / D-05: listBackups — merge + sort + never throws", () => {
  it("non-admin → FORBIDDEN before getEnabledDestinations (MUST_NOT_BE_REACHED)", async () => {
    forbidAdmin();
    getEnabledDestinationsMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(listBackups()).rejects.toThrow("FORBIDDEN");
    expect(getEnabledDestinationsMock).not.toHaveBeenCalled();
  });

  it("admin → merges keys from all enabled destinations, sorted newest-first", async () => {
    const local = {
      name: "local",
      list: vi
        .fn()
        .mockResolvedValue([
          "anydiscussion-20260728-0300.sqlc",
          "anydiscussion-20260729-0300.sqlc",
        ]),
    };
    const r2 = {
      name: "r2",
      list: vi.fn().mockResolvedValue(["anydiscussion-20260729-1500.sqlc"]),
    };
    getEnabledDestinationsMock.mockResolvedValue([local, r2]);

    const result = await listBackups();
    // Newest-first: 20260729-1500 > 20260729-0300 > 20260728-0300 (lexical === chronological).
    expect(result.backups.map((b: { key: string }) => b.key)).toEqual([
      "anydiscussion-20260729-1500.sqlc",
      "anydiscussion-20260729-0300.sqlc",
      "anydiscussion-20260728-0300.sqlc",
    ]);
    // Each entry carries its source destination name.
    const r2Entry = result.backups.find(
      (b: { key: string }) => b.key === "anydiscussion-20260729-1500.sqlc",
    );
    expect(r2Entry.destination).toBe("r2");
  });

  it("admin → never throws when a destination's list() rejects; other dests still return", async () => {
    const broken = { name: "r2", list: vi.fn().mockRejectedValue(new Error("R2 down")) };
    const ok = {
      name: "local",
      list: vi.fn().mockResolvedValue(["anydiscussion-20260729-0300.sqlc"]),
    };
    getEnabledDestinationsMock.mockResolvedValue([broken, ok]);

    const result = await listBackups();
    expect(result.backups).toHaveLength(1);
    expect(result.backups[0].key).toBe("anydiscussion-20260729-0300.sqlc");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. getGoogleConsentUrl — CSRF state cookie + buildConsentUrl (T-08-04d)
// ════════════════════════════════════════════════════════════════════════════
describe("T-08-04d: getGoogleConsentUrl — admin gate + signed httpOnly state cookie", () => {
  it("non-admin → FORBIDDEN before cookies/buildConsentUrl (MUST_NOT_BE_REACHED)", async () => {
    forbidAdmin();
    cookiesMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    buildConsentUrlMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(getGoogleConsentUrl()).rejects.toThrow("FORBIDDEN");
    expect(cookiesMock).not.toHaveBeenCalled();
    expect(buildConsentUrlMock).not.toHaveBeenCalled();
  });

  it("admin → sets signed httpOnly 'gdrive_oauth_state' cookie (maxAge<=600) + returns buildConsentUrl(state)", async () => {
    buildConsentUrlMock.mockImplementation((state: string) => `https://consent?state=${state}`);

    const url = await getGoogleConsentUrl();

    // Cookie set with the canonical CSRF name + httpOnly + short maxAge.
    expect(cookieSetMock).toHaveBeenCalledTimes(1);
    const [name, value, opts] = cookieSetMock.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(name).toBe("gdrive_oauth_state");
    expect(value).toMatch(/^[0-9a-f]{32}$/); // crypto.randomBytes(16).toString("hex")
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.maxAge).toBeLessThanOrEqual(600);
    // buildConsentUrl received the SAME state that was cookie-bound.
    expect(buildConsentUrlMock).toHaveBeenCalledWith(value);
    expect(url).toBe(`https://consent?state=${value}`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. disconnectGoogleDrive — revoke BEFORE delete + best-effort (T-08-04e)
// ════════════════════════════════════════════════════════════════════════════
describe("T-08-04e: disconnectGoogleDrive — admin gate + revoke-before-delete", () => {
  beforeEach(() => {
    decryptMock.mockReturnValue(JSON.stringify({ refreshToken: "rt-xyz" }));
    readSettingMock.mockResolvedValue("enc-gdrive");
    revokeDriveTokenMock.mockResolvedValue(undefined);
    deleteSettingMock.mockResolvedValue(undefined);
  });

  it("non-admin → FORBIDDEN before any read/revoke/delete (MUST_NOT_BE_REACHED)", async () => {
    forbidAdmin();
    readSettingMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    revokeDriveTokenMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(disconnectGoogleDrive()).rejects.toThrow("FORBIDDEN");
    expect(readSettingMock).not.toHaveBeenCalled();
    expect(revokeDriveTokenMock).not.toHaveBeenCalled();
    expect(deleteSettingMock).not.toHaveBeenCalled();
  });

  it("admin → revokes the token BEFORE deleting the backup.gdrive_creds row", async () => {
    await disconnectGoogleDrive();

    expect(revokeDriveTokenMock).toHaveBeenCalledWith("rt-xyz");
    expect(deleteSettingMock).toHaveBeenCalledWith("backup.gdrive_creds");
    // Call-order: revoke happens before delete.
    expect(revokeDriveTokenMock.mock.invocationCallOrder[0]).toBeLessThan(
      deleteSettingMock.mock.invocationCallOrder[0],
    );
  });

  it("admin → does NOT throw when revokeDriveToken rejects (best-effort); still deletes the row", async () => {
    revokeDriveTokenMock.mockRejectedValue(new Error("invalid_grant"));

    const result = await disconnectGoogleDrive();

    expect(result).toEqual({ ok: true });
    expect(deleteSettingMock).toHaveBeenCalledWith("backup.gdrive_creds");
  });

  it("admin → when no creds row exists, returns { ok:true } without revoking or deleting", async () => {
    readSettingMock.mockResolvedValue(""); // no creds stored
    const result = await disconnectGoogleDrive();
    expect(result).toEqual({ ok: true });
    expect(revokeDriveTokenMock).not.toHaveBeenCalled();
    expect(deleteSettingMock).not.toHaveBeenCalled();
  });
});
