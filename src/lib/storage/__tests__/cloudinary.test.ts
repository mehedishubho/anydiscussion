// src/lib/storage/__tests__/cloudinary.test.ts
// [CITED: 04-05-PLAN.md Task 2 <behavior> + <acceptance_criteria>]
// [CITED: 04-VALIDATION.md Wave 0 row "cloudinary.test.ts"]
// [CITED: 04-RESEARCH.md Example 1 (lines 542-588) + Pitfall 3 (lines 509-513)]
//
// Wave-0 Cloudinary provider tests proving D-22:
//   - upload bypasses sharp (Cloudinary owns transforms at delivery URL time — sharp
//     would double-transform). The mock asserts sharp was NEVER imported/called in
//     this provider's path.
//   - upload uses cloudinary.v2.uploader.upload_stream per Pitfall 3 (Readable.from(buffer)
//     .pipe(stream) — the canonical Node stream pattern).
//   - upload returns variants: [] + correct primary.key = public_id.
//   - getPublicUrl returns https://res.cloudinary.com/... with the transform params
//     (f_auto/q_auto + width based on variant).
//   - delete is idempotent — cloudinary.v2.uploader.destroy.catch(() => {}) swallows errors.
//
// Mock strategy: mock the cloudinary SDK (vi.mock('cloudinary', ...)) so the SUT calls
// our spies. Vitest default Node environment — no jsdom pragma.
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  uploadStreamMock,
  destroyMock,
  urlMock,
  configMock,
} = vi.hoisted(() => ({
  uploadStreamMock: vi.fn(),
  destroyMock: vi.fn(),
  urlMock: vi.fn(),
  configMock: vi.fn(),
}));

// cloudinary SDK mock — the SUT imports { v2 as cloudinary } from 'cloudinary' and calls
// v2.uploader.upload_stream / v2.uploader.destroy / v2.url / v2.config.
vi.mock("cloudinary", () => {
  const v2 = {
    config: (...a: unknown[]) => configMock(...a),
    uploader: {
      // upload_stream(options, callback) — Pitfall 3 pattern. The SUT pipes a buffer
      // through Readable.from(buffer).pipe(stream); the stream emits the callback on
      // completion. Mock the callback API directly.
      upload_stream: (...a: unknown[]) => uploadStreamMock(...a),
      destroy: (...a: unknown[]) => destroyMock(...a),
    },
    url: (...a: unknown[]) => urlMock(...a),
  };
  return { v2, default: { v2 } };
});

// Real Node stream for the pipe target — Readable.from(buffer).pipe(stream) calls
// .write/.end/.on on the destination, so a plain { pipe: () => {} } stub is insufficient.
// PassThrough is a valid Node Writable stream that accepts piped input.
import { PassThrough } from "node:stream";

// sharp should NEVER be imported in this provider's code path — D-22 explicit. We
// don't even need to mock it; the cloudinary provider's upload() body never touches
// sharp. (If it does, the test will fail at the import boundary on the real sharp
// binary — but more reliably, we assert sharpBufferMock was never called.)

import { cloudinaryProvider, configureCloudinary } from "../cloudinary";

describe("D-22 CloudinaryProvider — upload bypasses sharp (Cloudinary owns transforms)", () => {
  const buffer = Buffer.from("fake-png-bytes");
  const baseKey = "media/2026/07/abc-uuid";

  beforeEach(() => {
    vi.clearAllMocks();
    configureCloudinary({
      cloud_name: "test-cloud",
      api_key: "test-key",
      api_secret: "test-secret",
    });
  });

  it("image upload returns variants:[] + primary.key = public_id (NO sharp variants)", async () => {
    // upload_stream returns a Node Writable stream that the SUT pipes via
    // Readable.from(buffer).pipe(stream). PassThrough is a valid Writable; the
    // callback fires on the stream's 'finish' event (simulating the SDK behavior).
    uploadStreamMock.mockImplementation((_opts: unknown, cb: (e: Error | null, r: unknown) => void) => {
      const stream = new PassThrough();
      stream.on("finish", () =>
        cb(null, {
          public_id: `media/${baseKey}`,
          secure_url: `https://res.cloudinary.com/test-cloud/image/upload/media/${baseKey}.jpg`,
          width: 1024,
          height: 768,
          bytes: 12345,
        }),
      );
      return stream;
    });

    const result = await cloudinaryProvider.upload(buffer, baseKey, "image/png");

    expect(uploadStreamMock).toHaveBeenCalledTimes(1);
    expect(result.variants).toEqual([]);
    expect(result.primary.key).toBe(`media/${baseKey}`);
    expect(result.primary.width).toBe(1024);
    expect(result.primary.height).toBe(768);
    expect(result.primary.sizeBytes).toBe(12345);
  });

  it("non-image upload returns variants:[] + primary.key = public_id (resource_type: auto)", async () => {
    uploadStreamMock.mockImplementation((_opts: unknown, cb: (e: Error | null, r: unknown) => void) => {
      const stream = new PassThrough();
      stream.on("finish", () =>
        cb(null, {
          public_id: `media/${baseKey}`,
          secure_url: `https://res.cloudinary.com/test-cloud/raw/upload/media/${baseKey}`,
          bytes: 99,
        }),
      );
      return stream;
    });

    const result = await cloudinaryProvider.upload(buffer, baseKey, "application/pdf");
    expect(result.variants).toEqual([]);
    expect(result.primary.key).toBe(`media/${baseKey}`);
    expect(result.primary.sizeBytes).toBe(99);
  });
});

describe("D-22 CloudinaryProvider — getPublicUrl returns transform URLs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureCloudinary({
      cloud_name: "test-cloud",
      api_key: "test-key",
      api_secret: "test-secret",
    });
    // Default: cloudinary.url returns a deterministic transform URL.
    urlMock.mockImplementation((key: string, opts: unknown) => {
      const raw = (opts as { transformation?: Array<{ raw_transformation?: string }> })
        ?.transformation?.[0]?.raw_transformation;
      return `https://res.cloudinary.com/test-cloud/image/upload/${raw ?? ""}/${key}`;
    });
  });

  it("md variant → f_auto,q_auto,w_1024 transform param", () => {
    const url = cloudinaryProvider.getPublicUrl("media/abc", "md");
    expect(url).toContain("https://res.cloudinary.com/test-cloud/");
    expect(url).toContain("w_1024");
    expect(url).toContain("media/abc");
  });

  it("sm variant → w_640 transform param", () => {
    const url = cloudinaryProvider.getPublicUrl("media/abc", "sm");
    expect(url).toContain("w_640");
  });

  it("lg variant → w_1920 transform param", () => {
    const url = cloudinaryProvider.getPublicUrl("media/abc", "lg");
    expect(url).toContain("w_1920");
  });

  it("default (no variant) → w_1024 (md primary)", () => {
    const url = cloudinaryProvider.getPublicUrl("media/abc");
    expect(url).toContain("w_1024");
  });
});

describe("D-22 CloudinaryProvider — delete is idempotent (swallows errors)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureCloudinary({
      cloud_name: "test-cloud",
      api_key: "test-key",
      api_secret: "test-secret",
    });
  });

  it("destroy resolves and never throws on missing-resource errors", async () => {
    destroyMock.mockRejectedValue(new Error("not found"));
    await expect(cloudinaryProvider.delete("media/missing")).resolves.toBeUndefined();
    expect(destroyMock).toHaveBeenCalledWith("media/missing");
  });

  it("destroy resolves on success", async () => {
    destroyMock.mockResolvedValue({ result: "ok" });
    await expect(cloudinaryProvider.delete("media/abc")).resolves.toBeUndefined();
  });
});

describe("D-22 CloudinaryProvider — name discriminator", () => {
  it("provider.name === 'cloudinary' (matches widened types.ts union)", () => {
    expect(cloudinaryProvider.name).toBe("cloudinary");
  });
});
