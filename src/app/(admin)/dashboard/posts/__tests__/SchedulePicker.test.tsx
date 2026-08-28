// @vitest-environment jsdom
// src/app/(admin)/dashboard/posts/__tests__/SchedulePicker.test.tsx
// [CITED: 260828-gyt-PLAN.md Task 3 <behavior> — semantics-aware toast]
//
// Pins the 260828-gyt SchedulePicker toast semantics:
//   - setSchedule resolving { unpublished: true } → success toast contains
//     "Post unpublished — scheduled for {local date}" (the take-offline side
//     effect must be VISIBLE — scheduling a published post unpublishes it now).
//   - setSchedule resolving { ok: true, unpublished: false } → toast is
//     exactly "Schedule saved" (the old unconditional message).
//
// flatpickr is mocked with a factory that CAPTURES the config object, so a
// test can invoke config.onChange([date]) directly (the real flatpickr never
// mounts in jsdom). vi.useFakeTimers + advanceTimersByTimeAsync(700) flushes
// the ~700ms debounce AND the awaited action's microtasks in one step.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

const {
  toastSuccessMock,
  toastErrorMock,
  setScheduleMock,
  getSettingMock,
  fpConfigRef,
  fpDestroyMock,
} = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  setScheduleMock: vi.fn(),
  getSettingMock: vi.fn(),
  fpConfigRef: {} as { current: { onChange: (dates: Date[]) => void } | null },
  fpDestroyMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccessMock(...a),
    error: (...a: unknown[]) => toastErrorMock(...a),
  },
}));

// Capturing factory — records the config the component passes to flatpickr.
vi.mock("flatpickr", () => ({
  default: (el: unknown, config: { onChange: (dates: Date[]) => void }) => {
    fpConfigRef.current = config;
    return { destroy: fpDestroyMock };
  },
}));

vi.mock("@/actions/posts", () => ({
  setSchedule: (...a: unknown[]) => setScheduleMock(...a),
}));

vi.mock("@/actions/settings", () => ({
  getSetting: (...a: unknown[]) => getSettingMock(...a),
}));

import SchedulePicker from "../components/SchedulePicker";

/** Render, pick a date through the captured flatpickr config, flush the debounce. */
async function pickAndFlush(date: Date) {
  render(<SchedulePicker postId={7} publishedAt={null} />);
  const config = fpConfigRef.current;
  if (!config) throw new Error("flatpickr config not captured");
  act(() => {
    config.onChange([date]);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  getSettingMock.mockResolvedValue(null);
});

afterEach(() => {
  // Unmount BEFORE restoring real timers — the cleanup path clears the
  // pending debounce handle with the fake clock still in charge.
  cleanup();
  vi.useRealTimers();
});

describe("260828-gyt: SchedulePicker — semantics-aware success toast", () => {
  it("setSchedule { unpublished: true } → toast contains 'Post unpublished' + the picked date is sent as (7, date)", async () => {
    setScheduleMock.mockResolvedValue({ ok: true, unpublished: true });
    const picked = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pickAndFlush(picked);

    expect(setScheduleMock).toHaveBeenCalledWith(7, picked);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining("Post unpublished"),
    );
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("setSchedule { ok: true, unpublished: false } → toast is exactly 'Schedule saved'", async () => {
    setScheduleMock.mockResolvedValue({ ok: true, unpublished: false });
    const picked = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await pickAndFlush(picked);

    expect(setScheduleMock).toHaveBeenCalledWith(7, picked);
    expect(toastSuccessMock).toHaveBeenCalledWith("Schedule saved");
  });

  it("setSchedule rejection → toast.error carries the raw action message", async () => {
    setScheduleMock.mockRejectedValue(
      new Error(
        "SCHEDULE_IN_PAST — pick a future date for a published post, or unpublish it first",
      ),
    );

    await pickAndFlush(new Date(Date.now() + 60 * 60 * 1000));

    expect(toastErrorMock).toHaveBeenCalledWith(
      "SCHEDULE_IN_PAST — pick a future date for a published post, or unpublish it first",
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});
