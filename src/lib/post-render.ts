// src/lib/post-render.ts
// [CITED: RESEARCH.md Pattern 1 (L404-417) — the renderPostBody SSR pipeline shape]
// [CITED: 03-02-PLAN.md Task 2 — renderPostBody = generateHTML then sanitizeBeforeRender]
// [CITED: CLAUDE.md — sanitize any HTML/JS field before render (Pitfall #2 defense-in-depth)]
//
// The SSR render pipeline for post bodies. Two-step:
//   1. generateHTML(postBodyJson, editorExtensions) — Tiptap v3 JSON → HTML serialization
//      using the SAME extensions array as the client editor (Pitfall #1 — single source
//      of truth via src/components/editor/extensions.ts).
//   2. sanitizeBeforeRender(html) — DOMPurify defense-in-depth gate before
//      dangerouslySetInnerHTML (Pitfall #2 site #2).
//
// This is the render contract for EVERY public/preview surface:
//   - Slice D's /preview/[token] route (Plan 03-04)
//   - Phase 6's /[slug] public post page
//
// The two steps run in THIS ORDER — never the reverse. generateHTML first (produces
// HTML from the stored ProseMirror JSON), then sanitizeBeforeRender (strips anything
// malicious that may have been injected via direct DB edit or old data migration).
//
// Server-only — NO "use client" directive. Both generateHTML and sanitizeBeforeRender
// are server-safe (generateHTML is a pure ProseMirror schema walk, no DOM access).
import { generateHTML } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import { editorExtensions } from "@/components/editor/extensions";
import { sanitizeBeforeRender } from "@/lib/sanitize";

/**
 * Render a stored post body (ProseMirror JSON) to sanitized HTML for SSR.
 *
 * Step 1: `generateHTML(json, editorExtensions)` serializes the JSON to HTML
 *         using the SAME extensions array the client editor uses (Pitfall #1).
 * Step 2: `sanitizeBeforeRender(html)` runs DOMPurify with the shared config
 *         (Pitfall #2 site #2 — defense-in-depth before dangerouslySetInnerHTML).
 *
 * @param postBodyJson - the stored ProseMirror JSON from posts.body (jsonb)
 * @returns sanitized HTML string, safe for `dangerouslySetInnerHTML={{ __html: ... }}`
 */
export function renderPostBody(postBodyJson: unknown): string {
  // Cast to JSONContent — the stored jsonb is structurally ProseMirror JSON but
  // typed as `unknown` at the DB boundary. generateHTML walks the schema; invalid
  // nodes are silently dropped (safe behavior — no un-gated HTML reaches the output).
  const html = generateHTML(postBodyJson as JSONContent, editorExtensions);
  return sanitizeBeforeRender(html);
}
