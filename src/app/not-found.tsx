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
import GridShape from "@/components/common/GridShape";
import Image from "next/image";
import Link from "next/link";
import React, { Suspense } from "react";
import { headers } from "next/headers";
import { permanentRedirect, redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

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
 * NotFound — the root 404 page. The RedirectChecker runs inside <Suspense> so
 * the 404 UI stays in the static prerender shell (Cache Components requirement).
 * The fallback is null so nothing renders until the checker completes; if a
 * redirect is found, the user is redirected without ever seeing the 404.
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
          We can’t seem to find the page you are looking for!
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3.5 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
        >
          Back to Home Page
        </Link>
      </div>
      {/* <!-- Footer --> */}
      <p className="absolute text-sm text-center text-gray-500 -translate-x-1/2 bottom-6 left-1/2 dark:text-gray-400">
        &copy; 2026 - Any Discussion
      </p>
    </div>
  );
}
