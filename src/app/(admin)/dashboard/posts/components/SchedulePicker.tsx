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
//
// 05-08: this component calls setSchedule(postId, date) DIRECTLY from the flatpickr
// onChange option — the action's first call site. The edit page (a Server Component)
// must never pass a function prop here: functions cannot cross the server-to-client
// RSC serialization boundary, and the Phase-3 inline no-op stub prop threw on EVERY
// edit-page render (the 05-UAT R1 re-test blocker). The call is DEBOUNCED (~700ms)
// because with enableTime:true flatpickr fires onChange once per calendar-date pick
// AND once per time-slider increment — one settled value, one action call, one toast.
// An empty dates array (clear-to-empty) cancels any pending debounced call and
// returns WITHOUT invoking the action: setSchedule requires a non-null Date, and
// flatpickr's default readonly input makes a UI clear unreachable — defensive guard
// only; the persisted value simply stays.
//
// 260828-gyt: setSchedule is now SEMANTICS-AWARE — scheduling a PUBLISHED post
// to a future date also takes it offline (published→draft + public-surface
// revalidation server-side; the every-minute worker republishes at due time).
// The success toast must say so: { unpublished: true } renders
// "Post unpublished — scheduled for {local date}" instead of the plain
// "Schedule saved". Past dates on published posts reject SCHEDULE_IN_PAST and
// the raw message reaches the error toast below.
import { useEffect, useRef, useState } from "react";
import flatpickr from "flatpickr";
import { toast } from "sonner";
import { getSetting } from "@/actions/settings";
import { setSchedule } from "@/actions/posts";

// flatpickr instance type — structural (only the methods we use).
type FlatpickrInstance = { destroy: () => void };

interface SchedulePickerProps {
  postId: number;
  publishedAt: Date | null;
  /** Pre-fetched timezone from the edit page (Server Component) for instant first-paint. */
  initialTimezone?: string;
}

export default function SchedulePicker({
  postId,
  publishedAt,
  initialTimezone,
}: SchedulePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fpRef = useRef<FlatpickrInstance | null>(null);
  // 05-08 — handle of the pending debounced setSchedule call (see header comment).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [timezone, setTimezone] = useState<string | null>(initialTimezone ?? null);

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
        // Clear-to-empty guard: cancel any pending debounced save and return
        // WITHOUT invoking the action — setSchedule requires a non-null Date
        // (see header comment; defensive only, UI clears are unreachable).
        if (dates.length === 0) {
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
          }
          return;
        }
        // Reset the debounce timer on every fire — one settled value, one
        // action call, one toast (see header comment for the per-tick rationale).
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const date = dates[0];
        debounceRef.current = setTimeout(() => {
          debounceRef.current = null;
          void (async () => {
            try {
              // 260828-gyt — capture the result: unpublished=true means the
              // server ALSO took a published post offline (it comes back at
              // the scheduled minute). The toast must make that visible.
              const result = await setSchedule(postId, date);
              if (result?.unpublished) {
                toast.success(`Post unpublished — scheduled for ${date.toLocaleString()}`);
              } else {
                toast.success("Schedule saved");
              }
            } catch (err) {
              // Raw action message (FORBIDDEN / SCHEDULE_IN_PAST / network
              // text) — 05-06 convention.
              toast.error(
                err instanceof Error ? err.message : "Failed to save schedule",
              );
            }
          })();
        }, 700);
      },
    });
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
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
        Leave empty to publish immediately. Time stored as UTC. Scheduling a
        published post takes it offline until the scheduled time (it republishes
        automatically).
      </p>
    </div>
  );
}
