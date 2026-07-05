// src/actions/__tests__/media.test.ts
// [CITED: VALIDATION.md Wave 0 row "MEDIA-02 — media upload writes provider + key + alt + dimensions"]
// [CITED: 03-03-PLAN.md Task 2 <behavior> + <acceptance_criteria>]
// [CITED: PATTERNS.md row — clone src/actions/__tests__/users.test.ts mock shape]
//
// Wave-0 media action tests proving:
//   - T-03-01 / Pitfall #1: uploadMedia calls requireCan({media:["upload"]}) BEFORE
//     getActiveProvider (proven structurally by mocking getActiveProvider to throw
//     "MUST_NOT_BE_REACHED" — if the permission check ordering is wrong, this fires).
//   - T-03-12 / D-08: uploadMedia rejects files > MEDIA_MAX_SIZE_BYTES (10MB) with
//     "FILE_TOO_LARGE" BEFORE provider.upload is called.
//   - MEDIA-02: uploadMedia db.insert writes provider + providerKey + altText +
//     uploadedBy + mimeType + width + height + sizeBytes.
//   - D-07: non-image mime (application/pdf) stores as-is — provider.upload returns
//     variants:[] and the media record has width/height undefined (null in DB).
//   - D-06: upload is server-mediated — client → Server Action → sharp variants → provider.
//   - T-03-14: no presigned-direct path (all flow via provider.upload).
//   - listMedia requires media:read capability (dashboard-only).
//   - deleteMedia requires media:delete, calls provider.delete, then soft-deletes (D-08).
//   - T-03-13: baseKey is server-generated (crypto.randomUUID) — NEVER user-supplied.
//
// Mock strategy mirrors users.test.ts: vi.hoisted + vi.mock the server-only deps
// (@/lib/db, @/lib/permissions, @/lib/storage/registry, @/lib/log, ./media-schema,
// @/lib/auth). The provider returned by getActiveProvider is a controllable stub.
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  requireCanMock,
  getActiveProviderMock,
  getProviderByNameMock,
  providerUploadMock,
  providerGetPublicUrlMock,
  providerDeleteMock,
  r2ProviderDeleteMock,
  cloudinaryProviderDeleteMock,
  insertReturningMock,
  selectMediaMock,
  updateMediaMock,
} = vi.hoisted(() => ({
  requireCanMock: vi.fn(),
  getActiveProviderMock: vi.fn(),
  getProviderByNameMock: vi.fn(),
  providerUploadMock: vi.fn(),
  providerGetPublicUrlMock: vi.fn(),
  providerDeleteMock: vi.fn(),
  r2ProviderDeleteMock: vi.fn(),
  cloudinaryProviderDeleteMock: vi.fn(),
  insertReturningMock: vi.fn(),
  selectMediaMock: vi.fn(),
  updateMediaMock: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  requireCan: (...a: unknown[]) => requireCanMock(...a),
}));

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

// ./media-schema — the Zod schema + MEDIA_MAX_SIZE_BYTES constant.
// mediaUploadSchema.parse returns the input shape; MEDIA_MAX_SIZE_BYTES = 10MB.
vi.mock("../media-schema", () => ({
  mediaUploadSchema: {
    parse: (input: { file: File; altText?: string }) => input,
  },
  MEDIA_MAX_SIZE_BYTES: 10 * 1024 * 1024,
  mediaListSchema: {
    parse: (input: unknown) =>
      input ?? { limit: 20, offset: 0, mimeType: undefined },
  },
}));

// @/lib/storage/registry — getActiveProvider + getProviderByName return controllable
// provider stubs. Plan 04-05 Pitfall 0 fix: deleteMedia routes via getProviderByName
// (sync) — the mock selects the right stub based on the row.provider arg.
vi.mock("@/lib/storage/registry", () => ({
  getActiveProvider: (...a: unknown[]) => getActiveProviderMock(...a),
  getProviderByName: (...a: unknown[]) => getProviderByNameMock(...a),
}));

// The provider stub — the upload/getPublicUrl/delete spies.
const providerStub = {
  name: "local" as const,
  upload: (...a: unknown[]) => providerUploadMock(...a),
  getPublicUrl: (...a: unknown[]) => providerGetPublicUrlMock(...a),
  delete: (...a: unknown[]) => providerDeleteMock(...a),
};

// Pitfall 0 test stubs — distinct r2 + cloudinary providers so the multi-provider
// delete case can prove that deleteMedia routes via the ROW's stored provider
// (r2Provider.delete called) and NOT the active provider (cloudinaryProvider.delete
// NOT called) when row.provider="r2" but active="cloudinary".
const r2ProviderStub = {
  name: "r2" as const,
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  delete: (...a: unknown[]) => r2ProviderDeleteMock(...a),
};
const cloudinaryProviderStub = {
  name: "cloudinary" as const,
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  delete: (...a: unknown[]) => cloudinaryProviderDeleteMock(...a),
};

// @/lib/db — chainable select/from/where/orderBy/limit/offset + insert/values/returning
// + update/set/where. Mirrors the Drizzle query builder shape used by media.ts.
vi.mock("@/lib/db", () => {
  // The select chain terminal — returns the controlled array. Supports both
  // .where(...).limit(...) (deleteMedia fetch) and .where(...).orderBy(...).limit(...).offset(...)
  // (listMedia) by short-circuiting every step after .from() to a chainable that
  // ultimately resolves to selectMediaMock().
  const chainableWhere = () => {
    // Every chainable step returns the chain itself (infinitely composable), and
    // the chain IS thenable — resolving to selectMediaMock(). This supports
    // .where(...).limit(1) (deleteMedia), .where(...).orderBy(...).limit(...).offset(...)
    // (listMedia), and any partial chain the action may build.
    const chain: {
      orderBy: (...a: unknown[]) => unknown;
      limit: (...a: unknown[]) => unknown;
      offset: (...a: unknown[]) => unknown;
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => unknown;
      catch: (reject: (e: unknown) => unknown) => unknown;
    } = {
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(selectMediaMock()).then(resolve, reject),
      catch: (reject: (e: unknown) => unknown) =>
        Promise.resolve(selectMediaMock()).catch(reject),
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
        values: vi.fn(() => ({ returning: () => insertReturningMock() })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: () => updateMediaMock() })),
      })),
    },
    schema: {
      media: {
        id: "id",
        providerKey: "provider_key",
        provider: "provider",
        altText: "alt_text",
        uploadedBy: "uploaded_by",
        mimeType: "mime_type",
        width: "width",
        height: "height",
        sizeBytes: "size_bytes",
        deletedAt: "deleted_at",
        createdAt: "created_at",
      },
      // posts schema mock — findMediaReferences selects from posts.
      posts: {
        id: "id",
        title: "title",
        body: "body",
        featureImage: "feature_image",
      },
    },
  };
});

import { uploadMedia, listMedia, deleteMedia, findMediaReferences } from "../media";

const adminSession = () => ({
  user: { id: "u-admin", role: "admin" },
  session: { id: "s1" },
});

function makeFile(opts?: {
  size?: number;
  type?: string;
  name?: string;
}): File {
  const size = opts?.size ?? 1024;
  const type = opts?.type ?? "image/png";
  const name = opts?.name ?? "test.png";
  // File constructor — the blob body is a buffer of `size` bytes (allocUnsafe for speed).
  const buf = Buffer.alloc(size, 0);
  return new File([buf], name, { type });
}

describe("T-03-01 / Pitfall #1: uploadMedia calls requireCan BEFORE getActiveProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue(adminSession());
    getActiveProviderMock.mockResolvedValue(providerStub);
    providerUploadMock.mockResolvedValue({
      variants: [{ key: "k-sm.webp", width: 640, height: 480, format: "webp", sizeBytes: 100 }],
      primary: { key: "media/2026/07/uuid-md.webp", width: 1024, height: 768, sizeBytes: 200 },
    });
    providerGetPublicUrlMock.mockReturnValue("/api/media/media/2026/07/uuid-md.webp");
    insertReturningMock.mockResolvedValue([{ id: 1 }]);
  });

  it("throws FORBIDDEN before getActiveProvider when requireCan denies (MUST_NOT_BE_REACHED)", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    getActiveProviderMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(
      uploadMedia({ file: makeFile(), altText: "alt" }),
    ).rejects.toThrow("FORBIDDEN");
    expect(getActiveProviderMock).not.toHaveBeenCalled();
    expect(requireCanMock).toHaveBeenCalledWith({ media: ["upload"] });
  });
});

describe("T-03-12 / D-08: uploadMedia rejects files > 10MB BEFORE provider.upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue(adminSession());
    getActiveProviderMock.mockResolvedValue(providerStub);
    providerUploadMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
  });

  it("throws FILE_TOO_LARGE for an 11MB file and never reaches provider.upload", async () => {
    const elevenMb = 11 * 1024 * 1024;
    await expect(
      uploadMedia({ file: makeFile({ size: elevenMb }), altText: "big" }),
    ).rejects.toThrow("FILE_TOO_LARGE");
    expect(providerUploadMock).not.toHaveBeenCalled();
  });

  it("allows a 10MB file (boundary — exactly MEDIA_MAX_SIZE_BYTES)", async () => {
    providerUploadMock.mockResolvedValue({
      variants: [],
      primary: { key: "media/x", sizeBytes: 10 * 1024 * 1024 },
    });
    insertReturningMock.mockResolvedValue([{ id: 7 }]);
    providerGetPublicUrlMock.mockReturnValue("/api/media/media/x");
    const tenMb = 10 * 1024 * 1024;
    await expect(
      uploadMedia({ file: makeFile({ size: tenMb }), altText: "boundary" }),
    ).resolves.toBeDefined();
    expect(providerUploadMock).toHaveBeenCalledTimes(1);
  });
});

describe("MEDIA-02 / D-06: uploadMedia writes the correct media record (server-mediated)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue(adminSession());
    getActiveProviderMock.mockResolvedValue(providerStub);
    providerUploadMock.mockResolvedValue({
      variants: [
        { key: "k-sm.webp", width: 640, height: 480, format: "webp", sizeBytes: 100 },
        { key: "k-md.webp", width: 1024, height: 768, format: "webp", sizeBytes: 200 },
        { key: "k-lg.webp", width: 1920, height: 1080, format: "webp", sizeBytes: 300 },
      ],
      primary: { key: "media/2026/07/uuid-md.webp", width: 1024, height: 768, sizeBytes: 200 },
    });
    providerGetPublicUrlMock.mockReturnValue("/api/media/media/2026/07/uuid-md.webp");
    insertReturningMock.mockResolvedValue([{ id: 42 }]);
  });

  it("db.insert receives provider='local' + providerKey + altText + uploadedBy + mimeType + width + height + sizeBytes", async () => {
    const { db } = await import("@/lib/db");
    const file = makeFile({ type: "image/png", size: 2048 });
    await uploadMedia({ file, altText: "a sunset" });

    expect(providerUploadMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringMatching(/^media\/\d{4}\/\d{2}\/[a-f0-9-]+$/), // baseKey = media/YYYY/MM/uuid
      "image/png",
    );
    const insertValuesCall = (db.insert as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value?.values ?? (db.insert as ReturnType<typeof vi.fn>).mock.calls;
    // The db.insert(schema.media).values(...) was called once with the full record.
    expect(db.insert).toHaveBeenCalledTimes(1);
    // Verify the values() spy received the MEDIA-02 schema fields.
    const valuesSpy = (db.insert as ReturnType<typeof vi.fn>).mock.results[0].value.values;
    expect(valuesSpy).toHaveBeenCalledTimes(1);
    const record = valuesSpy.mock.calls[0][0];
    expect(record).toEqual(
      expect.objectContaining({
        provider: "local",
        providerKey: "media/2026/07/uuid-md.webp",
        altText: "a sunset",
        uploadedBy: "u-admin",
        mimeType: "image/png",
        width: 1024,
        height: 768,
        sizeBytes: 200,
      }),
    );
  });

  it("returns { id, providerKey, publicUrl } from the upload", async () => {
    const result = await uploadMedia({ file: makeFile(), altText: "x" });
    expect(result).toEqual(
      expect.objectContaining({
        id: 42,
        providerKey: "media/2026/07/uuid-md.webp",
        publicUrl: "/api/media/media/2026/07/uuid-md.webp",
      }),
    );
  });

  it("baseKey is server-generated — crypto.randomUUID pattern, NOT the user filename", async () => {
    const file = makeFile({ name: "INSECURE-FROM-CLIENT.exe.png", size: 1024 });
    await uploadMedia({ file, altText: "x" });
    const baseKeyArg = providerUploadMock.mock.calls[0][1];
    // baseKey must be media/YYYY/MM/<uuid> — the user's filename must NOT appear.
    expect(baseKeyArg).not.toContain("INSECURE");
    expect(baseKeyArg).not.toContain(".exe");
    expect(baseKeyArg).toMatch(/^media\/\d{4}\/\d{2}\/[a-f0-9-]+$/);
  });
});

describe("D-07: non-image mime stores as-is (no sharp variants)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue(adminSession());
    getActiveProviderMock.mockResolvedValue(providerStub);
    providerUploadMock.mockResolvedValue({
      variants: [],
      primary: { key: "media/2026/07/uuid", sizeBytes: 5120 },
    });
    providerGetPublicUrlMock.mockReturnValue("/api/media/media/2026/07/uuid");
    insertReturningMock.mockResolvedValue([{ id: 9 }]);
  });

  it("application/pdf produces variants:[] and width/height undefined in the record", async () => {
    const { db } = await import("@/lib/db");
    const file = makeFile({ type: "application/pdf", size: 5120, name: "doc.pdf" });
    await uploadMedia({ file, altText: "pdf doc" });

    const valuesSpy = (db.insert as ReturnType<typeof vi.fn>).mock.results[0].value.values;
    const record = valuesSpy.mock.calls[0][0];
    expect(record.mimeType).toBe("application/pdf");
    // Non-image → primary has no width/height; media.ts writes `primary.width ?? null`.
    expect(record.width).toBeNull();
    expect(record.height).toBeNull();
    expect(record.sizeBytes).toBe(5120);
  });
});

describe("listMedia: requires media:read capability (dashboard-only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectMediaMock.mockResolvedValue([]);
  });

  it("throws FORBIDDEN before db.select when requireCan denies", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    selectMediaMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(listMedia({})).rejects.toThrow("FORBIDDEN");
    expect(requireCanMock).toHaveBeenCalledWith({ media: ["read"] });
  });

  it("returns media rows when authorized", async () => {
    requireCanMock.mockResolvedValue(adminSession());
    selectMediaMock.mockResolvedValue([{ id: 1, providerKey: "k" }]);
    const rows = await listMedia({ limit: 10, offset: 0 });
    expect(rows).toEqual([{ id: 1, providerKey: "k" }]);
  });
});

describe("deleteMedia: requires media:delete + provider.delete + soft-delete (D-08)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue(adminSession());
    getActiveProviderMock.mockResolvedValue(providerStub);
    // Plan 04-05 Pitfall 0: deleteMedia now routes via getProviderByName (sync).
    // Default mock returns the local providerStub — keeps the existing tests working.
    getProviderByNameMock.mockReturnValue(providerStub);
    providerDeleteMock.mockResolvedValue(undefined);
    updateMediaMock.mockResolvedValue(undefined);
  });

  it("throws FORBIDDEN before provider.delete when requireCan denies", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    providerDeleteMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(deleteMedia(1)).rejects.toThrow("FORBIDDEN");
    expect(requireCanMock).toHaveBeenCalledWith({ media: ["delete"] });
  });

  it("fetches the media row, calls provider.delete(providerKey), then sets deletedAt", async () => {
    selectMediaMock.mockResolvedValue([
      { id: 5, providerKey: "media/x-md.webp", provider: "local" },
    ]);
    await deleteMedia(5);

    expect(providerDeleteMock).toHaveBeenCalledWith("media/x-md.webp");
    expect(updateMediaMock).toHaveBeenCalledTimes(1);
    // The update was called with a deletedAt set (soft-delete — D-08, NOT a hard delete).
    const { db } = await import("@/lib/db");
    const updateSetSpy = (db.update as ReturnType<typeof vi.fn>).mock.results[0].value.set;
    const setArg = updateSetSpy.mock.calls[0][0];
    expect(setArg.deletedAt).toBeInstanceOf(Date);
  });
});

describe("Pitfall 0 (Plan 04-05): deleteMedia routes via the ROW's stored provider, NOT the active provider", () => {
  // The bug: deleteMedia originally called getActiveProvider() — so a row stored under
  // provider="r2" would be deleted via whatever the active provider is now (e.g.
  // cloudinary), silently no-oping and leaking the R2 object. The fix: route via
  // getProviderByName(row.provider) — proven by this case.
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue(adminSession());
    // Active provider = cloudinary (the WRONG provider for a row stored under r2).
    getActiveProviderMock.mockResolvedValue(cloudinaryProviderStub);
    // getProviderByName routes by the arg name — return the r2 stub when "r2" is passed.
    getProviderByNameMock.mockImplementation((name: string | null | undefined) => {
      if (name === "r2") return r2ProviderStub;
      if (name === "cloudinary") return cloudinaryProviderStub;
      return providerStub; // default = local
    });
    r2ProviderDeleteMock.mockResolvedValue(undefined);
    cloudinaryProviderDeleteMock.mockResolvedValue(undefined);
    updateMediaMock.mockResolvedValue(undefined);
  });

  it("row.provider='r2' is deleted via r2Provider (NOT cloudinaryProvider) when active='cloudinary'", async () => {
    selectMediaMock.mockResolvedValue([
      { id: 7, providerKey: "media/r2-object-md.webp", provider: "r2" },
    ]);
    await deleteMedia(7);

    // r2Provider.delete was called with the row's providerKey — correct routing.
    expect(r2ProviderDeleteMock).toHaveBeenCalledWith("media/r2-object-md.webp");
    // cloudinaryProvider.delete was NEVER called — proves the active provider is NOT used.
    expect(cloudinaryProviderDeleteMock).not.toHaveBeenCalled();
    // getActiveProvider was NEVER called by deleteMedia (the bug path is gone).
    expect(getActiveProviderMock).not.toHaveBeenCalled();
  });

  it("row.provider=null falls back to local (legacy/default-safe per Pitfall 0 fix)", async () => {
    selectMediaMock.mockResolvedValue([
      { id: 8, providerKey: "media/legacy", provider: null },
    ]);
    providerDeleteMock.mockResolvedValue(undefined);
    await deleteMedia(8);

    // local provider was routed (providerStub.delete); r2 + cloudinary NOT called.
    expect(providerDeleteMock).toHaveBeenCalledWith("media/legacy");
    expect(r2ProviderDeleteMock).not.toHaveBeenCalled();
    expect(cloudinaryProviderDeleteMock).not.toHaveBeenCalled();
  });
});

describe("T-04-08 / D-15: findMediaReferences enforces requireCan FIRST + returns matched posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveProviderMock.mockResolvedValue(providerStub);
    providerGetPublicUrlMock.mockReturnValue("/api/media/media/x-md.webp");
  });

  it("throws FORBIDDEN before any db.select when requireCan denies (MUST_NOT_BE_REACHED)", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    selectMediaMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    getActiveProviderMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(findMediaReferences(42)).rejects.toThrow("FORBIDDEN");
    expect(requireCanMock).toHaveBeenCalledWith({ media: ["read"] });
    expect(getActiveProviderMock).not.toHaveBeenCalled();
    expect(selectMediaMock).not.toHaveBeenCalled();
  });

  it("returns matched posts + featureImageMatches when posts reference the URL", async () => {
    requireCanMock.mockResolvedValue(adminSession());
    const publicUrl = "/api/media/media/x-md.webp";
    // 1st call: media row fetch → [{ providerKey, provider }]
    // 2nd call: posts query → two posts, one matching via featureImage
    selectMediaMock
      .mockResolvedValueOnce([
        { id: 42, providerKey: "media/x-md.webp", provider: "local" },
      ])
      .mockResolvedValueOnce([
        { id: 1, title: "Post A", featureImage: publicUrl },
        { id: 2, title: "Post B", featureImage: null },
      ]);

    const result = await findMediaReferences(42);

    expect(providerGetPublicUrlMock).toHaveBeenCalledWith("media/x-md.webp");
    expect(result.posts).toEqual([
      { id: 1, title: "Post A" },
      { id: 2, title: "Post B" },
    ]);
    expect(result.featureImageMatches).toBe(1);
  });

  it("returns empty posts array + 0 featureImageMatches for an unreferenced media row", async () => {
    requireCanMock.mockResolvedValue(adminSession());
    selectMediaMock
      .mockResolvedValueOnce([
        { id: 99, providerKey: "media/lonely.webp", provider: "local" },
      ])
      .mockResolvedValueOnce([]);

    const result = await findMediaReferences(99);
    expect(result.posts).toEqual([]);
    expect(result.featureImageMatches).toBe(0);
  });

  it("returns empty for a media row that does not exist (not found)", async () => {
    requireCanMock.mockResolvedValue(adminSession());
    selectMediaMock.mockResolvedValueOnce([]);

    const result = await findMediaReferences(404);
    expect(result.posts).toEqual([]);
    expect(result.featureImageMatches).toBe(0);
    // Must NOT call getActiveProvider for a missing row (defensive short-circuit).
    expect(getActiveProviderMock).not.toHaveBeenCalled();
  });
});
