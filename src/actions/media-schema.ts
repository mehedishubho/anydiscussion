// src/actions/media-schema.ts
// [CITED: .claude/CLAUDE.md — zod@4.4.3 verified; schemas live alongside their feature]
// [CITED: 03-CONTEXT.md D-08 (10MB cap), D-07 (any mime — images through sharp)]
// [CITED: 03-RESEARCH.md L818-834 — Zod schema shape]
//
// Shared Zod schemas for the media Server Actions. Same schema reused client-side
// (the dashboard upload form) + server-side (the Server Action input parse).
// Importing MEDIA_MAX_SIZE_BYTES here keeps the cap authoritative in ONE place —
// the client uses it for pre-upload validation, the action uses it for the
// server-side gate (Pitfall #1: never trust the client).
//
// NOT a Server Action file (no "use server") — exports pure schema/const only.
import { z } from "zod";

/**
 * D-08: the per-file upload cap. De-facto scopes v1 to images + small PDFs/docs.
 * Real video hosting is deferred (would require raising this AND a presigned/
 * streaming large-file path — see 03-CONTEXT.md D-08 deferred ideas).
 */
export const MEDIA_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Upload schema — the client form + Server Action parse this same shape.
 * `file` is a File (Blob + name); `altText` is optional (max 500 chars).
 */
export const mediaUploadSchema = z.object({
  file: z.instanceof(File),
  altText: z.string().max(500).optional(),
});

/**
 * List schema — pagination + optional mime filter for the media library browser.
 * Limit capped at 100 to prevent unbounded result sets.
 */
export const mediaListSchema = z.object({
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().min(0).default(0),
  mimeType: z.string().optional(),
});
