// src/app/(site)/archive/page.tsx
// [CITED: 06-04-PLAN.md Task 2 — /archive dense filterable list (SITE-03, D-12)]
// [CITED: CLAUDE.md — Next 16 async searchParams (await searchParams)]
// [CITED: 06-CONTEXT.md D-12 — top filter bar + numbered pagination]
// [CITED: 06-CONTEXT.md D-16 — friendly empty states]
// [CITED: threat_model T-06-10 — filter values parsed via Zod (no raw SQL concat)]
//
// /archive — the dense filterable archive. Filters (category/tag/author/date-range)
// are applied via URL searchParams; numbered pagination is URL-based. Uses the
// shared ArchiveList component. The page parses searchParams via Zod (T-06-10
// mitigation) and passes typed values to listArchive.
//
// Server-only — NO "use client" directive.

import type { Metadata } from "next";
import { z } from "zod";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildArchiveMetadata } from "@/lib/seo/metadata";
import {
  listArchive,
  countArchive,
  type ArchiveFilters,
  ARCHIVE_PAGE_SIZE,
} from "@/lib/queries/archive";
import { listCategoriesWithCounts, listTags } from "@/lib/queries/taxonomy";
import { listAuthors } from "@/lib/queries/users";
import ArchiveList from "@/components/site/ArchiveList";
import type { PostCardProps } from "@/components/site/PostCard";

/**
 * searchParams parser (T-06-10 mitigation). All filter values come from the URL
 * and are validated/coerced via Zod. Integers for category/tag/page, ISO dates
 * for the date range, string for author. Invalid values are silently dropped
 * (the archive shows unfiltered results rather than 500ing).
 */
const archiveParamsSchema = z.object({
  category: z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  tag: z
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

type ArchiveParams = z.infer<typeof archiveParamsSchema>;

interface ArchivePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: ArchivePageProps): Promise<Metadata> {
  "use cache";
  const s = await getSeoSettings();
  return buildArchiveMetadata(
    { name: "Archive", kind: "category", path: "/archive" },
    s,
  );
}

/** Coerce a searchParam (string | string[] | undefined) to a single string. */
function coerceParam(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Parse the raw searchParams into validated ArchiveFilters + a page number. */
function parseArchiveFilters(raw: Record<string, string | string[] | undefined>) {
  // Flatten arrays (a filter form submits single values; arrays are unexpected).
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    flat[key] = coerceParam(value);
  }
  const parsed = archiveParamsSchema.safeParse(flat);
  if (!parsed.success) {
    return { filters: {} as ArchiveFilters, page: 1 };
  }
  const p = parsed.data as ArchiveParams;
  const filters: ArchiveFilters = {};
  if (p.category) filters.categoryId = p.category;
  if (p.tag) filters.tagId = p.tag;
  if (p.author) filters.authorId = p.author;
  if (p.dateFrom) filters.dateFrom = new Date(p.dateFrom);
  if (p.dateTo) {
    // Inclusive end of day: add 23:59:59 so a post published on dateTo matches.
    const d = new Date(p.dateTo);
    d.setUTCHours(23, 59, 59, 999);
    filters.dateTo = d;
  }
  return { filters, page: p.page ?? 1 };
}

export default async function ArchivePage({ searchParams }: ArchivePageProps) {
  const rawSearchParams = await searchParams;
  const { filters, page } = parseArchiveFilters(rawSearchParams);

  // Fetch posts + total count + filter-bar data in parallel.
  const [rows, total, categories, tags, authors] = await Promise.all([
    listArchive(filters, page),
    countArchive(filters),
    listCategoriesWithCounts(),
    listTags(),
    listAuthors(),
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <ArchiveList
        posts={cards}
        currentPage={page}
        totalPages={totalPages}
        basePath="/archive"
        searchParams={rawSearchParams}
        activeFilters={{
          categoryId: filters.categoryId,
          tagId: filters.tagId,
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
        heading="Archive"
        description="Browse all posts by category, tag, author, or date."
      />
    </div>
  );
}
