// src/actions/search.ts
// [CITED: 260827-se8-PLAN.md Task 8 <behavior> — the globalSearch contract]
// [CITED: CLAUDE.md "Roles & permissions" — server-side role checks, never UI hiding]
// [CITED: research A3 — author-scoping asymmetry note (below)]
//
// The header global search. One action, four role-scoped legs (posts / users /
// categories / tags), each capped at 5 rows, minimal columns only.
//
// Security ordering (Pitfall #1 — non-negotiable):
//   1. getSessionOrThrow() — FIRST; unauthenticated → UNAUTHORIZED before ANY
//      db access.
//   2. bounded(q, 100) (Task 2 helper); under 2 characters → empty groups
//      WITHOUT touching the DB.
//   3. Posts leg: requireCan({ post: ["read"] }) AND role-scoping derived
//      FROM THE SESSION (never client input) — author sees ONLY own posts
//      (authorId equality); editor/admin see any status (drafts findable —
//      dashboard semantics).
//   4. Users leg: runs ONLY when session.user.role === "admin" — for any other
//      role the user-table select is never invoked and the group is empty.
//   5. Categories + tags legs: open to all dashboard roles; tags + categories
//      exclude soft-deleted rows; ilike on name.
//
// Author-scoping asymmetry (research A3, documented deliberately): the posts
// LIST page does NOT author-scope (existing dashboard behavior, out of scope
// for 260827-se8). globalSearch is deliberately the safer direction — a
// non-privileged role typing another author's draft title into the header
// search must not see it surface. Do not "fix" the list page by copying from
// here without a separate decision.
//
// All queries are parameterized Drizzle ilike templates — never string concat.
//
// Server-only — top directive mandatory for Server Actions.
"use server";
import { db, schema } from "@/lib/db";
import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { requireCan, getSessionOrThrow } from "@/lib/permissions";
import { bounded } from "@/lib/list-filters";

/** Per-leg row cap — the dropdown renders at most this many rows per group. */
const SEARCH_LEG_LIMIT = 5;

/**
 * globalSearch — grouped live results for the header search island.
 *
 * @param rawQ The raw search string (length-bounded to 100, trimmed).
 * @returns { posts: [{id,title,status}], users: [{id,name,email}],
 *           categories: [{id,name,slug}], tags: [{id,name,slug}] }
 * @throws Error("UNAUTHORIZED") when no session — before any db access.
 */
export async function globalSearch(rawQ: string) {
  // 1. Session FIRST (Pitfall #1).
  const session = await getSessionOrThrow();

  // 2. Bound + short-circuit: a 1-character query is noise — return empty
  //    groups without a single DB round-trip.
  const q = bounded(rawQ, 100);
  if (q.length < 2) {
    return { posts: [], users: [], categories: [], tags: [] };
  }
  const pattern = `%${q}%`;

  // Role-scoping derives from the session — a client cannot claim a role.
  const role = session.user.role ?? "author";
  const privileged = role === "admin" || role === "editor";

  // 3. Posts leg — permission-gated AND role-scoped. A FORBIDDEN here degrades
  //    to an empty posts group; the taxonomy legs below still answer.
  let posts: Array<{ id: number; title: string; status: string }> = [];
  try {
    await requireCan({ post: ["read"] });
    const ownScope = privileged ? undefined : eq(schema.posts.authorId, session.user.id);
    posts = await db
      .select({
        id: schema.posts.id,
        title: schema.posts.title,
        status: schema.posts.status,
      })
      .from(schema.posts)
      .where(
        ownScope
          ? and(ilike(schema.posts.title, pattern), ownScope)
          : ilike(schema.posts.title, pattern),
      )
      .limit(SEARCH_LEG_LIMIT);
  } catch {
    // Permission denied (or transient db error) on one leg — empty group, not
    // a failed search. The other legs are independent.
    posts = [];
  }

  // 4. Users leg — admin ONLY. The select is structurally unreachable for any
  //    other role (the user table is never routed to — proven by search.test.ts
  //    MUST_NOT_BE_REACHED), and the projection carries no password material.
  let users: Array<{ id: string; name: string; email: string }> = [];
  if (role === "admin") {
    users = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.user)
      .where(
        or(ilike(schema.user.name, pattern), ilike(schema.user.email, pattern)),
      )
      .limit(SEARCH_LEG_LIMIT);
  }

  // 5. Taxonomy legs — open to all dashboard roles; soft-deleted rows excluded.
  const categories = await db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      slug: schema.categories.slug,
    })
    .from(schema.categories)
    .where(
      and(ilike(schema.categories.name, pattern), isNull(schema.categories.deletedAt)),
    )
    .limit(SEARCH_LEG_LIMIT);

  const tags = await db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      slug: schema.tags.slug,
    })
    .from(schema.tags)
    .where(and(ilike(schema.tags.name, pattern), isNull(schema.tags.deletedAt)))
    .limit(SEARCH_LEG_LIMIT);

  return { posts, users, categories, tags };
}
