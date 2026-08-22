// src/lib/footer-links.ts
// [CITED: 260823-6je-PLAN.md Task 1 — pure footer helpers (pickSocialLinks, boundFooterCategories)]
// [CITED: 260823-6je-PLAN.md locked decision 3 — social circles render ONLY for configured keys, no dead links]
// [CITED: 260823-6je-PLAN.md locked decision 7 — footer Categories column dynamic from DB, bounded ~6]
//
// Pure helpers backing the restyled SiteFooter. SiteFooter.tsx itself imports
// next/cache + @/lib/db ('use cache' boundary), so the testable logic lives in
// this separate pure module — same posture as src/lib/post-card.ts (node-env
// vitest can import it with no DB mocks).
//
// Pure module — no db, no react, no next imports. NO "use client".

/**
 * Input shape of SiteFooter's readSocialLinks(): each social URL or null
 * (absent keys are tolerated too).
 */
export interface SocialLinkInput {
  twitter?: string | null;
  facebook?: string | null;
  linkedin?: string | null;
}

/** One rendered footer social circle (locked decision 3). */
export interface FooterSocialLink {
  key: "twitter" | "facebook" | "linkedin";
  label: string;
  url: string;
}

/**
 * The three social entries in declared render order, carrying the aria labels
 * the current footer markup uses — helper output and rendered anchors stay in
 * sync ("Twitter / X", "Facebook", "LinkedIn").
 */
const SOCIAL_ENTRIES = [
  { key: "twitter", label: "Twitter / X" },
  { key: "facebook", label: "Facebook" },
  { key: "linkedin", label: "LinkedIn" },
] as const;

/**
 * pickSocialLinks — only configured social keys become footer circles.
 *
 * A key counts as configured when its value is non-null AND non-empty after
 * trimming; the returned URL is the trimmed value. All-unset input yields an
 * empty array — the footer then renders no social row at all (never a
 * placeholder "#" link, never an Instagram entry). NO Instagram (decision 3).
 */
export function pickSocialLinks(input: SocialLinkInput): FooterSocialLink[] {
  const links: FooterSocialLink[] = [];
  for (const { key, label } of SOCIAL_ENTRIES) {
    const raw = input[key];
    if (typeof raw !== "string") continue;
    const url = raw.trim();
    if (url === "") continue;
    links.push({ key, label, url });
  }
  return links;
}

/**
 * The minimal category shape the footer renders. Rows from
 * listCategoriesWithCounts() structurally satisfy it (they carry extra
 * fields — fine).
 */
export interface FooterCategoryLite {
  name: string;
  slug: string;
  postCount: number;
}

/**
 * boundFooterCategories — the footer Categories column source (locked
 * decision 7's "bounded ~5-6").
 *
 * Non-mutating: copies the input, sorts by postCount descending with a
 * name-ascending (localeCompare) tie-break BEFORE slicing, then slices to
 * `limit` (default 6). Most-published categories fill the column;
 * zero-count ones only appear when the roster is short.
 */
export function boundFooterCategories(
  categories: readonly FooterCategoryLite[],
  limit = 6,
): FooterCategoryLite[] {
  return [...categories]
    .sort(
      (a, b) => b.postCount - a.postCount || a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}
