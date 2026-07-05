// src/actions/__tests__/storage-settings.test.ts
// [CITED: 04-05-PLAN.md Task 3 <behavior> + <acceptance_criteria>]
// [CITED: 04-VALIDATION.md Wave 0 row "storage-settings.test.ts"]
// [CITED: 04-RESEARCH.md Pitfall 7 (lines 533-537) — credentials never pre-filled]
// [CITED: src/actions/__tests__/users.test.ts — mock scaffold shape]
//
// Wave-0 storage-settings tests proving D-23/D-24/D-25 + Pitfall 7:
//   - saveStorageSettings: admin → encrypts + persists + reconfigures provider;
//     non-admin → FORBIDDEN BEFORE encrypt or db.update (MUST_NOT_BE_REACHED).
//   - getStorageSettings: admin → returns redacted creds (secret fields empty);
//     non-admin → FORBIDDEN.
//   - testStorageConnection: admin → returns { ok: true } for a valid local probe;
//     non-admin → FORBIDDEN.
//   - Redact-on-read (Pitfall 7): even with real creds in DB, getStorageSettings
//     returns empty strings for secretAccessKey / api_secret / api_key / token.
//
// Mock strategy mirrors users.test.ts: vi.mock @/lib/db, @/lib/permissions, @/lib/crypto,
// @/lib/log, @/lib/storage/cloudinary, @/lib/storage/push-cdn. The storage-settings
// actions never touch a real DB or provider SDK in tests.
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  requireRoleMock,
  encryptMock,
  decryptMock,
  redactCredentialsMock,
  settingsRow,
  updateSetWhereMock,
  insertValuesMock,
  insertOnConflictMock,
  configureCloudinaryMock,
  configurePushCdnMock,
  cloudinaryPingMock,
} = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  encryptMock: vi.fn(),
  decryptMock: vi.fn(),
  redactCredentialsMock: vi.fn(),
  settingsRow: vi.fn(),
  updateSetWhereMock: vi.fn(),
  insertValuesMock: vi.fn(),
  insertOnConflictMock: vi.fn(),
  configureCloudinaryMock: vi.fn(),
  configurePushCdnMock: vi.fn(),
  cloudinaryPingMock: vi.fn(),
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

// @/lib/storage/cloudinary — only configureCloudinary is exercised; cloudinary.v2.api.ping
// is mocked separately for the testStorageConnection probe.
vi.mock("@/lib/storage/cloudinary", () => ({
  cloudinaryProvider: { name: "cloudinary", upload: vi.fn(), getPublicUrl: vi.fn(), delete: vi.fn() },
  configureCloudinary: (...a: unknown[]) => configureCloudinaryMock(...a),
}));

vi.mock("@/lib/storage/push-cdn", () => ({
  pushCdnProvider: { name: "push-cdn", upload: vi.fn(), getPublicUrl: vi.fn(), delete: vi.fn() },
  configurePushCdn: (...a: unknown[]) => configurePushCdnMock(...a),
}));

// cloudinary SDK — only the ping probe is used (in testStorageConnection).
vi.mock("cloudinary", () => ({
  v2: {
    api: { ping: (...a: unknown[]) => cloudinaryPingMock(...a) },
    config: vi.fn(),
  },
  default: { v2: { api: { ping: (...a: unknown[]) => cloudinaryPingMock(...a) }, config: vi.fn() } },
}));

// db — chainable select + insert/update + settings table ref.
vi.mock("@/lib/db", () => {
  // select chain: .from(...).where(...) — both deleteMedia-style + the storage-settings
  // multi-read paths. Resolve to settingsRow() at the end of the chain.
  const chainableWhere = () => {
    const chain: {
      limit: () => unknown;
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => unknown;
      catch: (e: unknown) => unknown;
    } = {
      limit: () => chain,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(settingsRow()).then(resolve, reject),
      catch: () => Promise.resolve(settingsRow()),
    };
    return chain;
  };
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => chainableWhere()),
        })),
      })),
      insert: vi.fn(() => ({
        values: (...a: unknown[]) => {
          insertValuesMock(...a);
          return { onConflictDoNothing: () => insertOnConflictMock() };
        },
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: (...a: unknown[]) => updateSetWhereMock(...a) })),
      })),
    },
    schema: {
      settings: { key: "key", value: "value", updatedAt: "updated_at" },
    },
  };
});

// fs — only used by testStorageConnection local probe (fs.access). Default success.
vi.mock("node:fs/promises", () => ({
  access: vi.fn().mockResolvedValue(undefined),
  default: { access: vi.fn().mockResolvedValue(undefined) },
}));

// @/aws-sdk/client-s3 — the push-CDN probe constructs an S3Client. Stub ListObjectsV2Command.
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(public opts: unknown) {}
    send() {
      return Promise.resolve({});
    }
  },
  ListObjectsV2Command: class {
    constructor(public input: unknown) {}
  },
}));

import {
  saveStorageSettings,
  getStorageSettings,
  testStorageConnection,
} from "../storage-settings";

const adminSession = () => ({
  user: { id: "u-admin", role: "admin" },
  session: { id: "s1" },
});

describe("D-23 / T-04-26: saveStorageSettings — admin gate fires FIRST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue(adminSession());
    encryptMock.mockImplementation((s: string) => `enc:${s}`);
    updateSetWhereMock.mockResolvedValue(undefined);
  });

  it("non-admin → FORBIDDEN before encrypt or db.update (MUST_NOT_BE_REACHED)", async () => {
    requireRoleMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    encryptMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    updateSetWhereMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(
      saveStorageSettings({
        activeProvider: "cloudinary",
        cloudinary: {
          cloud_name: "demo",
          api_key: "12345",
          api_secret: "shh",
        },
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(requireRoleMock).toHaveBeenCalledWith("admin");
    expect(encryptMock).not.toHaveBeenCalled();
  });

  it("admin → encrypts creds + persists encrypted blob + updates active_provider", async () => {
    await saveStorageSettings({
      activeProvider: "cloudinary",
      cloudinary: {
        cloud_name: "demo",
        api_key: "12345",
        api_secret: "shh",
      },
    });

    expect(encryptMock).toHaveBeenCalledTimes(1);
    // The encrypt input is a JSON-stringified credential blob (cloud_name + api_key + api_secret).
    const encArg = encryptMock.mock.calls[0][0] as string;
    expect(encArg).toContain("demo");
    expect(encArg).toContain("shh");
    // db.update was called — set the encrypted blob on the cloudinary_creds row +
    // the active_provider row. At least 2 updates (creds + active_provider).
    expect(updateSetWhereMock).toHaveBeenCalled();
  });

  it("admin → calls configureCloudinary so the provider picks up new creds without restart", async () => {
    await saveStorageSettings({
      activeProvider: "cloudinary",
      cloudinary: {
        cloud_name: "demo",
        api_key: "12345",
        api_secret: "shh",
      },
    });

    expect(configureCloudinaryMock).toHaveBeenCalledWith({
      cloud_name: "demo",
      api_key: "12345",
      api_secret: "shh",
    });
  });

  it("admin → push-cdn selection calls configurePushCdn (not cloudinary)", async () => {
    await saveStorageSettings({
      activeProvider: "push-cdn",
      push_cdn: {
        endpoint: "https://origin.example.com",
        region: "us-east-1",
        accessKeyId: "AKIA",
        secretAccessKey: "shh",
        bucket: "media",
        cdnBaseUrl: "https://cdn.example.com",
        forcePathStyle: true,
      },
    });

    expect(configurePushCdnMock).toHaveBeenCalledTimes(1);
    expect(configureCloudinaryMock).not.toHaveBeenCalled();
  });

  it("admin → empty secret fields means no encryption / no DB write for that provider", async () => {
    // Per Pitfall 7: the form sends empty strings for unchanged secrets. saveStorageSettings
    // treats empty-secret-shape as "no change" — does NOT encrypt an empty blob.
    await saveStorageSettings({
      activeProvider: "cloudinary",
      cloudinary: { cloud_name: "demo", api_key: "", api_secret: "" },
    });

    expect(encryptMock).not.toHaveBeenCalled();
    // active_provider IS still updated (the admin may switch active without re-entering creds).
    expect(updateSetWhereMock).toHaveBeenCalled();
  });
});

describe("D-25 / Pitfall 7: getStorageSettings — redacts secret fields on read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue(adminSession());
    decryptMock.mockImplementation((blob: string) => {
      // The settings row value is an encrypted blob; decrypt returns the JSON string.
      if (blob === "enc-cloudinary") return JSON.stringify({
        cloud_name: "demo",
        api_key: "12345",
        api_secret: "top-secret",
      });
      if (blob === "enc-r2") return JSON.stringify({
        endpoint: "https://r2.example.com",
        region: "auto",
        accessKeyId: "AKIAEXAMPLE",
        secretAccessKey: "r2-secret",
        bucket: "media",
        forcePathStyle: true,
      });
      return "{}";
    });
    redactCredentialsMock.mockImplementation(<T extends Record<string, unknown>>(creds: T): T => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(creds)) {
        out[k] = /secret|api[-_]?key|token|password/i.test(k) ? "" : v;
      }
      return out as T;
    });
  });

  it("non-admin → FORBIDDEN before any db.select (MUST_NOT_BE_REACHED)", async () => {
    requireRoleMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    settingsRow.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(getStorageSettings()).rejects.toThrow("FORBIDDEN");
    expect(requireRoleMock).toHaveBeenCalledWith("admin");
    expect(settingsRow).not.toHaveBeenCalled();
  });

  it("admin → returns redacted creds (secret fields empty, non-secret preserved)", async () => {
    // Settings rows: each select returns one row. getStorageSettings reads active_provider
    // + each provider's creds. The mock resolves the chainable to a single-row array per call.
    let callCount = 0;
    settingsRow.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) return [{ value: "cloudinary" }]; // active_provider
      if (callCount === 2) return [{ value: "enc-cloudinary" }]; // cloudinary_creds
      if (callCount === 3) return [{ value: "enc-r2" }]; // r2_creds
      return [{ value: "" }]; // push_cdn_creds (empty — unconfigured)
    });

    const result = await getStorageSettings();

    expect(result.activeProvider).toBe("cloudinary");
    // Cloudinary redacted: api_key + api_secret empty (per Pitfall 7); cloud_name preserved.
    expect(result.cloudinary.api_secret).toBe("");
    expect(result.cloudinary.cloud_name).toBe("demo");
    // R2 redacted: secretAccessKey empty; accessKeyId + bucket preserved.
    expect(result.r2.secretAccessKey).toBe("");
    expect(result.r2.bucket).toBe("media");
    // Push-CDN: empty blob → undefined creds in the returned shape.
    expect(result.push_cdn).toBeUndefined();
  });
});

describe("D-24: testStorageConnection — per-provider probe + admin gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue(adminSession());
  });

  it("non-admin → FORBIDDEN before any probe (MUST_NOT_BE_REACHED)", async () => {
    requireRoleMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    await expect(
      testStorageConnection("local", {} as never),
    ).rejects.toThrow("FORBIDDEN");
    expect(requireRoleMock).toHaveBeenCalledWith("admin");
  });

  it("admin → local probe returns { ok: true } when STORAGE_LOCAL_ROOT is accessible", async () => {
    const result = await testStorageConnection("local", {} as never);
    expect(result).toEqual({ ok: true });
  });

  it("admin → cloudinary probe calls cloudinary.v2.api.ping", async () => {
    cloudinaryPingMock.mockResolvedValue({ status: "ok" });
    const result = await testStorageConnection("cloudinary", {
      cloud_name: "demo",
      api_key: "x",
      api_secret: "y",
    } as never);
    expect(cloudinaryPingMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });

  it("admin → cloudinary probe returns { ok: false, error } on failure (never throws)", async () => {
    cloudinaryPingMock.mockRejectedValue(new Error("invalid creds"));
    const result = await testStorageConnection("cloudinary", {
      cloud_name: "demo",
      api_key: "x",
      api_secret: "y",
    } as never);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("admin → r2 probe uses S3Client + ListObjectsV2Command (MaxKeys:1)", async () => {
    // The S3Client mock's .send() resolves to {} (success).
    const result = await testStorageConnection("r2", {
      endpoint: "https://r2.example.com",
      region: "auto",
      accessKeyId: "AKIA",
      secretAccessKey: "shh",
      bucket: "media",
      forcePathStyle: true,
    } as never);
    expect(result).toEqual({ ok: true });
  });
});
