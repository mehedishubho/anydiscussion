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
// taxonomy + page resources the dashboard gates on (D-11 role matrix).
//
// Phase 4 DASH-05 adds the `page` resource (legal/contact/content pages — T&C,
// Privacy, Contact). Pages are site-wide content (no authorId), so the role
// matrix mirrors taxonomy (admin + editor get full CRUD) rather than posts
// (where authors own rows). Authors get ["read"] only — the sidebar (Plan 04-01)
// surfaces the Pages link to all roles, so read must pass for them; create /
// update / delete remain admin/editor scope (an author editing T&C would be
// out of role per CLAUDE.md "create/edit only their own posts").
const statement = {
  ...defaultStatements,
  post: ["create", "read", "update", "publish", "unpublish", "submit", "delete"],
  category: ["create", "read", "update", "delete"],
  tag: ["create", "read", "update", "delete"],
  page: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

// admin = full (merge adminAc.statements + grant all post/category/tag/page actions).
export const adminRole = ac.newRole({
  ...adminAc.statements,
  post: ["create", "read", "update", "publish", "unpublish", "submit", "delete"],
  category: ["create", "read", "update", "delete"],
  tag: ["create", "read", "update", "delete"],
  page: ["create", "read", "update", "delete"],
});

// editor = any post + taxonomy + pages, no user/settings (no user.* — D-11 editor
// matrix). Editors publish content directly, including legal/contact pages (D-20
// — page = draft | published only, no review workflow).
export const editorRole = ac.newRole({
  post: ["create", "read", "update", "publish", "unpublish", "submit", "delete"],
  category: ["create", "read", "update", "delete"],
  tag: ["create", "read", "update", "delete"],
  page: ["create", "read", "update", "delete"],
});

// author = own posts only (ownership enforced separately via assertOwnsPost),
// submit-for-review, NO direct publish. D-11 author matrix — publish is ABSENT.
// Authors get page:["read"] only — pages are site-wide content with no ownership
// model, so create/update/delete are out of author scope (mirrors the taxonomy
// treatment where authors use the picker but cannot mutate taxonomy rows).
export const authorRole = ac.newRole({
  post: ["create", "read", "update", "unpublish", "submit", "delete"],
  page: ["read"],
});
