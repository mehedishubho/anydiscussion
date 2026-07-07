// src/components/site/ReadProgress.tsx
// [CITED: 06-03-PLAN.md Task 3 — ReadProgress client island (D-14)]
// [CITED: src/context/ThemeContext.tsx L21-39 — the useEffect class-list pattern, MODEL only — DO NOT import]
// [CITED: 06-RESEARCH.md — minimal client JS for genuine interactivity only]
//
// A thin fixed bar at the top of the viewport that fills as the reader scrolls.
// Uses a scroll listener in useEffect (the dashboard ThemeContext's class-list
// pattern is the structural model — NOT imported; route-group isolation D-13).
//
// Progressive enhancement: if JS is disabled, no bar renders. The bar is purely
// cosmetic — it doesn't gate any functionality.
//
// Route-group isolation: does NOT import from (admin) or ThemeContext (D-13).

"use client";

import { useEffect, useState } from "react";

/**
 * ReadProgress — thin fixed top bar showing scroll progress through the article.
 *
 * Listens to window scroll, calculates the percentage of the document scrolled
 * (scrollTop / (scrollHeight - clientHeight) * 100), and sets the bar width.
 * Dark-mode aware via dark: classes. ARIA-hidden — decorative, not announced.
 */
export default function ReadProgress() {
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      const viewportHeight = window.innerHeight;
      const scrollable = docHeight - viewportHeight;
      // Avoid divide-by-zero on short pages (progress stays at 0).
      const pct = scrollable > 0 ? (scrollTop / scrollable) * 100 : 0;
      // Clamp to [0, 100] — overscroll can exceed bounds on touch devices.
      setProgress(Math.max(0, Math.min(100, pct)));
    };

    // Initial read so the bar reflects position on mount (e.g. anchor navigation).
    handleScroll();
    // passive: true — we don't preventDefault; smooth perf is critical.
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] bg-transparent"
    >
      <div
        className="h-full bg-gradient-to-r from-brand-500 to-brand-700 transition-[width] duration-100 ease-out dark:from-brand-400 dark:to-brand-600"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
