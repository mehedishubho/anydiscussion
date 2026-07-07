// src/lib/toc/index.ts
// [CITED: 06-01-PLAN.md Task 3 <action> — D-15 TOC from H2/H3]
// [CITED: 06-RESEARCH.md Code Examples L744-766 — buildToc shape]
// [CITED: 06-PATTERNS.md L338-361 — recursive ProseMirror walker from excerpt/index.ts]
//
// Extracts a table-of-contents (H2 + H3) from ProseMirror JSON. The walker
// mirrors the recursive pattern in src/lib/excerpt but targets heading nodes
// instead of text nodes. Generates URL-safe IDs that handle arbitrary Unicode
// (Bangla headings — D-20 note: validateSlug rejects non-Latin, so we use a
// Unicode-aware slugifier here, NOT @/lib/slug).
//
// NOTE: the rendered HTML must produce matching id attributes on h2/h3 elements.
// Tiptap v3's @tiptap/html generateHTML does NOT emit heading IDs by default
// (PATTERNS.md resolution #2 — editor extensions array has no heading-ID extension).
// Plan 06-03 post-processes renderPostBody's HTML to inject matching IDs.
//
// Server-only — NO "use client" directive.

/** A single TOC entry — always level 2 or 3. */
export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

interface ProseMirrorNode {
  type?: string;
  attrs?: { level?: number; [key: string]: unknown };
  content?: ProseMirrorNode[];
  text?: string;
}

/**
 * Generate a URL-safe ID from heading text. Handles arbitrary Unicode (Bengali
 * script) by keeping all Unicode letters/digits and converting spaces to hyphens.
 *
 * NOT using validateSlug from @/lib/slug (it rejects non-Latin text — D-20).
 */
function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "");
}

/**
 * Walk the body JSON recursively, collect H2/H3 headings, derive URL-safe IDs.
 *
 * @param bodyJson  The Tiptap/ProseMirror doc JSON (from posts.body jsonb).
 * @returns         Array of TocItem (level 2 or 3 only), with unique IDs.
 */
export function buildToc(bodyJson: unknown): TocItem[] {
  if (!bodyJson || typeof bodyJson !== "object") return [];

  const items: TocItem[] = [];
  const seenIds = new Map<string, number>();

  const walk = (node: ProseMirrorNode | null | undefined): void => {
    if (!node) return;

    if (
      node.type === "heading" &&
      (node.attrs?.level === 2 || node.attrs?.level === 3)
    ) {
      const text = (node.content ?? [])
        .map((c) => c.text ?? "")
        .join("");
      if (text) {
        const baseId = slugifyHeading(text);
        // Dedupe: if this ID already exists, append -1, -2, etc.
        let id = baseId;
        const count = seenIds.get(baseId) ?? 0;
        if (count > 0) {
          id = `${baseId}-${count}`;
        }
        seenIds.set(baseId, count + 1);

        items.push({
          id,
          text,
          level: node.attrs!.level as 2 | 3,
        });
      }
    }

    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  };

  walk(bodyJson as ProseMirrorNode);
  return items;
}
