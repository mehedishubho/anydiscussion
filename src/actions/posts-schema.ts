// src/actions/posts-schema.ts
// [CITED: RESEARCH.md L819-834 — Zod v4 postSchema shape]
// [CITED: 03-CONTEXT.md D-20 (slugs), D-21 (excerpt), D-23 (required category, tags cap ~8)]
// [CITED: CLAUDE.md "Code conventions" — Zod schemas alongside their feature, shared client+server]
//
// The Zod schema for post create/update. SHARED between the dashboard form
// (react-hook-form via zodResolver) and the Server Action (postSchema.parse) —
// per CLAUDE.md, the same schema is the client parsing contract AND the server
// input gate. CLAUDE.md `.claude/CLAUDE.md` pins Zod at v4.4.3.
//
// Server-action-adjacent — this file has NO "use server" or "use client"
// directive; it is a pure schema module imported by both sides.
import { z } from "zod";
import { imageUrlSchema } from "@/lib/validation/image-url";

// D-20: manual URL-safe Latin + hyphens. Same regex as src/lib/slug/index.ts.
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const postSchema = z.object({
  id: z.number().int().positive().optional(), // present on update, absent on create
  title: z.string().min(1, "Title is required").max(255),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(SLUG_REGEX, "URL-safe Latin + hyphens only (no uppercase, non-Latin, or special chars)"),
  // body is ProseMirror JSON — validated structurally by the editor + the round-trip
  // test, NOT by Zod (the schema is permissive here on purpose).
  body: z.any().optional(),
  excerpt: z.string().max(500).optional(), // D-21 manual excerpt; empty falls back to deriveExcerpt
  // D-23: required category (one), tagIds capped at 8. Two error halves
  // (05-07 / UAT re-run R1): the CONSTRUCTOR-level `error` covers the MISSING
  // path — /dashboard/posts/new defaults categoryId to undefined, and Zod 4
  // emits the constructor error there (the old default was the cryptic
  // "Invalid input: expected number, received undefined"). The .positive()
  // message only fires when a number IS provided but fails the check.
  categoryId: z.number({ error: "Category is required" }).int().positive("Category is required"),
  tagIds: z.array(z.number().int().positive()).max(8, "TOO_MANY_TAGS"),
  // D-10: feature image may be a library image (root-relative /api/media/<key>),
  // an external http(s) URL, or empty; optional. Shared imageUrlSchema contract
  // (quick 260826-5l0 — Phase 05 UAT R1 "Invalid url" fix).
  featureImage: imageUrlSchema.optional(),
  // D-14: publishedAt stored as UTC; display timezone is site-configured (Asia/Dhaka v1).
  publishedAt: z.date().optional(),
  status: z.enum(["draft", "pending_review", "published"]).optional(),

  // === Phase 5 D-08: post-editor SEO fields (post_seo one-to-one upsert) ===
  // Simple UTF-16 .max() caps for the dashboard client form. The grapheme rule
  // (SEO-06, Bangla-aware via Intl.Segmenter) is enforced SERVER-SIDE in savePost
  // via seoMetaSchema.safeParse — the split keeps client error messages simple
  // while the server applies the script-agnostic refine (D-10 shared-schema rule).
  metaTitle: z.string().max(255).optional(),
  metaDescription: z.string().max(600).optional(),
  ogImage: imageUrlSchema.optional(),
  // Canonicals must stay absolute full URLs (SEO contract) — never imageUrlSchema.
  canonicalUrl: z.string().url().optional().or(z.literal("")),
});

export type PostSchemaInput = z.input<typeof postSchema>;
export type PostSchemaOutput = z.output<typeof postSchema>;

// 260827-se8 Task 4 — the dashboard list filter contract. The posts page
// parses raw URL searchParams into these fields (manual coercion via
// src/lib/list-filters per the (site)/search/page.tsx parseSearch ethos),
// then passes the result here for the authoritative Zod gate. page/pageSize
// defaults + the 1-100 pageSize cap bound the DB window (offset abuse).
export const postListSchema = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(["draft", "pending_review", "published"]).optional(),
  categoryId: z.number().int().positive().optional(),
  author: z.string().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type PostListInput = z.input<typeof postListSchema>;
export type PostListQuery = z.output<typeof postListSchema>;
