// src/components/site/Toc.tsx
// [CITED: 06-03-PLAN.md Task 3 — Toc client island with scroll-spy (D-05)]
// [CITED: 06-CONTEXT.md D-05 — centered + sticky TOC sidebar; D-15 H2+H3 TOC]
// [CITED: 06-RESEARCH.md — small client islands for genuine interactivity only]
//
// The TOC client island. Renders the H2/H3 items passed from the server (built
// via buildToc from lib/toc/06-01). Adds IntersectionObserver-based scroll-spy:
// observes each heading element (by id), tracks the active one, highlights the
// corresponding TOC link. Progressive enhancement — if JS is disabled, the TOC
// links are plain anchors and still work.
//
// Two variants (the page renders both, in different DOM positions):
//   - variant="mobile"  → a collapsible "On this page" card (rendered inside the
//                          article, after the body, before view-count/related).
//   - variant="desktop" → a sticky sidebar (rendered as the grid's column 2
//                          sibling of the article, lg+ only).
//
// Both variants share the same items + active-section logic. Two IntersectionObserver
// instances is harmless — the browser dedupes the observation; the state is local
// to each variant. A single variant-aware component was chosen over two files to
// keep the visual styles co-located.
//
// Route-group isolation: does NOT import from (admin) or ThemeContext (D-13).
// "use client" — required for useEffect + IntersectionObserver + state.

"use client";

import { useEffect, useMemo, useState } from "react";

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

interface TocProps {
  items: TocItem[];
  /** Which rendering variant — see file header. Defaults to "mobile". */
  variant?: "mobile" | "desktop";
}

/**
 * Toc — TOC client island with scroll-spy.
 *
 * @param items   - the TOC items (built server-side via buildToc from lib/toc)
 * @param variant - "mobile" (collapsible card, lg:hidden) or "desktop" (sticky
 *                  sidebar, hidden lg:block). The page renders both variants.
 *
 * Renders nothing when items is empty. The scroll-spy uses IntersectionObserver
 * to track the currently-visible heading and applies an active highlight to the
 * matching anchor. SSR-safe — the useEffect only runs in the browser.
 */
export default function Toc({ items, variant = "mobile" }: TocProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // Mobile collapsible state — collapsed by default to minimize intrusiveness.
  const [mobileOpen, setMobileOpen] = useState(false);

  // Scroll-spy: observe each heading, track the topmost intersecting one.
  useEffect(() => {
    if (items.length === 0) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost intersecting entry — sort by viewport position.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        // Bias toward the upper third of the viewport — feels natural for reading.
        rootMargin: "-80px 0px -70% 0px",
        threshold: [0, 1],
      },
    );

    // Observe each heading element by id. Skip silently if missing (defensive).
    const headingEls: HTMLElement[] = [];
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) {
        observer.observe(el);
        headingEls.push(el);
      }
    }

    return () => {
      headingEls.forEach((el) => observer.unobserve(el));
      observer.disconnect();
    };
  }, [items]);

  // Memoize the click handler so the anchors work without full page reload.
  const handleAnchorClick = useMemo(
    () => (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      e.preventDefault();
      const el = document.getElementById(id);
      if (el) {
        // Update URL hash without jump, then smooth-scroll.
        history.replaceState(null, "", `#${id}`);
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveId(id);
        // Auto-close mobile nav on click.
        setMobileOpen(false);
      }
    },
    [],
  );

  if (items.length === 0) return null;

  // === Mobile variant — collapsible "On this page" card (lg:hidden) ===
  if (variant === "mobile") {
    return (
      <nav
        aria-label="Table of contents"
        className="mt-12 rounded-lg border border-gray-200 bg-gray-50 lg:hidden dark:border-gray-800 dark:bg-gray-900"
      >
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          className="flex w-full items-center justify-between p-4 text-left text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300"
        >
          <span>On this page</span>
          <span
            aria-hidden="true"
            className={`transition-transform ${mobileOpen ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </button>
        {mobileOpen ? (
          <ul className="space-y-1 px-4 pb-4 text-sm">
            {items.map((item) => (
              <li
                key={item.id}
                className={item.level === 3 ? "ml-4" : ""}
              >
                <a
                  href={`#${item.id}`}
                  onClick={(e) => handleAnchorClick(e, item.id)}
                  className={`block py-0.5 hover:underline ${
                    activeId === item.id
                      ? "font-semibold text-gray-900 dark:text-white"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </nav>
    );
  }

  // === Desktop variant — sticky sidebar with active highlight (hidden lg:block) ===
  return (
    <aside className="hidden lg:block">
      <nav
        aria-label="Table of contents"
        className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto"
      >
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          On this page
        </h2>
        <ul className="space-y-2 border-l border-gray-200 text-sm dark:border-gray-800">
          {items.map((item) => {
            const isActive = activeId === item.id;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={(e) => handleAnchorClick(e, item.id)}
                  className={
                    item.level === 3
                      ? `-ml-2 block border-l-2 pl-6 transition-colors ${
                          isActive
                            ? "border-gray-900 font-medium text-gray-900 dark:border-gray-100 dark:text-white"
                            : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                        }`
                      : `block border-l-2 pl-4 transition-colors ${
                          isActive
                            ? "border-gray-900 font-medium text-gray-900 dark:border-gray-100 dark:text-white"
                            : "border-transparent text-gray-700 hover:border-gray-400 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                        }`
                  }
                  aria-current={isActive ? "location" : undefined}
                >
                  {item.text}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
