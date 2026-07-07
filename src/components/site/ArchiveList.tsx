// src/components/site/ArchiveList.tsx
// [CITED: 06-04-PLAN.md Task 2 — reusable filterable list (D-12, D-14)]
// [CITED: 06-CONTEXT.md D-12 — top filter bar (category/tag/author/date-range) + numbered pagination]
// [CITED: 06-CONTEXT.md D-14 — reused by /category/[slug] + /tag/[slug], pre-filtered]
// [CITED: 06-CONTEXT.md D-16 — friendly empty states]
// [CITED: 06-PATTERNS.md ArchiveList row — partial-match from TailAdmin tables]
//
// The reusable dense list component. Server component — renders PostCards in a
// compact scanning layout plus a top filter bar driven by URL searchParams (GET
// form, works without JS). Consumed by /archive, /category/[slug], /tag/[slug].
//
// Filter bar: a <form method="get"> whose field names match the searchParams keys
// (category, tag, author, dateFrom, dateTo). The form submits to the current
// basePath, so the page's searchParams parsing drives the listArchive call.
// Individual filter inputs can be hidden via props (e.g. hide the category filter
// on /category/[slug] since the route is already scoped to one category).
//
// Pagination: delegates to the shared <Pagination> component, passing the current
// searchParams so the page number is preserved alongside the active filters.
//
// Server-only — NO "use client" directive.

import Link from "next/link";
import PostCard, { type PostCardProps } from "@/components/site/PostCard";
import Pagination from "@/components/site/Pagination";

/** Category option for the filter dropdown. */
export interface CategoryOption {
  id: number;
  name: string;
  slug: string;
}

/** Tag option for the filter dropdown. */
export interface TagOption {
  id: number;
  name: string;
  slug: string;
}

/** Author option for the filter dropdown. */
export interface AuthorOption {
  id: string;
  name: string;
  username: string | null;
}

/** The active filter state (pre-selects the dropdown values). */
export interface ActiveFilters {
  categoryId?: number;
  tagId?: number;
  authorId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ArchiveListProps {
  /** Post cards to render (already mapped to PostCardProps by the route). */
  posts: PostCardProps[];
  /** Current 1-based page number. */
  currentPage: number;
  /** Total number of pages (for pagination). */
  totalPages: number;
  /** Base path for pagination + filter form action (e.g. "/archive", "/category/tech"). */
  basePath: string;
  /** Current searchParams (preserved across pagination links). */
  searchParams?: Record<string, string | string[] | undefined>;
  /** Active filter values (pre-selects the dropdowns). */
  activeFilters?: ActiveFilters;
  /** Dropdown data — omit any to hide that filter input. */
  categories?: CategoryOption[];
  tags?: TagOption[];
  authors?: AuthorOption[];
  /** Hide specific filters even when their data is provided (for scoped routes). */
  hideCategoryFilter?: boolean;
  hideTagFilter?: boolean;
  hideAuthorFilter?: boolean;
  /** Optional heading rendered above the filter bar. */
  heading?: string;
  /** Optional description rendered below the heading. */
  description?: string | null;
}

export default function ArchiveList({
  posts,
  currentPage,
  totalPages,
  basePath,
  searchParams,
  activeFilters = {},
  categories,
  tags,
  authors,
  hideCategoryFilter = false,
  hideTagFilter = false,
  hideAuthorFilter = false,
  heading,
  description,
}: ArchiveListProps) {
  const showCategoryFilter = categories && !hideCategoryFilter;
  const showTagFilter = tags && !hideTagFilter;
  const showAuthorFilter = authors && !hideAuthorFilter;
  const hasAnyFilter =
    Boolean(showCategoryFilter || showTagFilter || showAuthorFilter);

  return (
    <div>
      {heading ? (
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
            {heading}
          </h1>
          {description ? (
            <p className="mt-2 text-base text-gray-600 dark:text-gray-400">
              {description}
            </p>
          ) : null}
        </header>
      ) : null}

      {/* ─── FILTER BAR (D-12) ─── */}
      {hasAnyFilter ? (
        <form
          method="get"
          action={basePath}
          className="mb-8 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {showCategoryFilter ? (
              <FilterField label="Category" htmlFor="filter-category">
                <select
                  id="filter-category"
                  name="category"
                  defaultValue={activeFilters.categoryId?.toString() ?? ""}
                  className={INPUT_CLASS}
                >
                  <option value="">All categories</option>
                  {categories!.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FilterField>
            ) : null}

            {showTagFilter ? (
              <FilterField label="Tag" htmlFor="filter-tag">
                <select
                  id="filter-tag"
                  name="tag"
                  defaultValue={activeFilters.tagId?.toString() ?? ""}
                  className={INPUT_CLASS}
                >
                  <option value="">All tags</option>
                  {tags!.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </FilterField>
            ) : null}

            {showAuthorFilter ? (
              <FilterField label="Author" htmlFor="filter-author">
                <select
                  id="filter-author"
                  name="author"
                  defaultValue={activeFilters.authorId ?? ""}
                  className={INPUT_CLASS}
                >
                  <option value="">All authors</option>
                  {authors!.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </FilterField>
            ) : null}

            <FilterField label="From date" htmlFor="filter-date-from">
              <input
                id="filter-date-from"
                name="dateFrom"
                type="date"
                defaultValue={activeFilters.dateFrom ?? ""}
                className={INPUT_CLASS}
              />
            </FilterField>

            <FilterField label="To date" htmlFor="filter-date-to">
              <input
                id="filter-date-to"
                name="dateTo"
                type="date"
                defaultValue={activeFilters.dateTo ?? ""}
                className={INPUT_CLASS}
              />
            </FilterField>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              Apply filters
            </button>
            <Link
              href={basePath}
              className="text-sm text-gray-600 hover:underline dark:text-gray-400"
            >
              Clear filters
            </Link>
          </div>
        </form>
      ) : null}

      {/* ─── POST LIST ─── */}
      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
          <p className="text-base text-gray-600 dark:text-gray-400">
            No posts found — try adjusting your filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((card) => (
            <PostCard key={card.id} {...card} />
          ))}
        </div>
      )}

      {/* ─── NUMBERED PAGINATION (D-12) ─── */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath={basePath}
        searchParams={searchParams}
      />
    </div>
  );
}

const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";

function FilterField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
