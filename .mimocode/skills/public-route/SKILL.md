---
name: public-route
description: Create a public route with Cache Components, generateMetadata, and Suspense boundaries
---

# Public Route Skill

Create a public route following the project's established pattern: `generateMetadata` with `'use cache'`, cached queries with `cacheTag`, and Suspense boundaries for streaming content.

## When to Use

- Creating a new public-facing page (e.g., `/blog`, `/category/[slug]`, `/author/[username]`)
- Building an archive or listing page
- Adding a route that needs SEO metadata

## Prerequisites

- Understanding of the data model (posts, categories, tags, users)
- Knowledge of Cache Components patterns (`'use cache'`, `cacheTag`, `cacheLife`)
- Understanding of Suspense boundaries for PPR

## Template

### 1. Basic Route (`(site)/<route>/page.tsx`)

```typescript
import { Suspense } from "react";
import { db, schema } from "@/lib/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildPostMetadata } from "@/lib/seo/metadata";
import { blogPostingJsonLd } from "@/lib/seo/jsonld";

// Types
interface <Route>PageProps {
  params: Promise<{ slug: string }>;
}

// Generate metadata (SEO)
export async function generateMetadata({
  params,
}: <Route>PageProps): Promise<Metadata> {
  const { slug } = await params;
  
  // Fetch data (can be cached)
  const [item] = await db
    .select()
    .from(schema.<table>)
    .where(
      and(
        eq(schema.<table>.slug, slug),
        eq(schema.<table>.status, "published"),
        isNull(schema.<table>.deletedAt)
      )
    )
    .limit(1);

  if (!item) {
    return {
      title: "Not Found",
      robots: { index: false, follow: false },
    };
  }

  const s = await getSeoSettings();
  
  return buildPostMetadata(
    {
      id: item.id,
      title: item.title,
      slug: item.slug,
      excerpt: item.excerpt,
      featureImage: item.featureImage,
    },
    null, // or item.seo if you have post_seo data
    s
  );
}

// Page component
export default async function <Route>Page({ params }: <Route>PageProps) {
  const { slug } = await params;

  // Fetch data (cached with 'use cache')
  const [item] = await db
    .select()
    .from(schema.<table>)
    .where(
      and(
        eq(schema.<table>.slug, slug),
        eq(schema.<table>.status, "published"),
        isNull(schema.<table>.deletedAt)
      )
    )
    .limit(1);

  if (!item) {
    notFound();
  }

  // Cache tag for revalidation
  // cacheTag(`<feature>-${item.id}`);
  // cacheTag(`<feature>-list`);

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            blogPostingJsonLd({
              title: item.title,
              slug: item.slug,
              excerpt: item.excerpt,
              author: item.author?.name ?? "Unknown",
              publishedAt: item.publishedAt?.toISOString() ?? "",
              featureImage: item.featureImage,
            })
          ),
        }}
      />

      {/* Main content (synchronous - LCP) */}
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
          {item.title}
        </h1>
        {/* Meta info: author, date, reading time */}
      </header>

      <div
        className="prose prose-lg max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{
          __html: renderPostBody(item.body),
        }}
      />

      {/* Streaming hole #1: View count */}
      <Suspense fallback={<div className="text-gray-500">Loading views...</div>}>
        <ViewCount postId={item.id} />
      </Suspense>

      {/* Streaming hole #2: Related posts */}
      <Suspense fallback={<div className="text-gray-500">Loading related...</div>}>
        <RelatedPosts
          postId={item.id}
          categoryId={item.categoryId}
        />
      </Suspense>
    </article>
  );
}
```

**Key rules:**
- `generateMetadata` is async and returns `Metadata` type
- Use `'use cache'` directive for cached data (under `cacheComponents:true`)
- Use `cacheTag(name)` for revalidation support
- JSON-LD goes in `<script type="application/ld+json">`, NOT in `metadata.other`
- Main content is synchronous (LCP) - NO Suspense wrapper
- Dynamic content uses `<Suspense>` boundaries

### 2. Cached Query Pattern

```typescript
import { cacheTag, cacheLife } from "next/cache";

// For cached reads (public content)
export async function getPostForPublic(slug: string) {
  "use cache";
  cacheTag(`post-${slug}`);
  cacheLife("hours"); // ISR-friendly for list routes

  const [post] = await db
    .select()
    .from(schema.posts)
    .leftJoin(schema.postSeo, eq(schema.postSeo.postId, schema.posts.id))
    .leftJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
    .where(
      and(
        eq(schema.posts.slug, slug),
        eq(schema.posts.status, "published"),
        isNull(schema.posts.deletedAt)
      )
    )
    .limit(1);

  if (!post) return null;

  // Add cache tags for revalidation
  cacheTag(`post-${post.posts.id}`);
  if (post.posts.authorId) {
    cacheTag(`author-${post.posts.authorId}`);
  }
  if (post.posts.categoryId) {
    cacheTag(`category-${post.posts.categoryId}`);
  }

  return post;
}
```

**Key rules:**
- `'use cache'` directive is MANDATORY for cached data
- `cacheTag(name)` enables revalidation via `revalidateTag(name, "max")`
- `cacheLife("hours")` for ISR-friendly caching
- Match cache tags with revalidation tags in Server Actions

### 3. Streaming Component Pattern

```typescript
import { connection } from "next/server";

// For per-request data (view count, real-time info)
export async function ViewCount({ postId }: { postId: number }) {
  // MUST call connection() first for per-request signal
  await connection();

  const views = await incrementViewCount(postId);

  return (
    <span className="text-sm text-gray-500">
      {views.toLocaleString()} views
    </span>
  );
}

// For cached related content
export async function RelatedPosts({
  postId,
  categoryId,
}: {
  postId: number;
  categoryId: number;
}) {
  // This can use 'use cache' since related posts change rarely
  const posts = await getRelatedPosts(postId, categoryId);

  return (
    <div className="mt-8 border-t border-gray-200 pt-8">
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
        Related Posts
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
```

**Key rules:**
- `await connection()` is MUST be FIRST line for per-request data
- Without `connection()`, the component may be cached incorrectly
- Use `<Suspense>` boundary when wrapping streaming components

### 4. List/Archive Route Pattern

```typescript
import { Suspense } from "react";
import { db, schema } from "@/lib/db";
import { and, isNull, desc, asc } from "drizzle-orm";
import { cacheTag, cacheLife } from "next/cache";

interface ArchivePageProps {
  searchParams: Promise<{ page?: string; category?: string; tag?: string }>;
}

export default async function ArchivePage({ searchParams }: ArchivePageProps) {
  const { page = "1", category, tag } = await searchParams;
  const pageNum = parseInt(page, 10);
  const limit = 12;
  const offset = (pageNum - 1) * limit;

  // Build filter conditions
  const conditions = [
    eq(schema.posts.status, "published"),
    isNull(schema.posts.deletedAt),
  ];

  if (category) {
    conditions.push(eq(schema.posts.categoryId, parseInt(category, 10)));
  }

  if (tag) {
    // Join with post_tags for tag filtering
    // ...
  }

  // Fetch posts (cached)
  const posts = await db
    .select()
    .from(schema.posts)
    .where(and(...conditions))
    .orderBy(desc(schema.posts.publishedAt))
    .limit(limit)
    .offset(offset);

  // Cache tags
  cacheTag("posts-list");
  if (category) cacheTag(`category-${category}`);
  if (tag) cacheTag(`tag-${tag}`);
  cacheLife("hours");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
        Archive
      </h1>

      {/* Filters */}
      <Suspense fallback={<div>Loading filters...</div>}>
        <ArchiveFilters
          selectedCategory={category}
          selectedTag={tag}
        />
      </Suspense>

      {/* Post list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={pageNum}
        totalPages={Math.ceil(totalPosts / limit)}
      />
    </div>
  );
}
```

**Key rules:**
- Filter conditions accumulated in an array
- Use `and(...conditions)` for dynamic filtering
- Cache tags for each filter combination
- `cacheLife("hours")` for ISR-friendly caching

## Checklist

- [ ] `generateMetadata` returns correct `Metadata` type
- [ ] Using `'use cache'` for cached data (if under `cacheComponents:true`)
- [ ] Using `cacheTag(name)` for revalidation support
- [ ] JSON-LD in `<script type="application/ld+json">`, NOT in metadata
- [ ] Main content is synchronous (NO Suspense wrapper)
- [ ] Dynamic content uses `<Suspense>` boundaries
- [ ] `await connection()` is FIRST line for per-request data
- [ ] Cache tags match revalidation tags in Server Actions
- [ ] Using concrete paths in `revalidatePath`
- [ ] Filter conditions accumulated dynamically for list routes

## Examples in Codebase

- `src/app/(site)/[slug]/page.tsx` (single post)
- `src/app/(site)/blog/page.tsx` (blog feed)
- `src/app/(site)/blog/page/[pageNumber]/page.tsx` (paginated)
- `src/app/(site)/archive/page.tsx` (filterable archive)
- `src/app/(site)/category/[slug]/page.tsx` (category archive)
- `src/app/(site)/tag/[slug]/page.tsx` (tag archive)
- `src/app/(site)/author/[username]/page.tsx` (author page)
- `src/app/(site)/search/page.tsx` (search results)
- `src/components/site/ViewCount.tsx` (streaming component)
- `src/components/site/RelatedPosts.tsx` (cached component)
