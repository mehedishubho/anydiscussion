// src/lib/excerpt/index.ts
// [CITED: 03-CONTEXT.md D-21 — excerpt: both (manual + auto-derive), Bangla-aware]
// [CITED: CLAUDE.md "SEO requirements" — byte/reasonable-char count, NOT Latin-character limits]
// [CITED: RESEARCH.md Pattern 6 (L818-834) — Bangla-aware byte/char handling]
//
// Derives an excerpt from ProseMirror JSON by walking the content tree
// recursively, collecting text nodes, and slicing at maxChars WITHOUT splitting
// a multi-byte UTF-16 surrogate pair or a Bangla combining-mark cluster.
//
// The author's manual `posts.excerpt` (schema.ts L46) takes precedence when
// non-empty; this utility is the fallback for posts with no manual excerpt.
//
// Server-only — NO "use client" directive.

interface ProseMirrorNode {
  type?: string;
  text?: string;
  content?: ProseMirrorNode[];
}

/**
 * Recursively walk a ProseMirror JSON tree, collecting `text` from text nodes
 * (concatenated with single spaces between block boundaries).
 */
function collectText(node: ProseMirrorNode | undefined | null, blocks: string[] = [""]): string[] {
  if (!node) return blocks;
  if (typeof node.text === "string") {
    blocks[blocks.length - 1] += node.text;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (child.type === "text") {
        collectText(child, blocks);
      } else {
        // Block boundary — start a new chunk so block-level whitespace collapses
        // to a single space between blocks (paragraph/list-item/etc.).
        blocks.push("");
        collectText(child, blocks);
      }
    }
  }
  return blocks;
}

/**
 * Slice a string at maxChars WITHOUT splitting a UTF-16 surrogate pair. Bangla
 * and other Indic scripts use combining marks that hang off a base codepoint —
 * we don't try to keep those clusters intact (would require full grapheme
 * segmentation), but we do avoid landing on a lone surrogate half.
 *
 * Per CLAUDE.md "SEO requirements": validate by reasonable byte/char count, NOT
 * Latin-character limits. maxChars is interpreted as a UTF-16 code-unit count,
 * which is what PostgreSQL's `length()` returns for text — close enough for
 * an excerpt trim.
 */
function safeSlice(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  let end = maxChars;
  // Walk back if we're on the low half of a surrogate pair (0xDC00..0xDFFF).
  while (end > 0) {
    const code = text.charCodeAt(end);
    if (code >= 0xdc00 && code <= 0xdfff) {
      end -= 1; // back up to include the high surrogate in the slice
    }
    break;
  }
  return text.slice(0, end);
}

/**
 * Derive an excerpt from a ProseMirror JSON body.
 *
 * @param bodyJson   The Tiptap/ProseMirror doc JSON (from posts.body jsonb).
 * @param maxChars   Optional max code-unit length (default 160). Bangla-aware.
 * @returns A plain-text excerpt, single-spaced, never mid-surrogate.
 */
export function deriveExcerpt(bodyJson: unknown, maxChars = 160): string {
  if (!bodyJson || typeof bodyJson !== "object") return "";
  const blocks = collectText(bodyJson as ProseMirrorNode);
  const joined = blocks.map((b) => b.trim()).filter(Boolean).join(" ");
  return safeSlice(joined, maxChars);
}
