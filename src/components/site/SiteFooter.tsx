// src/components/site/SiteFooter.tsx
// [CITED: 06-02-PLAN.md Task 1 — public site footer]
// [CITED: 06-CONTEXT.md D-10 — footer = short site blurb + legal links + quick links + optional socials]
// [CITED: 260823-6je-PLAN.md locked decision 2 — SUPERSEDED by 260824-3l2 D-06:
//  the Newsletter column is now a functional client island (useActionState +
//  subscribeNewsletter Server Action) rendered inside this cache boundary,
//  not the inert visuals the earlier task shipped]
// [CITED: 260824-3l2-CONTEXT.md D-02 — newsletter.enabled=false renders NO
//  newsletter column at all (not a disabled form); texts come from the
//  newsletter.* settings keys with built-in defaults]
// [CITED: 260824-3l2-CONTEXT.md D-06 — Server Action is the only mutation path;
//  the column is a small client island inside the cached footer (only string
//  props cross the cache boundary — the island imports the action directly)]
// [CITED: 260823-6je-PLAN.md locked decision 3 — social circles render ONLY for configured settings keys; no Instagram, no dead "#" links]
// [CITED: 260823-6je-PLAN.md locked decision 6 — footer is ALWAYS dark: gray-900 light mode / gray-950 dark mode, white/10 borders]
// [CITED: 260823-6je-PLAN.md locked decision 7 — dynamic Categories column bounded ~6; footer cache carries BOTH tags: seo-settings AND posts-list]
// [CITED: 260823-79v-PLAN.md Task 1 — readSocialLinks + SOCIAL_ICON_PATHS extracted to shared modules (social-links query + footer-links pure lib); imports-only rewiring, rendered output unchanged]
//
// Public site footer. Cached Server Component ('use cache' below). The
// newsletter column is a CLIENT ISLAND (NewsletterForm) — the first client
// child of a component-level 'use cache' boundary in this codebase; the
// documented-safe shape (Next 16 use-cache docs: cached components may return
// trees containing client components; the island imports the Server Action
// itself, so no function prop crosses the boundary). Legal links point to the
// dashboard-managed `pages` routes (T&C + Privacy per SITE-11); they live in
// the Quick Links column — the 4-column design has no fifth Legal column
// (260823-6je).

import Link from "next/link";
import { cacheTag } from "next/cache";
import { getSeoSettings } from "@/lib/seo/settings";
import { listCategoriesWithCounts } from "@/lib/queries/taxonomy";
import { readSocialLinks } from "@/lib/queries/social-links";
import { readNewsletterSettings } from "@/lib/queries/newsletter-settings";
import {
  pickSocialLinks,
  boundFooterCategories,
  SOCIAL_ICON_PATHS,
} from "@/lib/footer-links";
import NewsletterForm from "@/components/site/NewsletterForm";

/**
 * SiteFooter — public site chrome bottom slab.
 *
 * ALWAYS dark (decision 6): gray-900 in light mode, gray-950 in dark mode,
 * white/10 borders — interior classes use ONE white/gray palette set with no
 * dark: variants. Four columns: brand + blurb + configured-only social circles
 * (decision 3) / Quick Links incl. legal / dynamic bounded Categories
 * (decision 7) / Newsletter client island — settings-driven, rendered ONLY
 * while newsletter.enabled (260824-3l2 D-02/D-06).
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
  // readNewsletterSettings runs at cache-fill time; its result is captured in
  // the cached output. Revalidation via this boundary's OWN seo-settings tag
  // (saveNewsletterSettings -> revalidateTag('seo-settings','max')) re-renders
  // the footer with new texts/visibility — no rebuild, no new cache machinery.
  const [seo, socials, categories, newsletter] = await Promise.all([
    getSeoSettings(),
    readSocialLinks(),
    listCategoriesWithCounts(),
    readNewsletterSettings(),
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

          {/* Newsletter — client island inside the cache boundary (260824-3l2
              D-02/D-06). enabled=false renders NO column at all (not a disabled
              form); the lg grid then lays 3 children in 4 tracks — accepted
              cosmetic (research A4), deliberately NO grid-class switching.
              Only the three string props cross the cache boundary; the island
              imports subscribeNewsletter directly (no function props, no
              headers() inside 'use cache'). */}
          {newsletter.enabled ? (
            <NewsletterForm
              heading={newsletter.heading}
              description={newsletter.description}
              successMessage={newsletter.successMessage}
            />
          ) : null}
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-gray-500">
          &copy; {year} {seo.siteTitle}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
