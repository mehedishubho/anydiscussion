// src/lib/toc/__tests__/toc.test.ts
// [CITED: 06-VALIDATION.md Wave 0 row "toc — H2/H3 extraction, ID generation, dedupe"]
// [CITED: 06-01-PLAN.md Task 3 <behavior> — D-15 TOC from H2/H3 only]
//
// Wave-0 tests for buildToc. These tests verify:
//   - D-15: Extracts only H2 and H3 headings (never H1, H4, H5, H6).
//   - Empty body → empty array.
//   - Duplicate heading text → unique IDs (dedupe counter suffix).
//   - Heading IDs are URL-safe.
//
// No DB mock needed — buildToc is a pure function over ProseMirror JSON.

import { describe, it, expect } from "vitest";
import { buildToc } from "../index";

describe("D-15 / buildToc — H2/H3 extraction from ProseMirror JSON", () => {
  it("returns an empty array for a body with no headings", () => {
    const body = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Just a paragraph." }] },
      ],
    };
    expect(buildToc(body)).toEqual([]);
  });

  it("returns an empty array for an empty body", () => {
    expect(buildToc(null)).toEqual([]);
    expect(buildToc({})).toEqual([]);
  });

  it("extracts H2 and H3 only (never H1, H4, H5, H6)", () => {
    const body = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "H1 Title" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "First Section" }] },
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Subsection" }] },
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "H4 Title" }] },
        { type: "heading", attrs: { level: 5 }, content: [{ type: "text", text: "H5 Title" }] },
        { type: "heading", attrs: { level: 6 }, content: [{ type: "text", text: "H6 Title" }] },
      ],
    };
    const toc = buildToc(body);
    expect(toc).toHaveLength(2);
    expect(toc[0].level).toBe(2);
    expect(toc[0].text).toBe("First Section");
    expect(toc[1].level).toBe(3);
    expect(toc[1].text).toBe("Subsection");
  });

  it("generates URL-safe IDs from heading text", () => {
    const body = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Getting Started" }] },
      ],
    };
    const toc = buildToc(body);
    expect(toc[0].id).toBe("getting-started");
  });

  it("generates unique IDs for duplicate heading text (dedupe suffix)", () => {
    const body = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Introduction" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Introduction" }] },
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Introduction" }] },
      ],
    };
    const toc = buildToc(body);
    expect(toc).toHaveLength(3);
    const ids = toc.map((t) => t.id);
    expect(new Set(ids).size).toBe(3); // all unique
    expect(ids[0]).toBe("introduction");
    expect(ids[1]).not.toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[1]);
  });

  it("handles Bangla heading text", () => {
    const body = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "প্রযুক্তি ব্লগ" }] },
      ],
    };
    const toc = buildToc(body);
    expect(toc).toHaveLength(1);
    expect(toc[0].text).toBe("প্রযুক্তি ব্লগ");
    expect(toc[0].id).toBeTruthy();
    expect(toc[0].id.length).toBeGreaterThan(0);
  });

  it("walks nested content recursively", () => {
    const body = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Nested Heading" }] },
          ],
        },
      ],
    };
    const toc = buildToc(body);
    expect(toc).toHaveLength(1);
    expect(toc[0].text).toBe("Nested Heading");
  });
});
