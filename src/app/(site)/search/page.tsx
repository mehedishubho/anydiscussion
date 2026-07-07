// src/app/(site)/search/page.tsx
// [CITED: 06-07-PLAN.md Task 1 — FTS ranked results in <Suspense> + URL searchParams filters]
// [CITED: 06-CONTEXT.md D-09 — page-only, server-GET, NO client autocomplete]
// [CITED: 06-RESEARCH.md Pattern 3 (L566-596) — searchPosts FTS via websearch_to_tsquery('simple')]
// [CITED: 06-RESEARCH.md Pitfall 4 — do NOT FTS against posts.body jsonb; searchPosts uses title+excerpt]
// [CITED: src/app/sitemap.ts L41-45 — searchParams + published-only filter pattern]
// [CITED: src/lib/queries/posts.ts searchPosts — the FTS query (Plan 06-01)]
//
// The public /search route (SITE-08 / D-09). A server-rendered page that:
//   1. Reads URL searchParams (q, category, author, dateFrom, dateTo, page).
//   2. Renders the SearchForm (a plain GET <form>) pre-filled with the current values.
//   3. When a query is present, streams ranked FTS results inside <Suspense>
//      (searchPosts is uncached — under cacheComponents it MUST be in <Suspense>).
//   4. Renders empty states for no query (D-16) and no results (D-16).
//
// NO client JS. The SearchForm is a progressive-enhancement GET form; filter changes
// re-navigate to /search?... with the new searchParams (the browser handles it).
//
// Server-only — NO "use client" directive.

import { Suspense } from "react";
import type { Metadata } from "next";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildArchiveMetadata } from "@/lib/seo/metadata";
import SearchForm, { type SearchFormValues } from "@/components/site/SearchForm";
import PostCard from "@/components/site/PostCard";
import { searchPosts, type SearchFilters } from "@/lib/queries/posts";

/**
 * Parse + validate searchParams (T-06-17 mitigation — V5/V8 ASVS input validation).
 *
 * URL searchParams can carry `string | string[] | undefined` per key; the GET form
 * emits one value per key, but a tampered URL may send duplicates. Each value is
 * flattened to its first entry, trimmed, length-bounded, and coerced before it
 * reaches the FTS query. Bad types fall back to safe defaults rather than throwing.
 *
 * Manual parsing avoids Zod preprocess API drift across versions and keeps the
 * boundary explicit (every coercion is visible).
 */
function parseSearch(raw: Record<string, string | string[] | undefined>): ParsedSearch {
  return {
    q: bounded(firstValue(raw.q), 200),
    category: bounded(firstValue(raw.category), 50),
    author: bounded(firstValue(raw.author), 100),
    dateFrom: bounded(firstValue(raw.dateFrom), 20),
    dateTo: bounded(firstValue(raw.dateTo), 20),
    page: clampPage(firstValue(raw.page)),
  };
}

/** Parsed search shape (the values the page + form both consume). */
interface ParsedSearch {
  q: string;
  category: string;
  author: string;
  dateFrom: string;
  dateTo: string;
  page: number;
}

/** Read the first value of a string | string[] | undefined (URL searchParams shape). */
function firstValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/** Trim + length-bound a string searchParam (empty when absent). */
function bounded(v: string | undefined, max: number): string {
  const s = (v ?? "").trim();
  return s.slice(0, max);
}

/** Parse the page number (≥1, ≤1000 — bounds prevent offset abuse). */
function clampPage(v: string | undefined): number {
  const n = Number.parseInt((v ?? "1").trim(), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 1000);
}

/**
 * Build the SearchFilters object for searchPosts from the parsed params.
 * Dates are parsed to Date (NaN-safe); numbers to int; empty strings → undefined.
 */
function toSearchFilters(p: ParsedSearch): SearchFilters {
  const filters: SearchFilters = {};
  const categoryId = Number.parseInt(p.category, 10);
  if (Number.isFinite(categoryId) && categoryId > 0) filters.categoryId = categoryId;
  if (p.author) filters.authorId = p.author;
  const from = new Date(p.dateFrom);
  if (!Number.isNaN(from.getTime())) filters.dateFrom = from;
  const to = new Date(p.dateTo);
  if (!Number.isNaN(to.getTime())) filters.dateTo = to;
  return filters;
}

/**
 * generateMetadata — settings-driven (D-02 / Pitfall 1). The query term appears in
 * the title so users (and SERP crawlers) see the active search reflected. Returns
 * a generic "Search" title when no query is present.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  "use cache";
  const awaited = await searchParams;
  const p = parseSearch(awaited);
  const s = await getSeoSettings();
  return buildArchiveMetadata(
    {
      name: p.q || "Search",
      kind: "search",
      path: "/search",
    },
    s,
  );
}

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * SearchPage — the /search route.
 *
 * Layout:
 *  - <SearchForm /> (always rendered, pre-filled with the current values).
 *  - When no query → empty-state prompt (D-16): "Enter a search term to find posts".
 *  - When query present → <Suspense> wrapping <SearchResults> (searchPosts is
 *    uncached DB access; under cacheComponents it MUST stream in <Suspense>).
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const awaited = await searchParams;
  const p = parseSearch(awaited);

  const formValues: SearchFormValues = {
    q: p.q,
    category: p.category,
    author: p.author,
    dateFrom: p.dateFrom,
    dateTo: p.dateTo,
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Search</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Find posts across the blog. Matches titles and excerpts.
        </p>
      </header>

      <SearchForm values={formValues} />

      <div className="mt-8">
        {p.q.trim() === "" ? (
          <NoQueryState />
        ) : (
          <Suspense fallback={<ResultsSkeleton />}>
            <SearchResults q={p.q} filters={toSearchFilters(p)} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

/**
 * SearchResults — the async streaming component that runs the FTS query.
 *
 * NO 'use cache' — searchParams make this route dynamic; the query runs per request.
 * searchPosts uses websearch_to_tsquery('simple', q) with ts_rank ordering. The
 * 'simple' config has no stemming (no PG Bengali stemmer exists — SEARCH-02 v2 caveat),
 * so Bangla queries match correctly.
 */
async function SearchResults({
  q,
  filters,
}: {
  q: string;
  filters: SearchFilters;
}) {
  const results = await searchPosts(q, filters);

  if (results.length === 0) {
    return <NoResultsState q={q} />;
  }

  // searchPosts caps at 20 rows (src/lib/queries/posts.ts). For v1 the result cap
  // is generous enough that all matches fit on a single page (D-03 numbered
  // pagination is the canonical pattern; the limit is a deliberate v1 scope-lean
  // choice — the SearchForm's hidden page=1 input reserves the param for expansion).
  return (
    <section aria-label="Search results">
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
        {results.length} result{results.length === 1 ? "" : "s"} for{" "}
        <span className="font-semibold text-gray-900 dark:text-white">“{q}”</span>
      </p>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((post) => (
          <PostCard
            key={post.id}
            id={post.id}
            title={post.title}
            slug={post.slug}
            excerpt={post.excerpt}
            featureImage={post.featureImage}
            publishedAt={post.publishedAt}
            // searchPosts does not join user (the FTS query targets posts.searchVector
            // built from title+excerpt — author info is not part of the search signal).
            // Mirrors the RelatedPosts pattern: pass null rather than extending the
            // FTS query with a user join (kept lean for v1). Bylines are omitted on
            // search cards; the result's title/excerpt/rank carry the relevance signal.
            authorName={null}
            authorUsername={null}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * NoQueryState — D-16 friendly empty state for the initial /search visit (no query).
 */
function NoQueryState() {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-900/50">
      <p className="text-base font-medium text-gray-700 dark:text-gray-300">
        Enter a search term to find posts
      </p>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Try a topic, a title fragment, or an author&rsquo;s name.
      </p>
    </div>
  );
}

/**
 * NoResultsState — D-16 friendly empty state when a query yields zero matches.
 */
function NoResultsState({ q }: { q: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-900/50">
      <p className="text-base font-medium text-gray-700 dark:text-gray-300">
        No results for{" "}
        <span className="font-semibold text-gray-900 dark:text-white">“{q}”</span>
      </p>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Try different terms or remove filters.
      </p>
    </div>
  );
}

/**
 * ResultsSkeleton — pulsing placeholder shown while the FTS query streams
 * (D-16 — skeletons over spinners). Mirrors the PostCard grid dimensions.
 */
function ResultsSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mb-6 h-4 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
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
