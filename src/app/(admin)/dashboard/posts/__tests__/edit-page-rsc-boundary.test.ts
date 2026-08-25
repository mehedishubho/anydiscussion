// src/app/(admin)/dashboard/posts/__tests__/edit-page-rsc-boundary.test.ts
// [CITED: 05-08-PLAN.md Task 2 — structural regression pin for the edit-page RSC boundary]
// [CITED: 05-UAT.md R1 re-test blocker — the bug this suite exists to prevent]
//
// Plain node environment, PURE SOURCE SCAN: no jsdom pragma, no component imports.
// Importing the edit page would drag 'use server' module machinery and DB-touching
// actions into the test; the bug class lives in the source TEXT — a function value
// in a Client Component's props. tsc AND `next build` both pass that bug (types are
// fine; the build never renders the page), it only throws at RSC serialization
// time when the page actually renders. From Phase 3 until the 05-UAT R1 re-run
// first live-loaded the page, EVERY visit to /dashboard/posts/[id]/edit crashed on
// the inline no-op onChange stub. A failure here reads as a boundary violation,
// not a lint-style annoyance — do not "fix" it by deleting this suite.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const EDIT_PAGE = path.resolve(
  process.cwd(),
  "src/app/(admin)/dashboard/posts/[id]/edit/page.tsx",
);
const SCHEDULE_PICKER = path.resolve(
  process.cwd(),
  "src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx",
);

// Strip comments so documentation mentioning handler names can never
// false-positive — only actual code counts (same convention as
// src/lib/backup/__tests__/r2-destination.test.ts).
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("05-08: edit-page RSC boundary (05-UAT R1 regression pin)", () => {
  it("edit page passes only serializable props to SchedulePicker", () => {
    const src = stripComments(readFileSync(EDIT_PAGE, "utf8"));

    // The JSX span from the opening SchedulePicker tag through its self-closing
    // slash-bracket (the component has no children).
    const span =
      src.match(/<SchedulePicker[\s\S]*?\/>/)?.[0] ?? "";

    // Sanity: the picker is still rendered (for non-author viewers). If the
    // component ever moves or is deleted, update this pin DELIBERATELY.
    expect(
      span,
      "SchedulePicker JSX span not found in the edit page — update this pin deliberately if the picker moved",
    ).toBeTruthy();

    // The regression: an on*-prefixed PascalCase prop (onChange=, onClick=, …)
    // assigned on a 'use client' component rendered by this Server Component is
    // a function crossing the server-to-client RSC serialization boundary —
    // it throws on every render of the page.
    expect(span).not.toMatch(/\bon[A-Z]\w*\s*=/);
  });

  it("SchedulePicker interface declares no event-handler member", () => {
    const src = readFileSync(SCHEDULE_PICKER, "utf8");

    // Scope STRICTLY to the interface block — the flatpickr config object
    // legitimately declares an onChange OPTION elsewhere in the file, and this
    // assertion must not punish it.
    const iface =
      src.match(/interface SchedulePickerProps\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(
      iface,
      "SchedulePickerProps interface not found — update this pin if the props type moved",
    ).toBeTruthy();

    // A required function member here would force any Server Component render
    // site to pass a function prop — exactly the 05-UAT R1 bug class.
    expect(stripComments(iface)).not.toMatch(/\bon[A-Z]\w*\s*\??:/);
  });
});
