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
  clientIpHelperMock,
  // 260827-se8 Task 1 — subscriber → admins notify hook mocks:
  //   notifyUsersMock     — spy standing in for @/lib/notifications
  //   selectResultMock    — awaited db.select().from().where() result (admin-ids)
  //   selectLimitResultMock — db.select().from().where().limit() result (pre-read)
  notifyUsersMock,
  selectResultMock,
  selectLimitResultMock,
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
  // Plan 07-06 / CR-01 leg 2 — subscribeNewsletter now derives the limiter IP
  // via the shared getClientIpFromXff helper from @/lib/rate-limit. A spy (with
  // the faithful default implementation installed in beforeEach) so the tests
  // can assert the action actually routes the header THROUGH the shared helper
  // (the "do not invent a second style" contract), not just that the limiter
  // ends up keyed on the last hop.
  clientIpHelperMock: vi.fn(),
  notifyUsersMock: vi.fn(),
  selectResultMock: vi.fn(),
  selectLimitResultMock: vi.fn(),
}));

// @/lib/notifications — 260827-se8 Task 1. subscribeNewsletter awaits
// notifyUsers(adminIds, "new_subscriber", { subscriberEmail }) after a
// non-active pre-read + successful upsert. The helper's own swallow contract
// is proven against the REAL module in notifications.test.ts; here it is a
// spy so the action's call shape (and its defense-in-depth catch) is testable.
vi.mock("@/lib/notifications", () => ({
  notifyUsers: (...a: unknown[]) => notifyUsersMock(...a),
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

// next/headers — subscribeNewsletter reads x-forwarded-for (the shared
// getClientIpFromXff last-hop extraction, "unknown" fallback). Controllable per-test.
vi.mock("next/headers", () => ({
  headers: (...a: unknown[]) => headersMock(...a),
}));

// @/lib/rate-limit — controllable newsletterLimiter mock (D-05) + the shared
// getClientIpFromXff helper as a spy (CR-01 leg 2). The helper's real contract
// is unit-tested against the real module in
// src/lib/rate-limit/__tests__/client-ip.test.ts; here the spy's default
// implementation (installed in beforeEach) reproduces it faithfully.
vi.mock("@/lib/rate-limit", () => ({
  newsletterLimiter: { limit: (...a: unknown[]) => newsletterLimiterMock(...a) },
  getClientIpFromXff: (...a: unknown[]) => clientIpHelperMock(...a),
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
          // 260827-se8 Task 1 — where() is BOTH thenable (the admin-ids select
          // awaits the chain directly → selectResultMock) AND carries .limit()
          // (the subscriber pre-read resolves → selectLimitResultMock).
          // LAZY thenable, not Promise.resolve().then(fn): a floating promise
          // invokes fn on the next microtask EVEN IF the caller only takes
          // .limit() and never awaits the outer chain — which would break the
          // idempotent-duplicate test's "admin-ids select never fires"
          // assertion. Here fn runs only when .then is actually called.
          where: vi.fn(() => {
            const p = {
              then(
                onFulfilled?: (v: unknown) => unknown,
                onRejected?: (e: unknown) => unknown,
              ) {
                return Promise.resolve()
                  .then(() => selectResultMock())
                  .then(onFulfilled, onRejected);
              },
              limit: vi.fn(() => ({
                then(
                  onFulfilled?: (v: unknown) => unknown,
                  onRejected?: (e: unknown) => unknown,
                ) {
                  return Promise.resolve()
                    .then(() => selectLimitResultMock())
                    .then(onFulfilled, onRejected);
                },
              })),
            };
            return p;
          }),
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
      // user columns — the admin-ids select (260827-se8) references id + role.
      user: { id: "id", role: "role" },
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
    // 260827-se8 defaults: no existing subscriber row (pre-read → []), no
    // admins (admin-ids select → []), notify resolves. Empty admins means
    // notifyUsers([]) never inserts — keeping the existing single-insert
    // assertions intact.
    selectLimitResultMock.mockResolvedValue([]);
    selectResultMock.mockResolvedValue([]);
    notifyUsersMock.mockResolvedValue(undefined);
    // Faithful default implementation of the shared last-hop helper (the real
    // module's contract is pinned in
    // src/lib/rate-limit/__tests__/client-ip.test.ts): trimmed last
    // comma-separated entry, "unknown" fallback.
    clientIpHelperMock.mockImplementation(
      (forwardedFor: string | null) =>
        forwardedFor?.split(",").pop()?.trim() || "unknown",
    );
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

  // Plan 07-06 / CR-01 leg 2 — the limiter must key on the proxy-appended LAST
  // XFF hop (via the shared getClientIpFromXff helper), never the
  // client-spoofable first hop. Under an appending proxy the first hop is
  // attacker-controlled; keying on it hands a bot a fresh 5/h budget per fake
  // IP (07-REVIEW CR-01).
  it("multi-hop x-forwarded-for → limiter keyed on the LAST hop via the shared helper, NOT the injected first hop (CR-01)", async () => {
    headersMock.mockResolvedValue({
      get: (k: string) =>
        k === "x-forwarded-for" ? "9.9.9.9, 203.0.113.7" : null,
    });

    await subscribeNewsletter(
      { status: "idle" },
      subscribeForm("someone@example.com"),
    );

    // The action routes the RAW header through the one shared helper.
    expect(clientIpHelperMock).toHaveBeenCalledWith("9.9.9.9, 203.0.113.7");
    // The limiter is keyed on the proxy-appended last hop...
    expect(newsletterLimiterMock).toHaveBeenCalledWith("203.0.113.7");
    // ...and never on the client-injected first hop.
    expect(newsletterLimiterMock).not.toHaveBeenCalledWith("9.9.9.9");
  });

  // Plan 07-06 / WR-01 sibling — a Redis outage must surface as the defined
  // RATE_LIMITED error state (subscribeNewsletter's returned-state resilience
  // contract), never as an unhandled rejection / raw internal error on the
  // public footer surface (07-REVIEW WR-01/WR-03).
  it("limiter rejection (Redis outage) → { status: 'error', message: 'RATE_LIMITED' }, db.insert NEVER called (WR-01)", async () => {
    newsletterLimiterMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await subscribeNewsletter(
      { status: "idle" },
      subscribeForm("someone@example.com"),
    );

    expect(result).toEqual({ status: "error", message: "RATE_LIMITED" });
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

// ============================================================
// 260827-se8 Task 1 — subscriber → admins notification hook
// [CITED: 260827-se8-PLAN.md Task 1 <behavior> — subscribeNewsletter notify]
// [CITED: research A1 — the tiny pre-read/upsert race is acceptable
//  (display-only data; the per-IP rate limiter already bounds volume)]
//
// Threat register coverage (see 260827-se8-PLAN.md <threat_model>):
//  - T-Q-se8-07: notifyUsers is awaited with its swallow contract honored —
//    a notify failure NEVER fails the subscribe (status stays "success")
//  - idempotency: an already-ACTIVE pre-read must NOT re-notify (duplicate
//    subscribes are silent no-ops by D-01 design)
// ============================================================
describe("260827-se8: subscribeNewsletter — new-subscriber → admins notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue({
      get: (k: string) => (k === "x-forwarded-for" ? "203.0.113.7" : null),
    });
    newsletterLimiterMock.mockResolvedValue({ success: true });
    insertOnConflictUpdateMock.mockResolvedValue(undefined);
    selectLimitResultMock.mockResolvedValue([]);
    selectResultMock.mockResolvedValue([]);
    notifyUsersMock.mockResolvedValue(undefined);
    clientIpHelperMock.mockImplementation(
      (forwardedFor: string | null) =>
        forwardedFor?.split(",").pop()?.trim() || "unknown",
    );
  });

  it("first-time subscriber (pre-read finds NO row) → notifyUsers fires with ALL admin ids + 'new_subscriber' + the email", async () => {
    // Pre-read → no row (first subscribe). Admins → two ids.
    selectLimitResultMock.mockResolvedValue([]);
    selectResultMock.mockResolvedValue([{ id: "a-1" }, { id: "a-2" }]);

    const result = await subscribeNewsletter(
      { status: "idle" },
      subscribeForm("fresh@example.com"),
    );

    expect(result).toEqual({ status: "success" });
    expect(notifyUsersMock).toHaveBeenCalledTimes(1);
    expect(notifyUsersMock).toHaveBeenCalledWith(
      ["a-1", "a-2"],
      "new_subscriber",
      { subscriberEmail: "fresh@example.com" },
    );
  });

  it("re-subscribe after unsubscribe (pre-read row status 'unsubscribed') → notify fires (the upsert reactivated them)", async () => {
    selectLimitResultMock.mockResolvedValue([{ status: "unsubscribed" }]);
    selectResultMock.mockResolvedValue([{ id: "a-1" }]);

    await subscribeNewsletter(
      { status: "idle" },
      subscribeForm("back@example.com"),
    );

    expect(notifyUsersMock).toHaveBeenCalledTimes(1);
    expect(notifyUsersMock).toHaveBeenCalledWith(
      ["a-1"],
      "new_subscriber",
      { subscriberEmail: "back@example.com" },
    );
  });

  it("idempotent duplicate (pre-read row status 'active') → NO notify call at all", async () => {
    selectLimitResultMock.mockResolvedValue([{ status: "active" }]);
    selectResultMock.mockResolvedValue([{ id: "a-1" }]);

    const result = await subscribeNewsletter(
      { status: "idle" },
      subscribeForm("already@example.com"),
    );

    expect(result).toEqual({ status: "success" });
    expect(notifyUsersMock).not.toHaveBeenCalled();
    // The admin-ids select never even fires (short-circuit before it).
    expect(selectResultMock).not.toHaveBeenCalled();
  });

  it("notifyUsers rejection → subscribe STILL returns { status: 'success' } (notify can never fail the parent mutation, T-Q-se8-07)", async () => {
    selectLimitResultMock.mockResolvedValue([]);
    selectResultMock.mockResolvedValue([{ id: "a-1" }]);
    notifyUsersMock.mockRejectedValue(new Error("insert failed"));

    const result = await subscribeNewsletter(
      { status: "idle" },
      subscribeForm("still-ok@example.com"),
    );

    expect(result).toEqual({ status: "success" });
  });

  it("the upsert itself still runs exactly once alongside the notify hook (regression pin)", async () => {
    selectLimitResultMock.mockResolvedValue([]);
    selectResultMock.mockResolvedValue([{ id: "a-1" }]);

    await subscribeNewsletter(
      { status: "idle" },
      subscribeForm("upsert@example.com"),
    );

    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    const values = insertValuesMock.mock.calls[0][0] as { email?: string };
    expect(values.email).toBe("upsert@example.com");
  });
});
