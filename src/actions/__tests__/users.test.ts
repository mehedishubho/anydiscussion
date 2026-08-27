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
// Plan 02-06 Task 1 extension: adds sendVerificationEmailMock (AUTH-07 — the
// explicit post-creation send) and logInfo/logError spies (the action's send-
// failure path must be observable: log.error fired with the created email).
// Quick task 260824-ptx Task 1 extension: adds removeUserMock (the guarded
// deleteUser action's terminal auth.api call — MUST_NOT_BE_REACHED when any
// guard rejects).
// Quick task 260824-qtu Task 1 extension: adds the next/headers mock (users.ts
// now imports `headers` directly) + the headerless-internal-call regression
// block asserting forwarded headers on all four middleware-gated endpoints.
const {
  createUserMock,
  banUserMock,
  unbanUserMock,
  revokeUserSessionsMock,
  updateUserMock,
  sendVerificationEmailMock,
  removeUserMock,
  changePasswordMock,
  countResult,
  selectAllResult,
  updateSetWhere,
  requireCanMock,
  getSessionOrThrowMock,
  revalidatePathMock,
  revalidateTagMock,
  logInfoMock,
  logErrorMock,
  // 260827-se8 Task 5 — list-mechanics chain-step recorders:
  whereArgsMock,
  orderByArgsMock,
  limitArgsMock,
  offsetArgsMock,
} = vi.hoisted(() => ({
  createUserMock: vi.fn(),
  banUserMock: vi.fn(),
  unbanUserMock: vi.fn(),
  revokeUserSessionsMock: vi.fn(),
  updateUserMock: vi.fn(),
  sendVerificationEmailMock: vi.fn(),
  removeUserMock: vi.fn(),
  changePasswordMock: vi.fn(),
  countResult: vi.fn(),
  selectAllResult: vi.fn(),
  updateSetWhere: vi.fn(),
  requireCanMock: vi.fn(),
  getSessionOrThrowMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  revalidateTagMock: vi.fn(),
  logInfoMock: vi.fn(),
  logErrorMock: vi.fn(),
  whereArgsMock: vi.fn(),
  orderByArgsMock: vi.fn(),
  limitArgsMock: vi.fn(),
  offsetArgsMock: vi.fn(),
}));

// next/cache — Plan 07-03 Task 2 added revalidation calls to updateUser (profile
// fields name/bio/avatar now revalidate /author/${username} + posts-list tag).
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
  revalidateTag: (...a: unknown[]) => revalidateTagMock(...a),
}));

// next/headers — quick task 260824-qtu: users.ts now imports `headers` DIRECTLY to
// forward the caller's request headers into middleware-gated admin endpoints (the
// live-401 fix). This mock did not exist before because @/lib/permissions is
// module-mocked, so next/headers was never imported transitively. The real
// implementation throws outside a request scope — stub it with a plain Headers
// instance carrying a cookie, matching what adminMiddleware's session resolution
// needs to find the caller's session.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "test" }),
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
      // sendVerificationEmail — AUTH-07 (Plan 02-06): the createUser action calls
      // it explicitly after creation (better-auth 1.6.23's admin createUser endpoint
      // never invokes the sendOnSignUp-configured callback).
      sendVerificationEmail: sendVerificationEmailMock,
      // removeUser — quick task 260824-ptx: the guarded deleteUser action's
      // terminal call (Better Auth admin plugin cascades sessions/accounts).
      removeUser: removeUserMock,
      // changePassword — quick task 260827-869: the self-service password
      // change endpoint (dist/api/routes/update-user.mjs:75 — gated by
      // sensitiveSessionMiddleware, so the call MUST forward request headers).
      changePassword: changePasswordMock,
      // getSession + userHasPermission are used inside requireCan/getSessionOrThrow;
      // stubbed per-test as needed via the permissions mock below.
      getSession: vi.fn(),
      userHasPermission: vi.fn(),
      revokeSessions: vi.fn(),
    },
  },
}));

// db — the Drizzle query builder. Read shapes in users.ts:
//   (1) createFirstAdmin: db.select({n:count()}).from(user).where(...) → countResult()
//   (2) listUsers (Plan 04-03, bare): db.select({...}).from(user) → selectAllResult()
//   (3) 260827-se8 Task 5: listUsers(opts)/countUsers(opts) chain
//       where/orderBy/limit/offset — each step recorded into its ArgsMock.
//
// 260827-se8: from() returns a LAZY thenable node P (then → selectAllResult)
// carrying orderBy/limit/offset (record + return P); where() records and
// returns node W (then → countResult) carrying the same chain steps. Awaiting
// at from() (bare listUsers) → selectAllResult; awaiting at/after where()
// (createFirstAdmin count, countUsers, filtered listUsers) → countResult.
// Lazy = the terminal fires only when actually awaited (gate-ordering proofs
// stay honest; no floating-promise eager evaluation).
vi.mock("@/lib/db", () => {
  const lazyThenable = (fn: () => unknown) => ({
    then(
      onFulfilled?: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) {
      return Promise.resolve()
        .then(fn)
        .then(onFulfilled, onRejected);
    },
  });
  const attachSteps = (
    node: Record<string, unknown>,
    next: () => Record<string, unknown>,
  ) => {
    node.orderBy = (...a: unknown[]) => {
      orderByArgsMock(...a);
      return next();
    };
    node.limit = (...a: unknown[]) => {
      limitArgsMock(...a);
      return next();
    };
    node.offset = (...a: unknown[]) => {
      offsetArgsMock(...a);
      return next();
    };
    return node;
  };
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => {
          const p = attachSteps(lazyThenable(() => selectAllResult()), () => p);
          (p as unknown as { where: ReturnType<typeof vi.fn> }).where = vi.fn(
            (...a: unknown[]) => {
              whereArgsMock(...a);
              const w = attachSteps(lazyThenable(() => countResult()), () => w);
              return w;
            },
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
    // banned/emailVerified/createdAt are dereferenced by the 260827-se8 list
    // filters + desc(createdAt) ordering.
    // posts.authorId is dereferenced by deleteUser's has-posts guard
    // (eq(schema.posts.authorId, userId) — quick task 260824-ptx).
    schema: {
      user: {
        id: "id",
        role: "role",
        name: "name",
        bio: "bio",
        avatar: "avatar",
        email: "email",
        banned: "banned",
        emailVerified: "email_verified",
        createdAt: "created_at",
      },
      posts: {
        authorId: "authorId",
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

// log — structured logger. Plan 02-06: the spies are hoisted so the AUTH-07
// failure-isolation test can assert log.error fired (previously a no-op stub).
vi.mock("@/lib/log", () => ({
  log: { info: logInfoMock, error: logErrorMock },
}));

// Import the SUT AFTER mocks are in place.
// Plan 04-03 Task 1: + listUsers, updateUser (the two new actions under test).
// Quick task 260824-ptx Task 1: + deleteUser (guarded destructive removal).
import {
  createFirstAdmin,
  createUser,
  banUser,
  unbanUser,
  revokeSessions,
  listUsers,
  countUsers,
  updateUser,
  deleteUser,
  changeOwnPassword,
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
    // Plan 07-03 Task 2 — updateUser now fetches the target's username (for the
    // /author/${username} revalidation) via db.select(...).from(user).where(...).
    // That chain resolves to countResult(); seed a username-bearing row so the
    // revalidatePath branch fires. Revalidation mocks are no-op spies.
    countResult.mockResolvedValue([{ username: "target-user" }]);
    revalidatePathMock.mockReturnValue(undefined);
    revalidateTagMock.mockReturnValue(undefined);
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

    // Plan 07-07 / WR-05 fixture fix: the avatar here was previously the
    // scheme-less "cdn.example.com/me.png", which imageUrlSchema REJECTS —
    // updateUser gained Zod validation in 07-07, so the fixture must use a
    // value the media-picker contract actually accepts (absolute https URL).
    await updateUser("self-1", { name: "Me", bio: "my bio", avatar: "https://cdn.example.com/me.png" });

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

    // All persistence flows through db.update (the auth.api.updateUser body type
    // does not accept userId — see PLAN <action> step 3 fallback). `name` reaches
    // the DB; `role` does NOT. The Better Auth updateUser endpoint is never called.
    expect(updateSetWhere).toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
    // And requireCan was NOT called for the self-edit path.
    expect(requireCanMock).not.toHaveBeenCalled();
  });

  // ============================================================
  // Plan 07-06 / WR-04 — revalidation call assertions for updateUser. The
  // Plan 07-03 wiring had zero call coverage (07-REVIEW WR-04); these pin the
  // concrete literals (username seeded in beforeEach → "target-user") AND the
  // negative space (role-only updates fire NO revalidation).
  // ============================================================
  it("self-edit with profile fields revalidates /author/{username} + /sitemap.xml + posts-list tag (2-arg max form)", async () => {
    // Self-edit: session user is the target (username fetch → "target-user").
    getSessionOrThrowMock.mockResolvedValue({
      user: { id: "self-1", role: "author" },
      session: { id: "sess-self" },
    });

    await updateUser("self-1", { name: "Me" });

    expect(updateSetWhere).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/author/target-user");
    expect(revalidatePathMock).toHaveBeenCalledWith("/sitemap.xml");
    expect(revalidateTagMock).toHaveBeenCalledWith("posts-list", "max");
  });

  it("admin role-ONLY cross-user update fires NO revalidatePath (role changes have no public surface)", async () => {
    // Admin passes the cross-user gate; the patch carries ONLY role — the
    // users.ts conditional (name/bio/avatar all undefined) must skip the
    // revalidation block entirely.
    requireCanMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    await updateUser("target-1", { role: "editor" });

    expect(updateSetWhere).toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  // ============================================================
  // Plan 07-07 / WR-05 — Zod input validation for updateUser. The action
  // previously persisted whatever arrived: length-unlimited name/bio, ANY
  // avatar string (scheme-less hosts like the pre-fix fixture above, and
  // javascript: URLs — both outside the imageUrlSchema contract every other
  // image field obeys), and on the cross-user path ANY role string. These
  // tests pin the INVALID_INPUT contract: userUpdateSchema.safeParse fires
  // AFTER the session/permission gates, BEFORE the patch build / db.update.
  // ============================================================
  describe("Plan 07-07 / WR-05: updateUser validates input via Zod (INVALID_INPUT)", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Default: requireCan DENIES; cross-user tests override to admin-allow.
      requireCanMock.mockImplementation(() => {
        throw new Error("FORBIDDEN");
      });
      // Default session: admin editing target-1 (cross-user). Self-edit tests
      // override with a session whose id matches the target userId.
      getSessionOrThrowMock.mockResolvedValue({
        user: { id: "admin-1", role: "admin" },
        session: { id: "sess-1" },
      });
      updateSetWhere.mockResolvedValue(undefined);
      countResult.mockResolvedValue([{ username: "target-user" }]);
      revalidatePathMock.mockReturnValue(undefined);
      revalidateTagMock.mockReturnValue(undefined);
    });

    it("self-edit with an EMPTY name throws INVALID_INPUT BEFORE db.update", async () => {
      getSessionOrThrowMock.mockResolvedValue({
        user: { id: "self-1", role: "author" },
        session: { id: "sess-self" },
      });
      updateSetWhere.mockImplementation(() => {
        throw new Error("MUST_NOT_BE_REACHED");
      });

      await expect(updateUser("self-1", { name: "" })).rejects.toThrow("INVALID_INPUT");
      expect(updateSetWhere).not.toHaveBeenCalled();
    });

    it("self-edit with a SCHEME-LESS avatar throws INVALID_INPUT (imageUrlSchema contract)", async () => {
      getSessionOrThrowMock.mockResolvedValue({
        user: { id: "self-1", role: "author" },
        session: { id: "sess-self" },
      });
      updateSetWhere.mockImplementation(() => {
        throw new Error("MUST_NOT_BE_REACHED");
      });

      await expect(
        updateUser("self-1", { avatar: "cdn.example.com/me.png" }),
      ).rejects.toThrow("INVALID_INPUT");
      expect(updateSetWhere).not.toHaveBeenCalled();
    });

    it("self-edit with a javascript: avatar throws INVALID_INPUT", async () => {
      getSessionOrThrowMock.mockResolvedValue({
        user: { id: "self-1", role: "author" },
        session: { id: "sess-self" },
      });
      updateSetWhere.mockImplementation(() => {
        throw new Error("MUST_NOT_BE_REACHED");
      });

      await expect(
        updateUser("self-1", { avatar: "javascript:alert(1)" }),
      ).rejects.toThrow("INVALID_INPUT");
      expect(updateSetWhere).not.toHaveBeenCalled();
    });

    it("bio longer than 2000 characters throws INVALID_INPUT", async () => {
      getSessionOrThrowMock.mockResolvedValue({
        user: { id: "self-1", role: "author" },
        session: { id: "sess-self" },
      });
      updateSetWhere.mockImplementation(() => {
        throw new Error("MUST_NOT_BE_REACHED");
      });

      await expect(
        updateUser("self-1", { bio: "b".repeat(2001) }),
      ).rejects.toThrow("INVALID_INPUT");
      expect(updateSetWhere).not.toHaveBeenCalled();
    });

    it("admin cross-user update with an INVALID role value throws INVALID_INPUT AFTER the permission gate", async () => {
      // Simulates a forged client (TS types prevent legit callers from sending
      // this) — the value must die at the Zod gate, not reach patch.role.
      requireCanMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
      updateSetWhere.mockImplementation(() => {
        throw new Error("MUST_NOT_BE_REACHED");
      });
      const forged = { role: "superadmin" } as unknown as Parameters<typeof updateUser>[1];

      await expect(updateUser("target-1", forged)).rejects.toThrow("INVALID_INPUT");
      // Ordering: the cross-user permission gate fired FIRST (T-04-12 stays intact)...
      expect(requireCanMock).toHaveBeenCalledWith({ user: ["update"] });
      // ...and the write never happened.
      expect(updateSetWhere).not.toHaveBeenCalled();
    });

    it("EMPTY avatar string is ALLOWED (the media-picker cleared state — imageUrlSchema accepts \"\")", async () => {
      getSessionOrThrowMock.mockResolvedValue({
        user: { id: "self-1", role: "author" },
        session: { id: "sess-self" },
      });

      await expect(updateUser("self-1", { avatar: "" })).resolves.not.toThrow();
      expect(updateSetWhere).toHaveBeenCalled();
    });

    it("valid https avatar + name + bio still persist (regression pin after the fixture fix)", async () => {
      getSessionOrThrowMock.mockResolvedValue({
        user: { id: "self-1", role: "author" },
        session: { id: "sess-self" },
      });

      await expect(
        updateUser("self-1", { name: "Me", bio: "my bio", avatar: "https://cdn.example.com/me.png" }),
      ).resolves.not.toThrow();
      expect(updateSetWhere).toHaveBeenCalled();
    });
  });
});

// ============================================================
// Plan 02-06 Task 1 — AUTH-07 regression block (RED phase first)
// [CITED: 02-06-PLAN.md Task 1 <behavior> — the five AUTH-07 assertions]
// [CITED: .planning/debug/createuser-no-verify-email.md — root cause:
//  better-auth 1.6.23's admin createUser endpoint contains NO email-verification
//  logic; sendOnSignUp:true is consumed only by /sign-up/email and OAuth
//  link-account. The old __tests__/email-flows.test.ts config-only test proved
//  config wiring, never behavior — this block is the causal proof that shipped
//  as a blind spot.]
//
// Threat register coverage (see 02-06-PLAN.md <threat_model>):
//  - T-02-06-01: dashboard-created user → verification email actually sent
//  - T-02-06-02: send failure logged, never masked as a failed creation
//  - T-02-06-04: requireCan still fires FIRST (proven above; not reordered here)
// ============================================================
describe("AUTH-07: createUser action explicitly sends the verification email after creation (Plan 02-06 — UAT Test 5 gap closure)", () => {
  const adminInput = {
    name: "New User",
    email: "new@example.com",
    password: "longenough",
    role: "author" as const,
  };
  const creationResult = { user: { id: "u-new", email: "new@example.com" } };

  beforeEach(() => {
    vi.clearAllMocks();
    // Permitted path: requireCan resolves (admin holds user:create).
    requireCanMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    createUserMock.mockResolvedValue(creationResult);
    sendVerificationEmailMock.mockResolvedValue(undefined);
  });

  it("causal link: createUser resolves AND sendVerificationEmail fires exactly once with { body: { email } } — the assertion D2 never made", async () => {
    await expect(createUser(adminInput)).resolves.toEqual(creationResult);

    expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmailMock).toHaveBeenCalledWith({
      body: { email: adminInput.email },
    });
  });

  it("ordering: the send happens only AFTER the creation call resolves", async () => {
    await createUser(adminInput);

    // invocationCallOrder is global across mocks — the creation call index must
    // be strictly lower than the send call index.
    expect(createUserMock.mock.invocationCallOrder[0]).toBeLessThan(
      sendVerificationEmailMock.mock.invocationCallOrder[0],
    );
  });

  it("failure isolation: a send rejection does NOT fail the action — creation result returned, failure logged via log.error (T-02-06-02)", async () => {
    sendVerificationEmailMock.mockRejectedValueOnce(new Error("Resend down"));

    await expect(createUser(adminInput)).resolves.toEqual(creationResult);

    // The swallowed failure is observable in the server log, carrying the email
    // (the original failure mode was fully silent — needed Resend's dashboard
    // to even prove no send was attempted).
    expect(logErrorMock).toHaveBeenCalledWith(
      "verification email send failed after user creation",
      expect.objectContaining({ email: adminInput.email }),
    );
  });

  it("no send on failed creation: createUserMock rejects → the action rejects AND sendVerificationEmail was never called", async () => {
    createUserMock.mockRejectedValueOnce(new Error("creation failed"));

    await expect(createUser(adminInput)).rejects.toThrow("creation failed");
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
  });

  it("bootstrap scope: createFirstAdmin NEVER sends a verification email (bootstrap admin is auto-verified by design — D-09 still gates dashboard-created users)", async () => {
    // count(admins) === 0 → the bootstrap path proceeds.
    countResult.mockReturnValue([{ n: 0 }]);
    createUserMock.mockResolvedValue({ user: { id: "u1", role: "admin" } });

    await createFirstAdmin({
      name: "Root Admin",
      email: "admin@example.com",
      password: "correct-horse",
    });

    // The admin WAS created (emailVerified:true comes via the body — see the
    // createFirstAdmin zero test), but no verification email is sent.
    expect(createUserMock).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// Quick task 260824-ptx Task 1 — deleteUser (RED phase first)
// [CITED: 260824-ptx-PLAN.md Task 1 <behavior> — the five guarded-delete cases]
// [CITED: owner decision 2026-08-24 — revises 04-CONTEXT D-08 (disable-only):
//  guarded delete is now allowed; D-08's authorship-integrity rationale is
//  preserved STRUCTURALLY via the has-posts guard]
//
// Threat register coverage (see 260824-ptx-PLAN.md <threat_model>):
//  - T-Q-01: requireCan({user:["delete"]}) FIRST — removeUser unreachable when denied
//  - T-Q-02: self + last-admin guards prevent lockout
//  - T-Q-03: has-posts guard converts the raw NO-ACTION FK error into a friendly
//    message and preserves D-08 authorship integrity
//  - T-Q-04: log.info("user deleted") on success (repudiation)
//
// Mock-shape note: EVERY db.select(...).from(...).where(...) chain in this file's
// db mock resolves to countResult() — it is the generic .where-chain result, not
// just createFirstAdmin's admin count. deleteUser performs sequential .where
// queries (target-role fetch, then admin count OR post count); their results are
// queued with countResult.mockResolvedValueOnce(...) in execution order.
// ============================================================
describe("DASH-04: deleteUser — guarded destructive removal (owner decision 2026-08-24, revising D-08)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: requireCan DENIES — the permission-first test relies on this;
    // guarded-path tests override with an admin session.
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
  });

  it("permission-first: throws FORBIDDEN when requireCan denies — removeUser and every DB query unreachable (T-Q-01)", async () => {
    // SECURITY-CRITICAL: if the permission check ordering is wrong, either the
    // DB chain or removeUser fires and this throw surfaces — proving user:delete
    // gates the action BY EXECUTION ORDER, not just that refusal happens.
    removeUserMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED — requireCan did not fire first");
    });
    countResult.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED — requireCan did not fire before db.select");
    });

    await expect(deleteUser("target-1")).rejects.toThrow("FORBIDDEN");
    expect(removeUserMock).not.toHaveBeenCalled();
    // The capability statement fired with the EXACT user:delete permission.
    expect(requireCanMock).toHaveBeenCalledWith({ user: ["delete"] });
  });

  it("self-delete guard: rejects with a friendly error BEFORE any DB query — removeUser never called (T-Q-02)", async () => {
    requireCanMock.mockResolvedValue({ user: { id: "self-1", role: "admin" } });
    countResult.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED — self guard must fire before any DB query");
    });
    removeUserMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    // Plan 07-07 / CR-02 (gap #6): each guard error also carries a stable
    // `digest` — React's production flight serializer forwards digests (never
    // err.message), so the digest is what the dashboard's friendly-copy map
    // branches on (UsersTable → users-schema.ts). The message still exists on
    // the thrown instance (dev flights + server logs); the digest is the
    // production-surviving contract.
    await expect(deleteUser("self-1")).rejects.toMatchObject({
      message: "You cannot delete your own account.",
      digest: "SELF_DELETE",
    });
    expect(removeUserMock).not.toHaveBeenCalled();
  });

  // Plan 07-07 / CR-02 — the target-not-found guard carries USER_NOT_FOUND.
  it("target-not-found guard: rejects with 'User not found.' + digest USER_NOT_FOUND before any auth call", async () => {
    requireCanMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    // Target-role fetch returns no row → the not-found guard fires.
    countResult.mockResolvedValueOnce([]);
    removeUserMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(deleteUser("missing-user")).rejects.toMatchObject({
      message: "User not found.",
      digest: "USER_NOT_FOUND",
    });
    expect(removeUserMock).not.toHaveBeenCalled();
  });

  it("last-admin guard: rejects when the target is the only remaining admin (T-Q-02)", async () => {
    requireCanMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    // Queue in execution order: target-role fetch, then the admin count.
    countResult.mockResolvedValueOnce([{ role: "admin" }]); // target-role fetch
    countResult.mockResolvedValueOnce([{ n: 1 }]); // admin count === 1
    removeUserMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(deleteUser("target-1")).rejects.toMatchObject({
      message: "Cannot delete the last remaining admin. Promote another admin first.",
      digest: "LAST_ADMIN",
    });
    expect(removeUserMock).not.toHaveBeenCalled();
  });

  it("has-posts guard: rejects when the target still has posts — preserves D-08 authorship integrity (T-Q-03)", async () => {
    requireCanMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    // Target is a non-admin → the last-admin count is skipped; queue in
    // execution order: target-role fetch, then the post count.
    countResult.mockResolvedValueOnce([{ role: "author" }]); // target-role fetch
    countResult.mockResolvedValueOnce([{ n: 3 }]); // post count === 3
    removeUserMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(deleteUser("target-1")).rejects.toMatchObject({
      message: "This user still has posts. Reassign or delete their posts first.",
      digest: "USER_HAS_POSTS",
    });
    expect(removeUserMock).not.toHaveBeenCalled();
  });

  it("success: calls auth.api.removeUser exactly once with { body: { userId }, headers } when all guards pass", async () => {
    requireCanMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    countResult.mockResolvedValueOnce([{ role: "author" }]); // target-role fetch
    countResult.mockResolvedValueOnce([{ n: 0 }]); // post count === 0
    removeUserMock.mockResolvedValue({ success: true });

    await expect(deleteUser("target-1")).resolves.toEqual({ success: true });
    expect(removeUserMock).toHaveBeenCalledTimes(1);
    // 260824-qtu: exact-shape assertion relaxed to objectContaining — removeUser is
    // middleware-gated, so the call MUST now also carry forwarded request headers.
    expect(removeUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { userId: "target-1" },
        headers: expect.anything(),
      }),
    );
  });
});

// ============================================================
// Quick task 260824-qtu Task 1 — headerless-internal-call regression block (RED first)
// [CITED: 260824-qtu-PLAN.md Task 1 <behavior> — the headerless internal-call bug class]
// [CITED: live 401 root cause — better-auth 1.6.23 admin-plugin routes gated by
//  adminMiddleware (node_modules/better-auth/dist/plugins/admin/routes.mjs:16-20)
//  throw APIError UNAUTHORIZED when invoked server-side WITHOUT request headers:
//  getAuthoritativeSessionFromCtx finds no session. ALL FOUR middleware-gated
//  auth.api call sites in users.ts were headerless, so ban/unban/revoke-sessions
//  carry the same latent bug (DB has zero banned users — ban never worked live).]
//
// Threat register coverage (see 260824-qtu-PLAN.md <threat_model>):
//  - T-Q2-01: headers are the CALLER'S OWN live request (never fabricated or
//    substituted) — requireCan still fires FIRST unchanged, adminMiddleware
//    re-authorizes the SAME session (defense in depth preserved)
//  - T-Q2-02: the only headers source is the next/headers async function
//    (permissions/index.ts:24 precedent) — no hand-built Headers here
//  - T-Q2-03: "user deleted" logs only after removeUser resolves
//  - T-Q2-04: removeUser rejection becomes a readable thrown message
// ============================================================
describe("REGRESSION 260824-qtu: middleware-gated admin endpoints receive forwarded request headers (headerless internal call = live 401)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Success-path default: requireCan resolves with an admin session (the
    // gated endpoints are admin capabilities; the FORBIDDEN ordering is already
    // covered above and must stay unchanged).
    requireCanMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
  });

  it("banUser success: forwards request headers alongside body (headerless = live 401)", async () => {
    banUserMock.mockResolvedValue({ success: true });

    await banUser("target-id", { banReason: "spam" });

    expect(banUserMock).toHaveBeenCalledTimes(1);
    expect(banUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ userId: "target-id", banReason: "spam" }),
        headers: expect.anything(),
      }),
    );
    // Bug-class regression: the headers key MUST be present on the call argument.
    expect(banUserMock.mock.calls[0][0].headers).toBeDefined();
  });

  it("unbanUser success: forwards request headers alongside body (headerless = live 401)", async () => {
    unbanUserMock.mockResolvedValue({ success: true });

    await unbanUser("target-id");

    expect(unbanUserMock).toHaveBeenCalledTimes(1);
    expect(unbanUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ userId: "target-id" }),
        headers: expect.anything(),
      }),
    );
    expect(unbanUserMock.mock.calls[0][0].headers).toBeDefined();
  });

  it("revokeSessions success: forwards request headers alongside body (headerless = live 401)", async () => {
    revokeUserSessionsMock.mockResolvedValue({ success: true });

    await revokeSessions({ userId: "target-id" });

    expect(revokeUserSessionsMock).toHaveBeenCalledTimes(1);
    expect(revokeUserSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ userId: "target-id" }),
        headers: expect.anything(),
      }),
    );
    expect(revokeUserSessionsMock.mock.calls[0][0].headers).toBeDefined();
  });

  it("deleteUser failure path: removeUser rejection becomes a readable error + log.error — log.info NEVER fires (T-Q2-03/T-Q2-04)", async () => {
    // Guards pass: target is a non-admin author with zero posts.
    countResult.mockResolvedValueOnce([{ role: "author" }]); // target-role fetch
    countResult.mockResolvedValueOnce([{ n: 0 }]); // post count === 0
    // The live failure mode: the gated endpoint rejects with an opaque APIError.
    removeUserMock.mockRejectedValueOnce(new Error("APIError UNAUTHORIZED"));

    await expect(deleteUser("target-1")).rejects.toMatchObject({
      message: "Failed to delete user — please try again.",
      digest: "DELETE_FAILED",
    });
    // The failure is observable in the server log with the target id.
    expect(logErrorMock).toHaveBeenCalledWith(
      "deleteUser failed",
      expect.objectContaining({ userId: "target-1" }),
    );
    // The old premature "user deleted" log must NOT fire on failure.
    expect(logInfoMock).not.toHaveBeenCalled();
  });

  it("deleteUser log-ordering: 'user deleted' fires only AFTER removeUser resolves (T-Q2-03)", async () => {
    // Same green-path mocks as the success test above.
    countResult.mockResolvedValueOnce([{ role: "author" }]); // target-role fetch
    countResult.mockResolvedValueOnce([{ n: 0 }]); // post count === 0
    removeUserMock.mockResolvedValue({ success: true });

    await deleteUser("target-1");

    // invocationCallOrder is global across mocks (precedent: the AUTH-07 ordering
    // test above) — the removeUser call index must be strictly lower than the
    // success log's index, so the log can never claim a deletion that did not happen.
    expect(removeUserMock.mock.invocationCallOrder[0]).toBeLessThan(
      logInfoMock.mock.invocationCallOrder[0],
    );
    expect(logInfoMock).toHaveBeenCalledWith("user deleted", { userId: "target-1" });
  });

  it("deliberate asymmetry: auth.api.createUser stays HEADERLESS (caller-check skip is by design — routes.mjs:146-149)", async () => {
    createUserMock.mockResolvedValue({ user: { id: "u-new" } });
    sendVerificationEmailMock.mockResolvedValue(undefined);

    await createUser({
      name: "New User",
      email: "new@example.com",
      password: "longenough",
      role: "author",
    });

    // createUser tolerates headerless server-side calls BY DESIGN (the admin
    // endpoint's caller check is skipped when no headers are forwarded) and
    // sendVerificationEmail is deliberately headerless (anti-enumeration). Pin the
    // asymmetry so a future "cleanup" cannot silently change these call shapes —
    // the AUTH-07 exact-match assertion on sendVerificationEmail above already
    // enforces headerless there.
    expect(createUserMock.mock.calls[0][0]).not.toHaveProperty("headers");
  });
});

// ============================================================
// Quick task 260827-869 Task 3 — changeOwnPassword (RED phase first)
// [CITED: 260827-869-PLAN.md Task 3 <behavior> — the four self-service
//  password-change assertions]
//
// Threat register coverage (see 260827-869-PLAN.md <threat_model>):
//  - T-Q-869-01: getSessionOrThrow FIRST — self-service for any signed-in role,
//    NO requireCan (no userId param → the action can never target another
//    user); Better Auth re-verifies currentPassword against the credential
//    hash server-side
//  - T-Q-869-02: Zod length bounds reject short/empty input before the endpoint
//  - T-Q-869-03: digest-only client contract (CR-02) — INVALID_PASSWORD maps to
//    a stable digest; the raw APIError is never rethrown
//  - T-Q-869-04: revokeOtherSessions: true — other devices signed out; the
//    endpoint sets a fresh session cookie for the current one
//  - 260824-qtu regression class: changePassword is gated by
//    sensitiveSessionMiddleware (dist/api/routes/session.mjs:328 —
//    getAuthoritativeSessionFromCtx), which resolves the session FROM REQUEST
//    HEADERS — a headerless internal auth.api call 401s. The call MUST forward
//    the caller's live request headers.
// ============================================================
describe("260827-869: changeOwnPassword — self-service password change (any signed-in role)", () => {
  const validInput = {
    currentPassword: "old-password",
    newPassword: "new-password-123",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: a signed-in session exists. Self-service needs NO permission
    // check (the action takes no userId — it can only touch the caller's own
    // credential), so requireCan must NEVER fire on this path.
    getSessionOrThrowMock.mockResolvedValue({
      user: { id: "self-1", role: "author" },
      session: { id: "sess-self" },
    });
  });

  it("no session: getSessionOrThrow rejects — auth.api.changePassword NEVER reached (T-Q-869-01)", async () => {
    getSessionOrThrowMock.mockRejectedValue(new Error("UNAUTHORIZED"));
    changePasswordMock.mockImplementation(() => {
      throw new Error(
        "MUST_NOT_BE_REACHED — session gate did not fire before auth.api.changePassword",
      );
    });

    await expect(changeOwnPassword(validInput)).rejects.toThrow("UNAUTHORIZED");
    expect(changePasswordMock).not.toHaveBeenCalled();
    // Self-service: no capability statement fires (contrast deleteUser above).
    expect(requireCanMock).not.toHaveBeenCalled();
  });

  it("short newPassword or empty currentPassword: throws INVALID_INPUT BEFORE auth.api.changePassword (T-Q-869-02)", async () => {
    changePasswordMock.mockImplementation(() => {
      throw new Error(
        "MUST_NOT_BE_REACHED — Zod gate did not fire before auth.api.changePassword",
      );
    });

    await expect(
      changeOwnPassword({ currentPassword: "old-password", newPassword: "short" }),
    ).rejects.toThrow("INVALID_INPUT");
    await expect(
      changeOwnPassword({ currentPassword: "", newPassword: "new-password-123" }),
    ).rejects.toThrow("INVALID_INPUT");
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("happy path: forwarded headers + body { currentPassword, newPassword, revokeOtherSessions: true } (260824-qtu + T-Q-869-04)", async () => {
    changePasswordMock.mockResolvedValue({ status: true });

    await expect(changeOwnPassword(validInput)).resolves.toEqual({ status: true });

    expect(changePasswordMock).toHaveBeenCalledTimes(1);
    expect(changePasswordMock).toHaveBeenCalledWith({
      headers: expect.anything(),
      body: {
        currentPassword: validInput.currentPassword,
        newPassword: validInput.newPassword,
        revokeOtherSessions: true,
      },
    });
    // Bug-class regression: the headers key MUST be present (headerless =
    // live 401 under sensitiveSessionMiddleware).
    expect(changePasswordMock.mock.calls[0][0].headers).toBeDefined();
    // T-Q-04 convention — the success log fires only after the endpoint resolves.
    expect(logInfoMock).toHaveBeenCalledWith("password changed");
  });

  it("wrong current password (endpoint INVALID_PASSWORD): digest-carrying friendly error, never the raw APIError (T-Q-869-03)", async () => {
    // Better Auth APIError shape: the error code rides on err.body.code
    // (dist/api/routes/update-user.mjs:167 — BASE_ERROR_CODES.INVALID_PASSWORD).
    const apiError = Object.assign(new Error("APIError BAD_REQUEST"), {
      body: { code: "INVALID_PASSWORD" },
    });
    changePasswordMock.mockRejectedValueOnce(apiError);

    await expect(changeOwnPassword(validInput)).rejects.toMatchObject({
      message: "Your current password is incorrect.",
      digest: "INVALID_PASSWORD",
    });
    // The failure is observable in the server log; the success log never fired.
    expect(logErrorMock).toHaveBeenCalled();
    expect(logInfoMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 260827-se8 Task 5 — URL-driven users list mechanics
// [CITED: 260827-se8-PLAN.md Task 5 <behavior> — q/role/banned/verified filters]
// [CITED: src/actions/__tests__/posts.test.ts — the same chain-recorder +
//  deepContains structural-proof pattern (260827-se8 Task 4)]
// ===========================================================================

/**
 * deepContains — walk an object graph for an exact primitive (string/number/
 * boolean). drizzle eq()/ilike()/and() embed runtime values inside SQL nodes;
 * this proves a filter value reached the WHERE without drizzle internals.
 */
function deepContains(value: unknown, needle: string | number | boolean): boolean {
  const seen = new Set<unknown>();
  const walk = (v: unknown): boolean => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      return v === needle;
    }
    if (typeof v !== "object") return false;
    if (seen.has(v)) return false;
    seen.add(v);
    if (Array.isArray(v)) return v.some(walk);
    return Object.values(v).some(walk);
  };
  return walk(value);
}

describe("260827-se8 Task 5: listUsers — q/role/banned/verified URL filters (Plan Task 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    selectAllResult.mockResolvedValue([]);
    countResult.mockResolvedValue([]);
  });

  it("non-privileged call → FORBIDDEN before any db select (MUST_NOT_BE_REACHED)", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    selectAllResult.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    countResult.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(listUsers({ q: "x" })).rejects.toThrow("FORBIDDEN");
    expect(selectAllResult).not.toHaveBeenCalled();
    expect(countResult).not.toHaveBeenCalled();
    expect(requireCanMock).toHaveBeenCalledWith({ user: ["read"] });
  });

  it("q='alice' → WHERE embeds %alice% (name OR email ilike); page 1 defaults → limit 20 / offset 0", async () => {
    await listUsers({ q: "alice" });

    expect(whereArgsMock).toHaveBeenCalled();
    expect(deepContains(whereArgsMock.mock.calls[0][0], "%alice%")).toBe(true);
    expect(limitArgsMock).toHaveBeenCalledWith(20);
    expect(offsetArgsMock).toHaveBeenCalledWith(0);
  });

  it("role='editor' equality reaches the WHERE clause", async () => {
    await listUsers({ role: "editor" });

    expect(deepContains(whereArgsMock.mock.calls[0][0], "editor")).toBe(true);
  });

  it("banned/verified string enums coerce to BOOLEANS inside the action (documented URL-layer coercion)", async () => {
    await listUsers({ banned: "true", verified: "false" });

    const whereArg = whereArgsMock.mock.calls[0][0];
    expect(deepContains(whereArg, true)).toBe(true);
    expect(deepContains(whereArg, false)).toBe(true);
    // The raw strings never reach the query as strings.
    expect(deepContains(whereArg, "true")).toBe(false);
    expect(deepContains(whereArg, "false")).toBe(false);
  });

  it("deterministic desc(createdAt) ordering", async () => {
    await listUsers({});

    expect(orderByArgsMock).toHaveBeenCalled();
    expect(deepContains(orderByArgsMock.mock.calls[0][0], "created_at")).toBe(true);
  });

  it("page 2 → offset 20; invalid role → Zod throws BEFORE any db select", async () => {
    await listUsers({ page: 2 });
    expect(offsetArgsMock).toHaveBeenCalledWith(20);

    await expect(listUsers({ role: "superuser" } as never)).rejects.toThrow();
    expect(selectAllResult).not.toHaveBeenCalled();
    expect(countResult).not.toHaveBeenCalled();
  });
});

describe("260827-se8 Task 5: countUsers — same gate + same WHERE, count shape, NO page window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    countResult.mockResolvedValue([{ value: 9 }]);
  });

  it("non-privileged call → FORBIDDEN before any db select", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    countResult.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(countUsers({})).rejects.toThrow("FORBIDDEN");
    expect(countResult).not.toHaveBeenCalled();
  });

  it("applies the SAME q filter; NO limit/offset (count is the total); returns Number(row.value)", async () => {
    const n = await countUsers({ q: "alice" });

    expect(n).toBe(9);
    expect(deepContains(whereArgsMock.mock.calls[0][0], "%alice%")).toBe(true);
    expect(limitArgsMock).not.toHaveBeenCalled();
    expect(offsetArgsMock).not.toHaveBeenCalled();
  });
});
