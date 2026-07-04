// src/lib/storage/__tests__/registry.test.ts
// [CITED: VALIDATION.md Wave 0 row "MEDIA-01/04 — provider registry resolves active provider"]
// [CITED: 03-03-PLAN.md Task 1 <behavior> + <acceptance_criteria>]
// [CITED: PATTERNS.md row — clone transitions.test.ts mock shape]
//
// Wave-0 registry + provider tests proving:
//   - MEDIA-01/04: getActiveProvider reads settings.storage.active_provider and
//     returns the local (default) or r2 singleton; unknown values fall back to local
//     (default-safe — proven by test).
//   - registerStorageProvider adds to the provider map (Phase-4 DASH-09 hook).
//   - seedStorageSettings is idempotent (onConflictDoNothing — call twice, no throw).
//   - D-09: r2Provider.upload delegates to uploadImageVariants from @/lib/r2 (thin wrapper).
//   - Pitfall #4: localProvider writes to LOCAL_ROOT via fs.writeFile (NOT public/).
//   - T-03-13: localProvider rejects baseKey containing ".." (path-traversal mitigation).
//
// Mock strategy: the provider modules (./local, ./r2) are NOT mocked — they are the
// SUT for the provider-behavior tests. We mock their DEPENDENCIES: @/lib/r2 (the
// uploadImageVariants spy + s3Client stub), sharp (chainable), node:fs/promises
// (mkdir/writeFile/unlink spies). For registry selection tests we control the db
// settings row and assert reference equality with the real provider singletons.
import { describe, it, expect, beforeEach, vi } from "vitest";

// --- Mocks (vi.hoisted so spies exist when vi.mock factories run) ---
const {
  settingsRow,
  insertValuesMock,
  insertOnConflictMock,
  uploadImageVariantsMock,
  s3SendMock,
  sharpBufferMock,
  fsMkdirMock,
  fsWriteFileMock,
  fsUnlinkMock,
} = vi.hoisted(() => ({
  settingsRow: vi.fn(),
  insertValuesMock: vi.fn(),
  insertOnConflictMock: vi.fn(),
  uploadImageVariantsMock: vi.fn(),
  s3SendMock: vi.fn(),
  sharpBufferMock: vi.fn(),
  fsMkdirMock: vi.fn(),
  fsWriteFileMock: vi.fn(),
  fsUnlinkMock: vi.fn(),
}));

// @/lib/db — chainable select/from/where/limit + insert/values/onConflictDoNothing.
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: () => settingsRow() })),
        limit: () => settingsRow(),
      })),
    })),
    insert: vi.fn(() => ({
      values: (...a: unknown[]) => {
        insertValuesMock(...a);
        return { onConflictDoNothing: () => insertOnConflictMock() };
      },
    })),
  },
  // schema.settings.key is referenced by eq(schema.settings.key, ...) — a plain
  // object ref is fine because eq() just reads the column symbol.
  schema: { settings: { key: "key", value: "value" } },
}));

// @/lib/r2 — uploadImageVariants spy + s3Client stub (r2.ts wraps these unchanged — D-09).
vi.mock("@/lib/r2", () => ({
  uploadImageVariants: (...a: unknown[]) => uploadImageVariantsMock(...a),
  s3Client: { send: (...a: unknown[]) => s3SendMock(...a) },
}));

// sharp — chainable mock: sharp(buffer).resize(...).webp(...).toBuffer({resolveWithObject:true})
vi.mock("sharp", () => {
  const chain = {
    resize: vi.fn(() => chain),
    webp: vi.fn(() => chain),
    toBuffer: (opts?: unknown) => sharpBufferMock(opts),
  };
  const sharpFn = vi.fn(() => chain);
  // Default mock return: a 640x480 webp buffer (overridden per-test).
  sharpBufferMock.mockResolvedValue({
    data: Buffer.from("mock-webp"),
    info: { width: 640, height: 480, format: "webp", size: 1024 },
  });
  return { default: sharpFn };
});

// node:fs/promises — spies on mkdir/writeFile/unlink.
vi.mock("node:fs/promises", () => ({
  mkdir: (...a: unknown[]) => fsMkdirMock(...a),
  writeFile: (...a: unknown[]) => fsWriteFileMock(...a),
  unlink: (...a: unknown[]) => fsUnlinkMock(...a),
  // default constants for import compat
  default: {
    mkdir: (...a: unknown[]) => fsMkdirMock(...a),
    writeFile: (...a: unknown[]) => fsWriteFileMock(...a),
    unlink: (...a: unknown[]) => fsUnlinkMock(...a),
  },
}));

import { getActiveProvider, registerStorageProvider } from "../registry";
import { localProvider } from "../local";
import { r2Provider } from "../r2";
import { seedStorageSettings } from "../seed";

describe("MEDIA-01/04 / D-09: getActiveProvider — settings-driven provider selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns localProvider when settings row is missing (default = local)", async () => {
    settingsRow.mockResolvedValue([]); // no row → default
    const provider = await getActiveProvider();
    expect(provider).toBe(localProvider);
    expect(provider.name).toBe("local");
  });

  it("returns localProvider when settings.storage.active_provider = 'local'", async () => {
    settingsRow.mockResolvedValue([{ value: "local" }]);
    const provider = await getActiveProvider();
    expect(provider).toBe(localProvider);
  });

  it("returns r2Provider when settings.storage.active_provider = 'r2'", async () => {
    settingsRow.mockResolvedValue([{ value: "r2" }]);
    const provider = await getActiveProvider();
    expect(provider).toBe(r2Provider);
    expect(provider.name).toBe("r2");
  });

  it("falls back to localProvider for unknown values (default-safe)", async () => {
    settingsRow.mockResolvedValue([{ value: "cloudinary" }]); // not registered
    const provider = await getActiveProvider();
    expect(provider).toBe(localProvider);
  });
});

describe("DASH-09 hook: registerStorageProvider adds to the provider map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsRow.mockResolvedValue([]);
  });

  it("registerStorageProvider(name, provider) makes getActiveProvider return it", async () => {
    const custom = { name: "cloudinary", upload: vi.fn(), getPublicUrl: vi.fn(), delete: vi.fn() };
    registerStorageProvider("cloudinary", custom as never);
    settingsRow.mockResolvedValue([{ value: "cloudinary" }]);
    const provider = await getActiveProvider();
    expect(provider).toBe(custom);
  });
});

describe("seed.ts: seedStorageSettings is idempotent (D-14/D-09/D-10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertOnConflictMock.mockResolvedValue(undefined);
  });

  it("inserts 3 settings rows with onConflictDoNothing — calling twice does not throw", async () => {
    await seedStorageSettings();
    await seedStorageSettings();
    expect(insertValuesMock).toHaveBeenCalledTimes(2);
    expect(insertOnConflictMock).toHaveBeenCalledTimes(2);
  });

  it("the values array carries storage.active_provider + site.timezone + site.feature_image_default", async () => {
    await seedStorageSettings();
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ key: "storage.active_provider", value: "local" }),
        expect.objectContaining({ key: "site.timezone", value: "Asia/Dhaka" }),
        expect.objectContaining({ key: "site.feature_image_default", value: "" }),
      ]),
    );
  });
});

describe("D-09: r2Provider wraps uploadImageVariants unchanged (thin adapter)", () => {
  const buffer = Buffer.from("fake-png");
  const baseKey = "media/2026/07/abc-uuid";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("image mime delegates to uploadImageVariants and returns {variants:[3], primary:{key,width,height}}", async () => {
    const fakeVariants = [
      { key: `${baseKey}-sm.webp`, width: 640, height: 480, format: "webp", sizeBytes: 100 },
      { key: `${baseKey}-md.webp`, width: 1024, height: 768, format: "webp", sizeBytes: 200 },
      { key: `${baseKey}-lg.webp`, width: 1920, height: 1080, format: "webp", sizeBytes: 300 },
    ];
    uploadImageVariantsMock.mockResolvedValue(fakeVariants);

    const result = await r2Provider.upload(buffer, baseKey, "image/png");

    expect(uploadImageVariantsMock).toHaveBeenCalledWith(buffer, baseKey);
    expect(result.variants).toHaveLength(3);
    // primary = md variant (index 1).
    expect(result.primary.key).toBe(`${baseKey}-md.webp`);
    expect(result.primary.width).toBe(1024);
    expect(result.primary.height).toBe(768);
    expect(result.primary.sizeBytes).toBe(200);
  });

  it("non-image mime stores as-is via PutObjectCommand (no sharp variants)", async () => {
    s3SendMock.mockResolvedValue({});
    const result = await r2Provider.upload(buffer, baseKey, "application/pdf");
    expect(uploadImageVariantsMock).not.toHaveBeenCalled();
    expect(s3SendMock).toHaveBeenCalledTimes(1);
    expect(result.variants).toEqual([]);
    expect(result.primary.key).toBe(baseKey);
    expect(result.primary.sizeBytes).toBe(buffer.length);
  });

  it("getPublicUrl returns an absolute CDN URL (passes through cdnImageLoader)", () => {
    const url = r2Provider.getPublicUrl("media/x-md.webp");
    expect(/^https?:\/\//.test(url)).toBe(true);
    expect(url).toContain("/media/x-md.webp");
  });
});

describe("Pitfall #4: localProvider writes to LOCAL_ROOT via fs (NOT public/)", () => {
  const buffer = Buffer.from("fake-png");
  const baseKey = "media/2026/07/abc-uuid";

  beforeEach(() => {
    vi.clearAllMocks();
    fsMkdirMock.mockResolvedValue(undefined);
    fsWriteFileMock.mockResolvedValue(undefined);
    sharpBufferMock.mockResolvedValue({
      data: Buffer.from("mock-webp"),
      info: { width: 640, height: 480, format: "webp", size: 1024 },
    });
  });

  it("image mime writes 3 webp variants to LOCAL_ROOT via fs.writeFile", async () => {
    const result = await localProvider.upload(buffer, baseKey, "image/png");

    expect(sharpBufferMock).toHaveBeenCalledTimes(3); // sm + md + lg
    expect(fsMkdirMock).toHaveBeenCalledTimes(3);
    expect(fsWriteFileMock).toHaveBeenCalledTimes(3);
    // No writeFile path may include /public/ (Pitfall #4).
    for (const call of fsWriteFileMock.mock.calls) {
      const dest = String(call[0]);
      expect(dest).not.toMatch(/\/public\/|\\public\\/);
    }
    expect(result.variants).toHaveLength(3);
    expect(result.variants[0].key).toBe(`${baseKey}-sm.webp`);
    expect(result.variants[1].key).toBe(`${baseKey}-md.webp`);
    expect(result.variants[2].key).toBe(`${baseKey}-lg.webp`);
    // primary = md variant.
    expect(result.primary.key).toBe(`${baseKey}-md.webp`);
  });

  it("non-image mime stores buffer as-is at LOCAL_ROOT/${baseKey} (D-07)", async () => {
    const result = await localProvider.upload(buffer, baseKey, "application/pdf");

    expect(sharpBufferMock).not.toHaveBeenCalled();
    expect(fsWriteFileMock).toHaveBeenCalledTimes(1);
    // path.join normalizes OS-native separators (\ on Windows); compare normalized.
    const dest = String(fsWriteFileMock.mock.calls[0][0]).replace(/\\/g, "/");
    expect(dest).toContain(baseKey);
    expect(result.variants).toEqual([]);
    expect(result.primary.key).toBe(baseKey);
  });

  it("getPublicUrl returns /api/media/${key} (relative → app origin via cdnImageLoader)", () => {
    const url = localProvider.getPublicUrl("media/2026/07/abc-md.webp");
    expect(url).toBe("/api/media/media/2026/07/abc-md.webp");
    expect(url.startsWith("/api/media/")).toBe(true);
  });

  it("rejects baseKey containing '..' (T-03-13 path-traversal mitigation)", async () => {
    await expect(
      localProvider.upload(buffer, "../etc/passwd", "image/png"),
    ).rejects.toThrow("INVALID_KEY");
  });

  it("delete calls fs.unlink (idempotent — ignores not-found)", async () => {
    fsUnlinkMock.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    await expect(localProvider.delete("media/x.webp")).resolves.toBeUndefined();
    expect(fsUnlinkMock).toHaveBeenCalledTimes(1);
  });
});
