// src/lib/auth/permissions.ts
// [CITED: better-auth/better-auth@main/docs/content/docs/plugins/admin.mdx — Access Control]
// RBAC config: 3 fixed roles (admin/editor/author) via the `admin` plugin's
// `createAccessControl`. D-10 — the `access` plugin is NOT pulled in; fixed roles
// need only this declarative statement set. D-11 — role → capability matrix.
//
// Server-only config module — NO "use client" directive. Imported by the Better Auth
// instance (src/lib/auth/index.ts) and by the client auth plugin (02-02).
import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
} from "better-auth/plugins/admin/access";

// Extend the default statements (user[*], session[*]) with the post-workflow +
// taxonomy resources the dashboard gates on (D-11 role matrix).
const statement = {
  ...defaultStatements,
  post: ["create", "read", "update", "publish", "unpublish", "submit", "delete"],
  category: ["create", "read", "update", "delete"],
  tag: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

// admin = full (merge adminAc.statements + grant all post/category/tag actions).
export const adminRole = ac.newRole({
  ...adminAc.statements,
  post: ["create", "read", "update", "publish", "unpublish", "submit", "delete"],
  category: ["create", "read", "update", "delete"],
  tag: ["create", "read", "update", "delete"],
});

// editor = any post + taxonomy, no user/settings (no user.* — D-11 editor matrix).
export const editorRole = ac.newRole({
  post: ["create", "read", "update", "publish", "unpublish", "submit", "delete"],
  category: ["create", "read", "update", "delete"],
  tag: ["create", "read", "update", "delete"],
});

// author = own posts only (ownership enforced separately via assertOwnsPost),
// submit-for-review, NO direct publish. D-11 author matrix — publish is ABSENT.
export const authorRole = ac.newRole({
  post: ["create", "read", "update", "unpublish", "submit", "delete"],
});
