// src/app/not-found.tsx
// [CITED: 05-CONTEXT.md D-12 — redirects table checked before 404ing (CLAUDE.md SEO mandate)]
// [CITED: 05-RESEARCH.md "Architectural Responsibility Map" row "Redirects-table check" (L141) + Pitfall 4 + Pitfall 5]
// [CITED: src/app/(site)/preview/[token]/page.tsx L57-69 — server-component DB lookup pattern]
//
// The root 404 page, extended with a redirects-table lookup (D-12). Before
// rendering the 404 UI, a RedirectChecker component queries the `redirects`
// table (added by Plan 01, migration 0004) for the incoming path. If a row
// matches, it calls permanentRedirect (301 → 308 permanent) or redirect
// (302 → 307 temporary) to the configured new_path.
//
// CRITICAL — Node runtime, NOT middleware (landmine #2): this file runs in the
// Node.js runtime by default. middleware.ts / proxy.ts are edge-runtime and
// CANNOT run Drizzle/pg queries. Do NOT add this lookup to middleware.ts, and
// do NOT create src/proxy.ts (Pitfall 5 — does not exist).
//
// Cache Components architecture: the dynamic redirect-check (headers() + DB) is
// isolated inside a <Suspense> boundary so the 404 UI stays in the static
// prerender shell. Under cacheComponents:true, uncached data access outside
// <Suspense> blocks the entire route from prerendering — wrapping the lookup in
// Suspense keeps the root layout + 404 UI static while the redirect-check streams.
//
// T-05-08: the DB lookup is wrapped in try/catch — a missing table, query error,
// or missing x-invoke-path header falls through gracefully (no redirect → 404).
//
// Forward-compatibility (D-12): the redirects table ships EMPTY in v1. This
// wiring is ready for the SETT-03 v2 redirects-manager UI. No seed data needed.
//
// Phase 6 (SITE-12): the 404 now ALSO streams "suggested posts" + a search link.
// CRITICAL — Pitfall 6 / T-06-16: the SuggestedPosts DB read lives inside its OWN
// <Suspense> boundary, SEPARATE from the RedirectChecker Suspense. Inlining a DB
// read outside <Suspense> breaks the static 404 shell ("Uncached data was accessed
// outside of <Suspense>"). Two boundaries, never one combined.
import GridShape from "@/components/common/GridShape";
import Image from "next/image";
import Link from "next/link";
import React, { Suspense } from "react";
import { headers } from "next/headers";
import { permanentRedirect, redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { listPublished } from "@/lib/queries/posts";

/**
 * RedirectChecker — async component that queries the redirects table for the
 * incoming path. Runs inside a <Suspense> boundary so the 404 UI prerenders
 * statically. Returns null when no redirect matches (the 404 UI renders below).
 * Calls redirect()/permanentRedirect() (throws NEXT_REDIRECT) on a match.
 *
 * The redirect calls are OUTSIDE any try/catch — the NEXT_REDIRECT special error
 * must propagate to Next.js's framework handler unimpeded. Only the DB lookup
 * is caught (T-05-08 graceful degradation on missing table / query error).
 */
async function RedirectChecker(): Promise<null> {
  let redirectMatch: { newPath: string; statusCode: number } | null = null;

  try {
    const headerList = await headers();
    const incomingPath = headerList.get("x-invoke-path");

    if (incomingPath) {
      const [match] = await db
        .select()
        .from(schema.redirects)
        .where(eq(schema.redirects.oldPath, incomingPath))
        .limit(1);
      if (match) {
        redirectMatch = { newPath: match.newPath, statusCode: match.statusCode };
      }
    }
  } catch {
    // T-05-08 — graceful degradation: a missing redirects table (migration not
    // applied in this environment), query error, or missing header. Fall through
    // to the 404 UI. Do NOT crash the 404 page — the table is empty in v1.
  }

  // Redirect OUTSIDE the try/catch — NEXT_REDIRECT must not be caught.
  // 301 → permanentRedirect (308 — modern permanent). 302 → redirect (307 — temporary).
  if (redirectMatch) {
    if (redirectMatch.statusCode === 302) {
      redirect(redirectMatch.newPath);
    } else {
      permanentRedirect(redirectMatch.newPath);
    }
  }

  return null;
}

/**
 * SuggestedPosts — async component that streams a few popular/recent published
 * posts for the friendly 404 (SITE-12 / D-16). Runs inside its OWN <Suspense>
 * boundary, SEPARATE from the RedirectChecker Suspense (Pitfall 6 / T-06-16).
 *
 * Calls listPublished from @/lib/queries/posts (a cached read). The Suspense
 * boundary keeps the static 404 shell prerenderable while the suggested-posts
 * slot streams. Returns null if no posts exist yet (graceful empty state).
 *
 * Deliberately lightweight: a heading + 3 plain links, NOT PostCard (keeps the
 * 404 bundle minimal — D-16 friendly 404, not a content surface).
 */
async function SuggestedPosts(): Promise<React.ReactElement | null> {
  try {
    const posts = await listPublished({ page: 1, pageSize: 3 });
    if (!posts || posts.length === 0) return null;

    return (
      <div className="mx-auto mt-10 w-full max-w-[472px] text-center">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Popular Posts
        </h2>
        <ul className="space-y-2">
          {posts.map((row) => {
            // listPublished returns a union: plain posts row (no tagId) or a joined
            // { posts, postTags } row (with tagId). Normalize to the posts shape.
            const post = "posts" in row ? row.posts : row;
            return (
              <li key={post.id}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="text-sm font-medium text-brand-500 hover:underline dark:text-brand-400"
                >
                  {post.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  } catch {
    // Graceful degradation — never crash the 404 over a suggested-posts read.
    return null;
  }
}

/**
 * NotFound — the root 404 page. The RedirectChecker runs inside <Suspense> so
 * the 404 UI stays in the static prerender shell (Cache Components requirement).
 * The fallback is null so nothing renders until the checker completes; if a
 * redirect is found, the user is redirected without ever seeing the 404.
 *
 * Phase 6 (SITE-12): a friendly 404 — "Back to Home" + a "Search the site" link,
 * plus a SECOND <Suspense> streaming SuggestedPosts (popular/recent). Pitfall 6:
 * this is a SEPARATE boundary from the RedirectChecker Suspense above. Never
 * inline the SuggestedPosts DB read in the static shell.
 */
export default function NotFound() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen p-6 overflow-hidden z-1">
      <Suspense fallback={null}>
        <RedirectChecker />
      </Suspense>
      <GridShape />
      <div className="mx-auto w-full max-w-[242px] text-center sm:max-w-[472px]">
        <h1 className="mb-8 font-bold text-gray-800 text-title-md dark:text-white/90 xl:text-title-2xl">
          ERROR
        </h1>

        <Image
          src="/images/error/404.svg"
          alt="404"
          className="dark:hidden"
          width={472}
          height={152}
        />
        <Image
          src="/images/error/404-dark.svg"
          alt="404"
          className="hidden dark:block"
          width={472}
          height={152}
        />

        <p className="mt-10 mb-6 text-base text-gray-700 dark:text-gray-400 sm:text-lg">
          We can’t seem to find the page you are looking for.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3.5 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200 sm:w-auto"
          >
            Back to Home Page
          </Link>
          <Link
            href="/search"
            className="inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-5 py-3.5 text-sm font-medium text-white shadow-theme-xs hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 sm:w-auto"
          >
            Search the site
          </Link>
        </div>
      </div>

      {/* SuggestedPosts — SECOND <Suspense>, separate from RedirectChecker (Pitfall 6 / T-06-16).
          Falls back to null so the static 404 shell renders immediately; the slot streams in. */}
      <Suspense fallback={null}>
        <SuggestedPosts />
      </Suspense>

      {/* <!-- Footer --> */}
      <p className="absolute text-sm text-center text-gray-500 -translate-x-1/2 bottom-6 left-1/2 dark:text-gray-400">
        &copy; 2026 - Any Discussion
      </p>
    </div>
  );
}
