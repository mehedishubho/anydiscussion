// src/lib/__tests__/post-card.test.ts
// [CITED: 260823-4yc-PLAN.md Task 1 <behavior> — toPostCardProps shared mapper]
// [CITED: 260823-4yc-PLAN.md locked decision 3 — category tag / avatar / read time on every card]
//
// Tests for the ONE shared joined-row → PostCardProps mapper (src/lib/post-card.ts).
// The mapper is the single place that reads { posts, user, categories } join rows
// and derives the upgraded PostCard props (categoryName/categorySlug, authorAvatar,
// readTime). Every list consumer routes through it.
//
// No DB mock needed — toPostCardProps is pure (deriveReadingTime is pure and
// already covered by src/lib/reading-time/__tests__/reading-time.test.ts).

import { describe, it, expect } from "vitest";
import { toPostCardProps, type PostCardJoinedRow } from "../post-card";

/** Build a Tiptap doc whose text totals `words` word-like segments. */
function bodyWithWords(words: number) {
  const text = "word ".repeat(words).trim();
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

/** A fully-populated joined row ({ posts, user, categories }). */
function fullRow(): PostCardJoinedRow {
  return {
    posts: {
      id: 7,
      title: "Joined row title",
      slug: "joined-row-title",
      excerpt: "An excerpt.",
      featureImage: "/uploads/hero.jpg",
      publishedAt: new Date("2026-08-01T00:00:00Z"),
      body: bodyWithWords(400),
    },
    user: {
      name: "Ayesha Rahman",
      username: "ayesha",
      avatar: "/uploads/ayesha.jpg",
    },
    categories: { name: "Technology", slug: "technology" },
  };
}

describe("toPostCardProps — the shared row-to-card mapper", () => {
  it("maps a fully-populated joined row to all base PostCardProps fields", () => {
    const props = toPostCardProps(fullRow());
    expect(props).toMatchObject({
      id: 7,
      title: "Joined row title",
      slug: "joined-row-title",
      excerpt: "An excerpt.",
      featureImage: "/uploads/hero.jpg",
      publishedAt: new Date("2026-08-01T00:00:00Z"),
      authorName: "Ayesha Rahman",
      authorUsername: "ayesha",
    });
  });

  it("carries categoryName/categorySlug from the joined categories row", () => {
    const props = toPostCardProps(fullRow());
    expect(props.categoryName).toBe("Technology");
    expect(props.categorySlug).toBe("technology");
  });

  it("nulls categoryName/categorySlug when categories is null (uncategorized post)", () => {
    const row = fullRow();
    row.categories = null;
    const props = toPostCardProps(row);
    expect(props.categoryName).toBeNull();
    expect(props.categorySlug).toBeNull();
  });

  it("carries authorAvatar from the joined user row", () => {
    const props = toPostCardProps(fullRow());
    expect(props.authorAvatar).toBe("/uploads/ayesha.jpg");
  });

  it("nulls author fields when user is null (missing author join)", () => {
    const row = fullRow();
    row.user = null;
    const props = toPostCardProps(row);
    expect(props.authorName).toBeNull();
    expect(props.authorUsername).toBeNull();
    expect(props.authorAvatar).toBeNull();
  });

  it("computes readTime from posts.body — 400 words at 200 WPM = 2", () => {
    const props = toPostCardProps(fullRow());
    expect(props.readTime).toBe(2);
  });

  it("computes readTime 1 (never null) for a null body", () => {
    const row = fullRow();
    row.posts.body = null;
    const props = toPostCardProps(row);
    expect(props.readTime).toBe(1);
  });
});
