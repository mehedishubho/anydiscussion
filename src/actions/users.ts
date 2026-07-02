// src/actions/users.ts
// [CITED: better-auth/docs/plugins/admin.mdx — createUser/banUser/unbanUser/revokeUserSessions]
// [CITED: RESEARCH.md Pattern 5 (lines 537-576) — createFirstAdmin + D-08 self-disable]
// [CITED: 02-CONTEXT.md D-05/D-06/D-08/D-16/D-17 — the decision tags encoded here]
//
// The Server Actions file for user management. Establishes the action-first +
// permission-check-first convention (Pitfall #1 — no action trusts the proxy gate).
//
// SECURITY-CRITICAL: createFirstAdmin is the bootstrap exception gated by count(admins)===0.
// The count statement appears textually and executionally BEFORE any auth.api.admin.createUser
// call (D-08 — non-negotiable). The "blocked" test in users.test.ts enforces this ordering
// structurally by mocking auth.api to throw if reached.
//
// Server-only — top directive mandatory for Server Actions.
"use server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, count } from "drizzle-orm";
import { log } from "@/lib/log";
import { requireCan } from "@/lib/permissions";

// The admin plugin exposes its endpoints under `auth.api.admin.*` at runtime
// (createUser, banUser, unbanUser, revokeUserSessions). Better Auth's TS inference
// surfaces the endpoints flat (not nested under `admin`) because of how plugin
// endpoints are merged via UnionToIntersection. The runtime nesting is correct —
// we use a minimal cast so the action bodies type-check without `any`.
// [CITED: better-auth/docs/plugins/admin.mdx — server-side admin API]
type AdminApi = {
  createUser: (args: {
    body: {
      email: string;
      password: string;
      name: string;
      role: string;
      data?: Record<string, unknown>;
    };
  }) => Promise<unknown>;
  banUser: (args: {
    body: { userId: string; banReason?: string; banExpiresIn?: number };
  }) => Promise<unknown>;
  unbanUser: (args: { body: { userId: string } }) => Promise<unknown>;
  revokeUserSessions: (args: { body: { userId: string } }) => Promise<unknown>;
};
const adminApi = (auth.api as unknown as { admin: AdminApi }).admin;

/**
 * createFirstAdmin — the first-run admin-creation bootstrap action.
 *
 * D-08 (HARD security requirement, non-negotiable): this action MUST check
 * count(admins)===0 server-side BEFORE any Better Auth call and refuse (throw
 * FORBIDDEN) when an admin already exists. UI hiding alone is insufficient —
 * without this check the /signup route is an open privilege-escalation endpoint.
 *
 * Execution order (enforced structurally — see users.test.ts "createFirstAdmin blocked"):
 *   1. count(admins) via db.select — FIRST, before any auth.api.* call
 *   2. if count > 0 → log.error + throw FORBIDDEN (setup is closed)
 *   3. only if count===0 → auth.api.admin.createUser with role:"admin"
 */
export async function createFirstAdmin(input: {
  name: string;
  email: string;
  password: string;
}) {
  // D-08 STEP 1 — count existing admins. This statement is textually and
  // executionally BEFORE any auth.api call. Do not reorder.
  const [row] = await db
    .select({ n: count() })
    .from(schema.user)
    .where(eq(schema.user.role, "admin"));

  // D-08 STEP 2 — refuse if any admin exists. log THEN throw (lib/log idiom).
  if (Number(row?.n ?? 0) > 0) {
    log.error("createFirstAdmin blocked — admin already exists");
    throw new Error("FORBIDDEN"); // the setup route is now closed
  }

  // D-08 STEP 3 — only when count===0: create the first admin via Better Auth.
  // emailVerified:true so the bootstrap admin can sign in immediately (D-09 still
  // gates all subsequently-created users via the normal createUser action).
  const result = await adminApi.createUser({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
      role: "admin",
      data: { emailVerified: true },
    },
  });
  return result;
}

/**
 * createUser — admin-gated user creation (D-05: admin sets full credentials).
 *
 * Permission check FIRST (Pitfall #1). The proxy.ts cookie gate is NOT trusted.
 */
export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: "admin" | "editor" | "author";
}) {
  await requireCan({ user: ["create"] });

  return adminApi.createUser({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
      role: input.role,
    },
  });
}

/**
 * banUser — admin-gated ban (D-16 primitive, UI in Phase 4).
 * Bans the user + revokes all their sessions (Better Auth handles both).
 *
 * Permission check FIRST (Pitfall #1).
 */
export async function banUser(
  userId: string,
  options?: { banReason?: string; banExpiresIn?: number },
) {
  await requireCan({ user: ["ban"] });

  return adminApi.banUser({
    body: {
      userId,
      ...(options?.banReason ? { banReason: options.banReason } : {}),
      ...(options?.banExpiresIn ? { banExpiresIn: options.banExpiresIn } : {}),
    },
  });
}

/**
 * unbanUser — admin-gated unban (D-16 primitive, UI in Phase 4).
 *
 * Permission check FIRST (Pitfall #1). Reuses the user:ban capability.
 */
export async function unbanUser(userId: string) {
  await requireCan({ user: ["ban"] });

  return adminApi.unbanUser({
    body: { userId },
  });
}

/**
 * revokeSessions — admin-gated session revocation (D-17 primitive, UI in Phase 4).
 *
 * Admin-for-others path: requires user:revoke-session capability.
 * Self-revoke (sign out everywhere) is handled separately via auth.api.revokeSessions
 * which does not require this permission check (the user owns their own sessions).
 *
 * Permission check FIRST (Pitfall #1).
 */
export async function revokeSessions(input: { userId: string }) {
  await requireCan({ user: ["revoke-session"] });

  return adminApi.revokeUserSessions({
    body: { userId: input.userId },
  });
}
