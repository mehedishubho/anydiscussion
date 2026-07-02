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

// The admin plugin exposes its endpoints FLAT on `auth.api` (verified at runtime
// against better-auth@1.6.23 — auth.api.admin is undefined; there is NO nested
// namespace). Call auth.api.createUser / banUser / unbanUser / revokeUserSessions
// directly. The earlier `as { admin }` cast was wrong and made every action throw
// "Cannot read properties of undefined (reading 'createUser')" at runtime.
// [CITED: better-auth@1.6.23 dist/plugins/admin/admin.mjs — endpoints {} → flat auth.api]

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
  const result = await auth.api.createUser({
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

  return auth.api.createUser({
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

  return auth.api.banUser({
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

  return auth.api.unbanUser({
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

  return auth.api.revokeUserSessions({
    body: { userId: input.userId },
  });
}
