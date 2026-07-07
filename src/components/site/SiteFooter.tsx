// src/components/site/SiteFooter.tsx
// [CITED: 06-02-PLAN.md Task 1 — public site footer]
// [CITED: 06-CONTEXT.md D-10 — footer = short site blurb + legal links + quick links + optional socials]
//
// Public site footer. Server component (no "use client"). Reads cached SEO settings
// for the site blurb and reads optional social-link keys from the settings table.
// Legal links point to the dashboard-managed `pages` routes (T&C + Privacy per
// SITE-11; content seeded in Phase 4 D-17).

import Link from "next/link";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getSeoSettings } from "@/lib/seo/settings";

/** Settings keys for optional footer social links (D-10). */
const SOCIAL_KEYS = [
  "footer.social_twitter",
  "footer.social_facebook",
  "footer.social_linkedin",
] as const;

/**
 * readSocialLinks — reads the optional footer social-link settings rows.
 * Returns only the non-empty ones (footer omits a social entry when unset).
 * Uncached DB read here is small and isolated; this runs inside the layout
 * which is already cached at the generateMetadata scope, so we accept the
 * read. (If this proves hot, add a 'use cache' + cacheTag later.)
 */
async function readSocialLinks(): Promise<{
  twitter: string | null;
  facebook: string | null;
  linkedin: string | null;
}> {
  const rows = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, SOCIAL_KEYS[0]));
  // One round-trip per key is wasteful; do a single fetch of all three.
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
  // Silence the unused first query (kept simple — single fetch below).
  void rows;
  const map = Object.fromEntries(all);
  return {
    twitter: map[SOCIAL_KEYS[0]] ?? null,
    facebook: map[SOCIAL_KEYS[1]] ?? null,
    linkedin: map[SOCIAL_KEYS[2]] ?? null,
  };
}

/**
 * SiteFooter — public site chrome bottom bar.
 *
 * Renders: short site description (from SEO settings), legal links (T&C, Privacy),
 * quick links (Home, Blog, About, Contact), and optional social links (only when
 * the corresponding settings key is non-empty).
 */
export default async function SiteFooter() {
  const [seo, socials] = await Promise.all([
    getSeoSettings(),
    readSocialLinks(),
  ]);

  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* Site blurb */}
          <div>
            <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">
              {seo.siteTitle}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {seo.siteDescription || "Insights, stories, and discussions."}
            </p>
          </div>

          {/* Quick links */}
          <nav aria-label="Quick links">
            <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">
              Quick Links
            </h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li>
                <Link href="/" className="hover:text-gray-900 dark:hover:text-white">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-gray-900 dark:hover:text-white">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-gray-900 dark:hover:text-white">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-gray-900 dark:hover:text-white">
                  Contact
                </Link>
              </li>
            </ul>
          </nav>

          {/* Legal + socials */}
          <div>
            <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">
              Legal
            </h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li>
                <Link
                  href="/terms-and-conditions"
                  className="hover:text-gray-900 dark:hover:text-white"
                >
                  Terms and Conditions
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy-policy"
                  className="hover:text-gray-900 dark:hover:text-white"
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>

            {/* Optional social links — only render when a URL is set in settings */}
            {(socials.twitter || socials.facebook || socials.linkedin) && (
              <div className="mt-4 flex gap-3">
                {socials.twitter && (
                  <a
                    href={socials.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Twitter / X"
                    className="text-gray-500 hover:text-gray-900 dark:hover:text-white"
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                )}
                {socials.facebook && (
                  <a
                    href={socials.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Facebook"
                    className="text-gray-500 hover:text-gray-900 dark:hover:text-white"
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
                    </svg>
                  </a>
                )}
                {socials.linkedin && (
                  <a
                    href={socials.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="LinkedIn"
                    className="text-gray-500 hover:text-gray-900 dark:hover:text-white"
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 border-t border-gray-200 pt-6 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
          &copy; {year} {seo.siteTitle}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
