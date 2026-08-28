"use client";
// src/components/header/GlobalSearch.tsx
// [CITED: 260827-se8-PLAN.md Task 8 <action> step 2 — the self-contained search island]
// [CITED: research Finding — keyed queries discard stale responses]
//
// The header global search island. Owns: the search input (TailAdmin markup
// moved verbatim from AppHeader's inert form), the ⌘K/Ctrl+K focus shortcut
// (moved here from AppHeader), a ~300ms debounce, and the live results
// dropdown. Queries ride the shell's existing QueryProvider — no props, no
// threading through AuthGate (the layout does not re-render on sibling page
// navigations, so a prop-fed search would go stale; this island re-fetches
// on its own keyed cache).
//
// Keyed useQuery(["global-search", q]) means each keystroke window gets its
// own cache entry — a slow earlier response can never overwrite a newer one.
// Click-throughs (verified routes only):
//   post     → /dashboard/posts/{id}/edit
//   user     → /dashboard/users?q={email}      (URL-driven list, Task 5)
//   category → /dashboard/categories?q={name}  (URL-driven list, Task 6)
//   tag      → /dashboard/tags
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { globalSearch } from "@/actions/search";

/** Minimum characters before a query fires (mirrors the action's <2 short-circuit). */
const MIN_QUERY_LENGTH = 2;
/** Keystroke settle window before firing the action. */
const DEBOUNCE_MS = 300;

type SearchGroups = Awaited<ReturnType<typeof globalSearch>>;

const INPUT_CLASS =
  "dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 xl:w-[430px]";

function SearchIcon() {
  return (
    <svg
      className="fill-gray-500 dark:fill-gray-400"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.0033 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
        fill=""
      />
    </svg>
  );
}

export default function GlobalSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Debounce — the action fires DEBOUNCE_MS after the last keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);

  // ⌘K / Ctrl+K focus shortcut (moved here from AppHeader).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Escape closes the dropdown; click-outside closes it too.
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [isOpen]);

  const enabled = debounced.length >= MIN_QUERY_LENGTH;

  const { data, isFetching } = useQuery<SearchGroups>({
    queryKey: ["global-search", debounced],
    queryFn: () => globalSearch(debounced),
    enabled,
  });

  const groups = data;
  const hasResults =
    groups !== undefined &&
    (groups.posts.length > 0 ||
      groups.users.length > 0 ||
      groups.categories.length > 0 ||
      groups.tags.length > 0);

  return (
    <div className="relative" ref={rootRef}>
      <div className="relative">
        <span className="absolute -translate-y-1/2 left-4 top-1/2 pointer-events-none">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder="Search or type command..."
          className={INPUT_CLASS}
          onChange={(e) => {
            setValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          aria-label="Global search"
        />
        <button
          type="button"
          className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs -tracking-[0.2px] text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400"
          onClick={() => inputRef.current?.focus()}
          aria-label="Focus search (Command K)"
        >
          <span> ⌘ </span>
          <span> K </span>
        </button>
      </div>

      {isOpen && enabled && (
        <div className="absolute left-0 right-0 top-full z-999999 mt-2 max-h-[420px] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark">
          {isFetching && !hasResults ? (
            <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Searching…</p>
          ) : !hasResults ? (
            <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              No results for “{debounced}”
            </p>
          ) : (
            <>
              {groups!.posts.length > 0 && (
                <SearchSection title="Posts">
                  {groups!.posts.map((p) => (
                    <SearchItem key={`p-${p.id}`} href={`/dashboard/posts/${p.id}/edit`} onClose={() => setIsOpen(false)}>
                      <span className="truncate">{p.title}</span>
                      <span className="ml-2 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-white/5 dark:text-gray-400">
                        {p.status === "pending_review" ? "pending" : p.status}
                      </span>
                    </SearchItem>
                  ))}
                </SearchSection>
              )}
              {groups!.users.length > 0 && (
                <SearchSection title="Users">
                  {groups!.users.map((u) => (
                    <SearchItem
                      key={`u-${u.id}`}
                      href={`/dashboard/users?q=${encodeURIComponent(u.email)}`}
                      onClose={() => setIsOpen(false)}
                    >
                      <span className="truncate">{u.name}</span>
                      <span className="ml-2 shrink-0 truncate text-[11px] text-gray-400 dark:text-gray-500">
                        {u.email}
                      </span>
                    </SearchItem>
                  ))}
                </SearchSection>
              )}
              {groups!.categories.length > 0 && (
                <SearchSection title="Categories">
                  {groups!.categories.map((c) => (
                    <SearchItem
                      key={`c-${c.id}`}
                      href={`/dashboard/categories?q=${encodeURIComponent(c.name)}`}
                      onClose={() => setIsOpen(false)}
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="ml-2 shrink-0 truncate text-[11px] text-gray-400 dark:text-gray-500">
                        {c.slug}
                      </span>
                    </SearchItem>
                  ))}
                </SearchSection>
              )}
              {groups!.tags.length > 0 && (
                <SearchSection title="Tags">
                  {groups!.tags.map((t) => (
                    <SearchItem key={`t-${t.id}`} href="/dashboard/tags" onClose={() => setIsOpen(false)}>
                      <span className="truncate">{t.name}</span>
                      <span className="ml-2 shrink-0 truncate text-[11px] text-gray-400 dark:text-gray-500">
                        {t.slug}
                      </span>
                    </SearchItem>
                  ))}
                </SearchSection>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SearchSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1 last:mb-0">
      <h6 className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {title}
      </h6>
      {children}
    </div>
  );
}

function SearchItem({
  href,
  onClose,
  children,
}: {
  href: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
    >
      {children}
    </Link>
  );
}
