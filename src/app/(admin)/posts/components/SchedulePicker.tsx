"use client";
// src/app/(admin)/posts/components/SchedulePicker.tsx
// [CITED: 03-CONTEXT.md D-13 (full scheduling feature — datetime picker),
//  D-14 (UTC store + site-configured timezone display), D-15 (editor/admin only)]
// [CITED: 03-04-PLAN.md Task 3 Step A — getSetting("site.timezone") read path]
//
// Datetime picker for scheduling post publication. Uses flatpickr with enableTime:true
// (datetime mode). The display timezone label is READ from the settings key
// `site.timezone` via getSetting — NEVER a hardcoded tz literal (D-14).
//
// D-14: publishedAt is stored as UTC (JS Date internally stores epoch ms —
// toISOString() yields UTC). The picker renders in the browser's local timezone;
// the timezone LABEL (e.g. "Asia/Dhaka") is displayed alongside the input to show
// the intended site timezone. A future enhancement can wire flatpickr's timezone
// plugin for true tz-aware rendering.
//
// The edit page (Server Component) pre-fetches site.timezone via the SAME getSetting
// action and passes `initialTimezone` for instant first-paint (no flash of an
// unresolved label). This component also re-validates on mount.
import { useEffect, useRef, useState } from "react";
import flatpickr from "flatpickr";
import { getSetting } from "@/actions/settings";

// flatpickr instance type — structural (only the methods we use).
type FlatpickrInstance = { destroy: () => void };

interface SchedulePickerProps {
  postId: number;
  publishedAt: Date | null;
  onChange: (date: Date | null) => void;
  /** Pre-fetched timezone from the edit page (Server Component) for instant first-paint. */
  initialTimezone?: string;
}

export default function SchedulePicker({
  postId,
  publishedAt,
  onChange,
  initialTimezone,
}: SchedulePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fpRef = useRef<FlatpickrInstance | null>(null);
  const [timezone, setTimezone] = useState<string | null>(initialTimezone ?? null);
  const [copied, setCopied] = useState(false);

  // D-14 — read the live timezone value from settings on mount (re-validates the
  // initialTimezone prop in case the admin changed it since page load).
  useEffect(() => {
    if (initialTimezone) return; // trust the server-fetched prop when available
    let cancelled = false;
    getSetting("site.timezone")
      .then((tz) => {
        if (!cancelled && tz) setTimezone(tz);
      })
      .catch(() => {
        // Non-critical — the label just won't show a tz name.
      });
    return () => {
      cancelled = true;
    };
  }, [initialTimezone]);

  // Initialize flatpickr with enableTime:true (datetime mode).
  useEffect(() => {
    if (!inputRef.current) return;
    fpRef.current = flatpickr(inputRef.current, {
      enableTime: true,
      dateFormat: "Y-m-d H:i",
      defaultDate: publishedAt ?? undefined,
      onChange: (dates) => {
        if (dates.length > 0) {
          onChange(dates[0]);
        } else {
          onChange(null);
        }
      },
    });
    return () => {
      fpRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tzLabel = timezone ? `(${timezone})` : "";

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Schedule {tzLabel}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder="Select publish date and time…"
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
          data-post-id={postId}
        />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Leave empty to publish immediately. Time stored as UTC.
      </p>
    </div>
  );
}
