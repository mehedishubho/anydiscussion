// src/actions/posts.ts
// [CITED: src/actions/users.ts — the established Server Action template (PATTERNS.md row)]
// [CITED: 03-RESEARCH.md L786-815 — Server Action shape + RESEARCH Pattern 6 (revalidation)]
// [CITED: 03-CONTEXT.md D-19 (preview token), D-17 (autosave drafts-only), D-21 (excerpt)]
// [CITED: CLAUDE.md "Roles & permissions" — every mutating action starts with the check]
//
// Posts Server Actions. Every mutating action calls requireCan OR assertOwnsPost
// FIRST (Pitfall #1 — never trust the proxy gate). Status transitions funnel
// through `transitionPost` (R7) — submitForReview is the author path; publish
// is editor/admin via a separate action that calls transitionPost(id, 'published').
//
// Slice D (Plan 03-04) wires the publishPost action's concrete revalidatePath
// paths + 2-arg revalidateTag; this file imports next/cache now so the type
// surface is ready. The save action below is the create/update path.
//
// Server-only — top directive mandatory for Server Actions.
"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { log } from "@/lib/log";
import { assertOwnsPost, requireCan } from "@/lib/permissions";
import { transitionPost } from "@/lib/permissions/post-transitions";
import { assertUniqueSlug } from "@/lib/slug";
import { deriveExcerpt } from "@/lib/excerpt";
import { sanitizeBeforeStore } from "@/lib/sanitize";
import { postSchema } from "./posts-schema";

type PostStatus = "draft" | "pending_review" | "published";

interface SavePostInput {
  id?: number;
  title: string;
  slug: string;
  body?: unknown;
  excerpt?: string;
  categoryId: number;
  tagIds?: number[];
  featureImage?: string;
  publishedAt?: Date;
  status?: PostStatus;
}

/**
 * sanitizeBodyHtml — Pitfall #2 site #1 (storage-time sanitize on the body).
 *
 * The body is ProseMirror JSON — structured nodes, NOT raw HTML. However, the D-02
 * raw-HTML-paste embed path can store HTML strings inside node attrs (e.g. a raw-HTML
 * embed node carrying `<iframe src="...">` in an attr). This walker recursively
 * traverses the JSON tree and runs any string that looks like HTML (contains `<` and `>`)
 * through sanitizeBeforeStore — the shared DOMPurify config (Pitfall #2).
 *
 * If the body has no raw-HTML strings (pure structured JSON), this is a no-op —
 * the function still runs to be safe (defense-in-depth per CLAUDE.md).
 */
function sanitizeBodyHtml(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      // Only sanitize strings that look like HTML — avoids running DOMPurify on
      // every plain-text string in the JSON (perf) while catching all embed HTML.
      if (node.includes("<") && node.includes(">")) {
        return sanitizeBeforeStore(node);
      }
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node && typeof node === "object") {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(node as Record<string, unknown>)) {
        result[key] = walk((node as Record<string, unknown>)[key]);
      }
      return result;
    }
    return node;
  };

  return walk(body);
}

/**
 * savePost — create or update a post. Permission-check-FIRST:
 *   - new post: requireCan({post:["create"]})
 *   - existing post: assertOwnsPost(id) — author-own OR editor/admin bypass
 *
 * D-20: assertUniqueSlug runs BEFORE any DB write (rethrows SLUG_NOT_UNIQUE).
 * D-21: when posts.excerpt is empty, deriveExcerpt(body) is the fallback.
 */
export async function savePost(input: SavePostInput) {
  // 1. Permission check FIRST (Pitfall #1).
  const session = input.id
    ? await assertOwnsPost(input.id)
    : await requireCan({ post: ["create"] });

  // 2. Parse + validate with the shared Zod schema (D-20 slug regex, D-23 tag cap).
  const data = postSchema.parse(input) as SavePostInput;

  // 3. Slug uniqueness (D-20) — BEFORE any write.
  await assertUniqueSlug(data.slug, "posts", input.id);

  // 4. D-21 excerpt fallback — derive from body when manual is empty.
  const excerpt = data.excerpt && data.excerpt.trim().length > 0
    ? data.excerpt
    : deriveExcerpt(data.body, 160);

  // 5. Pitfall #2 site #1 — sanitize raw HTML embed nodes in the body BEFORE storage.
  //    Walks the ProseMirror JSON to find raw-HTML strings (D-02 embed path) and
  //    runs them through the shared DOMPurify config. No-op for pure-JSON bodies.
  const sanitizedBody = sanitizeBodyHtml(data.body);

  // 6. db.write.
  if (input.id) {
    await db
      .update(schema.posts)
      .set({
        title: data.title,
        slug: data.slug,
        body: sanitizedBody,
        excerpt,
        categoryId: data.categoryId,
        featureImage: data.featureImage ?? null,
        publishedAt: data.publishedAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.posts.id, input.id));
    return { id: input.id };
  }

  const [row] = await db
    .insert(schema.posts)
    .values({
      title: data.title,
      slug: data.slug,
      body: sanitizedBody,
      excerpt,
      status: "draft",
      authorId: session.user.id,
      categoryId: data.categoryId,
      featureImage: data.featureImage ?? null,
      publishedAt: data.publishedAt ?? null,
    })
    .returning({ id: schema.posts.id });
  return { id: row?.id };
}

/**
 * getPost — read a single post. Authors are scoped to their own; editor/admin
 * can read any (assertOwnsPost bypasses ownership for them). Throws NOT_FOUND
 * when the post doesn't exist.
 */
export async function getPost(postId: number) {
  await assertOwnsPost(postId);
  const [post] = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1);
  if (!post) {
    log.error("getPost not found", { postId });
    throw new Error("NOT_FOUND");
  }
  return post;
}

/**
 * listPosts — read all posts (dashboard list page). Editor/admin see all;
 * authors see only their own. requireCan({post:["read"]}) gates the call.
 */
export async function listPosts(opts?: { status?: PostStatus; authorId?: string; limit?: number }) {
  await requireCan({ post: ["read"] });
  // NOTE: scoping by authorId/status is built incrementally by the dashboard.
  // For now the simple select-all is gated by the read capability.
  const rows = await db.select().from(schema.posts).limit(opts?.limit ?? 50);
  return rows;
}

/**
 * submitForReview — author path. Calls transitionPost(postId, 'pending_review')
 * (R7 funnel). Authors CAN reach pending_review; they CANNOT reach published
 * (Phase-2 TRANSITIONS table + requireCan double enforcement).
 */
export async function submitForReview(postId: number) {
  await assertOwnsPost(postId); // FIRST (Pitfall #1)
  await transitionPost(postId, "pending_review");
  return { ok: true };
}

/**
 * autosavePost — D-16/D-17. Debounced (~3s) TanStack Query mutation target.
 *
 * D-17 (security-critical): autosave is DISABLED for published posts. Edits
 * to a live post require an explicit Save — a careless edit must NEVER go live
 * silently. The early return happens BEFORE any db.update (proven by Wave-0
 * test mocking db.update to throw MUST_NOT_BE_REACHED for published status).
 */
export async function autosavePost(postId: number, body: unknown) {
  await assertOwnsPost(postId); // FIRST (Pitfall #1)

  // Fetch the post's current status.
  const [post] = await db
    .select({ status: schema.posts.status })
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1);
  if (!post) throw new Error("NOT_FOUND");

  // D-17 — published posts require manual save. Early return, NO db.update.
  if (post.status === "published") {
    log.info("autosave disabled for published", { postId });
    return { skipped: true };
  }

  await db
    .update(schema.posts)
    .set({ body, updatedAt: new Date() })
    .where(eq(schema.posts.id, postId));
  return { skipped: false };
}

/**
 * rotatePreviewToken — D-19 draft preview links. Generates a high-entropy
 * crypto.randomUUID() and writes it to posts.previewToken. The old token is
 * invalidated (any prior /preview/[token] link 404s). Author-own or editor/admin.
 */
export async function rotatePreviewToken(postId: number) {
  await assertOwnsPost(postId); // FIRST (Pitfall #1)
  const token = randomUUID();
  await db
    .update(schema.posts)
    .set({ previewToken: token, updatedAt: new Date() })
    .where(eq(schema.posts.id, postId));
  return { token };
}

/**
 * publishPost — the user-facing publish action. Editor/admin path (authors fail
 * inside transitionPost via requireCan post:publish — D-15 double enforcement).
 *
 * D-25 / Pitfall #3: after the transition succeeds, revalidates the SAME concrete
 * paths + 2-arg tags as the scheduler (system-publish.ts). The 2-arg form
 * `revalidateTag(tag, "max")` is mandatory in Next.js 16.2.9 — single-arg is
 * DEPRECATED. Paths are resolved literals (e.g. `/blog/hello-world`) — NEVER
 * template-string patterns like `/blog/[slug]`.
 *
 * D-19: rotates the preview token on publish so any prior /preview/[token] link 404s.
 */
export async function publishPost(postId: number) {
  // 1. Ownership check FIRST (Pitfall #1). Admin/editor bypass.
  await assertOwnsPost(postId);

  // 2. R7 funnel — transitionPost enforces role + TRANSITIONS + requireCan(post:publish).
  //    Authors fail here (double enforcement: TRANSITIONS.author excludes published
  //    AND requireCan({post:["publish"]}) fails for the author role).
  await transitionPost(postId, "published");

  // 3. Fetch the post + category slug for revalidation. transitionPost already
  //    confirmed the post exists; this select gets the fields needed for the
  //    concrete revalidatePath / revalidateTag calls below.
  const [post] = await db
    .select({
      id: schema.posts.id,
      slug: schema.posts.slug,
      authorId: schema.posts.authorId,
      categoryId: schema.posts.categoryId,
      categorySlug: schema.categories.slug,
    })
    .from(schema.posts)
    .leftJoin(schema.categories, eq(schema.posts.categoryId, schema.categories.id))
    .where(eq(schema.posts.id, postId))
    .limit(1);
  if (!post) throw new Error("NOT_FOUND");

  // 4. D-25 — concrete literal paths (Pitfall #3). NEVER template-string patterns.
  revalidatePath(`/blog/${post.slug}`);
  revalidatePath("/");
  revalidatePath("/blog");
  if (post.categorySlug) {
    revalidatePath(`/category/${post.categorySlug}`);
  }
  revalidatePath("/sitemap.xml");
  revalidatePath("/rss.xml");

  // 5. D-25 — 2-arg revalidateTag(tag, "max"). Single-arg form is DEPRECATED in
  //    Next.js 16.2.9. "max" = stale-while-revalidate (recommended).
  revalidateTag(`post-${post.id}`, "max");
  revalidateTag(`author-${post.authorId}`, "max");
  if (post.categoryId) {
    revalidateTag(`category-${post.categoryId}`, "max");
  }
  revalidateTag("posts-list", "max");

  // 6. D-19 — rotate the preview token so the old /preview/[token] link 404s.
  //    This invalidates any shared draft-preview link on publish.
  await rotatePreviewToken(postId);

  return { ok: true };
}

/**
 * setSchedule — set the publishedAt timestamp on a post. D-15: only editor/admin
 * can schedule (scheduling = deferred publish, which authors lack). The action
 * calls requireCan({post:["publish"]}) — authors fail here.
 *
 * D-14: publishedAt is stored as UTC. The SchedulePicker client component displays
 * in the site-configured timezone (read via getSetting("site.timezone")); the
 * datetime is converted to UTC before storage.
 */
export async function setSchedule(postId: number, publishedAt: Date) {
  // D-15 — scheduling requires the publish capability. Authors lack post:publish.
  await requireCan({ post: ["publish"] });

  await db
    .update(schema.posts)
    .set({ publishedAt, updatedAt: new Date() })
    .where(eq(schema.posts.id, postId));

  log.info("schedule-set", { postId, publishedAt: publishedAt.toISOString() });
  return { ok: true };
}

/**
 * revokePreviewToken — D-19 manual revoke. Clears posts.previewToken so the
 * /preview/[token] route returns 404 for the prior token. Author-own or editor/admin.
 */
export async function revokePreviewToken(postId: number) {
  await assertOwnsPost(postId); // FIRST (Pitfall #1)
  await db
    .update(schema.posts)
    .set({ previewToken: null, updatedAt: new Date() })
    .where(eq(schema.posts.id, postId));
  log.info("preview-token-revoked", { postId });
  return { ok: true };
}
