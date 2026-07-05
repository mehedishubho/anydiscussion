// src/lib/storage/__tests__/push-cdn.test.ts
// [CITED: 04-05-PLAN.md Task 2 <behavior> + <acceptance_criteria>]
// [CITED: 04-VALIDATION.md Wave 0 row "push-cdn.test.ts"]
// [CITED: 04-RESEARCH.md Example 2 (lines 591-637) — S3-compatible origin + cdnBaseUrl overlay]
//
// Wave-0 push-CDN provider tests proving D-21:
//   - Image uploads run the SAME 3-variant sharp pipeline as local/r2 (sm 640 / md 1024
//     / lg 1920, webp quality 80, fit:inside, withoutEnlargement). 3 sharp calls + 3
//     PutObjectCommands + correct variant metadata.
//   - getPublicUrl overlays cdnBaseUrl (strips trailing slash at configure time).
//   - Non-image mime skips sharp — single PutObjectCommand with the raw buffer.
//   - delete uses DeleteObjectCommand (idempotent — catch swallows not-found).
//
// Mock strategy: mock @aws-sdk/client-s3 (S3Client + Put/Head/Delete commands) + sharp
// (chainable). Mirrors registry.test.ts mock structure.
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  s3SendMock,
  sharpBufferMock,
} = vi.hoisted(() => ({
  s3SendMock: vi.fn(),
  sharpBufferMock: vi.fn(),
}));

// @aws-sdk/client-s3 — S3Client stub. The provider constructs the client via
// configurePushCdn(); the mock returns a stubbed client whose send() goes through
// s3SendMock. Constructor options are captured for assertion.
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(public opts: unknown) {}
    send(...a: unknown[]) {
      return s3SendMock(...a);
    }
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
  ListObjectsV2Command: class {
    constructor(public input: unknown) {}
  },
}));

// sharp — chainable mock matching the local/r2 pattern.
vi.mock("sharp", () => {
  const chain = {
    resize: vi.fn(() => chain),
    webp: vi.fn(() => chain),
    toBuffer: (opts?: unknown) => sharpBufferMock(opts),
  };
  const sharpFn = vi.fn(() => chain);
  sharpBufferMock.mockResolvedValue({
    data: Buffer.from("mock-webp"),
    info: { width: 640, height: 480, format: "webp", size: 1024 },
  });
  return { default: sharpFn };
});

import { pushCdnProvider, configurePushCdn } from "../push-cdn";

describe("D-21 PushCdnProvider — image upload runs 3 sharp variants + 3 S3 PutObjectCommands", () => {
  const buffer = Buffer.from("fake-png");
  const baseKey = "media/2026/07/abc-uuid";

  beforeEach(() => {
    vi.clearAllMocks();
    s3SendMock.mockResolvedValue({});
    sharpBufferMock.mockResolvedValue({
      data: Buffer.from("mock-webp"),
      info: { width: 640, height: 480, format: "webp", size: 1024 },
    });
    configurePushCdn({
      endpoint: "https://origin.example.com",
      region: "us-east-1",
      accessKeyId: "AKIA",
      secretAccessKey: "shh",
      bucket: "media-origin",
      cdnBaseUrl: "https://cdn.example.com/", // trailing slash — must be stripped
      forcePathStyle: true,
    });
  });

  it("image mime → 3 sharp calls + 3 PutObjectCommand sends + variants[3] (sm/md/lg)", async () => {
    const result = await pushCdnProvider.upload(buffer, baseKey, "image/png");

    expect(sharpBufferMock).toHaveBeenCalledTimes(3); // sm + md + lg
    expect(s3SendMock).toHaveBeenCalledTimes(3); // 3 PutObjectCommand sends
    expect(result.variants).toHaveLength(3);
    expect(result.variants[0].key).toBe(`${baseKey}-sm.webp`);
    expect(result.variants[1].key).toBe(`${baseKey}-md.webp`);
    expect(result.variants[2].key).toBe(`${baseKey}-lg.webp`);
    expect(result.variants.every((v) => v.format === "webp")).toBe(true);
    // Primary = md variant (1024px — matches local/r2).
    expect(result.primary.key).toBe(`${baseKey}-md.webp`);
  });

  it("non-image mime → skips sharp, single PutObjectCommand, variants:[]", async () => {
    const result = await pushCdnProvider.upload(buffer, baseKey, "application/pdf");

    expect(sharpBufferMock).not.toHaveBeenCalled();
    expect(s3SendMock).toHaveBeenCalledTimes(1);
    expect(result.variants).toEqual([]);
    expect(result.primary.key).toBe(baseKey);
    expect(result.primary.sizeBytes).toBe(buffer.length);
  });
});

describe("D-21 PushCdnProvider — getPublicUrl overlays cdnBaseUrl (trailing slash stripped)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configurePushCdn({
      endpoint: "https://origin.example.com",
      region: "us-east-1",
      accessKeyId: "AKIA",
      secretAccessKey: "shh",
      bucket: "media-origin",
      cdnBaseUrl: "https://cdn.example.com/",
      forcePathStyle: true,
    });
  });

  it("overlays cdnBaseUrl/${key} without double-slash", () => {
    const url = pushCdnProvider.getPublicUrl("media/abc-md.webp");
    expect(url).toBe("https://cdn.example.com/media/abc-md.webp");
  });

  it("works when cdnBaseUrl had no trailing slash", () => {
    configurePushCdn({
      endpoint: "https://origin.example.com",
      region: "us-east-1",
      accessKeyId: "AKIA",
      secretAccessKey: "shh",
      bucket: "media-origin",
      cdnBaseUrl: "https://cdn2.example.com",
    });
    const url = pushCdnProvider.getPublicUrl("media/x");
    expect(url).toBe("https://cdn2.example.com/media/x");
  });
});

describe("D-21 PushCdnProvider — delete is idempotent via DeleteObjectCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configurePushCdn({
      endpoint: "https://origin.example.com",
      region: "us-east-1",
      accessKeyId: "AKIA",
      secretAccessKey: "shh",
      bucket: "media-origin",
      cdnBaseUrl: "https://cdn.example.com",
    });
  });

  it("swallows not-found errors (idempotent)", async () => {
    s3SendMock.mockRejectedValue(new Error("NoSuchKey"));
    await expect(pushCdnProvider.delete("media/missing")).resolves.toBeUndefined();
  });

  it("resolves on success", async () => {
    s3SendMock.mockResolvedValue({});
    await expect(pushCdnProvider.delete("media/abc")).resolves.toBeUndefined();
  });
});

describe("D-21 PushCdnProvider — name discriminator", () => {
  it("provider.name === 'push-cdn' (matches widened types.ts union)", () => {
    expect(pushCdnProvider.name).toBe("push-cdn");
  });
});
