// src/lib/schedule/system-publish.ts
// [CITED: 03-CONTEXT.md D-12 — documented exception to the R7 transitionPost() rule]
// [CITED: 03-RESEARCH.md Pattern 5 (L654-683) — system-publish body + revalidation]
// [CITED: 03-CONTEXT.md D-25 — targeted revalidatePath (concrete paths) + 2-arg revalidateTag(tag,'max')]
// [CITED: 03-CONTEXT.md D-11 — in-process worker, v1 single-instance]
//
// THE D-12 DOCUMENTED EXCEPTION (T-03-18 mitigation):
//
// The scheduler has NO session and therefore CANNOT call transitionPost() (which calls
// assertOwnsPost → getSessionOrThrow → throws UNAUTHORIZED). This module is the sole,
// auditable exception to the R7 "all status writes via transitionPost" rule.
//
// Justification: the post was already approved before scheduling — a human editor/admin
// set status to draft + publishedAt at a point in time. The scheduler executing the
// flip at publishedAt is system-executed, not a user mutation. Every flip is logged
// via log.info("system-publish", {postId}) for the audit trail.
//
// A6 recommendation: "scheduled" is represented as status='draft' AND publishedAt <= now() —
// NOT a new post_status enum value. This avoids an additive enum migration + TRANSITIONS
// table update. The worker queries this signal directly.
//
// Server-only — NO "use client" directive.
import { db, schema } from "@/lib/db";
import { and, eq, lte } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { log } from "@/lib/log";

/**
 * publishDueScheduledPosts — the D-12 system-level publish worker.
 *
 * Queries posts WHERE status='draft' AND publishedAt <= now() (A6 recommendation —
 * no enum migration), flips each to status='published', revalidates the same concrete
 * paths + 2-arg tags as the user publishPost action (D-25 parity), and logs each flip
 * for auditability.
 *
 * DOES NOT call transitionPost (D-12 — no session). This is the documented exception.
 *
 * @returns the count of flipped posts (for the scheduler's tick-logging).
 */
export async function publishDueScheduledPosts(): Promise<number> {
  // Query due posts with a leftJoin on categories to get the category slug for
  // the revalidatePath(`/category/${slug}`) call. The join is cheap (runs once
  // per minute on a small result set).
  const due = await db
    .select({
      id: schema.posts.id,
      slug: schema.posts.slug,
      status: schema.posts.status,
      authorId: schema.posts.authorId,
      categoryId: schema.posts.categoryId,
      publishedAt: schema.posts.publishedAt,
      categorySlug: schema.categories.slug,
    })
    .from(schema.posts)
    .leftJoin(schema.categories, eq(schema.posts.categoryId, schema.categories.id))
    .where(
      and(
        eq(schema.posts.status, "draft"),
        lte(schema.posts.publishedAt, new Date()),
      ),
    );

  for (const post of due) {
    // Flip status to 'published' — D-12 documented exception (no transitionPost).
    await db
      .update(schema.posts)
      .set({ status: "published", updatedAt: new Date() })
      .where(eq(schema.posts.id, post.id));

    // Audit trail — every flip is logged (T-03-18 mitigation: auditable exception).
    log.info("system-publish", { postId: post.id });

    // D-25 revalidation — SAME concrete paths + 2-arg tags as the user publishPost
    // action (Pitfall #3 parity). The scheduler must keep cached pages in sync just
    // like a manual publish does.
    revalidatePath(`/blog/${post.slug}`);
    revalidatePath("/");
    revalidatePath("/blog");
    if (post.categorySlug) {
      revalidatePath(`/category/${post.categorySlug}`);
    }
    revalidatePath("/sitemap.xml");
    revalidatePath("/rss.xml");

    // 2-arg revalidateTag(tag, "max") — Next.js 16.2.9 confirmed form. Single-arg
    // is DEPRECATED (State of the Art, RESEARCH.md L854). "max" = stale-while-revalidate.
    revalidateTag(`post-${post.id}`, "max");
    revalidateTag(`author-${post.authorId}`, "max");
    if (post.categoryId) {
      revalidateTag(`category-${post.categoryId}`, "max");
    }
    revalidateTag("posts-list", "max");
  }

  return due.length;
}
