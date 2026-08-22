// src/components/site/SiteFooter.tsx
// [CITED: 06-02-PLAN.md Task 1 — public site footer]
// [CITED: 06-CONTEXT.md D-10 — footer = short site blurb + legal links + quick links + optional socials]
// [CITED: 260823-6je-PLAN.md locked decision 2 — Newsletter column is frontend-only visuals (inert button, no form, no Server Action, zero client JS)]
// [CITED: 260823-6je-PLAN.md locked decision 3 — social circles render ONLY for configured settings keys; no Instagram, no dead "#" links]
// [CITED: 260823-6je-PLAN.md locked decision 6 — footer is ALWAYS dark: gray-900 light mode / gray-950 dark mode, white/10 borders]
// [CITED: 260823-6je-PLAN.md locked decision 7 — dynamic Categories column bounded ~6; footer cache carries BOTH tags: seo-settings AND posts-list]
//
// Public site footer. Server component (no "use client") — pure visuals for the
// newsletter column (decision 2): the Subscribe button is inert (type="button",
// no wrapping form, no Server Action); backend wiring comes in a later task.
// Legal links point to the dashboard-managed `pages` routes (T&C + Privacy per
// SITE-11); they live in the Quick Links column — the 4-column design has no
// fifth Legal column (260823-6je).

import Link from "next/link";
import { cacheTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getSeoSettings } from "@/lib/seo/settings";
import { listCategoriesWithCounts } from "@/lib/queries/taxonomy";
import { pickSocialLinks, boundFooterCategories } from "@/lib/footer-links";

/** Settings keys for optional footer social links (D-10). */
const SOCIAL_KEYS = [
  "footer.social_twitter",
  "footer.social_facebook",
  "footer.social_linkedin",
] as const;

/**
 * The social-circle SVG paths, keyed by pickSocialLinks' key union. Reused
 * verbatim from the pre-restyle footer markup (decision 3 — configured keys
 * only, never Instagram).
 */
const SOCIAL_ICON_PATHS: Record<"twitter" | "facebook" | "linkedin", string> = {
  twitter:
    "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  facebook:
    "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
};

/**
 * readSocialLinks — reads the optional footer social-link settings rows.
 * Returns each key's raw value (null when absent); the configured-only picking
 * (trim, order, labels) lives in the pure helper pickSocialLinks.
 *
 * 'use cache' + cacheTag('seo-settings') REQUIRED under cacheComponents:true:
 * SiteFooter renders inside the (site) layout, whose component body is NOT
 * cached (only its generateMetadata is). Without 'use cache' here, every
 * (site) route hits an uncached DB read at prerender -> "Uncached data outside
 * <Suspense>" build error. The seo-settings tag lets saveSeoSettings invalidate
 * social-link edits too (2-arg revalidateTag in src/actions/settings.ts).
 */
async function readSocialLinks(): Promise<{
  twitter: string | null;
  facebook: string | null;
  linkedin: string | null;
}> {
  "use cache";
  cacheTag("seo-settings");
  // Single fetch of all three keys — one round-trip per key in parallel.
  const all = await Promise.all(
    SOCIAL_KEYS.map(async (k) => {
      const [row] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, k))
        .limit(1);
      return [k, row?.value ?? null] as const;
    }),
  );
  const map = Object.fromEntries(all);
  return {
    twitter: map[SOCIAL_KEYS[0]] ?? null,
    facebook: map[SOCIAL_KEYS[1]] ?? null,
    linkedin: map[SOCIAL_KEYS[2]] ?? null,
  };
}

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
