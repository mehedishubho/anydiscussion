// src/app/(admin)/dashboard/settings/storage/__tests__/StorageSettingsForm.test.tsx
// @vitest-environment jsdom
// [CITED: 260827-se8-PLAN.md Task 3 <action> step 2 — the render regression test]
// [CITED: src/app/(admin)/dashboard/settings/backup/__tests__/BackupSettingsForm.test.tsx
//  — the verbatim jsdom + testing-library + vi.hoisted pattern]
//
// The 260827-se8 regression this file pins: with the conditional-render
// wrappers removed, ALL FOUR provider sections (Cloudinary, Cloudflare R2,
// Push-CDN, Local) mount in the SAME render regardless of the selector
// value, and the section matching watch("activeProvider") carries the
// Active indicator (badge + brand border). Before this task only the
// active provider's section rendered — an admin could not review another
// provider's non-secret config without switching the selector.
//
// Mock strategy: the two Server Actions in @/actions/storage-settings are
// replaced with vi.fn spies so the form never crosses the client/server
// boundary. The real Zod schema (schema-client bridge) stays — client shape
// provably matches the server contract. QueryClientProvider wraps the form
// (the save path uses TanStack useMutation — D-27, NOT optimistic).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// --- Hoisted action spies (mock factory needs them at hoist time) ---
const { saveStorageSettingsMock, testStorageConnectionMock } = vi.hoisted(
  () => ({
    saveStorageSettingsMock: vi.fn(),
    testStorageConnectionMock: vi.fn(),
  }),
);

vi.mock("@/actions/storage-settings", () => ({
  saveStorageSettings: (...a: unknown[]) => saveStorageSettingsMock(...a),
  testStorageConnection: (...a: unknown[]) => testStorageConnectionMock(...a),
}));

import StorageSettingsForm from "../StorageSettingsForm";

/** Render the form with a fresh QueryClient and redacted initial settings. */
const renderForm = (activeProvider: string) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <StorageSettingsForm initial={{ activeProvider }} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("260827-se8 Task 3: StorageSettingsForm — all four provider sections in ONE render", () => {
  it("initial activeProvider 'local' → Cloudinary, Cloudflare R2, Push-CDN, AND Local headings all present (the exact fixed regression)", () => {
    renderForm("local");

    expect(
      screen.getByText("Cloudinary credentials"),
    ).toBeTruthy();
    expect(
      screen.getByText("Cloudflare R2 credentials"),
    ).toBeTruthy();
    expect(
      screen.getByText("Push-CDN credentials (S3-compatible origin + CDN overlay)"),
    ).toBeTruthy();
    expect(screen.getByText("Local filesystem")).toBeTruthy();
  });

  it("the LOCAL section carries the Active indicator (badge inside its container + brand border); no other section does", () => {
    renderForm("local");

    // Exactly ONE Active badge in the whole render — on the local section.
    const badges = screen.getAllByText("Active");
    expect(badges).toHaveLength(1);

    // The badge lives inside the Local section's bordered container, and
    // that container carries the brand border ring.
    const localSection = screen
      .getByText("Local filesystem")
      .closest("div.rounded-lg");
    expect(localSection).not.toBeNull();
    expect(localSection?.textContent).toContain("Active");
    expect(localSection?.className).toContain("border-brand-500");
  });

  it("switching the watched provider to 'r2' keeps all four sections mounted and moves the Active badge to the R2 section", () => {
    renderForm("r2");

    expect(screen.getByText("Cloudinary credentials")).toBeTruthy();
    expect(screen.getByText("Local filesystem")).toBeTruthy();

    const badges = screen.getAllByText("Active");
    expect(badges).toHaveLength(1);
    const r2Section = screen
      .getByText("Cloudflare R2 credentials")
      .closest("div.rounded-lg");
    expect(r2Section?.textContent).toContain("Active");
    expect(r2Section?.className).toContain("border-brand-500");
  });
});
