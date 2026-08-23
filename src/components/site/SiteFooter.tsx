// src/components/site/SiteFooter.tsx
// [CITED: 06-02-PLAN.md Task 1 — public site footer]
// [CITED: 06-CONTEXT.md D-10 — footer = short site blurb + legal links + quick links + optional socials]
// [CITED: 260823-6je-PLAN.md locked decision 2 — Newsletter column is frontend-only visuals (inert button, no form, no Server Action, zero client JS)]
// [CITED: 260823-6je-PLAN.md locked decision 3 — social circles render ONLY for configured settings keys; no Instagram, no dead "#" links]
// [CITED: 260823-6je-PLAN.md locked decision 6 — footer is ALWAYS dark: gray-900 light mode / gray-950 dark mode, white/10 borders]
// [CITED: 260823-6je-PLAN.md locked decision 7 — dynamic Categories column bounded ~6; footer cache carries BOTH tags: seo-settings AND posts-list]
// [CITED: 260823-79v-PLAN.md Task 1 — readSocialLinks + SOCIAL_ICON_PATHS extracted to shared modules (social-links query + footer-links pure lib); imports-only rewiring, rendered output unchanged]
//
// Public site footer. Server component (no "use client") — pure visuals for the
// newsletter column (decision 2): the Subscribe button is inert (type="button",
// no wrapping form, no Server Action); backend wiring comes in a later task.
// Legal links point to the dashboard-managed `pages` routes (T&C + Privacy per
// SITE-11); they live in the Quick Links column — the 4-column design has no
// fifth Legal column (260823-6je).

import Link from "next/link";
import { cacheTag } from "next/cache";
import { getSeoSettings } from "@/lib/seo/settings";
import { listCategoriesWithCounts } from "@/lib/queries/taxonomy";
import { readSocialLinks } from "@/lib/queries/social-links";
import {
  pickSocialLinks,
  boundFooterCategories,
  SOCIAL_ICON_PATHS,
} from "@/lib/footer-links";

/**
 * SiteFooter — public site chrome bottom slab.
 *
 * ALWAYS dark (decision 6): gray-900 in light mode, gray-950 in dark mode,
 * white/10 borders — interior classes use ONE white/gray palette set with no
 * dark: variants. Four columns: brand + blurb + configured-only social circles
 * (decision 3) / Quick Links incl. legal / dynamic bounded Categories
 * (decision 7) / inert Newsletter visuals (decision 2).
 */
export default async function SiteFooter() {
  // Cache Component: the footer renders in the shared (site) layout, and
  // `new Date()` (copyright year) is non-deterministic. Under cacheComponents a
  // Server Component can't read the current time at prerender without a cache
  // boundary — 'use cache' provides it (the year freezes at cache-write time and
  // refreshes on revalidation; acceptable for a copyright line).
  //
  // TWO tags on this boundary (decision 7): seo-settings refreshes the footer on
  // settings saves, and posts-list re-renders it on category mutations —
  // src/actions/categories.ts revalidateTag("posts-list", "max") on
  // create/update/delete. Only tags declared on the footer's OWN cache boundary
  // re-render the footer; refreshing the nested listCategoriesWithCounts cache
  // entry alone would NOT re-render this markup.
  "use cache";
  cacheTag("seo-settings");
  cacheTag("posts-list");
  const [seo, socials, categories] = await Promise.all([
    getSeoSettings(),
    readSocialLinks(),
    listCategoriesWithCounts(),
  ]);

  const year = new Date().getFullYear();
  const socialLinks = pickSocialLinks(socials);
  const footerCategories = boundFooterCategories(categories, 6);

  return (
    <footer className="mt-16 bg-gray-900 dark:bg-gray-950">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column: speech-bubble mark + wordmark + blurb + social circles */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-brand-400">
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
              <span className="text-xl font-bold tracking-tight text-white">
                anydiscussion
              </span>
            </div>
            <p className="mt-4 text-sm text-gray-400">
              {seo.siteDescription || "Insights, stories, and discussions."}
            </p>

            {/* Configured-only social circles (decision 3) — no row at all when none are set */}
            {socialLinks.length > 0 ? (
              <div className="mt-5 flex gap-3">
                {socialLinks.map((social) => (
                  <a
                    key={social.key}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-gray-400 transition-colors hover:border-brand-400 hover:text-white"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d={SOCIAL_ICON_PATHS[social.key]} />
                    </svg>
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          {/* Quick links incl. legal (T&C + Privacy — no fifth column in the design) */}
          <nav aria-label="Quick links">
            <h3 className="mb-4 text-base font-semibold text-white">
              Quick Links
            </h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <Link href="/" className="transition-colors hover:text-white">
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/blog"
                  className="transition-colors hover:text-white"
                >
                  Blog
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="transition-colors hover:text-white"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="transition-colors hover:text-white"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  href="/terms-and-conditions"
                  className="transition-colors hover:text-white"
                >
                  Terms and Conditions
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy-policy"
                  className="transition-colors hover:text-white"
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </nav>

          {/* Categories — dynamic from DB, bounded ~6, most-published first (decision 7) */}
          <nav aria-label="Categories">
            <h3 className="mb-4 text-base font-semibold text-white">
              Categories
            </h3>
            <ul className="space-y-2 text-sm text-gray-400">
              {footerCategories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/category/${category.slug}`}
                    className="transition-colors hover:text-white"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Newsletter — frontend-only visuals (decision 2): inert input + button, NO form element, NO Server Action */}
          <div>
            <h3 className="mb-4 text-base font-semibold text-white">
              Newsletter
            </h3>
            <p className="mb-4 text-sm text-gray-400">
              Subscribe for the latest posts delivered straight to your inbox.
            </p>
            <div className="flex gap-3">
              <input
                type="email"
                name="email"
                placeholder="Enter your email"
                aria-label="Email address"
                className="w-full min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white transition-colors placeholder:text-gray-500 focus:border-brand-400 focus:outline-none"
              />
              <button
                type="button"
                className="shrink-0 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                Subscribe
              </button>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-gray-500">
          &copy; {year} {seo.siteTitle}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
