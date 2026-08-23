// src/components/site/SiteHeader.tsx
// [CITED: 06-02-PLAN.md Task 1 — public site header]
// [CITED: 06-CONTEXT.md D-10 — standard chrome: logo/title + nav + Categories dropdown + search icon + dark toggle]
// [CITED: 06-CONTEXT.md D-13 — dark mode route-isolated; ThemeToggle is a separate client component]
// [CITED: 260823-6je-PLAN.md locked decision 1 — all 5 nav entries survive the restyle (Blog stays one click away)]
// [CITED: 260823-6je-PLAN.md locked decision 4 — speech-bubble SVG + lowercase "anydiscussion" wordmark replace the image logo (site header only; the dashboard header keeps its own logo)]
// [CITED: 260823-6je-PLAN.md locked decision 5 — circular outlined search button beside the ThemeToggle]
// [CITED: 260823-79v-PLAN.md locked decisions 1-5 — two-row header per frontpage design: non-sticky white row 1 + pure-CSS sticky gray category bar row 2]
//
// Public site header, restructured into TWO SIBLING rows (260823-79v):
//
//   ROW 1 — solid white (gray-900 dark) bar carrying the full 260823-6je
//   content: speech-bubble brand block, all 5 nav entries incl. the Categories
//   hover-dropdown (z-50 panel — it still paints ABOVE row 2 when opened),
//   circular outlined search link, ThemeToggle. NOT sticky — it scrolls away
//   with the page (locked decision 1).
//
//   ROW 2 — gray band (gray-100/95 light + gray-900/95 dark, border-b,
//   backdrop-blur) pinned via PURE CSS sticky at top-0 z-40 once row 1 scrolls
//   off (locked decisions 2 + 3): bounded ~10 most-published DB categories
//   left (boundHeaderBarCategories; horizontal overflow is the degrade path
//   for many/long Bangla names — never truncate or wrap) and configured-only
//   social circles right (pickSocialLinks; hidden below sm — mobile keeps the
//   scrolling category strip as its only navigation, locked decision 4).
//
// Pure server component — zero client directives anywhere in this file
// (comments included). The sticky mechanics introduce NO client JS: no scroll
// listener, no IntersectionObserver, no effects (locked decision 3). The
// ThemeToggle remains the only client island.
//
// The component awaits three cached reads (getSeoSettings,
// listCategoriesWithCounts, readSocialLinks — each one a cache boundary in
// itself) so SiteHeader is NOT a cache boundary itself; that posture is the
// proven single-header shape extended by one cached read (locked decision 5).
// The brand block is a fixed literal per 260823-6je decision 4 — never
// sourced from settings or an image asset.
//
// Nav is HARD-CODED for v1 (Home, Blog, About, Contact) — the menu builder is
// v2 SETT-01 per D-10. The Categories dropdown is a cached server fetch via
// listCategoriesWithCounts (from 06-01's lib/queries/taxonomy), NOT an admin
// action; row 2 re-sorts that same feed via the pure boundHeaderBarCategories.
//
// Search icon links to /search (D-09 — page-only, server-GET; no client-side
// autocomplete).

import Link from "next/link";
import { getSeoSettings } from "@/lib/seo/settings";
import { listCategoriesWithCounts } from "@/lib/queries/taxonomy";
import { readSocialLinks } from "@/lib/queries/social-links";
import {
  pickSocialLinks,
  SOCIAL_ICON_PATHS,
} from "@/lib/footer-links";
import { boundHeaderBarCategories } from "@/lib/header-bar";
import ThemeToggle from "./ThemeToggle";

/**
 * SiteHeader — public site chrome top bar, two rows (260823-79v).
 *
 * ROW 1 renders: brand block (speech-bubble icon + lowercase "anydiscussion"
 * wordmark, links to /), hard-coded nav (D-10) with the Categories dropdown
 * (cached server fetch), the circular outlined search link (to /search), and
 * the ThemeToggle — on solid white, scrolling away with the page.
 *
 * ROW 2 (rendered only when there is at least one category or configured
 * social link): the sticky gray category bar — most-published categories
 * left, configured-only social circles right.
 */
export default async function SiteHeader() {
  // All three reads are cached ('use cache' inside each) so this stays
  // ISR-friendly and the component itself is not a cache boundary.
  const [seo, categories, socials] = await Promise.all([
    getSeoSettings(),
    listCategoriesWithCounts(),
    readSocialLinks(),
  ]);

  const barCategories = boundHeaderBarCategories(categories);
  const socialLinks = pickSocialLinks(socials);

  return (
    <>
      {/* ROW 1 — non-sticky white nav bar (locked decision 1): scrolls away */}
      <header className="w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          {/* Brand block: speech-bubble icon + wordmark (260823-6je decision 4) */}
          <Link href="/" title={seo.siteTitle} className="flex items-center gap-2">
            <span className="text-brand-500 dark:text-brand-400">
              <svg
                className="h-8 w-8"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M6 4H18A3 3 0 0 1 21 7V14A3 3 0 0 1 18 17H11.5L8 20.3V17H6A3 3 0 0 1 3 14V7A3 3 0 0 1 6 4ZM7.5 9.1A1.4 1.4 0 1 0 7.5 11.9A1.4 1.4 0 1 0 7.5 9.1ZM12 9.1A1.4 1.4 0 1 0 12 11.9A1.4 1.4 0 1 0 12 9.1ZM16.5 9.1A1.4 1.4 0 1 0 16.5 11.9A1.4 1.4 0 1 0 16.5 9.1Z"
                />
              </svg>
            </span>
            <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              anydiscussion
            </span>
          </Link>

          {/* Hard-coded nav (D-10 — menu builder is v2 SETT-01; 260823-6je decision 1 keeps all five entries) */}
          <nav
            className="hidden items-center gap-6 text-sm font-medium text-gray-600 md:flex dark:text-gray-300"
            aria-label="Main navigation"
          >
            <Link
              href="/"
              className="transition-colors hover:text-gray-900 dark:hover:text-white"
            >
              Home
            </Link>
            <Link
              href="/blog"
              className="transition-colors hover:text-gray-900 dark:hover:text-white"
            >
              Blog
            </Link>

            {/* Categories dropdown — cached server fetch (D-10); z-50 panel paints above the sticky row-2 band */}
            {categories.length > 0 ? (
              <div className="group relative">
                <button
                  type="button"
                  className="flex items-center gap-1 transition-colors hover:text-gray-900 dark:hover:text-white"
                  aria-haspopup="true"
                >
                  Categories
                  <svg
                    className="h-4 w-4 transition-transform group-hover:rotate-180"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                <div className="invisible absolute left-0 top-full z-50 min-w-[12rem] -translate-y-1 rounded-lg border border-gray-200 bg-white py-2 opacity-0 shadow-lg transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-800">
                  {categories.map((cat) => (
                    <Link
                      key={cat.id}
                      href={`/category/${cat.slug}`}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                    >
                      {cat.name}
                      {cat.postCount > 0 ? (
                        <span className="ml-2 text-xs text-gray-400">
                          ({cat.postCount})
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <Link
              href="/about"
              className="transition-colors hover:text-gray-900 dark:hover:text-white"
            >
              About
            </Link>
            <Link
              href="/contact"
              className="transition-colors hover:text-gray-900 dark:hover:text-white"
            >
              Contact
            </Link>
          </nav>

          {/* Right cluster: circular outlined search link + dark-mode toggle (260823-6je decision 5) */}
          <div className="flex items-center gap-2">
            <Link
              href="/search"
              aria-label="Search"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-gray-600 transition-colors hover:border-brand-500 hover:text-brand-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-brand-400 dark:hover:text-brand-400"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ROW 2 — sticky gray category bar (locked decisions 2 + 3): pure CSS
          sticky, no client JS. Rendered only when there is something to show —
          a fully empty bar renders nothing (graceful zero-state for fresh DBs). */}
      {barCategories.length > 0 || socialLinks.length > 0 ? (
        <nav
          aria-label="Categories"
          className="sticky top-0 z-40 w-full border-b border-gray-200 bg-gray-100/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95"
        >
          <div className="mx-auto flex h-11 max-w-6xl items-center justify-between gap-4 px-4">
            {/* LEFT — bounded most-published categories; overflow-x-auto +
                whitespace-nowrap IS the degrade path for many/long (Bangla)
                names — never truncate or wrap. */}
            <div className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto whitespace-nowrap py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {barCategories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/category/${cat.slug}`}
                  className="whitespace-nowrap text-xs font-medium text-gray-600 transition-colors hover:text-gray-900 sm:text-sm dark:text-gray-300 dark:hover:text-white"
                >
                  {cat.name}
                </Link>
              ))}
            </div>

            {/* RIGHT — configured-only social circles (small and subtle, per
                locked decision 2): hidden below sm — mobile keeps the
                scrolling category strip as its only navigation. Never a
                placeholder link, never Instagram. */}
            <div className="hidden shrink-0 items-center gap-2.5 sm:flex">
              {socialLinks.map((social) => (
                <a
                  key={social.key}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-gray-500 transition-colors hover:border-brand-500 hover:text-brand-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-brand-400 dark:hover:text-brand-400"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d={SOCIAL_ICON_PATHS[social.key]} />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </nav>
      ) : null}
    </>
  );
}
