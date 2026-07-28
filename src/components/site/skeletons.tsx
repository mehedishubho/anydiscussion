// src/components/site/skeletons.tsx
// [CITED: 06-03-PLAN.md Task 2 — Suspense fallbacks matching the slot dimensions]
// [CITED: 06-CONTEXT.md D-16 — skeletons + friendly empties over spinners/plain text]
// [CITED: 06-RESEARCH.md Pitfall 2 — two SEPARATE <Suspense> boundaries, each needs its own fallback]
//
// Pure presentational fallback components used as the `fallback` prop of the
// two streaming <Suspense> holes on /blog/[slug]:
//   - <ViewCountSkeleton /> matches the small <span> dimensions of ViewCount
//   - <RelatedPostsSkeleton /> matches the PostCard grid (3 pulsing cards)
//
// Using animate-pulse (Tailwind) gives a calm loading shimmer without flashing
// spinners or janky text reflow. Server-safe — no "use client".

/**
 * ViewCountSkeleton — small pulsing placeholder matching the view-count span.
 * Renders inline so the meta row doesn't shift when the count streams in.
 */
export function ViewCountSkeleton() {
  return (
    <span
      className="inline-block h-4 w-20 animate-pulse rounded bg-gray-200 align-middle dark:bg-gray-800"
      aria-hidden="true"
    />
  );
}

/**
 * RelatedPostsSkeleton — a 3-card pulsing placeholder matching the PostCard grid.
 * Renders inside the second <Suspense> boundary while listRelated resolves.
 */
export function RelatedPostsSkeleton() {
  return (
    <section className="mt-16" aria-hidden="true">
      <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">
        Related posts
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex animate-pulse flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
          >
              <div className="aspect-[16/9] w-full bg-gray-200 dark:bg-gray-800" />
              <div className="flex flex-1 flex-col p-5">
                <div className="h-5 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
                <div className="mt-3 h-3 w-full rounded bg-gray-200 dark:bg-gray-800" />
                <div className="mt-2 h-3 w-5/6 rounded bg-gray-200 dark:bg-gray-800" />
                <div className="mt-5 h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
              </div>
            </div>
          ))}
        </div>
    </section>
  );
}

/**
 * PostCardGridSkeleton — pulsing placeholder for the post-list routes
 * (/blog, /blog/page/[n], /category/[slug], /tag/[slug], /author/[username],
 * /archive, /search). Page-level PPR Suspense fallback used while the async
 * content component awaits cached params/searchParams + data under
 * cacheComponents:true. `count` tunes the grid fullness (default 6).
 */
export function PostCardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="mx-auto max-w-6xl px-4 py-10"
      aria-hidden="true"
      role="status"
      aria-label="Loading"
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex animate-pulse flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="aspect-[16/9] w-full bg-gray-200 dark:bg-gray-800" />
            <div className="flex flex-1 flex-col p-5">
              <div className="h-5 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="mt-3 h-3 w-full rounded bg-gray-200 dark:bg-gray-800" />
              <div className="mt-2 h-3 w-5/6 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="mt-5 h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * SinglePostSkeleton — pulsing placeholder for the single-post routes
 * (/blog/[slug], /preview/[token]). Page-level PPR Suspense fallback.
 */
export function SinglePostSkeleton() {
  return (
    <article
      className="mx-auto max-w-3xl px-4 py-12"
      aria-hidden="true"
      role="status"
      aria-label="Loading"
    >
      <div className="mb-6 h-10 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
      <div className="mb-8 h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
      <div className="aspect-[16/9] w-full animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" />
      <div className="mt-8 space-y-4">
        <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
      </div>
    </article>
  );
}
