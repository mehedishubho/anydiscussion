// src/app/(site)/tag/[slug]/page.tsx
// [CITED: 06-04-PLAN.md Task 3 — tag archive reusing ArchiveList (SITE-05, D-14)]
// [CITED: CLAUDE.md — Next 16 async params + searchParams]
// [CITED: 06-CONTEXT.md D-14 — reuse archive template + BreadcrumbList JSON-LD]
// [CITED: src/lib/seo/jsonld.ts — breadcrumbListJsonLd closes Phase 5 D-03]
//
// /tag/[slug] — the tag archive. Reuses ArchiveList pre-filtered to the one tag
// (D-14). The tag filter input is hidden (the route IS the scope); category/
// author/date filters remain active via searchParams. Injects a BreadcrumbList
// JSON-LD (Home › Tag) closing the Phase 5 D-03 deferral. notFound() when the
// tag does not exist.
//
// Server-only — NO "use client" directive.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildArchiveMetadata } from "@/lib/seo/metadata";
import { breadcrumbListJsonLd } from "@/lib/seo/jsonld";
import {
  getTagBySlug,
  listCategoriesWithCounts,
  listTags,
} from "@/lib/queries/taxonomy";
import {
  listArchive,
  countArchive,
  type ArchiveFilters,
  ARCHIVE_PAGE_SIZE,
} from "@/lib/queries/archive";
import { listAuthors } from "@/lib/queries/users";
import ArchiveList from "@/components/site/ArchiveList";
import type { PostCardProps } from "@/components/site/PostCard";

/**
 * searchParams parser for the tag route filters. tag is NOT parsed here — it
 * comes from the route slug (the route IS the scope). category/author/date are
 * optional URL filters.
 */
const tagParamsSchema = z.object({
  category: z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  author: z
    .string()
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  dateFrom: z
    .string()
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  dateTo: z
    .string()
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  page: z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
});

interface TagPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: TagPageProps): Promise<Metadata> {
  "use cache";
  const { slug } = await params;
  const tag = await getTagBySlug(slug);
  if (!tag) {
    return { title: "Not Found", robots: { index: false, follow: false } };
  }
  const s = await getSeoSettings();
  return buildArchiveMetadata(
    {
      name: tag.name,
      kind: "tag",
      path: `/tag/${tag.slug}`,
    },
    s,
  );
}

/** Coerce a searchParam to a single string. */
function coerceParam(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function TagArchivePage({
  params,
  searchParams,
}: TagPageProps) {
  const { slug } = await params;
  const tag = await getTagBySlug(slug);
  if (!tag) {
    notFound();
  }

  const rawSearchParams = await searchParams;
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(rawSearchParams)) {
    flat[key] = coerceParam(value);
  }
  const parsed = tagParamsSchema.safeParse(flat);
  const p = parsed.success ? (parsed.data as Record<string, unknown>) : {};

  const filters: ArchiveFilters = { tagId: tag.id };
  if (typeof p.category === "number") filters.categoryId = p.category;
  if (typeof p.author === "string") filters.authorId = p.author;
  if (typeof p.dateFrom === "string") filters.dateFrom = new Date(p.dateFrom);
  if (typeof p.dateTo === "string") {
    const d = new Date(p.dateTo);
    d.setUTCHours(23, 59, 59, 999);
    filters.dateTo = d;
  }
  const page = typeof p.page === "number" ? p.page : 1;

  const [rows, total, categories, tags, authors, seoSettings] = await Promise.all([
    listArchive(filters, page),
    countArchive(filters),
    listCategoriesWithCounts(),
    listTags(),
    listAuthors(),
    getSeoSettings(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE));
  const cards: PostCardProps[] = rows.map((r) => {
    const row = r as {
      posts: {
        id: number;
        title: string;
        slug: string;
        excerpt: string | null;
        featureImage: string | null;
        publishedAt: Date | null;
      };
      user: { name: string | null; username: string | null } | null;
    };
    return {
      id: row.posts.id,
      title: row.posts.title,
      slug: row.posts.slug,
      excerpt: row.posts.excerpt,
      featureImage: row.posts.featureImage,
      publishedAt: row.posts.publishedAt,
      authorName: row.user?.name ?? null,
      authorUsername: row.user?.username ?? null,
    };
  });

  // BreadcrumbList JSON-LD (Home › Tag) — closes Phase 5 D-03 (D-14).
  const tagPath = `/tag/${tag.slug}`;
  const breadcrumb = breadcrumbListJsonLd({
    items: [
      { name: "Home", url: seoSettings.canonicalBaseUrl },
      { name: tag.name, url: `${seoSettings.canonicalBaseUrl}${tagPath}` },
    ],
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <ArchiveList
        posts={cards}
        currentPage={page}
        totalPages={totalPages}
        basePath={tagPath}
        searchParams={rawSearchParams}
        activeFilters={{
          categoryId: filters.categoryId,
          authorId: filters.authorId,
          dateFrom: filters.dateFrom
            ? filters.dateFrom.toISOString().slice(0, 10)
            : undefined,
          dateTo: filters.dateTo
            ? filters.dateTo.toISOString().slice(0, 10)
            : undefined,
        }}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
        }))}
        tags={tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug }))}
        authors={authors.map((a) => ({
          id: a.id,
          name: a.name,
          username: a.username,
        }))}
        hideTagFilter
        heading={`Tag: ${tag.name}`}
      />
    </div>
  );
}
