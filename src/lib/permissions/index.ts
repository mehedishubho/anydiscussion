// src/lib/permissions/index.ts
// [CITED: better-auth/docs/plugins/admin.mdx — Access Control Usage; RESEARCH.md Pattern 3 lines 419-485]
// (Pitfall #1 + #4 enforcement layer) — server-side auth on EVERY mutating action.
// proxy.ts is UX-only; these helpers are the authoritative RBAC decision boundary.
//
// Server-only — NO "use client" directive. Imported by Server Actions via the
// @/lib/auth/server barrel.
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { log } from "@/lib/log";

export type Permission = Record<string, string[]>; // e.g. { post: ["publish"] }

/**
 * Get the authenticated session or throw UNAUTHORIZED.
 * The authoritative session reader — proxy.ts cookie check is NOT trusted here.
 *
 * @returns The Better Auth session ({ user, session }) when authenticated.
 * @throws Error("UNAUTHORIZED") when no session exists.
 */
export async function getSessionOrThrow() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    log.error("permission denied", { reason: "no session" });
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

/**
 * Require a specific role (route/action-level gate). Admin always passes
 * (override) — D-11 admin = full. Others must match exactly.
 *
 * @param role One of "admin" | "editor" | "author".
 * @returns The session when authorized.
 * @throws Error("FORBIDDEN") when the user's role does not match.
 */
export async function requireRole(role: "admin" | "editor" | "author") {
  const session = await getSessionOrThrow();
  if (session.user.role !== role && session.user.role !== "admin") {
    log.error("permission denied", { requiredRole: role, userRole: session.user.role });
    throw new Error("FORBIDDEN");
  }
  return session;
}

/**
 * Require a capability against the user's role statement set.
 * Delegates to auth.api.userHasPermission — the authoritative RBAC path.
 *
 * @param permission e.g. { post: ["publish"] }.
 * @returns The session when authorized.
 * @throws Error("FORBIDDEN") when the role lacks the permission.
 */
export async function requireCan(permission: Permission) {
  const session = await getSessionOrThrow();
  const result = await auth.api.userHasPermission({
    body: { userId: session.user.id, permissions: permission },
  });
  // A3 — handle either { ok } or boolean-ish result; treat falsy/denied as FORBIDDEN.
  if (!result || (typeof result === "object" && "ok" in result && !result.ok)) {
    log.error("permission denied", { permission, userRole: session.user.role });
    throw new Error("FORBIDDEN");
  }
  return session;
}

/**
 * Assert the user owns the post (author scope check). Admin/editor bypass
 * (they can edit any post per D-11). Authors are scoped to their own posts.
 *
 * @param postId The posts.id to check ownership against.
 * @returns The session when authorized.
 * @throws Error("FORBIDDEN") when the user is a non-owner author.
 */
export async function assertOwnsPost(postId: number) {
  const session = await getSessionOrThrow();
  // Admin/editor bypass ownership — they can edit any post (D-11).
  if (session.user.role === "admin" || session.user.role === "editor") {
    return session;
  }
  const [post] = await db
    .select({ authorId: schema.posts.authorId })
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1);
  if (!post || post.authorId !== String(session.user.id)) {
    log.error("ownership denied", { postId, userId: session.user.id });
    throw new Error("FORBIDDEN");
  }
  return session;
}
