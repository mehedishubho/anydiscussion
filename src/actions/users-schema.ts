// src/actions/users-schema.ts
// [CITED: 07-07-PLAN.md Task 1 — deleteUser digest constants + digest→message map (CR-02 leg 2)]
// [CITED: 07-07-PLAN.md Task 3 — userUpdateSchema Zod validation for updateUser (WR-05)]
// [CITED: src/actions/contact-schema.ts / src/actions/pages-schema.ts — the established
//  pure-schema sibling pattern (a "use server" file may ONLY export async functions,
//  so non-function exports live in this sibling module)]
// [CITED: 07-REVIEW.md CR-02 — React's production flight serializer emits digest-only
//  error chunks (react-server-dom-webpack emitErrorChunk stringifies {digest} only),
//  so a thrown error's .message NEVER reaches the client in production builds —
//  but its .digest DOES. Stable digests are therefore the production-surviving
//  client contract for thrown Server Action errors.]
//
// Pure module — NO "use server" / "use client" directive. Imported by BOTH:
//   - src/actions/users.ts (deleteUser attaches digests to its five guard throws;
//     updateUser parses input via userUpdateSchema)
//   - src/app/(admin)/dashboard/users/UsersTable.tsx (the client error alert maps
//     err.digest → the friendly copy below; same legal cross-boundary pattern as
//     contact-schema.ts being imported by ContactForm.tsx)
//
// Digest values are fixed non-sensitive sentinels (T-07-07-05): they carry no
// internal detail — the friendly copy lives client-side in this pure module.

import { z } from "zod";
import { imageUrlSchema } from "@/lib/validation/image-url";

/**
 * USER_DELETE_DIGESTS — the five stable digest tokens deleteUser attaches to
 * its guard errors. Values are identical to their keys (self-documenting in
 * logs and network payloads). Attach order in users.ts: SELF_DELETE,
 * USER_NOT_FOUND, LAST_ADMIN, USER_HAS_POSTS, DELETE_FAILED.
 */
export const USER_DELETE_DIGESTS = {
  SELF_DELETE: "SELF_DELETE",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  LAST_ADMIN: "LAST_ADMIN",
  USER_HAS_POSTS: "USER_HAS_POSTS",
  DELETE_FAILED: "DELETE_FAILED",
} as const;

export type UserDeleteDigest =
  (typeof USER_DELETE_DIGESTS)[keyof typeof USER_DELETE_DIGESTS];

/**
 * USER_DELETE_ERROR_MESSAGES — digest → the friendly dashboard copy, verbatim
 * the guard sentences users.ts has always thrown (the readable message still
 * exists on the thrown instance for dev flights + server logs; this map is
 * what the PRODUCTION client renders, keyed by the forwarded digest).
 */
export const USER_DELETE_ERROR_MESSAGES: Record<UserDeleteDigest, string> = {
  SELF_DELETE: "You cannot delete your own account.",
  USER_NOT_FOUND: "User not found.",
  LAST_ADMIN:
    "Cannot delete the last remaining admin. Promote another admin first.",
  USER_HAS_POSTS:
    "This user still has posts. Reassign or delete their posts first.",
  DELETE_FAILED: "Failed to delete user — please try again.",
};

/**
 * userUpdateSchema — the Zod input gate for updateUser (Plan 07-07 / WR-05).
 * Fires in users.ts AFTER the session + cross-user permission gates and BEFORE
 * the patch build / db.update; failure throws Error("INVALID_INPUT").
 *
 * Every field optional (the action's patch semantics: an empty patch is a legal
 * no-write call). Bounds:
 *   - name: min 1 when PRESENT (`.optional()` only exempts undefined — an empty
 *     string is rejected, mirroring the taxonomy name rule)
 *   - bio: max 2000; EMPTY STRING IS ALLOWED (clearing a bio is legitimate —
 *     same asymmetry as category description)
 *   - avatar: the ONE shared image-URL contract (imageUrlSchema) — "" (picker
 *     cleared state), absolute http(s), or root-relative /... ; scheme-less
 *     hosts and javascript: URLs die here
 *   - role: the three-role RBAC enum. Validated on the FULL input (not just the
 *     role-stripped self-edit remainder): the cross-user path persists role, so
 *     an unvalidated string there would flow straight to the DB column. The
 *     self-edit strip happens in users.ts AFTER this parse — a self-edit
 *     carrying a VALID enum role is still silently stripped (T-04-11 graceful
 *     degradation); only a forged INVALID value surfaces INVALID_INPUT.
 */
export const userUpdateSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(255).optional(),
  bio: z.string().max(2000, "Bio must be 2000 characters or fewer").optional(),
  avatar: imageUrlSchema.optional(),
  role: z.enum(["admin", "editor", "author"]).optional(),
});

export type UserUpdateSchemaInput = z.input<typeof userUpdateSchema>;
export type UserUpdateSchemaOutput = z.output<typeof userUpdateSchema>;

// ============================================================
// Quick task 260827-869 Task 3 — self-service password change
// [CITED: 260827-869-PLAN.md Task 3 <action> step 1 — schema + digests]
// [CITED: better-auth@1.6.23 dist/api/routes/update-user.mjs:75-184 — the
//  /change-password endpoint: body { currentPassword (verified against the
//  credential hash), newPassword (min/max length enforced — default min 8;
//  src/lib/auth/index.ts sets no custom password config), revokeOtherSessions?
//  (deletes all sessions, creates a fresh one, sets the session cookie) }]
//
// Threat register coverage (see 260827-869-PLAN.md <threat_model>):
//  - T-Q-869-02: length bounds reject degenerate input before the endpoint
//  - T-Q-869-03: digest-only client contract (CR-02) — INVALID_PASSWORD and
//    CHANGE_FAILED digests carry no internal detail; the friendly copy below
//    is what the PRODUCTION client renders (PasswordForm maps err.digest)
// ============================================================

/**
 * changePasswordSchema — the shared client+server input gate for
 * changeOwnPassword. min 8 on newPassword mirrors Better Auth's default
 * minPasswordLength (the endpoint enforces its own bounds too — this Zod gate
 * is the early contract so the client form and the server action agree).
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .max(128),
});

export type ChangePasswordSchemaInput = z.input<typeof changePasswordSchema>;
export type ChangePasswordSchemaOutput = z.output<typeof changePasswordSchema>;

/**
 * CHANGE_PASSWORD_DIGESTS — stable digest tokens changeOwnPassword attaches to
 * its mapped errors (values identical to keys, self-documenting in logs).
 * INVALID_PASSWORD = the endpoint verified the current password against the
 * credential hash and it did not match; CHANGE_FAILED = anything else.
 */
export const CHANGE_PASSWORD_DIGESTS = {
  INVALID_PASSWORD: "INVALID_PASSWORD",
  CHANGE_FAILED: "CHANGE_FAILED",
} as const;

export type ChangePasswordDigest =
  (typeof CHANGE_PASSWORD_DIGESTS)[keyof typeof CHANGE_PASSWORD_DIGESTS];

/**
 * CHANGE_PASSWORD_ERROR_MESSAGES — digest → the friendly copy PasswordForm
 * renders client-side (same legal cross-boundary pattern as
 * USER_DELETE_ERROR_MESSAGES → UsersTable). The thrown .message is
 * dev-flight/server-log material only (CR-02).
 */
export const CHANGE_PASSWORD_ERROR_MESSAGES: Record<ChangePasswordDigest, string> = {
  INVALID_PASSWORD: "Your current password is incorrect.",
  CHANGE_FAILED: "Failed to update password — please try again.",
};
