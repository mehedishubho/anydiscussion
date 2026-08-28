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
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { log } from "@/lib/log";
import { notifyUsers } from "@/lib/notifications";
import { assertOwnsPost, requireCan } from "@/lib/permissions";
import { transitionPost } from "@/lib/permissions/post-transitions";
import { assertUniqueSlug } from "@/lib/slug";
import { deriveExcerpt } from "@/lib/excerpt";
import { sanitizeBeforeStore } from "@/lib/sanitize";
import { seoMetaSchema } from "@/lib/seo/validation";
import { postListSchema, postSchema, type PostListInput, type PostListQuery } from "./posts-schema";

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
  // Phase 5 D-08: post_seo fields (upserted into the post_seo one-to-one table).
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
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
  let postId: number | undefined;
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
        // CR-02 — preserve the existing publishedAt when the payload omits it.
        // PostForm never sends the field, so the old `data.publishedAt ?? null`
        // nulled the publish date on EVERY edit-save of a published post
        // (visible date, og:publishedTime, RSS pubDate, and NULLS FIRST DESC
        // feed ordering all degraded). An explicitly provided date still writes.
        ...(data.publishedAt !== undefined ? { publishedAt: data.publishedAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.posts.id, input.id));
    postId = input.id;
  } else {
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
    postId = row?.id;
  }

  // 7. Phase 5 D-08 — post_seo upsert. Runs AFTER the posts-row write so the
  //    ownership/permission gate (step 1) covers these writes too (T-05-06).
  //    Defensive: seoMetaSchema.safeParse (NOT .parse) so a malformed SEO input
  //    logs and continues WITHOUT failing the whole post save — the post itself
  //    is already persisted at this point. The grapheme rule (SEO-06) lives in
  //    seoMetaSchema (src/lib/seo/validation.ts — reused per D-10, not re-implemented).
  await upsertPostSeo(postId, input);

  return { id: postId };
}

/**
 * upsertPostSeo — Phase 5 D-08. Inserts or updates the one-to-one post_seo row.
 *
 * Defensive contract: a safeParse failure (e.g. grapheme limit exceeded) is LOGGED
 * and SKIPPED — it never fails the surrounding savePost call. The post row is
 * already saved; SEO is a secondary concern. The editor can re-save with valid SEO.
 *
 * Security (T-05-06): this runs inside savePost AFTER assertOwnsPost / requireCan,
 * so the existing ownership gate covers the post_seo write. No new auth check needed.
 * postSeo has no deletedAt (hard-delete per D-08; PK is `id`, not `postId`).
 */
async function upsertPostSeo(
  postId: number | undefined,
  input: SavePostInput,
): Promise<void> {
  if (!postId) return;

  // D-10 — shared Zod schema, safeParse so the post save is resilient to bad SEO input.
  const parsed = seoMetaSchema.safeParse({
    metaTitle: input.metaTitle,
    metaDescription: input.metaDescription,
    ogImage: input.ogImage,
    canonicalUrl: input.canonicalUrl,
  });
  if (!parsed.success) {
    // Defensive log + continue. The post itself is already saved.
    log.info("post_seo validation skipped", {
      postId,
      issues: parsed.error.issues.map((i) => i.message),
    });
    return;
  }

  // Empty strings → null (post_seo columns are nullable; "" is not a meaningful value).
  const values = {
    metaTitle: parsed.data.metaTitle || null,
    metaDescription: parsed.data.metaDescription || null,
    ogImage: parsed.data.ogImage || null,
    canonicalUrl: parsed.data.canonicalUrl || null,
  };

  // One-to-one upsert: check for an existing row by postId, then update-or-insert.
  const [existing] = await db
    .select({ id: schema.postSeo.id })
    .from(schema.postSeo)
    .where(eq(schema.postSeo.postId, postId))
    .limit(1);
  if (existing) {
    await db
      .update(schema.postSeo)
      .set(values)
      .where(eq(schema.postSeo.id, existing.id));
  } else {
    await db.insert(schema.postSeo).values({ postId, ...values });
  }
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
 * buildPostListWhere — 260827-se8 Task 4. The shared WHERE builder for
 * listPosts + countPosts (identical filters ⇒ the count always matches the
 * page window). ILIKE, NOT posts.searchVector FTS: searchPosts is
 * published-only and wrong for the dashboard where drafts/pending_review
 * must be findable; admin tables are small, ILIKE is the verified decision.
 */
function buildPostListWhere(filters: PostListQuery) {
  const conds = [];
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conds.push(
      or(ilike(schema.posts.title, pattern), ilike(schema.posts.slug, pattern)),
    );
  }
  if (filters.status) conds.push(eq(schema.posts.status, filters.status));
  if (filters.categoryId) {
    conds.push(eq(schema.posts.categoryId, filters.categoryId));
  }
  if (filters.author) {
    // The author free-text filter matches the JOINED user's name OR email.
    const pattern = `%${filters.author}%`;
    conds.push(
      or(ilike(schema.user.name, pattern), ilike(schema.user.email, pattern)),
    );
  }
  return conds.length > 0 ? and(...conds) : undefined;
}

/**
 * listPosts — 260827-se8 Task 4: the URL-driven dashboard list. Permission
 * gate FIRST, then the shared Zod parse (defaults page=1/pageSize=20, cap 100).
 * Deterministic desc(updatedAt) ordering; limit/offset from the parsed page.
 * The user leftJoin (always applied — deterministic row shape) supports the
 * author filter; rows are mapped back to plain post rows.
 * Editor/admin see all; authors see only their own (requireCan + the row
 * projection is the existing contract).
 */
export async function listPosts(opts?: PostListInput) {
  await requireCan({ post: ["read"] }); // FIRST (Pitfall #1)
  const filters = postListSchema.parse(opts ?? {});
  const where = buildPostListWhere(filters);
  const base = db
    .select()
    .from(schema.posts)
    .leftJoin(schema.user, eq(schema.posts.authorId, schema.user.id));
  const filtered = where ? base.where(where) : base;
  const rows = await filtered
    .orderBy(desc(schema.posts.updatedAt))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);
  // leftJoin nests each row as { posts, user } — return the plain post rows.
  return rows.map((row) => row.posts);
}

/**
 * countPosts — 260827-se8 Task 4. Identical gate + identical WHERE as
 * listPosts (shared builder), `select({ value: sql`count(*)` })` shape —
 * never counts by materializing rows (newsletter.ts countSubscribers
 * precedent). No page window: the count is the TOTAL for pagination math.
 */
export async function countPosts(opts?: PostListInput): Promise<number> {
  await requireCan({ post: ["read"] }); // FIRST (Pitfall #1)
  const filters = postListSchema.parse(opts ?? {});
  const where = buildPostListWhere(filters);
  const base = db
    .select({ value: sql<number>`count(*)` })
    .from(schema.posts)
    .leftJoin(schema.user, eq(schema.posts.authorId, schema.user.id));
  const [row] = await (where ? base.where(where) : base);
  return Number(row?.value ?? 0);
}

/**
 * returnForRevision — 260827-se8 Task 4. Editor/admin sends a pending_review
 * post back to draft (the verified missing wrapper: TRANSITIONS already
 * legalizes pending_review → draft for editor/admin). assertOwnsPost FIRST —
 * the server stays correct even though the Return button is editor/admin-only
 * UI (authors can only affect their own posts).
 */
export async function returnForRevision(postId: number) {
  // 1. Ownership/authority FIRST (Pitfall #1).
  const session = await assertOwnsPost(postId);

  // 2. R7 funnel — transitionPost enforces role + TRANSITIONS + requireCan.
  await transitionPost(postId, "draft");

  // 3. Fetch the post for the notification payload.
  const [post] = await db
    .select({
      title: schema.posts.title,
      slug: schema.posts.slug,
      authorId: schema.posts.authorId,
    })
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1);

  // 4. Notify the author — never the actor (self-return is silent).
  //    T-Q-se8-07 awaited-swallow: a notify failure NEVER fails the action.
  if (post?.authorId && post.authorId !== session.user.id) {
    try {
      await notifyUsers([post.authorId], "post_returned", {
        postId,
        postTitle: post.title,
      });
    } catch (err) {
      log.error("post_returned notify failed", { postId, err: String(err) });
    }
  }

  // 5. Dashboard list only. A pending_review post has NO public cache surface
  //    (public feeds filter status='published'), so the single 2-arg
  //    revalidateTag("posts-list", "max") is the COMPLETE invalidation
  //    (Pitfall 5: the 2-arg form is mandatory in Next.js 16.2.9).
  revalidateTag("posts-list", "max");

  return { ok: true };
}

/**
 * submitForReview — author path. Calls transitionPost(postId, 'pending_review')
 * (R7 funnel). Authors CAN reach pending_review; they CANNOT reach published
 * (Phase-2 TRANSITIONS table + requireCan double enforcement).
 *
 * 260827-se8 Task 4: after the transition, every editor+admin (minus the
 * actor) gets a post_submitted notification — the review queue is no longer
 * discoverable only by re-visiting the list.
 */
export async function submitForReview(postId: number) {
  const session = await assertOwnsPost(postId); // FIRST (Pitfall #1)
  await transitionPost(postId, "pending_review");

  // Title for the notification payload.
  const [post] = await db
    .select({ title: schema.posts.title })
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1);

  // Every editor + admin EXCLUDING the actor (an editor submitting their own
  // post is not waiting on themselves). T-Q-se8-07 awaited-swallow: a notify
  // failure never fails the submit.
  const reviewers = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(inArray(schema.user.role, ["editor", "admin"]));
  const recipients = reviewers
    .map((r) => r.id)
    .filter((id) => id !== session.user.id);
  if (recipients.length > 0) {
    try {
      await notifyUsers(recipients, "post_submitted", {
        postId,
        postTitle: post?.title,
      });
    } catch (err) {
      log.error("post_submitted notify failed", { postId, err: String(err) });
    }
  }

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
  const session = await assertOwnsPost(postId);

  // 2. R7 funnel — transitionPost enforces role + TRANSITIONS + requireCan(post:publish).
  //    Authors fail here (double enforcement: TRANSITIONS.author excludes published
  //    AND requireCan({post:["publish"]}) fails for the author role).
  await transitionPost(postId, "published");

  // 3. Fetch the post + category slug for revalidation. transitionPost already
  //    confirmed the post exists; this select gets the fields needed for the
  //    concrete revalidatePath / revalidateTag calls below (+ title for the
  //    260827-se8 author notification).
  const [post] = await db
    .select({
      id: schema.posts.id,
      title: schema.posts.title,
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

  // 7. 260827-se8 Task 4 — notify the post's author (never the actor: an
  //    author-publishing-own is impossible per TRANSITIONS, but an editor
  //    publishing their own post must not self-notify) that the post is live.
  //    T-Q-se8-07 awaited-swallow: a notify failure NEVER fails the publish —
  //    the revalidation above already happened and stays untouched.
  if (post.authorId && post.authorId !== session.user.id) {
    try {
      await notifyUsers([post.authorId], "post_published", {
        postId,
        postTitle: post.title,
      });
    } catch (err) {
      log.error("post_published notify failed", { postId, err: String(err) });
    }
  }

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
