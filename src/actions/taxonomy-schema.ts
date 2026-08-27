// src/actions/taxonomy-schema.ts
// [CITED: 07-07-PLAN.md Task 3 — Zod validation for taxonomy actions (WR-05)]
// [CITED: src/actions/pages-schema.ts / src/actions/users-schema.ts — the established
//  pure-schema sibling pattern (a "use server" file may ONLY export async functions,
//  so non-function exports live in this sibling module)]
// [CITED: 07-REVIEW.md WR-05 — createCategory/updateCategory/createTag/updateTag
//  previously wrote whatever arrived: empty-string names, unbounded lengths, and
//  updateCategory's truthiness spread `input.name ? {name} : {}` silently DROPPED
//  a present-but-empty name instead of rejecting it]
//
// Pure module — NO "use server" / "use client" directive. Imported by the Server
// Actions (categories.ts / tags.ts) at the input gate, directly AFTER requireCan
// and BEFORE slug validation / any db write.
//
// Bounds mirror the UI contract (TailAdmin form fields) and the DB column widths:
//   - name: required min 1 (an empty name is a user error, not a no-op),
//     max 120 (varchar headroom)
//   - description (categories only — the tags table has no description column):
//     optional, max 1000; EMPTY STRING IS ALLOWED because clearing the field is
//     a legitimate edit (min(1) is deliberately NOT applied — same asymmetry as
//     updateUser's bio).
//   - slug: structural presence only (min 1). The FULL slug rules live in
//     validateSlug (src/lib/slug.ts) + assertUniqueSlug — kept there so the
//     taxonomy slug contract stays in one place; this schema only guarantees
//     a non-empty string reaches that validator.
//
// On failure the actions throw Error("INVALID_INPUT") — same sentinel style as
// INVALID_SLUG:<reason> and the contact action's returned INVALID_INPUT state.

import { z } from "zod";

const taxonomyNameField = z
  .string()
  .min(1, "Name is required")
  .max(120, "Name must be 120 characters or fewer");

const taxonomyDescriptionField = z
  .string()
  .max(1000, "Description must be 1000 characters or fewer");

/** CREATE contract for categories — name + slug required. */
export const categorySchema = z.object({
  name: taxonomyNameField,
  slug: z.string().min(1, "Slug is required"),
  description: taxonomyDescriptionField.optional(),
});

/**
 * UPDATE contract for categories — every field optional (Partial<CategoryInput>
 * semantics, same pattern as pageUpdateSchema). A PRESENT-BUT-EMPTY name is
 * REJECTED: `.optional()` only exempts `undefined`; a present "" still runs
 * the inner min(1) chain, closing the truthiness-spread silent-drop hole.
 */
export const categoryUpdateSchema = z.object({
  name: taxonomyNameField.optional(),
  slug: z.string().min(1, "Slug is required").optional(),
  description: taxonomyDescriptionField.optional(),
});

/** CREATE contract for tags — name + slug required (no description field). */
export const tagSchema = z.object({
  name: taxonomyNameField,
  slug: z.string().min(1, "Slug is required"),
});

/** UPDATE contract for tags — partial; present-but-empty name rejected. */
export const tagUpdateSchema = tagSchema.partial();

export type CategorySchemaInput = z.input<typeof categorySchema>;
export type CategorySchemaOutput = z.output<typeof categorySchema>;
export type CategoryUpdateSchemaInput = z.input<typeof categoryUpdateSchema>;
export type CategoryUpdateSchemaOutput = z.output<typeof categoryUpdateSchema>;
export type TagSchemaInput = z.input<typeof tagSchema>;
export type TagSchemaOutput = z.output<typeof tagSchema>;
export type TagUpdateSchemaInput = z.input<typeof tagUpdateSchema>;
export type TagUpdateSchemaOutput = z.output<typeof tagUpdateSchema>;

// ============================================================
// Quick task 260827-se8 Task 6 — URL-driven categories list filters
// [CITED: 260827-se8-PLAN.md Task 6 <action> step 1]
//
// The dashboard categories page parses raw URL searchParams into these fields
// (manual coercion via src/lib/list-filters), then this Zod gate is the
// authoritative contract. page's ABSENCE signals "no pagination": a bare
// listCategories() call (post-editor CategoryPicker, posts-page options
// fetch) must keep returning the FULL list — limit/offset apply only when
// page is present. pageSize defaults to 20 whenever pagination is active.
// ============================================================

export const categoryListSchema = z.object({
  q: z.string().max(200).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type CategoryListInput = z.input<typeof categoryListSchema>;
export type CategoryListQuery = z.output<typeof categoryListSchema>;
