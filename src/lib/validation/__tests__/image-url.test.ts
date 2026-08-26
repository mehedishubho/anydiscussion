// src/lib/validation/__tests__/image-url.test.ts
// [CITED: quick 260826-5l0 Task 1 — shared imageUrlSchema matrix + schema integration]
// [CITED: Phase 05 UAT R1 re-test — publish rejected media-library feature images]
// [CITED: src/lib/seo/__tests__/validation.test.ts — safeParse assertion style]
//
// Pins the ONE shared image-URL contract used by postSchema (featureImage,
// ogImage), seoMetaSchema (ogImage), and seoSettingsSchema (defaultOgImage):
// accepted shapes are EXACTLY empty string | absolute http(s) URL | root-relative
// path starting with "/" (the MediaPicker /api/media/<providerKey> convention).
//
// Also pins the NEGATIVE space that must never regress:
//   - canonical / canonicalBaseUrl fields stay ABSOLUTE-ONLY (SEO contract)
//   - slash-less relative strings, non-http schemes, and protocol-relative
//     "//host" URLs (an external host smuggled behind a leading slash —
//     threat T-Q5-01) are rejected.

import { describe, it, expect } from "vitest";
import { imageUrlSchema } from "../image-url";
import { postSchema } from "@/actions/posts-schema";
import { seoMetaSchema } from "@/lib/seo/validation";
import { seoSettingsSchema } from "@/actions/seo-settings-schema";

describe("quick 260826-5l0: imageUrlSchema helper matrix", () => {
  it("PASS: empty string (the form 'cleared' state)", () => {
    expect(imageUrlSchema.safeParse("").success).toBe(true);
  });

  it("PASS: absolute https and http URLs", () => {
    expect(
      imageUrlSchema.safeParse("https://cdn.anydiscussion.com/images/og.jpg").success,
    ).toBe(true);
    expect(
      imageUrlSchema.safeParse("http://localhost:3000/api/media/abc.png").success,
    ).toBe(true);
  });

  it("PASS: root-relative /api/media/<providerKey> (THE MediaPicker bug case)", () => {
    expect(imageUrlSchema.safeParse("/api/media/uploads/photo.png").success).toBe(true);
  });

  it("PASS: any root-relative path, not just /api/media", () => {
    expect(imageUrlSchema.safeParse("/blog/default-cover.png").success).toBe(true);
  });

  it("FAIL: non-URL string", () => {
    expect(imageUrlSchema.safeParse("not-a-url").success).toBe(false);
  });

  it("FAIL: relative path WITHOUT a leading slash (ambiguous — rejected)", () => {
    expect(imageUrlSchema.safeParse("api/media/abc.png").success).toBe(false);
  });

  it("FAIL: javascript: and ftp:// schemes (only http(s) is renderable)", () => {
    expect(imageUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(imageUrlSchema.safeParse("ftp://example.com/x.png").success).toBe(false);
  });

  it("FAIL: protocol-relative //host URLs (T-Q5-01 — external host behind a leading slash)", () => {
    expect(imageUrlSchema.safeParse("//evil.com/x.png").success).toBe(false);
  });
});

describe("quick 260826-5l0: postSchema integration", () => {
  // The schema's other required fields: title, SLUG_REGEX slug, categoryId,
  // and the (required, possibly-empty) tagIds array.
  const validBase = {
    title: "Test Post",
    slug: "test-post",
    categoryId: 1,
    tagIds: [],
  };

  it("PASS: featureImage accepts a root-relative media-library URL", () => {
    const r = postSchema.safeParse({ ...validBase, featureImage: "/api/media/abc.png" });
    expect(r.success).toBe(true);
  });

  it("PASS: ogImage accepts a root-relative media-library URL", () => {
    const r = postSchema.safeParse({ ...validBase, ogImage: "/api/media/abc.png" });
    expect(r.success).toBe(true);
  });

  it("PASS: featureImage accepts empty string (the cleared state)", () => {
    const r = postSchema.safeParse({ ...validBase, featureImage: "" });
    expect(r.success).toBe(true);
  });

  it("FAIL: featureImage rejects a non-URL string", () => {
    const r = postSchema.safeParse({ ...validBase, featureImage: "not-a-url" });
    expect(r.success).toBe(false);
  });

  it("FAIL: canonicalUrl stays ABSOLUTE-ONLY — root-relative rejected (regression pin)", () => {
    const r = postSchema.safeParse({ ...validBase, canonicalUrl: "/blog/some-post" });
    expect(r.success).toBe(false);
  });
});

describe("quick 260826-5l0: seoMetaSchema integration", () => {
  it("PASS: ogImage accepts a root-relative media-library URL", () => {
    const r = seoMetaSchema.safeParse({ ogImage: "/api/media/abc.png" });
    expect(r.success).toBe(true);
  });

  it("FAIL: canonicalUrl stays ABSOLUTE-ONLY — root-relative rejected (regression pin)", () => {
    const r = seoMetaSchema.safeParse({ canonicalUrl: "/relative" });
    expect(r.success).toBe(false);
  });
});

describe("quick 260826-5l0: seoSettingsSchema integration", () => {
  it("PASS: defaultOgImage accepts a root-relative media-library URL", () => {
    const r = seoSettingsSchema.safeParse({
      siteTitle: "Any Discussion",
      canonicalBaseUrl: "https://anydiscussion.com",
      defaultOgImage: "/api/media/abc.png",
    });
    expect(r.success).toBe(true);
  });

  it("FAIL: canonicalBaseUrl keeps its own absolute-only rule + message", () => {
    const r = seoSettingsSchema.safeParse({
      siteTitle: "Any Discussion",
      canonicalBaseUrl: "/nope",
      defaultOgImage: "",
    });
    expect(r.success).toBe(false);
  });
});
