// src/components/site/SiteHeader.tsx
// [CITED: 06-02-PLAN.md Task 1 — public site header]
// [CITED: 06-CONTEXT.md D-10 — standard chrome: logo/title + nav + Categories dropdown + search icon + dark toggle]
// [CITED: 06-CONTEXT.md D-13 — dark mode route-isolated; ThemeToggle is a separate client component]
//
// Public site header. Server component (no "use client") — reads cached SEO settings
// for the site title/logo and the cached categories list for the dropdown (D-10).
//
// Nav is HARD-CODED for v1 (Home, Blog, About, Contact) — the menu builder is v2
// SETT-01 per D-10. The Categories dropdown is a cached server fetch via
// listCategoriesWithCounts (from 06-01's lib/queries/taxonomy), NOT an admin action.
//
// Search icon links to /search (D-09 — page-only, server-GET; no client autocomplete).
// The ThemeToggle is a small client island (the only interactive piece here).

import Link from "next/link";
import Image from "next/image";
import { getSeoSettings } from "@/lib/seo/settings";
import { listCategoriesWithCounts } from "@/lib/queries/taxonomy";
import ThemeToggle from "./ThemeToggle";

/**
 * SiteHeader — public site chrome top bar.
 *
 * Renders: logo/site-title (links to /), hard-coded nav (D-10), Categories dropdown
 * (cached server fetch), search icon (links to /search), and the ThemeToggle.
 */
export default async function SiteHeader() {
  // Both reads are cached ('use cache' inside each) so this stays ISR-friendly.
  const [seo, categories] = await Promise.all([
    getSeoSettings(),
    listCategoriesWithCounts(),
  ]);

  const logoUrl = "/images/logo/sees-logo.png"; // TODO v2: read site.logo from settings when the settings/general page ships.

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        {/* Logo / site title */}
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white"
        >
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={seo.siteTitle}
              width={150}
              height={32}
              priority
            />
          ) : (
            <span>{seo.siteTitle}</span>
          )}
        </Link>

        {/* Hard-coded nav (D-10 — menu builder is v2 SETT-01) */}
        <nav
          className="hidden items-center gap-6 text-sm font-medium text-gray-600 md:flex dark:text-gray-300"
          aria-label="Main navigation"
        >
          <Link href="/" className="hover:text-gray-900 dark:hover:text-white">
            Home
          </Link>
          <Link href="/blog" className="hover:text-gray-900 dark:hover:text-white">
            Blog
          </Link>

          {/* Categories dropdown — cached server fetch (D-10) */}
          {categories.length > 0 ? (
            <div className="group relative">
              <button
                type="button"
                className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white"
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
            className="hover:text-gray-900 dark:hover:text-white"
          >
            About
          </Link>
          <Link
            href="/contact"
            className="hover:text-gray-900 dark:hover:text-white"
          >
            Contact
          </Link>
        </nav>

        {/* Right cluster: search icon + dark-mode toggle */}
        <div className="flex items-center gap-2">
          <Link
            href="/search"
            aria-label="Search"
            className="flex items-center justify-center h-9 w-9 rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
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
  );
}
