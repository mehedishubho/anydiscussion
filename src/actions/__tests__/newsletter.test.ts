// src/actions/__tests__/newsletter.test.ts
// [CITED: 260824-3l2-PLAN.md Task 2/4/6 <behavior> blocks — the single test module
//  for src/actions/newsletter.ts, extended wave by wave]
// [CITED: src/actions/__tests__/seo-settings.test.ts — the MUST_NOT_BE_REACHED pattern]
// [CITED: 260824-3l2-CONTEXT.md D-02 (admin-only settings save) + T-3l2-02
//  (requireRole FIRST — proven here), D-01/D-05 (subscribe gates — Wave 3 tests),
//  D-03 (admin-only list/delete — Wave 4 tests)]
//
// Wave 2 (Task 2) — saveNewsletterSettings:
//   - non-admin → FORBIDDEN before ANY db write (MUST_NOT_BE_REACHED)
//   - admin → persists all 4 newsletter keys (4 upsert writes)
//   - admin → revalidateTag with EXACTLY the 2-arg form ("seo-settings", "max")
//   - admin → revalidatePath("/", "layout") and nothing else (no SEO routes read
//     newsletter keys — reasoned delta from saveSeoSettings)
//   - Zod rejects a >100-char heading before any db write
//   - enabled=false persists the STRING "false" (settings.value is text)
//
// Mock strategy mirrors seo-settings.test.ts: vi.hoisted + vi.mock the
// server-only deps (@/lib/db, @/lib/permissions, @/lib/log, next/cache). The
// newsletter actions never touch a real DB in tests.
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  requireRoleMock,
  updateSetMock,
  updateWhereMock,
  insertValuesMock,
  insertOnConflictMock,
  revalidatePathMock,
  revalidateTagMock,
} = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  // update chain: db.update(schema.settings).set(patch).where(eq) — set captures
  // the written patch (key/value assertions), where is the terminal promise.
  updateSetMock: vi.fn(),
  updateWhereMock: vi.fn(),
  // insert chain: db.insert(schema.settings).values(v).onConflictDoNothing()
  insertValuesMock: vi.fn(),
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

// db — chainable update + insert matching the private upsertSetting helper
// shape (update-then-insert-onConflictDoNothing). updateSetMock records every
// .set() patch so key/value persistence can be asserted precisely.
vi.mock("@/lib/db", () => {
  return {
    db: {
      // Readers (listSubscribers etc., Wave 4) extend this select chain later.
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: () => insertOnConflictMock(),
        })),
      })),
      update: vi.fn(() => ({
        set: (patch: unknown) => {
          updateSetMock(patch);
          return {
            where: (...a: unknown[]) => updateWhereMock(...a),
          };
        },
      })),
    },
    schema: {
      settings: { key: "key", value: "value", updatedAt: "updated_at" },
    },
  };
});

import { saveNewsletterSettings } from "../newsletter";

const adminSession = () => ({
  user: { id: "u-admin", role: "admin" },
  session: { id: "s1" },
});

describe("260824-3l2 D-02: saveNewsletterSettings — admin gate fires FIRST (MUST_NOT_BE_REACHED)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue(adminSession());
    // Rows matched on update → the upsert helper never falls back to insert
    // (mirrors settings.ts upsertSetting semantics).
    updateWhereMock.mockResolvedValue([{ key: "x" }]);
    insertOnConflictMock.mockResolvedValue(undefined);
    revalidatePathMock.mockReturnValue(undefined);
    revalidateTagMock.mockReturnValue(undefined);
  });

  it("non-admin → FORBIDDEN before any db.update or db.insert (MUST_NOT_BE_REACHED)", async () => {
    requireRoleMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    updateWhereMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    insertOnConflictMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(
      saveNewsletterSettings({
        enabled: true,
        heading: "Newsletter",
        description: "",
        successMessage: "",
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(requireRoleMock).toHaveBeenCalledWith("admin");
    expect(updateWhereMock).not.toHaveBeenCalled();
    expect(insertOnConflictMock).not.toHaveBeenCalled();
  });

  it("admin → persists all 4 newsletter keys (4 upsert writes)", async () => {
    await saveNewsletterSettings({
      enabled: true,
      heading: "Newsletter",
      description: "Subscribe for updates.",
      successMessage: "Thanks!",
    });

    expect(requireRoleMock).toHaveBeenCalledWith("admin");
    // Four keys: newsletter.enabled, newsletter.heading,
    // newsletter.description, newsletter.success_message.
    expect(updateWhereMock).toHaveBeenCalledTimes(4);
    // Rows matched on update → insert fallback never fires.
    expect(insertOnConflictMock).not.toHaveBeenCalled();
  });

  it("admin → revalidateTag with EXACTLY the 2-arg form ('seo-settings', 'max')", async () => {
    await saveNewsletterSettings({
      enabled: true,
      heading: "",
      description: "",
      successMessage: "",
    });

    expect(revalidateTagMock).toHaveBeenCalledTimes(1);
    expect(revalidateTagMock).toHaveBeenCalledWith("seo-settings", "max");
  });

  it("admin → calls revalidatePath('/', 'layout') and nothing else (no SEO routes read newsletter keys)", async () => {
    await saveNewsletterSettings({
      enabled: true,
      heading: "",
      description: "",
      successMessage: "",
    });

    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it("admin → heading longer than 100 chars is rejected by Zod before any db write", async () => {
    await expect(
      saveNewsletterSettings({
        enabled: true,
        heading: "a".repeat(101),
        description: "",
        successMessage: "",
      }),
    ).rejects.toThrow();
    expect(updateWhereMock).not.toHaveBeenCalled();
    expect(insertOnConflictMock).not.toHaveBeenCalled();
  });

  it("admin → enabled=false persists the STRING 'false' (settings.value is text)", async () => {
    await saveNewsletterSettings({
      enabled: false,
      heading: "Newsletter",
      description: "",
      successMessage: "",
    });

    // The enabled write is FIRST of the four Promise.all upserts; the stored
    // value must be the string "false" (not a boolean) — settings.value is text.
    expect(updateSetMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    const enabledPatch = updateSetMock.mock.calls[0]?.[0] as {
      value?: unknown;
    };
    expect(enabledPatch?.value).toBe("false");
    // Every persisted value is a string.
    for (const call of updateSetMock.mock.calls) {
      expect(typeof (call[0] as { value: unknown }).value).toBe("string");
    }
  });
});
