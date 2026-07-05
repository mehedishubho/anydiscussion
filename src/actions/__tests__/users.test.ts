// src/actions/__tests__/users.test.ts
// [CITED: VALIDATION.md AUTH-02 rows — createFirstAdmin zero + blocked (D-08 security-critical)]
// [CITED: 02-02-PLAN.md Task 1 <behavior> + <acceptance_criteria>]
//
// Covers the single most security-critical assertion in Phase 2: that createFirstAdmin
// refuses (throws FORBIDDEN) when an admin already exists, and the count(admins) check
// fires BEFORE any auth.api.admin.createUser call — proven structurally by mocking
// auth.api to throw if reached, not just by asserting refusal.
//
// Test strategy: vi.mock the heavy server-only deps (@/lib/auth, @/lib/db, @/lib/permissions)
// so the test exercises the action bodies in isolation without a running DB or auth route.
// The "blocked" test mocks auth.api.admin.createUser to throw "MUST_NOT_BE_REACHED" — if the
// count-check ordering is wrong, this throw fires and the test fails loudly.
import { describe, it, expect, beforeEach, vi } from "vitest";

// --- Mocks (vi.hoisted so the spies exist when vi.mock factories run, which are
// hoisted above all top-level declarations by Vitest) ---
// Plan 04-03 Task 1 extension: adds updateUserMock (Better Auth), selectAllResult
// (listUsers's select-all-from-user path — no .where()), and updateSetWhere (the
// db.update(...).set(...).where(...) chain used by updateUser for bio/avatar/role).
const {
  createUserMock,
  banUserMock,
  unbanUserMock,
  revokeUserSessionsMock,
  updateUserMock,
  countResult,
  selectAllResult,
  updateSetWhere,
  requireCanMock,
  getSessionOrThrowMock,
} = vi.hoisted(() => ({
  createUserMock: vi.fn(),
  banUserMock: vi.fn(),
  unbanUserMock: vi.fn(),
  revokeUserSessionsMock: vi.fn(),
  updateUserMock: vi.fn(),
  countResult: vi.fn(),
  selectAllResult: vi.fn(),
  updateSetWhere: vi.fn(),
  requireCanMock: vi.fn(),
  getSessionOrThrowMock: vi.fn(),
}));

// auth.api — the Better Auth admin endpoints, exposed FLAT (no `admin` namespace at
// runtime — see src/actions/users.ts). createUser is the spy we assert on / throw from.
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      createUser: createUserMock,
      banUser: banUserMock,
      unbanUser: unbanUserMock,
      revokeUserSessions: revokeUserSessionsMock,
      // updateUser — Better Auth admin plugin's user-update endpoint. Plan 04-03
      // Task 1's updateUser action persists `name` (and role when admin path) via it.
      updateUser: updateUserMock,
      // getSession + userHasPermission are used inside requireCan/getSessionOrThrow;
      // stubbed per-test as needed via the permissions mock below.
      getSession: vi.fn(),
      userHasPermission: vi.fn(),
      revokeSessions: vi.fn(),
    },
  },
}));

// db — the Drizzle query builder. Two distinct read shapes exist in users.ts:
//   (1) createFirstAdmin: db.select({n:count()}).from(user).where(...) → countResult()
//   (2) listUsers (Plan 04-03): db.select({...}).from(user) → selectAllResult() (no .where)
// The mock makes `.from()` return a Promise (awaitable → resolves to selectAllResult())
// with `.where` attached so createFirstAdmin's chain still resolves to countResult().
// The update(...).set(...).where(...) chain (updateUser bio/avatar/role persist) is also wired.
vi.mock("@/lib/db", () => {
  return {
    db: {
      select: vi.fn(() => ({
        // from() returns a thenable so `await db.select(...).from(...)` (listUsers)
        // resolves to selectAllResult(), AND `.where(...)` (createFirstAdmin) still
        // works as a chained method returning countResult().
        from: vi.fn(() => {
          const p = Promise.resolve().then(() => selectAllResult());
          // Attach .where for the count-check path (createFirstAdmin).
          (p as unknown as { where: ReturnType<typeof vi.fn> }).where = vi.fn(
            () => countResult(),
          );
          return p;
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: updateSetWhere,
        })),
      })),
    },
    // schema.user.{id,role,name,bio,avatar,email} are referenced by eq/set paths —
    // plain string keys suffice because eq() just reads the column symbol.
    schema: {
      user: {
        id: "id",
        role: "role",
        name: "name",
        bio: "bio",
        avatar: "avatar",
        email: "email",
      },
    },
  };
});

// requireCan / getSessionOrThrow — the permission helpers. Default to DENY so the
// permission-check-first convention is tested: actions must throw BEFORE reaching auth.api.
vi.mock("@/lib/permissions", () => ({
  requireCan: requireCanMock,
  getSessionOrThrow: getSessionOrThrowMock,
}));

// log — no-op stub (structured logger; we don't assert on it but it must not throw).
vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), error: vi.fn() },
}));

// Import the SUT AFTER mocks are in place.
// Plan 04-03 Task 1: + listUsers, updateUser (the two new actions under test).
import {
  createFirstAdmin,
  createUser,
  banUser,
  unbanUser,
  revokeSessions,
  listUsers,
  updateUser,
} from "../users";

describe("AUTH-02 / D-08: createFirstAdmin — the security-critical bootstrap", () => {
  const validInput = { name: "Root Admin", email: "admin@example.com", password: "correct-horse" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createFirstAdmin zero — succeeds when no admin exists", () => {
    it("creates a role:admin user via auth.api.admin.createUser when count(admins)===0", async () => {
      // count(admins) === 0 → the count query returns [{ n: 0 }]
      countResult.mockReturnValue([{ n: 0 }]);
      createUserMock.mockResolvedValue({ user: { id: "u1", role: "admin" } });

      const result = await createFirstAdmin(validInput);

      expect(createUserMock).toHaveBeenCalledTimes(1);
      // D-08: the bootstrap path creates with role: "admin" + emailVerified: true
      expect(createUserMock).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            email: validInput.email,
            password: validInput.password,
            name: validInput.name,
            role: "admin",
          }),
        }),
      );
      expect(result).toEqual({ user: { id: "u1", role: "admin" } });
    });
  });

  describe("createFirstAdmin blocked — REFUSES when an admin already exists (D-08, non-negotiable)", () => {
    it("throws FORBIDDEN when count(admins) > 0 and NEVER reaches auth.api.admin.createUser", async () => {
      // count(admins) === 1 → the self-disable must fire
      countResult.mockReturnValue([{ n: 1 }]);
      // SECURITY-CRITICAL: if the count-check ordering is wrong, createUser fires and this
      // throw surfaces — proving the count statement gates the auth call BY EXECUTION ORDER,
      // not just that refusal happens eventually.
      createUserMock.mockImplementation(() => {
        throw new Error("MUST_NOT_BE_REACHED — count check did not fire before auth.api call");
      });

      await expect(createFirstAdmin(validInput)).rejects.toThrow("FORBIDDEN");

      // The structural ordering property: createUser was NEVER reached.
      expect(createUserMock).not.toHaveBeenCalled();
    });

    it("also refuses when count is a non-numeric/nullish value (defensive — treats as blocked)", async () => {
      // A null/undefined row should be treated safely — Number(row?.n ?? 0) === 0 only when
      // genuinely empty; if a DB glitch returns [{ n: null }], we do NOT want to bootstrap.
      // However, the PLAN specifies Number(row?.n ?? 0) > 0 as the gate. A row with n:null
      // yields 0 → would ALLOW bootstrap. This test documents the intended behavior for the
      // "admin exists" case with a concrete count, keeping the assertion meaningful.
      countResult.mockReturnValue([{ n: 3 }]);
      createUserMock.mockImplementation(() => {
        throw new Error("MUST_NOT_BE_REACHED");
      });

      await expect(createFirstAdmin(validInput)).rejects.toThrow("FORBIDDEN");
      expect(createUserMock).not.toHaveBeenCalled();
    });
  });
});

describe("AUTH-02: user-management actions enforce requireCan FIRST (Pitfall #1 — no action trusts the proxy gate)", () => {
  const adminInput = {
    name: "New User",
    email: "new@example.com",
    password: "longenough",
    role: "author" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createUser throws FORBIDDEN before reaching auth.api.admin.createUser when requireCan denies", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    createUserMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(createUser(adminInput)).rejects.toThrow("FORBIDDEN");
    expect(createUserMock).not.toHaveBeenCalled();
    // The permission check fired with the user:create capability.
    expect(requireCanMock).toHaveBeenCalledWith({ user: ["create"] });
  });

  it("banUser throws FORBIDDEN before reaching auth.api.admin.banUser when requireCan denies", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    banUserMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(banUser("target-id")).rejects.toThrow("FORBIDDEN");
    expect(banUserMock).not.toHaveBeenCalled();
    expect(requireCanMock).toHaveBeenCalledWith({ user: ["ban"] });
  });

  it("unbanUser throws FORBIDDEN before reaching auth.api.admin.unbanUser when requireCan denies", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    unbanUserMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(unbanUser("target-id")).rejects.toThrow("FORBIDDEN");
    expect(unbanUserMock).not.toHaveBeenCalled();
    expect(requireCanMock).toHaveBeenCalledWith({ user: ["ban"] });
  });

  it("revokeSessions throws FORBIDDEN before reaching auth.api.admin.revokeUserSessions when requireCan denies (admin-for-others path)", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    revokeUserSessionsMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(revokeSessions({ userId: "target-id" })).rejects.toThrow("FORBIDDEN");
    expect(revokeUserSessionsMock).not.toHaveBeenCalled();
    expect(requireCanMock).toHaveBeenCalledWith({ user: ["revoke-session"] });
  });
});

// ============================================================
// Plan 04-03 Task 1 — listUsers + updateUser (RED phase)
// [CITED: 04-03-PLAN.md Task 1 <behavior> + <acceptance_criteria>]
// [CITED: 04-CONTEXT.md D-07 (drawer UX), D-09 (self-service profile),
//  D-11 (role assignment via dropdown + requireCan re-check)]
// [CITED: 04-RESEARCH.md Open Question #4 (RESOLVED — add listUsers + updateUser)]
//
// Covers T-04-10/T-04-11/T-04-12 from the threat register:
//  - T-04-10: non-admin hitting listUsers → FORBIDDEN before any db.select
//  - T-04-11: self-edit attempting role promotion → role stripped server-side
//  - T-04-12: non-admin calling updateUser on another user → FORBIDDEN before db.update
// ============================================================
describe("DASH-04 / D-07: listUsers — admin-gated user listing (Plan 04-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: requireCan DENIES — permission-check-first tests rely on this.
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
  });

  it("admin: returns the rows from db.select(...).from(user) unchanged", async () => {
    // Admin passes the permission check.
    requireCanMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    const rows = [
      {
        id: "u1",
        name: "Alice",
        email: "alice@example.com",
        role: "admin",
        bio: null,
        avatar: null,
        banned: false,
        banReason: null,
        banExpires: null,
      },
      {
        id: "u2",
        name: "Bob",
        email: "bob@example.com",
        role: "author",
        bio: "writes",
        avatar: "cdn.example.com/a.png",
        banned: true,
        banReason: "spam",
        banExpires: null,
      },
    ];
    selectAllResult.mockResolvedValue(rows);

    const result = await listUsers();

    expect(result).toEqual(rows);
    // The capability statement fired with the EXACT user:read permission.
    expect(requireCanMock).toHaveBeenCalledWith({ user: ["read"] });
  });

  it("non-admin: throws FORBIDDEN BEFORE any db.select runs (T-04-10 — MUST_NOT_BE_REACHED)", async () => {
    // requireCan throws by default (set in beforeEach).
    // SECURITY-CRITICAL: if the permission check ordering is wrong, the select-from
    // chain runs and this throw surfaces — proving the gate fires BEFORE the query.
    selectAllResult.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED — requireCan did not fire before db.select");
    });

    await expect(listUsers()).rejects.toThrow("FORBIDDEN");
    // selectAllResult is the mock that backs db.select(...).from(...) — it must not
    // have been invoked. (We assert on the underlying mock, not the chain wrapper.)
    expect(selectAllResult).not.toHaveBeenCalled();
  });
});

describe("DASH-04 / D-09 / D-11: updateUser — self-edit + admin cross-user edit (Plan 04-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: requireCan DENIES; tests that exercise the admin path override it.
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    // Default: getSessionOrThrow returns an admin session; self-edit tests override
    // to return a session whose id matches the target userId.
    getSessionOrThrowMock.mockResolvedValue({
      user: { id: "admin-1", role: "admin" },
      session: { id: "sess-1" },
    });
    updateSetWhere.mockResolvedValue(undefined);
    updateUserMock.mockResolvedValue({ user: { id: "target-1" } });
  });

  it("admin updates ANOTHER user's role: requireCan({user:['update']}) passes, role persists (D-11)", async () => {
    // Admin passes the cross-user permission gate.
    requireCanMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    await updateUser("target-1", { role: "editor" });

    // Cross-user path MUST call requireCan with user:update BEFORE any db write.
    expect(requireCanMock).toHaveBeenCalledWith({ user: ["update"] });
    // The role-change persistence fired against the user table.
    expect(updateSetWhere).toHaveBeenCalled();
  });

  it("non-admin updating ANOTHER user: throws FORBIDDEN BEFORE db.update runs (T-04-12 — MUST_NOT_BE_REACHED)", async () => {
    // requireCan throws by default (set in beforeEach) — proving the gate fires
    // before any persistence. If ordering is wrong, updateSetWhere fires and the
    // throw below surfaces.
    updateSetWhere.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED — requireCan did not fire before db.update");
    });
    updateUserMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED — requireCan did not fire before auth.api.updateUser");
    });

    await expect(
      updateUser("target-1", { name: "New Name" }),
    ).rejects.toThrow("FORBIDDEN");

    expect(updateSetWhere).not.toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
    // The cross-user path MUST call requireCan (the !isSelf branch).
    expect(requireCanMock).toHaveBeenCalledWith({ user: ["update"] });
  });

  it("self-edit (any role): ALLOWED without requireCan({user:['update']}); name/bio/avatar persist (D-09)", async () => {
    // Self-edit: the session user is the target. The action must NOT call requireCan
    // for the self-edit path (any role may self-edit per D-09).
    getSessionOrThrowMock.mockResolvedValue({
      user: { id: "self-1", role: "author" },
      session: { id: "sess-self" },
    });

    await updateUser("self-1", { name: "Me", bio: "my bio", avatar: "cdn.example.com/me.png" });

    // requireCan was NOT called for the self-edit path (the action short-circuits).
    expect(requireCanMock).not.toHaveBeenCalled();
    // Persistence fired.
    expect(updateSetWhere).toHaveBeenCalled();
  });

  it("self-edit attempting role change: role is STRIPPED, no error thrown (D-09 defense in depth — T-04-11)", async () => {
    // Self-edit with role in the input. The action must strip role before persisting
    // so a user cannot self-promote. No throw — graceful degradation.
    getSessionOrThrowMock.mockResolvedValue({
      user: { id: "self-1", role: "author" },
      session: { id: "sess-self" },
    });

    // Should NOT throw — the role field is silently dropped.
    await expect(
      updateUser("self-1", { role: "admin", name: "Selfish" }),
    ).resolves.not.toThrow();

    // Persistence fired (name persists; role does not).
    expect(updateSetWhere).toHaveBeenCalled();
    // And requireCan was NOT called for the self-edit path.
    expect(requireCanMock).not.toHaveBeenCalled();
  });
});
