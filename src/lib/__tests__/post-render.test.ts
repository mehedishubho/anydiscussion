// src/lib/__tests__/post-render.test.ts
// [CITED: src/lib/post-render.ts — renderPostBody = generateHTML then sanitizeBeforeRender]
// [CITED: 07-06-PLAN.md Task 3 — the NULL-body guard unblocked the live harness build]
//
// Null-guard tests for renderPostBody (Plan 07-06, Rule 2/3 deviation). On
// 2026-08-26 the production build crashed at prerender on /terms-and-conditions:
// the dashboard had saved the published pages row with body = NULL, and
// renderPostBody(NULL) reached Tiptap's generateHTML → Node.fromJSON(schema, null)
// → "RangeError: Invalid input for Node.fromJSON" → build exit 1. A CMS page with
// an empty body must render an empty article, not take down the site build.
//
// The guard returns "" BEFORE generateHTML/sanitizeBeforeRender run, so no DOM
// or schema machinery is exercised on these paths (node environment is fine).
import { describe, it, expect } from "vitest";
import { renderPostBody } from "../post-render";

describe("renderPostBody null/empty guard (Plan 07-06 — build-crash fix)", () => {
  it("returns \"\" for a null body (dashboard-saved pages row) instead of throwing", () => {
    // Before the guard: generateHTML(null, editorExtensions) threw
    // "RangeError: Invalid input for Node.fromJSON" and killed `next build`
    // at the /terms-and-conditions prerender (2026-08-26).
    expect(() => renderPostBody(null)).not.toThrow();
    expect(renderPostBody(null)).toBe("");
  });

  it("returns \"\" for an undefined body", () => {
    expect(renderPostBody(undefined)).toBe("");
  });

  it("still renders a minimal valid doc through generateHTML + sanitize (guard is a no-op for valid input)", () => {
    // A minimal valid ProseMirror doc — proves the guard did not swallow the
    // normal path. Output flows through sanitizeBeforeRender, so it is HTML.
    const html = renderPostBody({ type: "doc", content: [{ type: "paragraph" }] });
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
  });
});
