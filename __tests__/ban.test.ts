// __tests__/ban.test.ts
// [CITED: VALIDATION.md D-16 row — banned user cannot sign in; unban restores]
// [CITED: 02-03-PLAN.md Task 2 <behavior> + <acceptance_criteria>]
// [CITED: RESEARCH.md Code Examples lines 883-898 — admin.banUser/unbanUser]
//
// Covers the D-16 ban primitive SUCCESS PATH (the permission-check-first denial
// path is already covered by src/actions/__tests__/users.test.ts). This test
// proves banUser actually invokes auth.api.admin.banUser with the right args
// (including optional banReason/banExpiresIn) and that unbanUser invokes
// auth.api.admin.unbanUser — the actions are wired to the Better Auth primitive,
// not just permission-gated stubs.
//
// Strategy mirrors src/actions/__tests__/users.test.ts: vi.mock the heavy
// server-only deps (@/lib/auth, @/lib/permissions, @/lib/log) so the action
// bodies run in isolation without a live DB or auth route.
import { describe, it, expect, beforeEach, vi } from "vitest";

// --- Hoisted spies (Vitest 4 hoists vi.mock factories above top-level decls) ---
const {
  banUserMock,
  unbanUserMock,
  requireCanMock,
} = vi.hoisted(() => ({
  banUserMock: vi.fn(),
  unbanUserMock: vi.fn(),
  requireCanMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      banUser: banUserMock,
      unbanUser: unbanUserMock,
    },
  },
}));

// requireCan — default ALLOW so we exercise the success path past the gate.
// (The deny path is covered by users.test.ts "banUser throws FORBIDDEN ...".)
vi.mock("@/lib/permissions", () => ({
  requireCan: requireCanMock,
}));

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), error: vi.fn() },
}));

import { banUser, unbanUser } from "@/actions/users";

describe("D-16: banUser — admin-gated ban primitive (success path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
  });

  it("banned blocked: banUser calls auth.api.admin.banUser with userId (Better Auth sets banned=true + revokes sessions)", async () => {
    banUserMock.mockResolvedValue({ status: true });

    await banUser("target-user-id");

    // The ban primitive is delegated to Better Auth — it manages banned=true,
    // session revocation, AND blocking future sign-in (not just a column flip).
    expect(banUserMock).toHaveBeenCalledTimes(1);
    expect(banUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ userId: "target-user-id" }),
      }),
    );
    // requireCan fires FIRST with the user:ban capability (Pitfall #1).
    expect(requireCanMock).toHaveBeenCalledWith({ user: ["ban"] });
    expect(requireCanMock).toHaveBeenCalledBefore(banUserMock);
  });

  it("banUser forwards optional banReason + banExpiresIn when provided", async () => {
    banUserMock.mockResolvedValue({ status: true });

    await banUser("target-user-id", {
      banReason: "Spamming",
      banExpiresIn: 60 * 60 * 24 * 7, // 7 days
    });

    expect(banUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          userId: "target-user-id",
          banReason: "Spamming",
          banExpiresIn: 60 * 60 * 24 * 7,
        }),
      }),
    );
  });

  it("banUser omits banReason/banExpiresIn from the body when not provided (clean payload)", async () => {
    banUserMock.mockResolvedValue({ status: true });

    await banUser("target-user-id");

    const callArgs = banUserMock.mock.calls[0][0];
    expect(callArgs.body).not.toHaveProperty("banReason");
    expect(callArgs.body).not.toHaveProperty("banExpiresIn");
  });
});

describe("D-16: unbanUser — restores sign-in ability (success path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
  });

  it("unban restores: unbanUser calls auth.api.admin.unbanUser with userId", async () => {
    unbanUserMock.mockResolvedValue({ status: true });

    await unbanUser("target-user-id");

    expect(unbanUserMock).toHaveBeenCalledTimes(1);
    expect(unbanUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ userId: "target-user-id" }),
      }),
    );
    // unban reuses the user:ban capability (documented in 02-02).
    expect(requireCanMock).toHaveBeenCalledWith({ user: ["ban"] });
    expect(requireCanMock).toHaveBeenCalledBefore(unbanUserMock);
  });
});
