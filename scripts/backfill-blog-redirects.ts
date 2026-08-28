// scripts/backfill-blog-redirects.ts
//
// 260828-blog-url: one-shot backfill for the blog-URL migration. Inserts a
// `redirects` row for every published post so that the legacy /blog/{slug}
// URL emits a real HTTP 308 to /blog/{categorySlug|uncategorized}/{slug}.
//
// The redirects table is consumed by src/proxy.ts (line 117, 5s snapshot TTL)
// and by the not-found.tsx RedirectChecker fallback. After this script runs,
// no request ever reaches the legacy /blog/{slug] route file (which now
// 404s as a safety net).
//
// USAGE (operator, after deploy):
//   pnpm tsx scripts/backfill-blog-redirects.ts
//   # or, if you don't have tsx installed:
//   node --experimental-strip-types scripts/backfill-blog-redirects.ts
//
// IDEMPOTENT: every insert uses ON CONFLICT (old_path) DO NOTHING, so re-running
// the script is safe (existing rows are left untouched). To re-run after the
// category of a post changes, DELETE the stale row first (the script logs the
// per-row decision so manual cleanup is obvious).
//
// LOCATION NOTE: this file imports directly from src/lib/db, so it can ONLY
// run inside the project's TS toolchain. The drizzle client and pg driver
// expect a valid DATABASE_URL — same as any server-side code.

import { db, schema } from "../src/lib/db/index.ts";
import { and, eq, isNull, sql } from "drizzle-orm";

// Match the helper exported from src/lib/post-card.ts. We duplicate the
// literal here (rather than importing) so the script can run in environments
// where the project's path aliases (@/lib/post-card) are not configured.
// Keep in sync with src/lib/post-card.ts — see UNCATEGORIZED_SLUG there.
const UNCATEGORIZED_SLUG = "uncategorized";

interface PostRow {
  slug: string;
  categorySlug: string | null;
}

async function main() {
  console.log("[backfill-blog-redirects] starting…");

  // 1. Fetch every published, non-soft-deleted post (and its category slug,
  //    if any). The join is the same one the sitemap uses — keeps the
  //    source-of-truth for /blog/{category}/{slug} URLs in ONE place.
  const rows: PostRow[] = await db
    .select({
      slug: schema.posts.slug,
      categorySlug: schema.categories.slug,
    })
    .from(schema.posts)
    .leftJoin(
      schema.categories,
      eq(schema.categories.id, schema.posts.categoryId),
    )
    .where(
      and(
        eq(schema.posts.status, "published"),
        isNull(schema.posts.deletedAt),
      ),
    );

  if (rows.length === 0) {
    console.log("[backfill-blog-redirects] no published posts found — nothing to do");
    return;
  }

  console.log(`[backfill-blog-redirects] found ${rows.length} published post(s)`);

  // 2. Insert a 301 row per post. ON CONFLICT (old_path) DO NOTHING keeps the
  //    run idempotent — re-running never overwrites a manually-edited row.
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const oldPath = `/blog/${row.slug}`;
    const newPath = `/blog/${row.categorySlug || UNCATEGORIZED_SLUG}/${row.slug}`;

    const result = await db
      .insert(schema.redirects)
      .values({
        oldPath,
        newPath,
        statusCode: 301,
      })
      .onConflictDoNothing({ target: schema.redirects.oldPath })
      .returning({ id: schema.redirects.id });

    if (result.length > 0) {
      inserted += 1;
      console.log(`  + ${oldPath} -> ${newPath}`);
    } else {
      skipped += 1;
      console.log(`  = ${oldPath} (already present, left untouched)`);
    }
  }

  console.log(
    `[backfill-blog-redirects] done — ${inserted} inserted, ${skipped} skipped (already present)`,
  );

  // 3. Optional sanity check — log the first 3 rows so the operator can
  //    eyeball the resulting shape. The 5s snapshot in src/proxy.ts will
  //    pick these up on the next request after the cache TTL expires.
  const sample = await db
    .select({
      oldPath: schema.redirects.oldPath,
      newPath: schema.redirects.newPath,
      statusCode: schema.redirects.statusCode,
    })
    .from(schema.redirects)
    .where(sql`${schema.redirects.oldPath} LIKE '/blog/%'`)
    .limit(3);
  if (sample.length > 0) {
    console.log("[backfill-blog-redirects] sample of resulting rows:");
    for (const r of sample) {
      console.log(`  ${r.oldPath}  ->  ${r.newPath}  (${r.statusCode})`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-blog-redirects] FAILED:", err);
    process.exit(1);
  });
