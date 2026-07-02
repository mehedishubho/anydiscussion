// src/lib/permissions/post-transitions.ts
// [CITED: project-specific — D-13/D-14/D-15; built on postStatusEnum from src/db/schema.ts]
// Review-workflow status-transition policy + the single funnel through which all
// post.status writes flow (R7 — no direct db.update(posts).set({status:...}) elsewhere).
//
// Double enforcement for author → publish: (1) TRANSITIONS.author excludes published,
// AND (2) requireCan({post:['publish']}) fails for the author role (which lacks publish).
//
// Server-only — NO "use client" directive.
import { assertOwnsPost, requireCan } from "./index";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

type Status = "draft" | "pending_review" | "published";

/**
 * Legal transitions per role (D-15 happy path + D-14 edge policy):
 * - author: draft→pending_review (submit), pending_review→draft (recall D-14a),
 *           published→draft (unpublish own D-14b). CANNOT reach published.
 * - editor/admin: full transition graph incl. publish.
 */
const TRANSITIONS: Record<"author" | "editor" | "admin", Partial<Record<Status, Status[]>>> = {
  author: {
    draft: ["pending_review"], // submit for review (cannot go to published)
    pending_review: ["draft"], // recall (D-14a)
    published: ["draft"], // unpublish own post (D-14b)
  },
  editor: {
    draft: ["pending_review", "published"],
    pending_review: ["draft", "published"], // approve → publish
    published: ["draft", "pending_review"],
  },
  admin: {
    draft: ["pending_review", "published"],
    pending_review: ["draft", "published"],
    published: ["draft", "pending_review"],
  },
};

/**
 * Transition a post to the target status, enforcing ownership + permission +
 * the TRANSITIONS policy table. ALL status writes funnel through this helper (R7).
 *
 * @param postId The posts.id to transition.
 * @param target One of "draft" | "pending_review" | "published".
 * @throws Error("NOT_FOUND") if the post does not exist.
 * @throws Error("UNAUTHORIZED" | "FORBIDDEN") propagated from the permission helpers.
 * @throws Error("INVALID_TRANSITION:...") if the role lacks the transition.
 */
export async function transitionPost(
  postId: number,
  target: Status,
): Promise<void> {
  // 1. Fetch current post.
  const [post] = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1);
  if (!post) throw new Error("NOT_FOUND");

  // 2. Ownership check (authors only own; admin/editor bypass inside the helper).
  const session = await assertOwnsPost(postId);
  const role = session.user.role as "admin" | "editor" | "author";

  // 3. Publish requires the post.publish permission — authors FAIL here (double
  //    enforcement, D-15). Runs BEFORE the TRANSITIONS check so the security
  //    decision is independent of the table.
  if (target === "published") {
    await requireCan({ post: ["publish"] });
  }

  // 4. Validate the transition is legal for this role.
  const allowed = TRANSITIONS[role]?.[post.status as Status] ?? [];
  if (!allowed.includes(target)) {
    throw new Error(`INVALID_TRANSITION:${post.status}→${target}`);
  }

  // 5. Apply.
  await db
    .update(schema.posts)
    .set({ status: target, updatedAt: new Date() })
    .where(eq(schema.posts.id, postId));
}
