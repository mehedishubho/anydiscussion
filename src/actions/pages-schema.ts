// src/actions/pages-schema.ts
// [CITED: src/actions/posts-schema.ts — the schema-module template]
// [CITED: 04-CONTEXT.md D-18 (slimmed page editor), D-20 (draft|published only — NO in-review state)]
// [CITED: CLAUDE.md "Code conventions" — Zod schemas live alongside their feature,
//  shared client+server per CLAUDE.md]
//
// The Zod schema for page create/update. SHARED between the dashboard PageForm
// (react-hook-form via zodResolver) and the Server Action (pageSchema.parse) —
// per CLAUDE.md, the same schema is the client parsing contract AND the server
// input gate. CLAUDE.md `.claude/CLAUDE.md` pins Zod at v4.4.3.
//
// D-20 (security-critical): status enum is ["draft", "published"] ONLY. Pages do
// not flow through the editorial review pipeline — legal/contact content does
// not need the in-review state that posts use. Adding a third enum value here
// would silently break that contract.
//
// Server-action-adjacent — this file has NO "use server" or "use client"
// directive; it is a pure schema module imported by both sides. The SLUG_REGEX
// is re-exported (not re-declared) from posts-schema so the slug rule is one
// constant across the codebase.
import { z } from "zod";
import { SLUG_REGEX } from "./posts-schema";

export { SLUG_REGEX };

export const pageSchema = z.object({
  id: z.number().int().positive().optional(), // present on update, absent on create
  title: z.string().min(1, "Title is required").max(255),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(SLUG_REGEX, "URL-safe Latin + hyphens only (no uppercase, non-Latin, or special chars)"),
  // body is ProseMirror JSON — validated structurally by the editor + the round-trip
  // test, NOT by Zod (the schema is permissive here on purpose, mirroring posts).
  body: z.any().optional(),
  // D-20 — draft | published ONLY. NO in-review state (legal/contact content
  // bypasses the editorial review pipeline).
  status: z.enum(["draft", "published"]).optional(),
  metaTitle: z.string().max(255).optional(),
  metaDescription: z.string().max(500).optional(),
  // canonical is optional URL OR empty string (mirrors posts-schema featureImage pattern).
  canonical: z.string().url().optional().or(z.literal("")),
});

export type PageSchemaInput = z.input<typeof pageSchema>;
export type PageSchemaOutput = z.output<typeof pageSchema>;
