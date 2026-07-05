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
import { requireCan, getSessionOrThrow } from "@/lib/permissions";

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

// ============================================================
// Plan 04-03 Task 1 — listUsers + updateUser (GREEN phase)
// [CITED: 04-03-PLAN.md Task 1 <behavior> + <action>]
// [CITED: 04-CONTEXT.md D-07 (table+drawer UX), D-09 (self-service profile),
//  D-11 (role assignment via dropdown + requireCan re-check)]
// [CITED: 04-RESEARCH.md Open Question #4 — RESOLVED: add listUsers + updateUser]
// [CITED: 02-03-SUMMARY.md — Phase 2 banUser/unbanUser/revokeSessions primitives]
//
// Threat register coverage (see PLAN.md <threat_model>):
//   T-04-10: listUsers permission-check-first → requireCan({user:["read"]}) BEFORE db.select
//   T-04-11: updateUser self-edit path strips `role` server-side (no self-promotion)
//   T-04-12: updateUser cross-user path → requireCan({user:["update"]}) BEFORE db.update
//
// D-08 (still authoritative): no destructive user-removal action — disable-only via
// the existing banUser above. Preserves post authorship integrity.
// ============================================================

/**
 * listUsers — admin-gated user listing for the /dashboard/users table (D-07).
 *
 * Returns the columns the UI table needs (no passwordHash / no emailVerified).
 * Permission check FIRST (Pitfall #1 — non-admin → FORBIDDEN BEFORE any db.select,
 * proven structurally by the MUST_NOT_BE_REACHED test in users.test.ts).
 *
 * @returns Array of user rows with role/bio/avatar/email/name/banned fields.
 * @throws Error("UNAUTHORIZED") when no session.
 * @throws Error("FORBIDDEN") when the role lacks user:read.
 */
export async function listUsers() {
  // Permission check FIRST (Pitfall #1). Sidebar (Plan 04-01) is UX-only.
  await requireCan({ user: ["read"] });

  // Select only the columns the dashboard table renders. Omitting passwordHash /
  // account credentials keeps the surface lean (T-04-15 — admin-only, low risk,
  // but no need to ship a passwordHash column to the client bundle).
  return db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.user.role,
      bio: schema.user.bio,
      avatar: schema.user.avatar,
      banned: schema.user.banned,
      banReason: schema.user.banReason,
      banExpires: schema.user.banExpires,
    })
    .from(schema.user);
}

/**
 * updateUser — admin cross-user edit OR self-edit (D-09 + D-11).
 *
 * Two execution paths, gated differently:
 *   (A) Self-edit (userId === session.user.id): ALLOWED for any role. The `role`
 *       field is STRIPPED server-side so a user cannot self-promote (T-04-11
 *       defense in depth — ProfileForm also hides the role field, but the server
 *       is the authoritative gate). requireCan is NOT called on this path.
 *   (B) Cross-user edit (!isSelf): requireCan({user:["update"]}) FIRST. Non-admin
 *       → FORBIDDEN BEFORE any db.update (T-04-12 — MUST_NOT_BE_REACHED test).
 *
 * Persistence:
 *   - `name` flows through auth.api.updateUser (Better Auth owns the core column).
 *   - `bio` + `avatar` (AUTH-08 fields) persist via db.update on schema.user.
 *   - `role` persists via db.update ONLY on the cross-user path when provided.
 *
 * @param userId Target user id.
 * @param input  Patch object. `role` is ignored on the self-edit path.
 * @throws Error("UNAUTHORIZED") when no session.
 * @throws Error("FORBIDDEN") when a non-admin attempts a cross-user edit.
 */
export async function updateUser(
  userId: string,
  input: {
    name?: string;
    bio?: string;
    avatar?: string;
    role?: "admin" | "editor" | "author";
  },
) {
  const session = await getSessionOrThrow();
  const isSelf = session.user.id === userId;

  // Self-edit strips `role` (T-04-11 — no self-promotion). Destructure `role`
  // out of safeInput so it can NEVER reach the bio/avatar patch; the explicit
  // `!isSelf` guard below is the second layer of defense. We do NOT throw on a
  // self-edit role attempt — graceful degradation (UI hides the field; server
  // strips it; no error surfaced to the user).
  const { role, ...safeInput } = input;

  if (!isSelf) {
    // Cross-user edit — admin-only. MUST fire BEFORE any db.write (T-04-12).
    await requireCan({ user: ["update"] });
  }

  // Persist ALL fields (name + AUTH-08 bio/avatar + cross-user role) via a single
  // db.update on schema.user. Per the PLAN <action> step 3 alternative path: the
  // Better Auth admin plugin's updateUser body type does NOT accept userId as a
  // body property (it types body as Partial<AdditionalUserFieldsInput<...>>),
  // so the type-safe route is a direct DB write. These columns all live on the
  // Drizzle `user` table; the next session read picks up the new values.
  const patch: Record<string, unknown> = {};
  if (safeInput.name !== undefined) patch.name = safeInput.name;
  if (safeInput.bio !== undefined) patch.bio = safeInput.bio;
  if (safeInput.avatar !== undefined) patch.avatar = safeInput.avatar;
  // Role only persists on the admin cross-user path (isSelf → never persists;
  // the !isSelf guard is the authoritative T-04-11 mitigation).
  if (role !== undefined && !isSelf) patch.role = role;

  if (Object.keys(patch).length > 0) {
    await db.update(schema.user).set(patch).where(eq(schema.user.id, userId));
  }

  log.info("user updated", { userId, isSelf });
  return { id: userId };
}
