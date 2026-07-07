// src/components/site/SearchForm.tsx
// [CITED: 06-07-PLAN.md Task 1 — server GET form (progressive enhancement)]
// [CITED: 06-CONTEXT.md D-09 — page-only, server-GET, NO client autocomplete]
// [CITED: 06-PATTERNS.md "No Analog Found" — first progressive-enhancement server form]
//
// A plain HTML server-rendered <form method="GET" action="/search">. No client directive.
// The browser submits a GET to /search?q=...&category=...&author=...&dateFrom=...&dateTo=...
// — every interaction is a full-page navigation, fully crawlable and cacheable.
//
// D-09 explicitly rejected the header autocomplete box (client component + API Route).
// This form has ZERO client JS. Filter changes re-navigate to /search with the new
// searchParams (the browser handles the GET submit; no JS intercepts).
//
// The category dropdown options come from listCategoriesWithCounts (cached). Inputs
// are pre-filled with the current searchParams values (passed as props from the page)
// so the form reflects the active query on re-render after a GET.
//
// Server-only — NO client directive (D-09 / acceptance criteria).

import { listCategoriesWithCounts } from "@/lib/queries/taxonomy";

/** The raw string values the form reads from URL searchParams. */
export interface SearchFormValues {
  q: string;
  category: string;
  author: string;
  dateFrom: string;
  dateTo: string;
}

interface SearchFormProps {
  /** Current searchParams values for pre-filling the inputs. */
  values: SearchFormValues;
}

/** Shared Tailwind class strings for a consistent, accessible input style. */
const INPUT_CLASS =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white";
const LABEL_CLASS =
  "block text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400";

/**
 * SearchForm — the D-09 server-GET form.
 *
 * Renders a `<form action="/search" method="GET">` with the query input + optional
 * filter dropdowns. Every input's `name` attribute matches the searchParams key the
 * /search page parses. The form works with JavaScript disabled (progressive
 * enhancement) and is fully crawlable.
 *
 * The category dropdown is populated from the cached listCategoriesWithCounts query.
 * Other filters (author, date range) are plain text/date inputs — simple and
 * JS-free. The hidden `page` input resets pagination to 1 whenever the filters
 * change (so a narrowed query never lands on an out-of-range page).
 */
export default async function SearchForm({ values }: SearchFormProps) {
  // Categories come from the cached taxonomy query (D-10 dropdown reuse).
  const categories = await listCategoriesWithCounts();

  return (
    <form
      action="/search"
      method="GET"
      role="search"
      aria-label="Search posts"
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
    >
      {/* Query input — the primary field. name="q" matches the page parser. */}
      <div className="flex flex-col gap-2">
        <label htmlFor="search-q" className={LABEL_CLASS}>
          Search
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="search-q"
            type="search"
            name="q"
            value={values.q}
            placeholder="Search posts…"
            autoComplete="off"
            // D-09: NO client autocomplete. spellcheck off avoids OS spell-underlines
            // that imply a Latin-only expectation (Bangla content allowed).
            spellCheck={false}
            className={INPUT_CLASS}
            aria-describedby="search-q-help"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            Search
          </button>
        </div>
        <p id="search-q-help" className="text-xs text-gray-500 dark:text-gray-400">
          Search matches post titles and excerpts. Use quotes for exact phrases.
        </p>
      </div>

      {/* Filters — collapsed by default into a labelled row. Each filter submits
          via the GET form (changing a filter + pressing Search re-navigates). */}
      <fieldset className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="sr-only">Optional filters</legend>

        {/* Hidden page reset — any filter change starts from page 1. */}
        <input type="hidden" name="page" value="1" />

        <div className="flex flex-col gap-1">
          <label htmlFor="search-category" className={LABEL_CLASS}>
            Category
          </label>
          <select
            id="search-category"
            name="category"
            value={values.category}
            className={INPUT_CLASS}
          >
            <option value="">All categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={String(cat.id)}>
                {cat.name} ({cat.postCount})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="search-author" className={LABEL_CLASS}>
            Author username
          </label>
          <input
            id="search-author"
            type="text"
            name="author"
            value={values.author}
            placeholder="e.g. mehedi"
            autoComplete="off"
            className={INPUT_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="search-date-from" className={LABEL_CLASS}>
            Published from
          </label>
          <input
            id="search-date-from"
            type="date"
            name="dateFrom"
            value={values.dateFrom}
            className={INPUT_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="search-date-to" className={LABEL_CLASS}>
            Published to
          </label>
          <input
            id="search-date-to"
            type="date"
            name="dateTo"
            value={values.dateTo}
            className={INPUT_CLASS}
          />
        </div>
      </fieldset>
    </form>
  );
}
