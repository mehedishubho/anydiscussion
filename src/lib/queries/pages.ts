// src/lib/queries/pages.ts
// [CITED: 06-01-PLAN.md Task 2 — public page reads]
// [CITED: 06-PATTERNS.md — adapt src/actions/pages.ts getPage to published-only + slug]
//
// Public read query for managed pages (T&C, Privacy, Contact content — SITE-11).
// Published-only filter. NO permission checks (published content is public, T-06-02).
//
// Server-only — NO "use client" directive.

import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq, isNull, and } from "drizzle-orm";

/**
 * getPublishedPage — fetch a published page by slug (SITE-11).
 *
 * Returns the page row (with body for renderPostBody) or null for draft/missing
 * pages. Used by T&C/Privacy/Contact routes.
 */
export async function getPublishedPage(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("posts-list");

  const [row] = await db
    .select()
    .from(schema.pages)
    .where(
      and(
        eq(schema.pages.slug, slug),
        eq(schema.pages.status, "published"),
        isNull(schema.pages.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
