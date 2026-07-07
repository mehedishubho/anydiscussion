// src/lib/reading-time/index.ts
// [CITED: 06-01-PLAN.md Task 3 <action> — D-15 Bangla-aware reading time]
// [CITED: 06-RESEARCH.md Code Examples L719-737 — deriveReadingTime shape]
// [CITED: 06-PATTERNS.md L298-333 — mirrors src/lib/excerpt/index.ts collectText walker]
// [CITED: .claude/CLAUDE.md — Intl.Segmenter for Bangla grapheme/word boundaries (Node 20.19+)]
//
// Derives reading time from ProseMirror JSON body. Reuses the exact text walker
// from src/lib/excerpt (Phase 3 D-21) via the exported collectText function.
// Word counting uses Intl.Segmenter (NOT whitespace split) so Bangla word
// boundaries are respected (D-15).
//
// Server-only — NO "use client" directive.

import { collectText } from "@/lib/excerpt";

/** Default words-per-minute constant. Tunable for Bangla density (D-15). */
const DEFAULT_WPM = 200;

/**
 * Derive "N min read" from a ProseMirror JSON body, Bangla-aware.
 *
 * @param bodyJson  The Tiptap/ProseMirror doc JSON (from posts.body jsonb).
 * @param wpm       Words per minute (default 200). Bangla may read slower; adjust via settings.
 * @returns         Reading time in minutes, minimum 1. Returns 1 for empty/null body.
 */
export function deriveReadingTime(bodyJson: unknown, wpm = DEFAULT_WPM): number {
  if (!bodyJson || typeof bodyJson !== "object") return 1;

  const blocks = collectText(bodyJson as Parameters<typeof collectText>[0]);
  const text = blocks.map((b) => b.trim()).filter(Boolean).join(" ");
  if (!text) return 1;

  // Intl.Segmenter with { granularity: 'word' } counts words correctly across scripts.
  // Latin whitespace split would undercount for scripts with different word boundaries.
  // Node 20.19+ built-in — no install needed (.claude/CLAUDE.md).
  // Filter by isWordLike to exclude punctuation/whitespace segments from the count.
  const segmenter = new Intl.Segmenter("en", { granularity: "word" });
  let words = 0;
  for (const seg of segmenter.segment(text)) {
    if (seg.isWordLike) words++;
  }

  return Math.max(1, Math.round(words / wpm));
}
