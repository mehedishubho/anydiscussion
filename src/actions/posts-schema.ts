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
  // D-23: required category (one), tagIds capped at 8.
  categoryId: z.number().int().positive("Category is required"),
  tagIds: z.array(z.number().int().positive()).max(8, "TOO_MANY_TAGS"),
  // D-10: feature image may be a library image OR an external URL; optional.
  featureImage: z.string().url().optional().or(z.literal("")),
  // D-14: publishedAt stored as UTC; display timezone is site-configured (Asia/Dhaka v1).
  publishedAt: z.date().optional(),
  status: z.enum(["draft", "pending_review", "published"]).optional(),
});

export type PostSchemaInput = z.input<typeof postSchema>;
export type PostSchemaOutput = z.output<typeof postSchema>;
