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
