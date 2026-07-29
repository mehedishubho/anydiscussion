// src/lib/backup/__tests__/media-sync.test.ts
// [CITED: 08-02-PLAN.md Task 2 <behavior> + <acceptance_criteria> — syncMediaBucket pagination]
// [CITED: 08-VALIDATION.md Wave 0 row "media-sync.test.ts"]
// [CITED: 08-RESEARCH.md Code Examples (lines 544-575) — ListObjectsV2 + per-object Get → upload]
// [CITED: D-06 (full DR = DB dump + R2 media objects)]
//
// Wave-0 media-sync tests. Asserts syncMediaBucket:
//   - Paginates ListObjectsV2Command via ContinuationToken across multiple pages.
//   - For each object: GetObjectCommand → Buffer → uploadObject(`${destKeyPrefix}${key}`, buf).
//   - Returns the count of objects copied.
//   - Skips list entries without a Key; returns 0 on an empty bucket.
//
// Mock strategy: the SOURCE S3Client is injected via opts.source, so no @aws-sdk/client-s3
// module mock is needed — we pass a stub `{ send: sendMock }` and shape its responses. This
// keeps the test a pure unit test of the pagination/copy loop (T-08-02b read-only source).
import { describe, it, expect, vi } from "vitest";
import type { S3Client } from "@aws-sdk/client-s3";

/** Build a stub source client whose `send` is an observable vi.fn. */
function makeSource() {
  const send = vi.fn();
  return { client: { send } as unknown as S3Client, send };
}

describe("08-02 Task 2: syncMediaBucket paginates ListObjectsV2 + uploads each object (D-06)", () => {
  it("paginates across multiple ListObjectsV2 pages and uploads every object with the destKeyPrefix", async () => {
    const { client, send } = makeSource();
    // Page 1: two objects, truncated → ContinuationToken tok-1.
    // Then two GetObject responses (one per object, interleaved with the listing flow).
    // Then page 2: one object, not truncated. Then its GetObject response.
    send
      .mockResolvedValueOnce({
        Contents: [{ Key: "img/a.webp" }, { Key: "img/b.webp" }],
        IsTruncated: true,
        NextContinuationToken: "tok-1",
      })
      .mockResolvedValueOnce({
        Body: { transformToByteArray: async () => new Uint8Array([1, 1]) },
      })
      .mockResolvedValueOnce({
        Body: { transformToByteArray: async () => new Uint8Array([2, 2]) },
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: "pdf/c.pdf" }],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({
        Body: { transformToByteArray: async () => new Uint8Array([3, 3, 3]) },
      });

    const uploadObject = vi.fn().mockResolvedValue(undefined);
    const { syncMediaBucket } = await import("../media-sync");
    const count = await syncMediaBucket({
      source: { client, bucket: "anydiscussion-media" },
      destKeyPrefix: "media-20260729/",
      uploadObject,
    });

    expect(count).toBe(3);
    expect(uploadObject).toHaveBeenCalledTimes(3);
    // Every key carries the destKeyPrefix.
    expect(uploadObject.mock.calls[0][0]).toBe("media-20260729/img/a.webp");
    expect(uploadObject.mock.calls[1][0]).toBe("media-20260729/img/b.webp");
    expect(uploadObject.mock.calls[2][0]).toBe("media-20260729/pdf/c.pdf");
    // Buffers are passed through as Buffer (Buffer.from(ByteArray)).
    expect(Buffer.isBuffer(uploadObject.mock.calls[0][1])).toBe(true);
    expect((uploadObject.mock.calls[0][1] as Buffer).equals(Buffer.from([1, 1]))).toBe(true);
    expect((uploadObject.mock.calls[2][1] as Buffer).equals(Buffer.from([3, 3, 3]))).toBe(true);
    // Pagination loop issued: list1, get a, get b, list2, get c = 5 sends.
    expect(send).toHaveBeenCalledTimes(5);
    // Page 2 carried the ContinuationToken returned by page 1.
    // The 4th send (index 3) is the second ListObjectsV2 — inspect its command input.
    const page2Command = send.mock.calls[3][0];
    expect(page2Command?.input?.ContinuationToken).toBe("tok-1");
    expect(page2Command?.input?.Bucket).toBe("anydiscussion-media");
  });

  it("returns 0 and never uploads when the media bucket is empty", async () => {
    const { client, send } = makeSource();
    send.mockResolvedValueOnce({ Contents: [], IsTruncated: false });

    const uploadObject = vi.fn().mockResolvedValue(undefined);
    const { syncMediaBucket } = await import("../media-sync");
    const count = await syncMediaBucket({
      source: { client, bucket: "empty" },
      destKeyPrefix: "media-x/",
      uploadObject,
    });

    expect(count).toBe(0);
    expect(uploadObject).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1); // the single list call
  });

  it("skips list entries that have no Key (defensive — never calls uploadObject for them)", async () => {
    const { client, send } = makeSource();
    send
      .mockResolvedValueOnce({
        Contents: [{ Key: "keep.webp" }, { Key: undefined as unknown as string }],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({
        Body: { transformToByteArray: async () => new Uint8Array([9]) },
      });

    const uploadObject = vi.fn().mockResolvedValue(undefined);
    const { syncMediaBucket } = await import("../media-sync");
    const count = await syncMediaBucket({
      source: { client, bucket: "m" },
      destKeyPrefix: "p/",
      uploadObject,
    });

    expect(count).toBe(1); // only the entry with a real Key
    expect(uploadObject).toHaveBeenCalledTimes(1);
    expect(uploadObject.mock.calls[0][0]).toBe("p/keep.webp");
  });
});
