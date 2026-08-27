// src/actions/__tests__/notifications.test.ts
// [CITED: 260827-se8-PLAN.md Task 1 <behavior> — the notifications data layer]
// [CITED: src/actions/__tests__/users.test.ts — the vi.hoisted mock-db harness]
// [CITED: src/actions/users.ts L138-154 — the awaited-swallow rationale this
//  feature cites for notifyUsers (never void fire-and-forget in a Server Action)]
//
// Covers the 260827-se8 Task 1 behaviors:
//   - notifyUsers: ONE db.insert carrying ALL recipient rows; empty array → NO
//     insert; insert rejection → log.error + normal resolution (swallow contract)
//   - countUnreadNotifications: getSessionOrThrow FIRST (UNAUTHORIZED before any
//     db call); session-scoped count over readAt-null rows
//   - listNotifications(page): session-scoped, newest-first, 20/page, page ≥ 1
//   - markNotificationsRead: session-scoped update touching ONLY the caller's
//     unread rows; NO userId parameter exists anywhere in the action file
//     (T-Q-se8-06 — a client can never read or mark another user's notifications)
//
// Mock strategy mirrors users.test.ts: vi.hoisted + vi.mock the server-only deps
// (@/lib/db, @/lib/permissions, @/lib/log). The REAL src/lib/notifications.ts is
// under test for the fan-out helper (only its db/log deps are mocked).
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  getSessionOrThrowMock,
  selectResultMock,
  whereArgsMock,
  limitMock,
  offsetMock,
  insertValuesMock,
  insertTerminalMock,
  updateSetMock,
  updateWhereArgsMock,
  updateTerminalMock,
  logErrorMock,
  logInfoMock,
} = vi.hoisted(() => ({
  getSessionOrThrowMock: vi.fn(),
  // Terminal result of every awaited select chain (count row / list rows).
  selectResultMock: vi.fn(),
  // Captured builder args — where/limit/offset prove session scoping + paging.
  whereArgsMock: vi.fn(),
  limitMock: vi.fn(),
  offsetMock: vi.fn(),
  // insert chain: db.insert(schema.notifications).values(rows) — values captures
  // the FULL row array (one insert for all recipients), terminal is the awaited
  // promise (controllable rejection for the swallow test).
  insertValuesMock: vi.fn(),
  insertTerminalMock: vi.fn(),
  // update chain: db.update(schema.notifications).set({readAt}).where(...)
  updateSetMock: vi.fn(),
  updateWhereArgsMock: vi.fn(),
  updateTerminalMock: vi.fn(),
  logErrorMock: vi.fn(),
  logInfoMock: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  getSessionOrThrow: (...a: unknown[]) => getSessionOrThrowMock(...a),
}));

vi.mock("@/lib/log", () => ({
  log: { info: logInfoMock, error: logErrorMock },
}));

// db — chainable select/insert/update matching the shapes used by
// src/lib/notifications.ts + src/actions/notifications.ts:
//   select().from().where()                        → awaited (countUnread)
//   select().from().where().orderBy().limit().offset() → awaited (list)
//   insert().values(rows)                          → awaited (notifyUsers)
//   update().set(patch).where(...)                 → awaited (markRead)
vi.mock("@/lib/db", () => {
  const chainAfterWhere = () => {
    const chain: Record<string, unknown> = {
      orderBy: (...a: unknown[]) => {
        return chain;
      },
      limit: (...a: unknown[]) => {
        limitMock(a);
        return chain;
      },
      offset: (...a: unknown[]) => {
        offsetMock(a);
        return chain;
      },
      then: (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(selectResultMock()).then(resolve, reject),
    };
    return chain;
  };
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: (...a: unknown[]) => {
            whereArgsMock(a);
            return chainAfterWhere();
          },
        })),
      })),
      insert: vi.fn(() => ({
        values: (v: unknown) => {
          insertValuesMock(v);
          return insertTerminalMock();
        },
      })),
      update: vi.fn(() => ({
        set: (patch: unknown) => {
          updateSetMock(patch);
          return {
            where: (...a: unknown[]) => {
              updateWhereArgsMock(a);
              return updateTerminalMock();
            },
          };
        },
      })),
    },
    // Mock column markers — eq()/and() from real drizzle-orm embed these plus
    // the runtime values; deepContains below proves the session id is inside
    // the captured WHERE arguments (structural session-scoping proof).
    schema: {
      notifications: {
        id: "id",
        userId: "user_id",
        type: "type",
        payload: "payload",
        readAt: "read_at",
        createdAt: "created_at",
      },
    },
  };
});

// Import the SUTs AFTER mocks are in place. src/lib/notifications.ts is the
// REAL module (its db/log deps are mocked above); src/actions/notifications.ts
// likewise. In RED these modules do not exist yet — the imports fail loudly.
import { notifyUsers } from "@/lib/notifications";
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationsRead,
} from "../notifications";

/**
 * deepContains — walk an object graph looking for an exact string. drizzle
 * eq(col, value) embeds value inside a Param node of the returned SQL object;
 * this helper proves the session user's id reached the WHERE clause without
   depending on drizzle internals.
 */
function deepContains(value: unknown, needle: string): boolean {
  const seen = new Set<unknown>();
  const walk = (v: unknown): boolean => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v === needle;
    if (typeof v !== "object") return false;
    if (seen.has(v)) return false;
    seen.add(v);
    if (Array.isArray(v)) return v.some(walk);
    return Object.values(v).some(walk);
  };
  return walk(value);
}

const sessionFor = (id: string) => ({
  user: { id, role: "author" as const },
  session: { id: `sess-${id}` },
});

describe("260827-se8 Task 1: notifyUsers — single-insert fan-out with swallow contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertTerminalMock.mockResolvedValue(undefined);
  });

  it("empty recipients array → NO db.insert at all", async () => {
    await notifyUsers([], "post_submitted", { postId: 1 });

    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("multiple recipients → exactly ONE db.insert carrying ALL recipient rows (userId/type/payload per row)", async () => {
    await notifyUsers(
      ["u-1", "u-2", "u-3"],
      "post_published",
      { postId: 7, postTitle: "Hello" },
    );

    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    const rows = insertValuesMock.mock.calls[0][0] as Array<
      Record<string, unknown>
    >;
    expect(rows).toHaveLength(3);
    expect(rows).toEqual([
      { userId: "u-1", type: "post_published", payload: { postId: 7, postTitle: "Hello" } },
      { userId: "u-2", type: "post_published", payload: { postId: 7, postTitle: "Hello" } },
      { userId: "u-3", type: "post_published", payload: { postId: 7, postTitle: "Hello" } },
    ]);
  });

  it("db.insert rejection → log.error fires and the helper RESOLVES normally (swallow — notify never fails the parent mutation, T-Q-se8-07)", async () => {
    insertTerminalMock.mockRejectedValue(new Error("connection reset"));

    // Must NOT reject — the awaited try/catch observes the rejection (never
    // void fire-and-forget, users.ts L138-154 rationale).
    await expect(
      notifyUsers(["u-1"], "new_subscriber", { subscriberEmail: "a@b.c" }),
    ).resolves.toBeUndefined();

    expect(logErrorMock).toHaveBeenCalled();
  });
});

describe("260827-se8 Task 1: countUnreadNotifications — session-first, session-scoped", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionOrThrowMock.mockResolvedValue(sessionFor("u-reader"));
    // Benign default (see markRead describe note): neutralizes any throwing
    // implementation leaked from a previous test's MUST_NOT_BE_REACHED guard.
    selectResultMock.mockResolvedValue([{ n: 0 }]);
  });

  it("no session → UNAUTHORIZED thrown BEFORE any db call (MUST_NOT_BE_REACHED)", async () => {
    getSessionOrThrowMock.mockRejectedValue(new Error("UNAUTHORIZED"));
    selectResultMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED — session gate did not fire first");
    });

    await expect(countUnreadNotifications()).rejects.toThrow("UNAUTHORIZED");
    expect(selectResultMock).not.toHaveBeenCalled();
  });

  it("returns the count row's n value as a number", async () => {
    selectResultMock.mockResolvedValue([{ n: 4 }]);

    await expect(countUnreadNotifications()).resolves.toBe(4);
  });

  it("WHERE is scoped to the session user's id (T-Q-se8-06 — no userId parameter, session-derived only)", async () => {
    selectResultMock.mockResolvedValue([{ n: 0 }]);

    await countUnreadNotifications();

    expect(whereArgsMock).toHaveBeenCalled();
    const whereArg = whereArgsMock.mock.calls[0][0];
    expect(deepContains(whereArg, "u-reader")).toBe(true);
  });
});

describe("260827-se8 Task 1: listNotifications — newest-first page of 20, page clamped to ≥1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionOrThrowMock.mockResolvedValue(sessionFor("u-reader"));
    selectResultMock.mockResolvedValue([]);
  });

  it("no session → UNAUTHORIZED thrown BEFORE any db call", async () => {
    getSessionOrThrowMock.mockRejectedValue(new Error("UNAUTHORIZED"));
    selectResultMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(listNotifications(1)).rejects.toThrow("UNAUTHORIZED");
    expect(selectResultMock).not.toHaveBeenCalled();
  });

  it("page 3 → limit 20 + offset 40 (page-1 × 20)", async () => {
    await listNotifications(3);

    expect(limitMock).toHaveBeenCalledWith([20]);
    expect(offsetMock).toHaveBeenCalledWith([40]);
  });

  it("page 0 / negative / non-numeric → clamped to page 1 (offset 0)", async () => {
    await listNotifications(0);
    await listNotifications(-5);
    await listNotifications(Number.NaN);

    expect(offsetMock).toHaveBeenNthCalledWith(1, [0]);
    expect(offsetMock).toHaveBeenNthCalledWith(2, [0]);
    expect(offsetMock).toHaveBeenNthCalledWith(3, [0]);
  });

  it("WHERE is scoped to the session user's id (T-Q-se8-06)", async () => {
    await listNotifications(1);

    const whereArg = whereArgsMock.mock.calls[0][0];
    expect(deepContains(whereArg, "u-reader")).toBe(true);
  });
});

describe("260827-se8 Task 1: markNotificationsRead — session-scoped update of ONLY the caller's unread rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionOrThrowMock.mockResolvedValue(sessionFor("u-reader"));
    updateTerminalMock.mockResolvedValue(undefined);
    // Benign default implementation: vi.clearAllMocks() clears CALL HISTORY
    // but NOT implementations, so the "no session" test's throwing
    // mockImplementation on updateSetMock would otherwise leak into the
    // happy-path test below (mockResolvedValue cannot neutralize it because
    // set() is called for its side-effect chain, not awaited directly).
    updateSetMock.mockImplementation(() => undefined);
  });

  it("no session → UNAUTHORIZED thrown BEFORE any db.update (MUST_NOT_BE_REACHED)", async () => {
    getSessionOrThrowMock.mockRejectedValue(new Error("UNAUTHORIZED"));
    updateSetMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(markNotificationsRead()).rejects.toThrow("UNAUTHORIZED");
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("sets readAt to a Date and scopes WHERE to the session user's id (T-Q-se8-06 — no userId parameter exists)", async () => {
    await markNotificationsRead();

    expect(updateSetMock).toHaveBeenCalledTimes(1);
    const patch = updateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.readAt).toBeInstanceOf(Date);

    expect(updateWhereArgsMock).toHaveBeenCalled();
    const whereArg = updateWhereArgsMock.mock.calls[0][0];
    expect(deepContains(whereArg, "u-reader")).toBe(true);
  });
});
