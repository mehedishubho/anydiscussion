// src/app/(site)/about/page.tsx
// [CITED: 06-06-PLAN.md Task 1 — About is a hard-coded TSX marketing page (SITE-09)]
// [CITED: 06-CONTEXT.md — "About page content — marketing, founder-authored at build time"]
// [CITED: src/app/(site)/page.tsx — the cached generateMetadata pattern for static routes]
// [CITED: src/lib/seo/metadata.ts — buildPageMetadata (the pages-row builder, reused with static values)]
//
// The About page is hand-written JSX marketing copy — NOT a dashboard-managed pages row
// and NOT CMS content. Per SITE-09 this page makes ZERO database queries. The founder
// authors the copy directly here at build time; the placeholder copy below should be
// replaced with the real brand story before launch (a CONTEXT.md discretion item).
//
// CRITICAL (acceptance): this file makes ZERO database queries (no published-post or
// published-page read helpers) and uses NO raw-HTML injection — the content is literal
// JSX. Pitfall #2 / T-06-15 do not apply because there is no stored HTML to sanitize.
//
// Server Component by default (NO "use client"). generateMetadata uses 'use cache' +
// getSeoSettings per the established pattern (Pitfall 1 — settings-driven metadata on
// an otherwise-prerenderable route needs explicit caching under cacheComponents:true).

import type { Metadata } from "next";
import Link from "next/link";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildPageMetadata, type PageLike } from "@/lib/seo/metadata";

// Static About-page metadata input. Reuses the pages-row builder for consistency so
// canonical/OG/title logic is shared. No DB row backs this — the values are literals.
const ABOUT_PAGE: PageLike = {
  slug: "about",
  title: "About Us",
  metaTitle: "About Any Discussion",
  metaDescription:
    "Learn about Any Discussion — our mission, our editorial team, and what we publish.",
  canonical: "/about",
  // updatedAt is part of the PageLike contract; for a hard-coded page it is unused by
  // buildPageMetadata (only post metadata reads modifiedTime), so a sentinel is fine.
  updatedAt: new Date(0),
};

export async function generateMetadata(): Promise<Metadata> {
  "use cache";
  const s = await getSeoSettings();
  return buildPageMetadata(ABOUT_PAGE, s);
}

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
          About Any Discussion
        </h1>
        <p className="mt-3 text-lg text-gray-600 dark:text-gray-400">
          Stories, ideas, and conversations worth your time.
        </p>
      </header>

      <div className="prose prose-lg max-w-none dark:prose-invert">
        <h2>Our mission</h2>
        <p>
          Any Discussion is an independent publication exploring technology,
          culture, and the ideas that shape how we live and work. We publish
          thoughtful, well-researched writing in English and Bangla — built to
          be read at speed, without clutter or noise.
        </p>
        <p>
          {/* Placeholder copy — founder replaces before launch (CONTEXT.md discretion). */}
          We believe great writing should load instantly and read cleanly on any
          device. This site is built from the ground up for performance and
          search: every page is server-rendered, cached at the edge, and kept
          free of heavy client-side scripts.
        </p>

        <h2>Our editorial team</h2>
        <p>
          Our small team of editors and authors covers the topics that matter to
          our readers. We follow a simple draft → review → publish workflow so
          every post is checked before it goes live, and we cite our sources.
        </p>
        <ul>
          <li>Editors can create, edit, and publish posts across all categories.</li>
          <li>Authors can draft and submit posts for editor review.</li>
          <li>Admins manage the platform, users, and site-wide settings.</li>
        </ul>

        <h2>What we publish</h2>
        <p>
          From deep dives and explainers to practical guides and commentary, we
          cover a growing range of topics. Browse the latest on our{" "}
          <Link href="/blog">blog</Link>, or explore posts by{" "}
          <Link href="/archive">archive</Link>.
        </p>

        <h2>Get in touch</h2>
        <p>
          Have a question, a tip, or a story idea? We&apos;d love to hear from
          you. Reach out through our{" "}
          <Link href="/contact">contact page</Link> and we&apos;ll get back to
          you.
        </p>
      </div>

      <div className="mt-12 border-t border-gray-200 pt-8 dark:border-gray-800">
        <Link
          href="/contact"
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
        >
          Contact us
        </Link>
      </div>
    </article>
  );
}
