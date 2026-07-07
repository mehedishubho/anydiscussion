// src/components/site/RelatedPosts.tsx
// [CITED: 06-03-PLAN.md Task 2 — cached related-posts slot with 'use cache']
// [CITED: 06-RESEARCH.md Pattern 1 L485-490 + L524-538 — cacheLife('hours') + cacheTag]
// [CITED: src/lib/queries/posts.ts listRelated — D-06 same-category → tags fallback]
// [CITED: src/actions/posts.ts L363-368 — publishPost revalidateTag tags matched here]
//
// The related-posts streaming slot. Cached via 'use cache' so the join + tag
// fallback doesn't run per request. cacheLife('hours') makes it ISR-friendly;
// cacheTag('posts-list') + cacheTag(`category-${cid}`) match publishPost's existing
// revalidateTag(..., "max") calls so published edits refresh the slot.
//
// Runs inside its OWN <Suspense> boundary (Pitfall 2 — two separate boundaries so
// the view-count streams independently and isn't blocked on this join query).
//
// NO "use client" — async Server Component rendered into a streaming <Suspense> slot.
// The PostCard grid is consumed from Task 1 (reused by all list routes).

import { cacheLife, cacheTag } from "next/cache";
import PostCard from "@/components/site/PostCard";
import { listRelated } from "@/lib/queries/posts";

interface RelatedPostsProps {
  postId: number;
  categoryId: number | null;
}

/**
 * RelatedPosts — the cached related-posts slot.
 *
 * Calls listRelated(postId, categoryId) which does same-category first, then
 * fills with tag-sharing posts (D-06). Excludes the current post; cap 3.
 * Renders PostCards in a responsive grid; renders nothing when empty.
 *
 * @param postId     - the current post's id (excluded from results)
 * @param categoryId - the current post's category id (null when uncategorized)
 */
export default async function RelatedPosts({ postId, categoryId }: RelatedPostsProps) {
  "use cache";
  cacheLife("hours");
  // Match publishPost's revalidateTag calls (2-arg, "max") so publishes refresh.
  cacheTag("posts-list");
  if (categoryId) cacheTag(`category-${categoryId}`);

  const rows = await listRelated(postId, categoryId, 3);

  // listRelated returns a union: bare posts (same-category branch) or
  // { posts, postTags } (tag-fallback join branch). Normalize to posts[] for
  // uniform rendering — every consumer needs the post fields, not the join.
  const related = rows.map((row) => ("posts" in row ? row.posts : row));

  if (related.length === 0) {
    // Minimal empty state — D-16 friendly empties over plain text.
    return null;
  }

  return (
    <section aria-labelledby="related-posts-heading" className="mt-16">
      <h2
        id="related-posts-heading"
        className="mb-6 text-2xl font-bold text-gray-900 dark:text-white"
      >
        Related posts
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((post) => (
          <PostCard
            key={post.id}
            id={post.id}
            title={post.title}
            slug={post.slug}
            excerpt={post.excerpt}
            featureImage={post.featureImage}
            publishedAt={post.publishedAt}
            // listRelated returns posts from this query module — no author join,
            // so authorName/authorUsername are null here. Future enhancement:
            // extend listRelated to leftJoin user when bylines are needed in cards.
            authorName={null}
            authorUsername={null}
          />
        ))}
      </div>
    </section>
  );
}
