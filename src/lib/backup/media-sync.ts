// src/lib/backup/media-sync.ts
// [CITED: 08-CONTEXT.md D-06 (full DR = DB dump + R2 media objects)]
// [CITED: 08-RESEARCH.md Code Examples (lines 544-575) — ListObjectsV2 + per-object Get → upload]
// [CITED: 08-PATTERNS.md row media-sync.ts]
// [CITED: 08-02-PLAN.md Task 2 <behavior> + <acceptance_criteria>]
//
// R2 media-object sync — the "media" half of full disaster recovery (D-06). A Postgres dump
// alone is NOT full DR: a restored site without its uploaded images is broken. syncMediaBucket
// paginates ListObjectsV2 over the MEDIA R2 bucket (the SOURCE — read-only) and uploads every
// object to the backup destinations via an injectable uploadObject callback, so a restored
// site has its images intact.
//
// v1 approach (RESEARCH A5): full bucket copy each backup — simplest correct for a bounded v1
// media volume. Revisit (incremental/differential) only if the media catalogue exceeds ~10k
// objects; until then full-copy is cheap relative to the dump + keeps the restore path trivial.
//
// SEPARATION INVARIANT (T-08-02b): the SOURCE client is the MEDIA R2 client (read-only List/Get).
// It NEVER writes back to the media bucket. Backup-bucket credentials are scoped to the backup
// bucket and are supplied by the uploadObject callback (each destination's own upload). The
// source client is passed IN by the caller (job.ts) so this module stays a pure copy loop with
// zero knowledge of where backups land — fully unit-testable with a stub client.
//
// Server-only — NO "use client" directive.
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * Injected upload sink — typically a fan-out over every enabled BackupDestination's `upload`.
 * Declared inline (not imported from ./types) so this module has no dependency on the
 * BackupDestination contract and stays a self-contained copy primitive.
 */
export type UploadObjectCallback = (
  key: string,
  buffer: Buffer,
) => Promise<void>;

/**
 * Options for syncMediaBucket.
 */
export interface SyncMediaBucketOptions {
  /** The READ-ONLY media R2 source (client + bucket name). */
  source: { client: S3Client; bucket: string };
  /** Dated key prefix under which media objects land in each destination, e.g. "media-20260729/". */
  destKeyPrefix: string;
  /** Per-object upload sink (fans out to every enabled backup destination). */
  uploadObject: UploadObjectCallback;
}

/**
 * syncMediaBucket (D-06) — full-copy the media R2 bucket to the backup destinations.
 *
 * Paginates ListObjectsV2Command via a ContinuationToken loop over `opts.source.bucket`; for
 * each object: GetObjectCommand → Buffer.from(await Body.transformToByteArray()) →
 * opts.uploadObject(`${destKeyPrefix}${key}`, buf). Returns the count of objects copied.
 *
 * Read-only against the source (T-08-02b): only List + Get are issued to the media bucket;
 * every write goes through the injected uploadObject callback (each destination's own upload,
 * using that destination's own credentials/bucket — never the media client).
 *
 * @returns The number of objects copied (0 on an empty bucket).
 */
export async function syncMediaBucket(
  opts: SyncMediaBucketOptions,
): Promise<number> {
  let token: string | undefined;
  let copied = 0;
  do {
    const listed = await opts.source.client.send(
      new ListObjectsV2Command({
        Bucket: opts.source.bucket,
        ContinuationToken: token,
      }),
    );
    for (const obj of listed.Contents ?? []) {
      // Defensive: a list entry may lack a Key (rare for R2/S3, but the SDK types allow it).
      if (!obj.Key) continue;
      const got = await opts.source.client.send(
        new GetObjectCommand({ Bucket: opts.source.bucket, Key: obj.Key }),
      );
      // transformToByteArray is the documented SDK v3 streaming → Uint8Array helper.
      const bytes = await got.Body!.transformToByteArray();
      const buf = Buffer.from(bytes);
      await opts.uploadObject(`${opts.destKeyPrefix}${obj.Key}`, buf);
      copied++;
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
  return copied;
}
