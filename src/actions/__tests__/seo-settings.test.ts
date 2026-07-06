// src/actions/__tests__/seo-settings.test.ts
// [CITED: 05-03-PLAN.md Task 2 <behavior> + <done>]
// [CITED: 05-VALIDATION.md T-05-01 row — saveSeoSettings admin gate MUST_NOT_BE_REACHED]
// [CITED: src/actions/__tests__/storage-settings.test.ts L165-188 — the MUST_NOT_BE_REACHED pattern]
// [CITED: 05-RESEARCH.md Pitfall 6 (L746-750) — revalidateTag('seo-settings','max') 2-arg form]
//
// Wave-0 permission-gate tests proving T-05-01 is mitigated for saveSeoSettings:
//   - non-admin (author/editor) → FORBIDDEN before ANY db.write (MUST_NOT_BE_REACHED)
//   - admin → writes the five settings keys + calls revalidateTag('seo-settings','max')
//     (2-arg form — landmine #5) + revalidatePath('/','layout') + the 3 SEO routes.
//
// Mock strategy mirrors storage-settings.test.ts: vi.hoisted + vi.mock the
// server-only deps (@/lib/db, @/lib/permissions, @/lib/log, next/cache). The
// saveSeoSettings action never touches a real DB in tests.
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  requireRoleMock,
  updateSetWhereMock,
  insertOnConflictMock,
  revalidatePathMock,
  revalidateTagMock,
} = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  updateSetWhereMock: vi.fn(),
  insertOnConflictMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  revalidateTagMock: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  requireRole: (...a: unknown[]) => requireRoleMock(...a),
}));

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
  revalidateTag: (...a: unknown[]) => revalidateTagMock(...a),
}));

// db — chainable update + insert matching the upsertSetting helper shape.
vi.mock("@/lib/db", () => {
  return {
    db: {
      // saveSeoSettings only writes (no reads); select is stubbed for completeness.
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing: () => insertOnConflictMock() })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: (...a: unknown[]) => updateSetWhereMock(...a) })),
      })),
    },
    schema: {
      settings: { key: "key", value: "value", updatedAt: "updated_at" },
    },
  };
});

import { saveSeoSettings } from "../settings";

const adminSession = () => ({
  user: { id: "u-admin", role: "admin" },
  session: { id: "s1" },
});

describe("T-05-01: saveSeoSettings — admin gate fires FIRST (MUST_NOT_BE_REACHED)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue(adminSession());
    updateSetWhereMock.mockResolvedValue(undefined);
    insertOnConflictMock.mockResolvedValue(undefined);
    revalidatePathMock.mockReturnValue(undefined);
    revalidateTagMock.mockReturnValue(undefined);
  });

  it("non-admin → FORBIDDEN before any db.update or db.insert (MUST_NOT_BE_REACHED)", async () => {
    requireRoleMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    updateSetWhereMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    insertOnConflictMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(
      saveSeoSettings({
        siteTitle: "Any Discussion",
        siteDescription: "A blog.",
        defaultOgImage: "",
        canonicalBaseUrl: "https://anydiscussion.com",
        twitterHandle: "@anydiscussion",
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(requireRoleMock).toHaveBeenCalledWith("admin");
    expect(updateSetWhereMock).not.toHaveBeenCalled();
    expect(insertOnConflictMock).not.toHaveBeenCalled();
  });

  it("admin → writes the five settings keys via upsertSetting (5 db calls)", async () => {
    await saveSeoSettings({
      siteTitle: "Any Discussion",
      siteDescription: "A fast blog.",
      defaultOgImage: "https://cdn.anydiscussion.com/og.png",
      canonicalBaseUrl: "https://anydiscussion.com",
      twitterHandle: "@anydiscussion",
    });

    expect(requireRoleMock).toHaveBeenCalledWith("admin");
    // Five keys: site.title, site.description, seo.default_og_image,
    // site.canonical_base_url, seo.twitter_handle.
    expect(updateSetWhereMock).toHaveBeenCalledTimes(5);
  });

  it("admin → calls revalidateTag with 2-arg form ('seo-settings', 'max') (landmine #5)", async () => {
    await saveSeoSettings({
      siteTitle: "Any Discussion",
      siteDescription: "",
      defaultOgImage: "",
      canonicalBaseUrl: "https://anydiscussion.com",
      twitterHandle: "",
    });

    const seoTagCall = revalidateTagMock.mock.calls.find(
      (c) => c[0] === "seo-settings",
    );
    expect(seoTagCall).toBeDefined();
    expect(seoTagCall?.[1]).toBe("max"); // 2-arg form — single-arg is DEPRECATED
  });

  it("admin → calls revalidatePath('/', 'layout') + the 3 SEO routes", async () => {
    await saveSeoSettings({
      siteTitle: "Any Discussion",
      siteDescription: "",
      defaultOgImage: "",
      canonicalBaseUrl: "https://anydiscussion.com",
      twitterHandle: "",
    });

    const paths = revalidatePathMock.mock.calls.map((c) => [c[0], c[1]]);
    expect(paths).toContainEqual(["/", "layout"]);
    expect(paths).toContainEqual(["/sitemap.xml", undefined]);
    expect(paths).toContainEqual(["/robots.txt", undefined]);
    expect(paths).toContainEqual(["/rss.xml", undefined]);
  });

  it("admin → empty site title is rejected by Zod (min 1) before any db.write", async () => {
    await expect(
      saveSeoSettings({
        siteTitle: "",
        siteDescription: "",
        defaultOgImage: "",
        canonicalBaseUrl: "https://anydiscussion.com",
        twitterHandle: "",
      }),
    ).rejects.toThrow();
    expect(updateSetWhereMock).not.toHaveBeenCalled();
  });

  it("admin → invalid canonicalBaseUrl is rejected by Zod (must be valid URL)", async () => {
    await expect(
      saveSeoSettings({
        siteTitle: "Any Discussion",
        siteDescription: "",
        defaultOgImage: "",
        canonicalBaseUrl: "not-a-url",
        twitterHandle: "",
      }),
    ).rejects.toThrow();
    expect(updateSetWhereMock).not.toHaveBeenCalled();
  });
});
