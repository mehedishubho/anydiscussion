// src/lib/backup/__tests__/google-drive.test.ts
// [CITED: 08-03-PLAN.md Task 1 <behavior> + <acceptance_criteria> — OAuth URL + destination + revoke]
// [CITED: 08-VALIDATION.md Wave 0 row "google-drive.test.ts"]
// [CITED: 08-RESEARCH.md Pattern 3 (lines 282-325) — buildConsentUrl/exchangeCode/uploadToDrive]
// [CITED: 08-RESEARCH.md Pitfall 4 — access_type=offline + prompt=consent REQUIRED for refresh_token]
// [CITED: D-02 (OAuth user-consent), D-03 (encrypted creds), T-08-03c (drive.file least privilege)]
//
// Wave-0 Google Drive destination tests. Asserts the module:
//   - buildConsentUrl emits the FOUR non-negotiable consent params (access_type/prompt/scope/state).
//   - exchangeCode delegates to oauth2.getToken(code).
//   - revokeDriveToken delegates to oauth2.revokeToken AND is best-effort (no throw on reject).
//   - gdriveBackupDestination implements upload/list/download/delete/testConnection against drive.files.*.
//   - testConnection returns {ok:false,error:"not connected"} when no creds are stored.
//
// Mock strategy: `googleapis` is mocked so OAuth2 construction + drive.files.* inputs are observable.
// ../config.readSetting returns an "encrypted" blob; @/lib/crypto.decrypt returns JSON creds. No network.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Decrypted gdrive creds blob shape: { refreshToken }. */
const GDRIVE_CREDS = { refreshToken: "REFRESH-TOKEN-XYZ" };

const {
  generateAuthUrlMock,
  getTokenMock,
  setCredentialsMock,
  revokeTokenMock,
  filesCreateMock,
  filesListMock,
  filesGetMock,
  filesDeleteMock,
  oauth2CtorMock,
  driveFactoryMock,
  readSettingMock,
  decryptMock,
} = vi.hoisted(() => ({
  generateAuthUrlMock: vi.fn(),
  getTokenMock: vi.fn(),
  setCredentialsMock: vi.fn(),
  revokeTokenMock: vi.fn(),
  filesCreateMock: vi.fn(),
  filesListMock: vi.fn(),
  filesGetMock: vi.fn(),
  filesDeleteMock: vi.fn(),
  oauth2CtorMock: vi.fn(),
  driveFactoryMock: vi.fn(),
  readSettingMock: vi.fn(),
  decryptMock: vi.fn(),
}));

// Mock googleapis: google.auth.OAuth2 is a constructor returning a shared instance whose methods are
// observable; google.drive is a factory returning a shared { files } surface. generateAuthUrl builds
// a real URL carrying the passed options so tests can assert the consent-URL params.
vi.mock("googleapis", () => {
  const oauth2Instance = {
    generateAuthUrl: generateAuthUrlMock,
    getToken: getTokenMock,
    setCredentials: setCredentialsMock,
    revokeToken: revokeTokenMock,
  };
  const OAuth2 = vi.fn(function (this: typeof oauth2Instance) {
    oauth2CtorMock(...arguments);
    return oauth2Instance;
  });
  const driveInstance = {
    files: {
      create: filesCreateMock,
      list: filesListMock,
      get: filesGetMock,
      delete: filesDeleteMock,
    },
  };
  const drive = vi.fn(function () {
    driveFactoryMock(...arguments);
    return driveInstance;
  });
  return { google: { auth: { OAuth2: OAuth2 }, drive } };
});

vi.mock("../config", () => ({
  readSetting: (...a: unknown[]) => readSettingMock(...a),
  BACKUP_GDRIVE_CREDS_KEY: "backup.gdrive_creds",
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: (...a: unknown[]) => decryptMock(...a),
}));

/** Wire generateAuthUrl to emit a URL encoding the options (so the 4 consent params are visible). */
function wireConsentUrl(): void {
  generateAuthUrlMock.mockImplementation((opts: Record<string, unknown>) => {
    const scope = Array.isArray(opts.scope) ? opts.scope.join(" ") : String(opts.scope ?? "");
    const params = new URLSearchParams({
      access_type: String(opts.access_type ?? ""),
      prompt: String(opts.prompt ?? ""),
      scope,
      state: String(opts.state ?? ""),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  });
}

async function loadMod() {
  return (await import("../destinations/google-drive")) as typeof import("../destinations/google-drive");
}

describe("08-03 Task 1: Google Drive destination + OAuth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readSettingMock.mockResolvedValue("ENCRYPTED-BLOB");
    decryptMock.mockReturnValue(JSON.stringify(GDRIVE_CREDS));
    wireConsentUrl();
  });

  describe("buildConsentUrl(state)", () => {
    it("returns a URL carrying access_type=offline, prompt=consent, drive.file scope, and the state", async () => {
      const { buildConsentUrl } = await loadMod();
      const url = buildConsentUrl("CSRF-STATE-123");
      expect(url).toContain("access_type=offline");
      expect(url).toContain("prompt=consent");
      expect(url).toContain("scope=" + encodeURIComponent("https://www.googleapis.com/auth/drive.file"));
      expect(url).toContain("state=" + encodeURIComponent("CSRF-STATE-123"));
    });

    it("constructs the OAuth2 client from GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI env vars", async () => {
      const { buildConsentUrl } = await loadMod();
      buildConsentUrl("S");
      expect(oauth2CtorMock).toHaveBeenCalledTimes(1);
      expect(oauth2CtorMock.mock.calls[0]).toEqual([
        "g-client-id",
        "g-client-secret",
        "https://app.test/api/auth/google/callback",
      ]);
    });
  });

  describe("exchangeCode(code)", () => {
    it("calls oauth2.getToken(code) and returns the tokens object", async () => {
      const tokens = {
        refresh_token: "RT-1",
        access_token: "AT-1",
        expiry_date: 1,
        token_type: "Bearer",
      };
      getTokenMock.mockResolvedValue({ tokens });
      const { exchangeCode } = await loadMod();

      const out = await exchangeCode("AUTH-CODE");

      expect(getTokenMock).toHaveBeenCalledTimes(1);
      expect(getTokenMock.mock.calls[0][0]).toBe("AUTH-CODE");
      expect(out).toEqual(tokens);
    });
  });

  describe("revokeDriveToken(refreshToken)", () => {
    it("calls oauth2.revokeToken(refreshToken)", async () => {
      revokeTokenMock.mockResolvedValue({});
      const { revokeDriveToken } = await loadMod();

      await revokeDriveToken("RT-TO-REVOKE");

      expect(revokeTokenMock).toHaveBeenCalledTimes(1);
      expect(revokeTokenMock.mock.calls[0][0]).toBe("RT-TO-REVOKE");
    });

    it("does NOT throw when revokeToken rejects (best-effort — already-revoked is safe)", async () => {
      revokeTokenMock.mockRejectedValue(new Error("invalid_grant: token already revoked"));
      const { revokeDriveToken } = await loadMod();

      await expect(revokeDriveToken("RT-EXPIRED")).resolves.toBeUndefined();
      expect(revokeTokenMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("gdriveBackupDestination", () => {
    it("exports a BackupDestination whose readonly name === 'gdrive'", async () => {
      const { gdriveBackupDestination } = await loadMod();
      expect(gdriveBackupDestination.name).toBe("gdrive");
    });

    it("upload setCredentials({refresh_token}) + drive.files.create with a streaming body + key name", async () => {
      filesCreateMock.mockResolvedValue({ data: { id: "FILE-1" } });
      const { gdriveBackupDestination } = await loadMod();
      const buf = Buffer.from("DB-DUMP-BYTES");

      const res = await gdriveBackupDestination.upload(buf, "anydiscussion-20260729-0300.sqlc");

      // setCredentials received the decrypted refresh_token.
      expect(setCredentialsMock).toHaveBeenCalledWith({ refresh_token: "REFRESH-TOKEN-XYZ" });
      // drive factory was constructed with version v3 + the auth'd oauth2 client.
      expect(driveFactoryMock).toHaveBeenCalledTimes(1);
      expect(driveFactoryMock.mock.calls[0][0]).toMatchObject({ version: "v3" });
      // drive.files.create received the key as the file name + a stream body + octet-stream mime.
      expect(filesCreateMock).toHaveBeenCalledTimes(1);
      const arg = filesCreateMock.mock.calls[0][0] as Record<string, unknown>;
      const requestBody = arg.requestBody as Record<string, unknown>;
      const media = arg.media as Record<string, unknown>;
      expect(requestBody.name).toBe("anydiscussion-20260729-0300.sqlc");
      expect(media.mimeType).toBe("application/octet-stream");
      expect(media.body).toBeDefined();
      expect(res).toEqual({ key: "anydiscussion-20260729-0300.sqlc", sizeBytes: buf.length });
    });

    it("list returns file names from drive.files.list", async () => {
      filesListMock.mockResolvedValue({
        data: { files: [{ name: "anydiscussion-20260729-0300.sqlc" }, { name: "anydiscussion-20260730-0300.sqlc" }] },
      });
      const { gdriveBackupDestination } = await loadMod();

      const keys = await gdriveBackupDestination.list("anydiscussion-");

      expect(keys).toEqual(["anydiscussion-20260729-0300.sqlc", "anydiscussion-20260730-0300.sqlc"]);
      const arg = filesListMock.mock.calls[0][0] as Record<string, unknown>;
      // The q filter scopes by name-contains the prefix (avoids listing the user's whole Drive).
      expect(String(arg.q)).toContain("anydiscussion-");
    });

    it("download resolves fileId by name then drive.files.get alt:media → Buffer", async () => {
      filesListMock.mockResolvedValue({ data: { files: [{ id: "FID-9", name: "anydiscussion-20260729-0300.sqlc" }] } });
      const bytes = new Uint8Array([9, 8, 7, 6]);
      filesGetMock.mockResolvedValue({ data: Buffer.from(bytes) });
      const { gdriveBackupDestination } = await loadMod();

      const out = await gdriveBackupDestination.download("anydiscussion-20260729-0300.sqlc");

      expect(Buffer.isBuffer(out)).toBe(true);
      expect(out.equals(Buffer.from(bytes))).toBe(true);
      // get was called with alt:media + the resolved fileId.
      const getArg = filesGetMock.mock.calls[0][0] as Record<string, unknown>;
      expect(getArg.fileId).toBe("FID-9");
      expect(getArg.alt).toBe("media");
    });

    it("delete resolves fileId then drive.files.delete (idempotent on reject)", async () => {
      filesListMock.mockResolvedValue({ data: { files: [{ id: "FID-9", name: "k.sqlc" }] } });
      filesDeleteMock.mockResolvedValue({});
      const { gdriveBackupDestination } = await loadMod();

      await gdriveBackupDestination.delete("k.sqlc");

      expect(filesDeleteMock).toHaveBeenCalledTimes(1);
      expect((filesDeleteMock.mock.calls[0][0] as Record<string, unknown>).fileId).toBe("FID-9");
    });

    it("delete does NOT throw when the file is already gone", async () => {
      filesListMock.mockResolvedValue({ data: { files: [] } });
      const { gdriveBackupDestination } = await loadMod();

      await expect(gdriveBackupDestination.delete("missing.sqlc")).resolves.toBeUndefined();
      expect(filesDeleteMock).not.toHaveBeenCalled();
    });

    it("testConnection returns {ok:true} on a successful pageSize:1 list", async () => {
      filesListMock.mockResolvedValue({ data: { files: [] } });
      const { gdriveBackupDestination } = await loadMod();

      const res = await gdriveBackupDestination.testConnection();

      expect(res).toEqual({ ok: true });
      const arg = filesListMock.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.pageSize).toBe(1);
    });

    it("testConnection returns {ok:false,error} on throw — never throws", async () => {
      filesListMock.mockRejectedValue(new Error("invalid_grant"));
      const { gdriveBackupDestination } = await loadMod();

      const res = await gdriveBackupDestination.testConnection();

      expect(res.ok).toBe(false);
      expect(res.error).toContain("invalid_grant");
    });

    it("testConnection returns {ok:false} 'not connected' without calling drive when creds are absent", async () => {
      readSettingMock.mockResolvedValue(""); // no backup.gdrive_creds row
      const { gdriveBackupDestination } = await loadMod();

      const res = await gdriveBackupDestination.testConnection();

      expect(res).toEqual({ ok: false, error: expect.stringContaining("not connected") });
      expect(filesListMock).not.toHaveBeenCalled();
      expect(setCredentialsMock).not.toHaveBeenCalled();
    });
  });
});

describe("08-03 Task 1 scope gate: least-privilege drive.file (T-08-03c)", () => {
  it("google-drive.ts uses the drive.file scope URL and NOT the over-privileged full 'drive' scope", async () => {
    // Static source gate (T-08-03c): backups may only touch app-created files. The full
    // https://www.googleapis.com/auth/drive scope would grant access to the user's entire
    // Drive — reading the source from disk makes this a real structural assertion.
    const src = await readFile(join(__dirname, "..", "destinations", "google-drive.ts"), "utf8");

    // Strip comments so a doc comment explaining the anti-pattern does not false-positive.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    // The drive.file scope URL MUST appear in the source.
    expect(code).toContain("https://www.googleapis.com/auth/drive.file");
    // The over-privileged full-drive scope URL MUST NOT appear (boundary-aware: assert the
    // trailing scope path, not the drive.file URL itself).
    expect(code).not.toMatch(/https:\/\/www\.googleapis\.com\/auth\/drive(?!\.file)["' ]/);
  });
});
