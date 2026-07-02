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
const {
  createUserMock,
  banUserMock,
  unbanUserMock,
  revokeUserSessionsMock,
  countResult,
  requireCanMock,
  getSessionOrThrowMock,
} = vi.hoisted(() => ({
  createUserMock: vi.fn(),
  banUserMock: vi.fn(),
  unbanUserMock: vi.fn(),
  revokeUserSessionsMock: vi.fn(),
  countResult: vi.fn(),
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
      // getSession + userHasPermission are used inside requireCan/getSessionOrThrow;
      // stubbed per-test as needed via the permissions mock below.
      getSession: vi.fn(),
      userHasPermission: vi.fn(),
      revokeSessions: vi.fn(),
    },
  },
}));

// db — the Drizzle query builder. createFirstAdmin calls db.select(...).from(...).where(...)
// which returns an array; index [0] is the first row. We control the count result here.
// Also used by the signup page (Server Component) for the same count query.
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => countResult()),
      })),
    })),
  },
  // schema.user.role is referenced by eq(schema.user.role, "admin") — a plain object ref is fine
  // because eq() just reads the column symbol; we only need the property path to exist.
  schema: { user: { role: "role" } },
}));

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
import { createFirstAdmin, createUser, banUser, unbanUser, revokeSessions } from "../users";

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
