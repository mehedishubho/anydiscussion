// src/lib/footer-links.ts
// [CITED: 260823-6je-PLAN.md Task 1 — pure footer helpers (pickSocialLinks, boundFooterCategories)]
// [CITED: 260823-6je-PLAN.md locked decision 3 — social circles render ONLY for configured keys, no dead links]
// [CITED: 260823-6je-PLAN.md locked decision 7 — footer Categories column dynamic from DB, bounded ~6]
// [CITED: 260823-79v-PLAN.md Task 1 — SOCIAL_ICON_PATHS moved verbatim from SiteFooter.tsx; shared by footer + header row 2]
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
 * The social-circle SVG paths, keyed to match FooterSocialLink["key"]
 * (and therefore pickSocialLinks' key union). Single source for BOTH
 * renderers: the SiteFooter brand column and SiteHeader row 2's social
 * circles (260823-79v Task 1 — moved verbatim from SiteFooter.tsx, not
 * duplicated). Configured keys only, never Instagram (decision 3).
 */
export const SOCIAL_ICON_PATHS: Record<"twitter" | "facebook" | "linkedin", string> = {
  twitter:
    "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  facebook:
    "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
};

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
