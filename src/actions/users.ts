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
import { revalidatePath, revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { log } from "@/lib/log";
import { requireCan, getSessionOrThrow } from "@/lib/permissions";
import {
  USER_DELETE_DIGESTS,
  USER_DELETE_ERROR_MESSAGES,
  CHANGE_PASSWORD_DIGESTS,
  CHANGE_PASSWORD_ERROR_MESSAGES,
  userUpdateSchema,
  changePasswordSchema,
  userListSchema,
  type UserDeleteDigest,
  type ChangePasswordDigest,
  type UserListInput,
  type UserListQuery,
} from "./users-schema";

// The admin plugin exposes its endpoints FLAT on `auth.api` (verified at runtime
// against better-auth@1.6.23 — auth.api.admin is undefined; there is NO nested
// namespace). Call auth.api.createUser / banUser / unbanUser / revokeUserSessions /
// removeUser directly. The earlier `as { admin }` cast was wrong and made every
// action throw "Cannot read properties of undefined (reading 'createUser')" at
// runtime.
// [CITED: better-auth@1.6.23 dist/plugins/admin/admin.mjs — endpoints {} → flat auth.api]
//
// WHY `headers` IS IMPORTED (260824-qtu — do NOT "clean up" the asymmetry below):
// every admin-plugin route gated by adminMiddleware (removeUser, banUser, unbanUser,
// revokeUserSessions, setRole, … — better-auth@1.6.23
// dist/plugins/admin/routes.mjs:16-20) resolves the caller's session FROM THE
// REQUEST HEADERS via getAuthoritativeSessionFromCtx and throws APIError
// UNAUTHORIZED when invoked server-side WITHOUT them. A headerless internal
// auth.api call therefore 401s even when requireCan already passed — the live
// deleteUser 401 shipped exactly this way (ban/unban/revoke carried the same
// latent bug: zero banned users existed in the DB). Every call to a gated
// endpoint MUST forward the caller's OWN live request headers via await
// headers() — never fabricated (pattern: src/lib/permissions/index.ts:24).
// DELIBERATE exceptions, pinned by tests (users.test.ts REGRESSION 260824-qtu):
//   - auth.api.createUser — headerless BY DESIGN: routes.mjs:146-149 skips the
//     caller check when no headers are forwarded.
//   - auth.api.sendVerificationEmail — deliberately headerless (anti-enumeration;
//     .planning/debug/createuser-no-verify-email.md).

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

  // N/A per 07-REVALIDATION-AUDIT.md — a brand-new user has zero published posts,
  // and /author/[username] is gated by listAuthorPosts returning rows. No public
  // surface exists yet; revalidation becomes relevant only when this user
  // publishes, which routes through publishPost (the canonical revalidation path).

  // AUTH-07 (Plan 02-06 / T-02-06-01) — better-auth 1.6.23's admin createUser
  // endpoint contains NO email-verification logic: sendOnSignUp is consumed only
  // by /sign-up/email and OAuth link-account (verified in
  // .planning/debug/createuser-no-verify-email.md). The causal link is enforced
  // HERE — after creation resolves, send the verification email explicitly.
  const result = await auth.api.createUser({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
      role: input.role,
    },
  });

  // A send failure must NOT mask the successful creation (T-02-06-02): the user
  // exists; a propagated rejection would report creation as failed and a retry
  // would collide on the duplicate email. Swallow after logging — the email is
  // included deliberately: the original failure mode was fully silent (UAT Test 5
  // needed the Resend dashboard to prove the send was never attempted), and
  // server logs are admin-only. Awaited (not void) so this catch observes the
  // rejection — fire-and-forget would make it dead code plus an unhandled
  // rejection inside the Server Action runtime. The R8 timing-attack rationale
  // does not apply: this is a requireCan-gated admin action where the admin just
  // created the account (no account-existence secret to protect).
  try {
    await auth.api.sendVerificationEmail({ body: { email: input.email } });
  } catch (err) {
    log.error("verification email send failed after user creation", {
      email: input.email,
      err: String(err),
    });
  }

  return result;
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

  // N/A per 07-REVALIDATION-AUDIT.md — the `banned` flag is NOT currently rendered
  // on /author/[username] (getUserByUsername's select list reads only id/name/username/
  // bio/avatar). No public surface for ban state. If a future phase renders banned
  // state on the author page, this becomes MISSING and needs revalidatePath("/author/${username}").

  return auth.api.banUser({
    // Middleware-gated endpoint — forward the caller's headers (see import note).
    headers: await headers(),
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

  // N/A per 07-REVALIDATION-AUDIT.md — same rationale as banUser: `banned` flag is
  // not rendered on /author/[username]. No public surface.

  return auth.api.unbanUser({
    // Middleware-gated endpoint — forward the caller's headers (see import note).
    headers: await headers(),
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

  // N/A per 07-REVALIDATION-AUDIT.md — affects server-side sessions only; no public
  // surface (no route renders session state).

  return auth.api.revokeUserSessions({
    // Middleware-gated endpoint — forward the caller's headers (see import note).
    headers: await headers(),
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
// D-08 REVISED (owner decision 2026-08-24): a GUARDED destructive deleteUser now
// exists (bottom of this file). D-08's authorship-integrity rationale is preserved
// structurally — the has-posts guard rejects deletion of any user who still has
// posts, so authorship rows can never be orphaned by this action.
// ============================================================

/**
 * buildUserListWhere — 260827-se8 Task 5. Shared WHERE builder for listUsers +
 * countUsers (identical filters ⇒ the count always matches the page window).
 * banned/verified are URL STRING enums ("true"/"false") coerced to booleans
 * HERE — after the permission gate, per the documented manual-parse ethos.
 */
function buildUserListWhere(filters: UserListQuery) {
  const conds = [];
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conds.push(
      or(ilike(schema.user.name, pattern), ilike(schema.user.email, pattern)),
    );
  }
  if (filters.role) conds.push(eq(schema.user.role, filters.role));
  if (filters.banned !== undefined) {
    conds.push(eq(schema.user.banned, filters.banned === "true"));
  }
  if (filters.verified !== undefined) {
    conds.push(eq(schema.user.emailVerified, filters.verified === "true"));
  }
  return conds.length > 0 ? and(...conds) : undefined;
}

/**
 * listUsers — admin-gated user listing for the /dashboard/users table (D-07).
 *
 * 260827-se8 Task 5: URL-driven filters (q ilike name/email, role equality,
 * banned/verified tri-state) + deterministic desc(createdAt) ordering + the
 * page window (default 20, cap 100). Returns the columns the UI table needs
 * (no passwordHash; emailVerified IS projected since quick task 260824-ptx —
 * the three-state Status badge needs it). Permission check FIRST (Pitfall #1
 * — non-admin → FORBIDDEN BEFORE any db.select, proven structurally by the
 * MUST_NOT_BE_REACHED test in users.test.ts).
 *
 * @returns Array of user rows with role/bio/avatar/email/name/banned/emailVerified fields.
 * @throws Error("UNAUTHORIZED") when no session.
 * @throws Error("FORBIDDEN") when the role lacks user:read.
 */
export async function listUsers(opts?: UserListInput) {
  // Permission check FIRST (Pitfall #1). Sidebar (Plan 04-01) is UX-only.
  await requireCan({ user: ["read"] });

  const filters = userListSchema.parse(opts ?? {});
  const where = buildUserListWhere(filters);

  // Select only the columns the dashboard table renders. Omitting passwordHash /
  // account credentials keeps the surface lean (T-04-15 — admin-only, low risk,
  // but no need to ship a passwordHash column to the client bundle).
  const base = db
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
      emailVerified: schema.user.emailVerified,
    })
    .from(schema.user);
  const filtered = where ? base.where(where) : base;
  return filtered
    .orderBy(desc(schema.user.createdAt))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);
}

/**
 * countUsers — 260827-se8 Task 5. Identical gate + identical WHERE as
 * listUsers (shared builder), `select({ value: sql`count(*)` })` shape
 * (newsletter.ts countSubscribers precedent). No page window — the count is
 * the TOTAL for pagination math.
 *
 * @throws Error("FORBIDDEN") when the role lacks user:read (requireCan FIRST).
 */
export async function countUsers(opts?: UserListInput): Promise<number> {
  await requireCan({ user: ["read"] }); // FIRST (Pitfall #1)
  const filters = userListSchema.parse(opts ?? {});
  const where = buildUserListWhere(filters);
  const base = db
    .select({ value: sql<number>`count(*)` })
    .from(schema.user);
  const [row] = await (where ? base.where(where) : base);
  return Number(row?.value ?? 0);
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
 * Persistence (ALL fields via a single direct db.update on schema.user — see the
 * inline comment below for why auth.api.updateUser is NOT used; 260824-qtu
 * corrected this JSDoc, which still claimed name flows through the Better Auth
 * endpoint):
 *   - `name` + `bio` + `avatar` (AUTH-08 fields) persist via db.update on schema.user.
 *   - `role` persists via db.update ONLY on the cross-user path when provided.
 *
 * @param userId Target user id.
 * @param input  Patch object. `role` is ignored on the self-edit path.
 * @throws Error("UNAUTHORIZED") when no session.
 * @throws Error("FORBIDDEN") when a non-admin attempts a cross-user edit.
 * @throws Error("INVALID_INPUT") when the input fails userUpdateSchema
 *         (Plan 07-07 / WR-05 — empty name, >2000-char bio, avatar outside the
 *         imageUrlSchema contract, or a non-enum role value).
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

  if (!isSelf) {
    // Cross-user edit — admin-only. MUST fire BEFORE any db.write (T-04-12).
    await requireCan({ user: ["update"] });
  }

  // WR-05: Zod input gate AFTER the session/permission gates, BEFORE the patch
  // build / db.update. The FULL input (role included) is parsed — the cross-user
  // path persists `role`, so an unvalidated string there would flow straight to
  // the DB column. Role-stripping for self-edits happens on the PARSED data
  // below, preserving T-04-11's graceful degradation for valid enum values.
  const parsed = userUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("INVALID_INPUT");
  }

  // Self-edit strips `role` (T-04-11 — no self-promotion). Destructure `role`
  // out of safeInput so it can NEVER reach the bio/avatar patch; the explicit
  // `!isSelf` guard below is the second layer of defense. We do NOT throw on a
  // self-edit role attempt — graceful degradation (UI hides the field; server
  // strips it; no error surfaced to the user).
  const { role, ...safeInput } = parsed.data;

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

  // D-25 / Pitfall #3 / #7 — revalidate the author page when profile fields that
  // the public /author/[username] route renders have changed. The route reads
  // name/bio/avatar via getUserByUsername (path-cache — NO cacheTag, only
  // revalidatePath can refresh it) and post lists via listAuthorPosts +
  // listAuthors (both cacheTag("posts-list")). role changes do NOT need
  // revalidation (no public surface for role on the author page).
  // Template: src/actions/posts.ts:325-375.
  if (
    safeInput.name !== undefined ||
    safeInput.bio !== undefined ||
    safeInput.avatar !== undefined
  ) {
    // Fetch the target user's username AFTER the write so we have the concrete
    // path. Username is not in the input type and cannot be mutated by updateUser;
    // this read returns the stable public slug.
    const rows = await db
      .select({ username: schema.user.username })
      .from(schema.user)
      .where(eq(schema.user.id, userId));
    const username = rows[0]?.username;
    if (username) {
      revalidatePath(`/author/${username}`);
      revalidatePath("/sitemap.xml");
      revalidateTag("posts-list", "max");
    } else {
      // No username set → user has no public author page (D-11 — username gates the
      // route). Only the tag-axis invalidation is needed (listAuthors cache).
      revalidateTag("posts-list", "max");
    }
  }

  log.info("user updated", { userId, isSelf });
  return { id: userId };
}

// ============================================================
// Quick task 260824-ptx Task 1 — deleteUser (GREEN phase)
// [CITED: 260824-ptx-PLAN.md Task 1 <action> — guard order is non-negotiable]
// [CITED: owner decision 2026-08-24 — revises 04-CONTEXT D-08 (disable-only):
//  guarded delete is now allowed so admins can remove junk accounts that cannot
//  pass email verification. D-08's authorship-integrity rationale is preserved
//  STRUCTURALLY via the has-posts guard below.]
//
// Threat register coverage (see 260824-ptx-PLAN.md <threat_model>):
//   T-Q-01: requireCan({user:["delete"]}) FIRST — admin-only via adminAc.statements
//   T-Q-02: self + last-admin guards prevent lockout
//   T-Q-03: has-posts guard converts the raw NO-ACTION FK error into a friendly
//           message (posts.authorId — src/db/schema.ts — is a bare .references()
//           with no onDelete, so default NO ACTION would raw-error the delete)
//   T-Q-04: "user deleted" logs only AFTER removeUser resolves (repudiation —
//           verified, not assumed); 260824-qtu hardened the failure surface too
// ============================================================

/**
 * deleteUserGuardError — build a guard Error carrying a stable `digest`
 * (Plan 07-07 / CR-02 leg 2, 07-VERIFICATION gap #6).
 *
 * LOCAL helper, deliberately NOT exported (a "use server" file may only export
 * async functions — the digest constants + message map live in the pure sibling
 * ./users-schema, imported by both this action and the UsersTable client).
 *
 * WHY the digest: React's production flight serializer emits digest-only error
 * chunks (emitErrorChunk stringifies { digest } — verified in the installed
 * dist), so the readable .message below never reaches the client in production
 * builds, but the digest DOES. UsersTable maps err.digest → the friendly copy
 * via USER_DELETE_ERROR_MESSAGES. The message still exists on the thrown
 * instance (dev flights forward it; server logs keep it).
 */
function deleteUserGuardError(digest: UserDeleteDigest): Error & { digest: UserDeleteDigest } {
  const err = new Error(
    USER_DELETE_ERROR_MESSAGES[digest],
  ) as Error & { digest: UserDeleteDigest };
  err.digest = digest;
  return err;
}

/**
 * deleteUser — admin-gated, GUARDED destructive user removal (owner decision
 * 2026-08-24, revising D-08's disable-only policy).
 *
 * Execution order (enforced structurally by the 5-case block in users.test.ts —
 * each guard is proven to fire BEFORE auth.api.removeUser):
 *   1. requireCan({ user: ["delete"] }) — FIRST (Pitfall #1). Its return value
 *      IS the getSessionOrThrow session (requireCan delegates and returns it) —
 *      no second session fetch is issued.
 *   2. Self guard — session identity vs target id, before any DB query.
 *   3. Target role fetch — "User not found." for a missing row (defensive;
 *      Better Auth would otherwise error opaquely).
 *   4. Last-admin guard — only when the target is an admin: count(admins) <= 1
 *      refuses, preventing admin lockout.
 *   5. Has-posts guard — count(posts by author) > 0 refuses. WHY: the
 *      posts.authorId FK is a bare .references() (no onDelete — default NO
 *      ACTION), so without this guard the DB would raw-error; the guard turns
 *      that into a friendly message AND preserves D-08's authorship integrity.
 *   6. Success — auth.api.removeUser with forwarded request headers (middleware-
 *      gated endpoint — see the next/headers import note). "user deleted" logs
 *      only AFTER the endpoint resolves; a rejection is converted into a
 *      readable thrown error. The admin-plugin endpoint cascades the user's
 *      sessions/accounts on the auth side.
 *
 * Each of the five guard failures throws an error carrying a stable `digest`
 * (SELF_DELETE / USER_NOT_FOUND / LAST_ADMIN / USER_HAS_POSTS / DELETE_FAILED —
 * Plan 07-07 / CR-02): digests survive production flight serialization, so
 * UsersTable can render the friendly copy client-side; the thrown .message is
 * dev-flight/server-log material only.
 *
 * @param userId Target user id.
 * @throws Error("FORBIDDEN") when the role lacks user:delete (admin-only).
 * @throws Error + digest SELF_DELETE on self-delete.
 * @throws Error + digest USER_NOT_FOUND when the target row does not exist.
 * @throws Error + digest LAST_ADMIN for the last remaining admin.
 * @throws Error + digest USER_HAS_POSTS while the target still has posts.
 * @throws Error + digest DELETE_FAILED when removeUser rejects.
 */
export async function deleteUser(userId: string) {
  // T-Q-01 — permission check FIRST (Pitfall #1). requireCan already returns
  // the getSessionOrThrow session; reuse it for the identity check.
  const session = await requireCan({ user: ["delete"] });

  // T-Q-02 — self guard. Fires BEFORE any DB query (proven structurally by the
  // self-delete test: countResult is mocked to throw MUST_NOT_BE_REACHED).
  if (session.user.id === userId) {
    log.error("deleteUser blocked — self-delete");
    throw deleteUserGuardError(USER_DELETE_DIGESTS.SELF_DELETE);
  }

  // Fetch the target's role (needed to decide whether the last-admin guard
  // applies). Defensive miss → friendly error instead of Better Auth's opaque one.
  const [target] = await db
    .select({ role: schema.user.role })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  if (!target) {
    log.error("deleteUser blocked — target not found", { userId });
    throw deleteUserGuardError(USER_DELETE_DIGESTS.USER_NOT_FOUND);
  }

  // T-Q-02 — last-admin guard. Exact createFirstAdmin count pattern; only when
  // the target IS an admin (deleting an editor/author never threatens lockout).
  if (target.role === "admin") {
    const [adminRow] = await db
      .select({ n: count() })
      .from(schema.user)
      .where(eq(schema.user.role, "admin"));
    if (Number(adminRow?.n ?? 0) <= 1) {
      log.error("deleteUser blocked — last remaining admin", { userId });
      throw deleteUserGuardError(USER_DELETE_DIGESTS.LAST_ADMIN);
    }
  }

  // T-Q-03 — has-posts guard (preserves D-08's authorship integrity). The
  // posts.authorId FK is a bare .references() with no onDelete — default NO
  // ACTION — so deleting a post-author would raw-error at the DB. This guard
  // converts that into a friendly message BEFORE any destructive write.
  const [postRow] = await db
    .select({ n: count() })
    .from(schema.posts)
    .where(eq(schema.posts.authorId, userId));
  if (Number(postRow?.n ?? 0) > 0) {
    log.error("deleteUser blocked — user still has posts", { userId });
    throw deleteUserGuardError(USER_DELETE_DIGESTS.USER_HAS_POSTS);
  }

  // T-Q-04 (260824-qtu) — logging follows RESOLUTION, not assumption: "user
  // deleted" fires only after auth.api.removeUser actually resolves (the old
  // log-then-call shape claimed deletions that never happened — the live 401
  // shipped exactly that, with the log written and the row still present). A
  // rejection is converted into a readable message: the raw APIError surfaced as
  // a blank dashboard alert + "no message was provided" Server Components error.
  // Do NOT rethrow the raw err. The endpoint is middleware-gated — headers are
  // forwarded (see the next/headers import note).
  try {
    const result = await auth.api.removeUser({
      headers: await headers(),
      body: { userId },
    });
    log.info("user deleted", { userId });
    return result;
  } catch (err) {
    log.error("deleteUser failed", { userId, err: String(err) });
    throw deleteUserGuardError(USER_DELETE_DIGESTS.DELETE_FAILED);
  }
}

// ============================================================
// Quick task 260827-869 Task 3 — changeOwnPassword (GREEN phase)
// [CITED: 260827-869-PLAN.md Task 3 <action> — session-first self-service]
// [CITED: better-auth@1.6.23 dist/api/routes/update-user.mjs:75-184 — the
//  /change-password endpoint: currentPassword verified against the credential
//  hash; newPassword length-bounded (default min 8 — src/lib/auth/index.ts
//  sets no custom password config); revokeOtherSessions deletes every session,
//  creates a fresh one, and sets the session cookie]
//
// Threat register coverage (see 260827-869-PLAN.md <threat_model>):
//   T-Q-869-01: getSessionOrThrow FIRST; NO requireCan and NO userId parameter
//               — the action is self-service for any signed-in role and can
//               never target another user's credential; the endpoint still
//               verifies currentPassword server-side
//   T-Q-869-02: changePasswordSchema bounds gate degenerate input early
//   T-Q-869-03: digest-only client contract — the raw APIError is never
//               rethrown; INVALID_PASSWORD → stable digest + friendly copy
//   T-Q-869-04: revokeOtherSessions:true — other devices signed out, fresh
//               cookie for the current one
// ============================================================

/**
 * changePasswordGuardError — digest-carrying error builder, mirroring
 * deleteUserGuardError above (same CR-02 rationale: production flights forward
 * digests, never .message).
 */
function changePasswordGuardError(
  digest: ChangePasswordDigest,
): Error & { digest: ChangePasswordDigest } {
  const err = new Error(
    CHANGE_PASSWORD_ERROR_MESSAGES[digest],
  ) as Error & { digest: ChangePasswordDigest };
  err.digest = digest;
  return err;
}

/**
 * changeOwnPassword — self-service password change for ANY signed-in role.
 *
 * Execution order (enforced structurally by the four-case block in
 * users.test.ts — 260827-869):
 *   1. getSessionOrThrow() — FIRST (Pitfall #1). Self-service: NO requireCan —
 *      this is the caller's own credential, and there is no userId parameter,
 *      so the action can never target another user.
 *   2. changePasswordSchema.safeParse — INVALID_INPUT on failure (T-Q-869-02).
 *   3. auth.api.changePassword with the caller's forwarded request headers
 *      (the endpoint is gated by sensitiveSessionMiddleware, which resolves
 *      the session FROM REQUEST HEADERS — the 260824-qtu headerless-401 bug
 *      class) and body { currentPassword, newPassword, revokeOtherSessions:
 *      true } (T-Q-869-04 standard post-change hardening).
 *   4. Endpoint rejection → mapped to a digest-carrying Error (T-Q-869-03):
 *      body.code INVALID_PASSWORD (wrong current password) → INVALID_PASSWORD;
 *      anything else → CHANGE_FAILED. The raw APIError is never rethrown.
 *      log.info "password changed" fires only after the endpoint resolves
 *      (T-Q-04 convention); log.error on failure.
 *
 * @param input { currentPassword, newPassword } — validated by the shared
 *        changePasswordSchema (also the client form's contract).
 * @throws Error("UNAUTHORIZED") when no session.
 * @throws Error("INVALID_INPUT") when the input fails changePasswordSchema.
 * @throws Error + digest INVALID_PASSWORD when the current password is wrong.
 * @throws Error + digest CHANGE_FAILED when the endpoint rejects otherwise.
 */
export async function changeOwnPassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  // T-Q-869-01 — session check FIRST. The returned session is not needed for
  // identity (the endpoint re-resolves it from the forwarded headers), so the
  // await is purely the gate.
  await getSessionOrThrow();

  // T-Q-869-02 — Zod gate BEFORE the endpoint call.
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("INVALID_INPUT");
  }

  try {
    const result = await auth.api.changePassword({
      // sensitiveSessionMiddleware resolves the session from request headers —
      // forward the caller's own live headers (see the next/headers note).
      headers: await headers(),
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        // T-Q-869-04 — other devices signed out; the endpoint sets a fresh
        // session cookie for the current one.
        revokeOtherSessions: true,
      },
    });
    log.info("password changed");
    return result;
  } catch (err) {
    // T-Q-869-03 — map the Better Auth error code (rides on err.body.code)
    // to the production-safe digest contract; never rethrow the raw APIError.
    const code = (err as { body?: { code?: string } }).body?.code;
    log.error("changeOwnPassword failed", { code, err: String(err) });
    if (code === "INVALID_PASSWORD") {
      throw changePasswordGuardError(CHANGE_PASSWORD_DIGESTS.INVALID_PASSWORD);
    }
    throw changePasswordGuardError(CHANGE_PASSWORD_DIGESTS.CHANGE_FAILED);
  }
}
