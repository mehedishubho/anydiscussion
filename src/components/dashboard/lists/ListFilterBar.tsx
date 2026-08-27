"use client";
// src/components/dashboard/lists/ListFilterBar.tsx
// [CITED: 260827-se8-PLAN.md Task 2 <action> step 2 — the generic URL-writing
// filter bar consumed by the posts/users/categories/media lists (Tasks 4-7)]
//
// List-mechanics contract (260827-se8 list decision):
//   - The bar ONLY writes URLs. It never fetches, never holds rows — the
//     Server Component re-queries from the new searchParams, so list state
//     stays URL-driven (shareable, back/forward-correct, zero client data
//     layer).
//   - Params are built from the PROPS the server just rendered (deterministic
//     without reading the URL) — sidestepping the useSearchParams CSR-bailout
//     class entirely (research Pitfall 8: useSearchParams in a client
//     component under cacheComponents forces dynamic rendering of the route).
//   - ANY filter change DROPS the page param — filtering always resets to
//     page 1, so a stale ?page=7 can never point past a shortened result set.
//
// Discretion element: the 300ms debounce is applied to BOTH free-text inputs
// (q and the optional text field) — a per-keystroke router.push would fire a
// server round-trip per character on the posts list. Enter commits either
// input immediately. Selects are discrete choices and apply on change.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** TailAdmin form styling — matches StorageSettingsForm's INPUT_CLASS look. */
const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

const LABEL_CLASS =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

/** A discrete select filter (e.g. Status, Category). value "" = "All". */
export interface FilterSelectDef {
  /** URL param name, used verbatim (e.g. "status"). */
  name: string;
  label: string;
  /** Current value from the server-rendered searchParams. */
  value: string;
  options: Array<{ value: string; label: string }>;
}

/** An optional secondary free-text filter (e.g. Author). */
export interface FilterTextFieldDef {
  /** URL param name, used verbatim (e.g. "author"). */
  name: string;
  label: string;
  value: string;
  placeholder?: string;
}

interface ListFilterBarProps {
  /** Route the filtered URL is pushed to (e.g. "/dashboard/posts"). */
  basePath: string;
  /** Current q value from searchParams (the primary search box). */
  q: string;
  selects?: FilterSelectDef[];
  textField?: FilterTextFieldDef;
}

const DEBOUNCE_MS = 300;

export default function ListFilterBar({
  basePath,
  q,
  selects = [],
  textField,
}: ListFilterBarProps) {
  const router = useRouter();
  // Local q mirrors the prop so typing is instant while the push waits for
  // the debounce; the effects re-sync when the URL (thus the props) change —
  // e.g. after a pagination Link navigation re-renders with new searchParams.
  const [qState, setQState] = useState(q);
  const [textState, setTextState] = useState(textField?.value ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQState(q);
  }, [q]);

  useEffect(() => {
    setTextState(textField?.value ?? "");
  }, [textField?.value]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  /**
   * Build a fresh URLSearchParams from ALL current values — non-empty only —
   * and push. The page param is intentionally NEVER set (filter change ⇒
   * page 1); there is nothing to "drop" because stale page params simply
   * never enter the new URL.
   */
  const pushFilters = (
    nextQ: string,
    override?: { name: string; value: string },
  ) => {
    const params = new URLSearchParams();
    const trimmedQ = nextQ.trim();
    if (trimmedQ) params.set("q", trimmedQ);
    for (const s of selects) {
      const v = override?.name === s.name ? override.value : s.value;
      if (v) params.set(s.name, v);
    }
    if (textField) {
      const raw = override?.name === textField.name ? override.value : textField.value;
      const v = raw.trim();
      if (v) params.set(textField.name, v);
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  const schedulePush = (value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => pushFilters(value), DEBOUNCE_MS);
  };

  const commitNow = (value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    pushFilters(value);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-55 max-w-md flex-1">
        <label htmlFor="list-filter-q" className={LABEL_CLASS}>
          Search
        </label>
        <input
          id="list-filter-q"
          type="search"
          className={INPUT_CLASS}
          placeholder="Type to search…"
          value={qState}
          onChange={(e) => {
            setQState(e.target.value);
            schedulePush(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitNow(qState);
          }}
        />
      </div>

      {selects.map((s) => (
        <div key={s.name} className="min-w-40">
          <label htmlFor={`list-filter-${s.name}`} className={LABEL_CLASS}>
            {s.label}
          </label>
          <select
            id={`list-filter-${s.name}`}
            className={INPUT_CLASS}
            value={s.value}
            onChange={(e) =>
              pushFilters(qState, { name: s.name, value: e.target.value })
            }
          >
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {textField && (
        <div className="min-w-45">
          <label
            htmlFor={`list-filter-${textField.name}`}
            className={LABEL_CLASS}
          >
            {textField.label}
          </label>
          <input
            id={`list-filter-${textField.name}`}
            type="text"
            className={INPUT_CLASS}
            placeholder={textField.placeholder}
            value={textState}
            onChange={(e) => {
              setTextState(e.target.value);
              schedulePush(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNow(qState);
            }}
          />
        </div>
      )}
    </div>
  );
}
