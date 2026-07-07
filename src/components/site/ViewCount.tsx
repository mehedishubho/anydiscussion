// src/components/site/ViewCount.tsx
// [CITED: 06-03-PLAN.md Task 2 — connection() FIRST, then atomic increment, render]
// [CITED: 06-RESEARCH.md "HIGHEST Spike — RESOLVED" + Pitfall 1 (L666-671) + Pattern 1 L516-523]
// [CITED: 06-PATTERNS.md ViewCount section L154-192 — the exact shape with connection()]
// [CITED: src/app/not-found.tsx RedirectChecker — async-component-per-request-DB-work analog]
// [CITED: bundled next@16.2.9 docs — 01-app/03-api-reference/04-functions/connection.md
//        canonical getVisitorCount() example: await connection() → db write → render]
//
// The view-count streaming slot. Per-request via connection() — the per-request
// signal from next/server. Then runs the atomic UPDATE views = views + 1 (D-01),
// then renders the count.
//
// CRITICAL (Pitfall 1): connection() is the FIRST line. Without it under
// cacheComponents:true, the build hangs ("Filling a cache during prerender timed
// out") or the increment is silently cached (fires once, never again). The
// <Suspense> fallback in the page (Task 2) is part of the static prerender; the
// increment runs only when this component actually executes at request time.
//
// NO cache directive here (would defeat the per-request increment — Pitfall 7 analog).
// NO "use client" — this is an async Server Component streamed inside <Suspense>.
//
// The ONE public write (D-02): unauthenticated by design (published content is
// public). D-01 accepts minor inflation from refreshes/crawlers — no de-dupe for v1
// (SCALE-01 v2 adds Redis-backed dedupe).

import { connection } from "next/server";
import { incrementViewCount } from "@/lib/queries/posts";

/**
 * ViewCount — the per-request view-count slot.
 *
 * @param postId - the published post's id (the row to atomically increment)
 *
 * Renders "{n} views" using Intl.NumberFormat (L10n-safe per CLAUDE.md). The
 * increment fires exactly once per real visit (NOT per ISR regeneration — the
 * streaming slot is never part of the cached prerender).
 */
export default async function ViewCount({ postId }: { postId: number }) {
  // FIRST LINE — the per-request signal (Pitfall 1). Without this, the framework
  // infers deterministic and may cache the output, freezing the count at 1.
  await connection();

  // The atomic increment (D-01): UPDATE posts SET views = views + 1 RETURNING views.
  // Single statement — concurrent increments are serialized by Postgres at the row
  // level (no lost updates). Returns the new value or 0 for an edge-case miss.
  const views = await incrementViewCount(postId);

  return (
    <span className="text-sm text-gray-500 dark:text-gray-400">
      {new Intl.NumberFormat("en-US").format(views)} views
    </span>
  );
}
