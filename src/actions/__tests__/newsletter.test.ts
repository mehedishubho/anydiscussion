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
  insertOnConflictUpdateMock,
  deleteMock,
  deleteWhereMock,
  revalidatePathMock,
  revalidateTagMock,
  headersMock,
  newsletterLimiterMock,
} = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  // update chain: db.update(schema.settings).set(patch).where(eq) — set captures
  // the written patch (key/value assertions), where is the terminal promise.
  updateSetMock: vi.fn(),
  updateWhereMock: vi.fn(),
  // insert chain: db.insert(...).values(v) captures the row; both conflict
  // continuations exist (onConflictDoNothing for upsertSetting, onConflictDoUpdate
  // for the D-01 subscribe upsert — the config object is captured for assertions).
  insertValuesMock: vi.fn(),
  insertOnConflictMock: vi.fn(),
  insertOnConflictUpdateMock: vi.fn(),
  // delete chain (Wave 4): db.delete(schema.subscribers).where(eq(id)) —
  // deleteMock records the table, deleteWhereMock is the terminal promise.
  deleteMock: vi.fn(),
  deleteWhereMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  revalidateTagMock: vi.fn(),
  headersMock: vi.fn(),
  newsletterLimiterMock: vi.fn(),
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

// next/headers — subscribeNewsletter reads x-forwarded-for (contact.ts
// extraction: first value, "unknown" fallback). Controllable per-test.
vi.mock("next/headers", () => ({
  headers: (...a: unknown[]) => headersMock(...a),
}));

// @/lib/rate-limit — controllable newsletterLimiter mock (D-05).
vi.mock("@/lib/rate-limit", () => ({
  newsletterLimiter: { limit: (...a: unknown[]) => newsletterLimiterMock(...a) },
}));

// db — chainable update + insert + delete + select matching the action shapes:
// upsertSetting (settings insert → onConflictDoNothing), the D-01 subscribe
// upsert (subscribers insert → onConflictDoUpdate), deleteSubscriber
// (delete → where), and the Wave-4 reader chains (from → where/orderBy).
vi.mock("@/lib/db", () => {
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })),
          orderBy: vi.fn(() => ({
            offset: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: (v: unknown) => {
          insertValuesMock(v);
          return {
            onConflictDoNothing: () => insertOnConflictMock(),
            onConflictDoUpdate: (cfg: unknown) => insertOnConflictUpdateMock(cfg),
          };
        },
      })),
      update: vi.fn(() => ({
        set: (patch: unknown) => {
          updateSetMock(patch);
          return {
            where: (...a: unknown[]) => updateWhereMock(...a),
          };
        },
      })),
      delete: vi.fn((t: unknown) => {
        deleteMock(t);
        return {
          where: (...a: unknown[]) => deleteWhereMock(...a),
        };
      }),
    },
    schema: {
      settings: { key: "key", value: "value", updatedAt: "updated_at" },
      // subscribers columns as mock markers — assertions compare against these
      // strings (e.g. onConflictDoUpdate target === "email").
      subscribers: {
        id: "id",
        email: "email",
        status: "status",
        token: "token",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
  };
});

import {
  saveNewsletterSettings,
  subscribeNewsletter,
  listSubscribers,
  deleteSubscriber,
} from "../newsletter";

const adminSession = () => ({
  user: { id: "u-admin", role: "admin" },
  session: { id: "s1" },
});

/** Build subscribe FormData the way the footer island submits it. */
const subscribeForm = (email: string, website?: string) => {
  const f = new FormData();
  f.set("email", email);
  if (website !== undefined) f.set("website", website);
  return f;
};

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

describe("260824-3l2 D-01/D-05/D-06: subscribeNewsletter — public subscribe gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default happy-path surroundings: forwarded IP present, limiter allows.
    headersMock.mockResolvedValue({
      get: (k: string) => (k === "x-forwarded-for" ? "203.0.113.7" : null),
    });
    newsletterLimiterMock.mockResolvedValue({ success: true });
    insertOnConflictUpdateMock.mockResolvedValue(undefined);
  });

  it("honeypot filled → silent { status: 'success' }, db.insert NEVER called, limiter never reached (D-05)", async () => {
    const result = await subscribeNewsletter(
      { status: "idle" },
      subscribeForm("someone@example.com", "http://spam.example"),
    );

    expect(result).toEqual({ status: "success" });
    expect(insertValuesMock).not.toHaveBeenCalled();
    expect(insertOnConflictUpdateMock).not.toHaveBeenCalled();
    expect(newsletterLimiterMock).not.toHaveBeenCalled();
  });

  it("limiter success=false → { status: 'error', message: 'RATE_LIMITED' }, db.insert NEVER called", async () => {
    newsletterLimiterMock.mockResolvedValue({ success: false });

    const result = await subscribeNewsletter(
      { status: "idle" },
      subscribeForm("someone@example.com"),
    );

    expect(result).toEqual({ status: "error", message: "RATE_LIMITED" });
    expect(newsletterLimiterMock).toHaveBeenCalledWith("203.0.113.7");
    expect(insertValuesMock).not.toHaveBeenCalled();
    expect(insertOnConflictUpdateMock).not.toHaveBeenCalled();
  });

  it("invalid email → { status: 'error', message: 'INVALID_EMAIL' }, db.insert NEVER called", async () => {
    const result = await subscribeNewsletter(
      { status: "idle" },
      subscribeForm("not-an-email"),
    );

    expect(result).toEqual({ status: "error", message: "INVALID_EMAIL" });
    expect(insertValuesMock).not.toHaveBeenCalled();
    expect(newsletterLimiterMock).not.toHaveBeenCalled();
  });

  it("valid mixed-case email → single insert with LOWERCASE email + non-empty token; onConflictDoUpdate targets email with status 'active' + explicit updatedAt Date", async () => {
    const result = await subscribeNewsletter(
      { status: "idle" },
      subscribeForm("  User@Example.COM "),
    );

    expect(result).toEqual({ status: "success" });
    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    const values = insertValuesMock.mock.calls[0]?.[0] as {
      email?: string;
      token?: string;
    };
    // Zod did the normalization (trim + lowercase — no citext).
    expect(values.email).toBe("user@example.com");
    expect(typeof values.token).toBe("string");
    expect(values.token?.length).toBeGreaterThan(0);

    // The D-01 conflict config: email target, active status, explicit Date
    // ($onUpdate does not fire on the conflict path).
    expect(insertOnConflictUpdateMock).toHaveBeenCalledTimes(1);
    const cfg = insertOnConflictUpdateMock.mock.calls[0]?.[0] as {
      target?: unknown;
      set?: { status?: unknown; updatedAt?: unknown };
    };
    expect(cfg.target).toBe("email"); // mock marker for schema.subscribers.email
    expect(cfg.set?.status).toBe("active");
    expect(cfg.set?.updatedAt).toBeInstanceOf(Date);
  });

  it("NO permission gate by design — requireRole is never called on the public subscribe path (mirrors contact.ts)", async () => {
    await subscribeNewsletter(
      { status: "idle" },
      subscribeForm("someone@example.com"),
    );

    expect(requireRoleMock).not.toHaveBeenCalled();
  });
});

describe("260824-3l2 D-03: listSubscribers / deleteSubscriber — admin gates fire FIRST (MUST_NOT_BE_REACHED)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue(adminSession());
    deleteWhereMock.mockResolvedValue(undefined);
  });

  it("non-admin deleteSubscriber → FORBIDDEN before any db.delete (MUST_NOT_BE_REACHED)", async () => {
    requireRoleMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    deleteWhereMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(deleteSubscriber(1)).rejects.toThrow("FORBIDDEN");
    expect(requireRoleMock).toHaveBeenCalledWith("admin");
    expect(deleteMock).not.toHaveBeenCalled();
    expect(deleteWhereMock).not.toHaveBeenCalled();
  });

  it("non-admin listSubscribers → FORBIDDEN before any db.select", async () => {
    requireRoleMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });

    await expect(listSubscribers(1)).rejects.toThrow("FORBIDDEN");
    expect(requireRoleMock).toHaveBeenCalledWith("admin");
  });

  it("admin deleteSubscriber → HARD delete via db.delete where id, returns ok (no soft-delete on this utility table)", async () => {
    const result = await deleteSubscriber(7);

    expect(result).toEqual({ ok: true });
    expect(requireRoleMock).toHaveBeenCalledWith("admin");
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });

  it("deleteSubscriber rejects a non-positive/non-integer id via Zod before any DB call", async () => {
    await expect(deleteSubscriber(0)).rejects.toThrow();
    await expect(deleteSubscriber(-3)).rejects.toThrow();
    await expect(deleteSubscriber(2.5)).rejects.toThrow();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(deleteWhereMock).not.toHaveBeenCalled();
  });
});
